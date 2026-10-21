package orders

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/parla/gateway/internal/services"
	"github.com/parla/gateway/internal/translators/pagaya"
)

// Wallet: lo que los retiros necesitan de la billetera (transferir a la del repartidor).
type Wallet interface {
	// Transfer es idempotente por referencia: repetirla no paga dos veces.
	Transfer(ctx context.Context, reference, destination string, amountCents int, concept string) (string, error)
}

const payoutConcept = "Rapidito · tus ganancias"

// Payout retira las ganancias del repartidor a su billetera PagaYa. Las ganancias (95 % de la
// tarifa de delivery más el 100 % de las propinas) las calcula y las guarda el core; aquí solo se
// mueve el dinero:
//
//  1. el core aparta todo el saldo disponible como un retiro pendiente (si ya hay uno en curso
//     responde 409 y no pasa nada más: nunca hay dos retiros a la vez);
//  2. se transfiere en PagaYa con el id del retiro como referencia (idempotente: reintentar la misma
//     transferencia no paga dos veces);
//  3. se cierra el retiro en el core: pagado, o fallido (el dinero vuelve al saldo).
//
// Si la transferencia salió pero cerrar el retiro en el core falla, se registra el error y se
// responde éxito: el dinero ya se envió y el retiro queda pendiente en el core hasta que
// ReconcilePayouts lo cierre (vuelve a transferir con la misma referencia, que devuelve la misma
// transferencia sin pagar de nuevo).
func (o *Orchestrator) Payout(ctx context.Context, userID, reason string) (services.Payout, error) {
	if o.Payouts == nil || o.Wallet == nil {
		return services.Payout{}, unavailable("Los retiros")
	}
	reservation, err := o.Payouts.ReservePayout(ctx, userID, reason)
	var conflict *ConflictError
	switch {
	case errors.As(err, &conflict):
		return services.Payout{}, &Error{Status: http.StatusConflict, Code: "conflict", Message: conflict.Message}
	case errors.Is(err, ErrConflict):
		return services.Payout{}, &Error{Status: http.StatusConflict, Code: "conflict", Message: "No se pudo iniciar el retiro"}
	case errors.Is(err, ErrNotFound):
		return services.Payout{}, &Error{Status: http.StatusNotFound, Code: "not_found", Message: "Tu cuenta no es de repartidor de Rapidito"}
	case err != nil:
		slog.Error("no se pudo apartar el saldo del repartidor", "repartidor", userID, "error", err)
		return services.Payout{}, unavailable("Parla")
	}

	transferID, err := o.Wallet.Transfer(ctx, reservation.PayoutID, reservation.Destination, reservation.AmountCents, payoutConcept)
	if err != nil {
		invalidDestination := errors.Is(err, pagaya.ErrInvalidDestination)
		failure := "PagaYa no responde"
		if invalidDestination {
			failure = "Número de PagaYa inválido"
		}
		slog.Warn("la transferencia al repartidor falló", "retiro", reservation.PayoutID, "error", err)
		if _, settleErr := o.Payouts.SettlePayout(ctx, reservation.PayoutID, services.PayoutSettle{Status: "failed", FailureReason: failure}); settleErr != nil {
			slog.Error("no se pudo marcar el retiro como fallido", "retiro", reservation.PayoutID, "error", settleErr)
		}
		if invalidDestination {
			return services.Payout{}, &Error{Status: http.StatusBadRequest, Code: "bad_request", Message: "Tu número de PagaYa no es válido. Corrígelo en tu perfil."}
		}
		return services.Payout{}, &Error{Status: http.StatusBadGateway, Code: "bad_gateway", Message: "PagaYa no responde. Tu saldo sigue disponible."}
	}

	paid := services.Payout{PayoutID: reservation.PayoutID, AmountCents: reservation.AmountCents, Status: "paid", TransferID: transferID}
	settled, err := o.Payouts.SettlePayout(ctx, reservation.PayoutID, services.PayoutSettle{Status: "paid", TransferID: transferID})
	if err != nil {
		slog.Error("el dinero se transfirió pero no se pudo cerrar el retiro en el core", "retiro", reservation.PayoutID, "transferencia", transferID, "error", err)
		return paid, nil
	}
	return settled, nil
}

// StuckAfterMinutes: un retiro pendiente hace más que esto se concilia (la transferencia salió o no,
// pero el core no se enteró).
const StuckAfterMinutes = 10

// ReconcilePayouts cierra los retiros que quedaron pendientes (p. ej. el dinero salió pero el core no
// pudo registrarlo). Reintenta la transferencia con la misma referencia: PagaYa es idempotente, así
// que si ya se hizo devuelve la misma y si no, la hace ahora; nunca se paga dos veces. Con destino
// inválido se cierra fallido (el dinero vuelve al saldo); con PagaYa caído queda pendiente para la
// próxima vez. Nunca falla.
func (o *Orchestrator) ReconcilePayouts(ctx context.Context) (settled, failed, pending int) {
	if o.Payouts == nil || o.Wallet == nil {
		return 0, 0, 0
	}
	stuck, err := o.Payouts.StuckPayouts(ctx, StuckAfterMinutes)
	if err != nil {
		slog.Error("no se pudo consultar los retiros pendientes", "error", err)
		return 0, 0, 0
	}
	for _, p := range stuck {
		transferID, err := o.Wallet.Transfer(ctx, p.PayoutID, p.Destination, p.AmountCents, payoutConcept)
		switch {
		case errors.Is(err, pagaya.ErrInvalidDestination):
			if _, err := o.Payouts.SettlePayout(ctx, p.PayoutID, services.PayoutSettle{Status: "failed", FailureReason: "Número de PagaYa inválido"}); err != nil {
				slog.Error("no se pudo cerrar como fallido un retiro pendiente", "retiro", p.PayoutID, "error", err)
				pending++
				continue
			}
			failed++
		case err != nil:
			slog.Warn("PagaYa no responde: el retiro sigue pendiente", "retiro", p.PayoutID, "error", err)
			pending++
		default:
			if _, err := o.Payouts.SettlePayout(ctx, p.PayoutID, services.PayoutSettle{Status: "paid", TransferID: transferID}); err != nil {
				slog.Error("no se pudo cerrar como pagado un retiro pendiente", "retiro", p.PayoutID, "error", err)
				pending++
				continue
			}
			settled++
		}
	}
	if len(stuck) > 0 {
		slog.Info("conciliación de retiros de Rapidito", "pagados", settled, "fallidos", failed, "siguen_pendientes", pending)
	}
	return settled, failed, pending
}

// RunAutoPayouts paga a cada repartidor con saldo suficiente (retiro automático diario). Antes
// concilia los retiros pendientes, para que nadie quede bloqueado por uno viejo. Nunca falla: lo que
// no se pudo pagar queda en el saldo para la próxima vez.
func (o *Orchestrator) RunAutoPayouts(ctx context.Context) (paid, failed int) {
	if o.Payouts == nil {
		return 0, 0
	}
	o.ReconcilePayouts(ctx)
	due, err := o.Payouts.DuePayouts(ctx)
	if err != nil {
		slog.Error("no se pudo consultar quién tiene saldo para el retiro automático", "error", err)
		return 0, 0
	}
	for _, d := range due {
		if _, err := o.Payout(ctx, d.UserID, "auto"); err != nil {
			failed++
			slog.Warn("retiro automático no realizado", "repartidor", d.UserID, "error", err)
			continue
		}
		paid++
	}
	slog.Info("retiros automáticos de Rapidito", "pagados", paid, "no_realizados", failed, "pendientes", len(due))
	return paid, failed
}

// PayoutTimeZone: el retiro automático se programa en hora de Lima.
const PayoutTimeZone = "America/Lima"

// ParsePayoutAt lee «HH:MM» (vacío = retiro automático apagado).
func ParsePayoutAt(value string) (hour, minute int, enabled bool, err error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, 0, false, nil
	}
	t, err := time.Parse("15:04", value)
	if err != nil {
		return 0, 0, false, errors.New("RAPIDITO_PAYOUT_AT debe tener el formato HH:MM (p. ej. 23:00)")
	}
	return t.Hour(), t.Minute(), true, nil
}

// PayoutDue dice si toca el retiro automático: ya pasó la hora programada de hoy (en la zona dada)
// y hoy todavía no se corrió. Devuelve la fecha de hoy («2006-01-02») para recordarla.
func PayoutDue(now time.Time, loc *time.Location, hour, minute int, lastRun string) (bool, string) {
	local := now.In(loc)
	today := local.Format("2006-01-02")
	scheduled := time.Date(local.Year(), local.Month(), local.Day(), hour, minute, 0, 0, loc)
	return !local.Before(scheduled) && lastRun != today, today
}

// StartPayoutScheduler concilia los retiros pendientes cada hora y revisa cada minuto si toca el
// retiro automático, que corre una vez por día (si el gateway arranca después de la hora, lo corre ese
// mismo día al arrancar). Con la hora vacía solo se apaga el retiro automático, no la conciliación.
func (o *Orchestrator) StartPayoutScheduler(ctx context.Context, at string) error {
	hour, minute, enabled, err := ParsePayoutAt(at)
	if err != nil {
		return err
	}
	go func() {
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				o.ReconcilePayouts(ctx)
			}
		}
	}()
	if !enabled {
		return nil
	}
	loc, err := time.LoadLocation(PayoutTimeZone)
	if err != nil {
		loc = time.FixedZone("Lima", -5*3600)
	}
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		lastRun := ""
		for {
			if due, today := PayoutDue(o.now(), loc, hour, minute, lastRun); due {
				lastRun = today
				o.RunAutoPayouts(ctx)
			}
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
	slog.Info("retiro automático de Rapidito programado", "hora", at, "zona", PayoutTimeZone)
	return nil
}
