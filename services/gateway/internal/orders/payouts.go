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
const storePayoutConcept = "Parla · tus ventas"

// payoutKind: a quién se le deposita. El mismo recorrido (apartar saldo → transferir → cerrar → conciliar) sirve
// para los repartidores (sus ganancias) y para las tiendas (sus ventas menos la comisión de Parla).
type payoutKind struct {
	core    PayoutCore
	concept string
	// notFound: lo que se le dice a quien no tiene cuenta de ese tipo.
	notFound string
	// label: cómo se nombra en los registros.
	label string
}

func (o *Orchestrator) driverKind() payoutKind {
	return payoutKind{core: o.Payouts, concept: payoutConcept, notFound: "Tu cuenta no es de repartidor de Rapidito", label: "repartidor"}
}

func (o *Orchestrator) storeKind() payoutKind {
	return payoutKind{core: o.StorePayouts, concept: storePayoutConcept, notFound: "Tu cuenta no tiene una tienda en Parla", label: "tienda"}
}

// kinds: los retiros que están encendidos (el de tiendas es opcional).
func (o *Orchestrator) kinds() []payoutKind {
	var out []payoutKind
	for _, k := range []payoutKind{o.driverKind(), o.storeKind()} {
		if k.core != nil {
			out = append(out, k)
		}
	}
	return out
}

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
	return o.payout(ctx, o.driverKind(), userID, reason)
}

// StorePayout: «Retirar ahora» de una tienda. Es el mismo recorrido, con las ventas de la tienda (menos la comisión).
func (o *Orchestrator) StorePayout(ctx context.Context, userID, reason string) (services.Payout, error) {
	return o.payout(ctx, o.storeKind(), userID, reason)
}

func (o *Orchestrator) payout(ctx context.Context, k payoutKind, userID, reason string) (services.Payout, error) {
	if k.core == nil || o.Wallet == nil {
		return services.Payout{}, unavailable("Los retiros")
	}
	reservation, err := k.core.ReservePayout(ctx, userID, reason)
	var conflict *ConflictError
	switch {
	case errors.As(err, &conflict):
		return services.Payout{}, &Error{Status: http.StatusConflict, Code: "conflict", Message: conflict.Message}
	case errors.Is(err, ErrConflict):
		return services.Payout{}, &Error{Status: http.StatusConflict, Code: "conflict", Message: "No se pudo iniciar el retiro"}
	case errors.Is(err, ErrNotFound):
		return services.Payout{}, &Error{Status: http.StatusNotFound, Code: "not_found", Message: k.notFound}
	case err != nil:
		slog.Error("no se pudo apartar el saldo", "tipo", k.label, "cuenta", userID, "error", err)
		return services.Payout{}, unavailable("Parla")
	}

	transferID, err := o.Wallet.Transfer(ctx, reservation.PayoutID, reservation.Destination, reservation.AmountCents, k.concept)
	if err != nil {
		invalidDestination := errors.Is(err, pagaya.ErrInvalidDestination)
		failure := "PagaYa no responde"
		if invalidDestination {
			failure = "Número de PagaYa inválido"
		}
		slog.Warn("la transferencia falló", "tipo", k.label, "retiro", reservation.PayoutID, "error", err)
		if _, settleErr := k.core.SettlePayout(ctx, reservation.PayoutID, services.PayoutSettle{Status: "failed", FailureReason: failure}); settleErr != nil {
			slog.Error("no se pudo marcar el retiro como fallido", "retiro", reservation.PayoutID, "error", settleErr)
		}
		if invalidDestination {
			return services.Payout{}, &Error{Status: http.StatusBadRequest, Code: "bad_request", Message: "Tu número de PagaYa no es válido. Corrígelo en tu perfil."}
		}
		return services.Payout{}, &Error{Status: http.StatusBadGateway, Code: "bad_gateway", Message: "PagaYa no responde. Tu saldo sigue disponible."}
	}

	paid := services.Payout{PayoutID: reservation.PayoutID, AmountCents: reservation.AmountCents, Status: "paid", TransferID: transferID}
	settled, err := k.core.SettlePayout(ctx, reservation.PayoutID, services.PayoutSettle{Status: "paid", TransferID: transferID})
	if err != nil {
		slog.Error("el dinero se transfirió pero no se pudo cerrar el retiro en el core", "tipo", k.label, "retiro", reservation.PayoutID, "transferencia", transferID, "error", err)
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
	if o.Wallet == nil {
		return 0, 0, 0
	}
	for _, k := range o.kinds() {
		s, f, p := o.reconcile(ctx, k)
		settled, failed, pending = settled+s, failed+f, pending+p
	}
	return settled, failed, pending
}

func (o *Orchestrator) reconcile(ctx context.Context, k payoutKind) (settled, failed, pending int) {
	stuck, err := k.core.StuckPayouts(ctx, StuckAfterMinutes)
	if err != nil {
		slog.Error("no se pudo consultar los retiros pendientes", "tipo", k.label, "error", err)
		return 0, 0, 0
	}
	for _, p := range stuck {
		transferID, err := o.Wallet.Transfer(ctx, p.PayoutID, p.Destination, p.AmountCents, k.concept)
		switch {
		case errors.Is(err, pagaya.ErrInvalidDestination):
			if _, err := k.core.SettlePayout(ctx, p.PayoutID, services.PayoutSettle{Status: "failed", FailureReason: "Número de PagaYa inválido"}); err != nil {
				slog.Error("no se pudo cerrar como fallido un retiro pendiente", "retiro", p.PayoutID, "error", err)
				pending++
				continue
			}
			failed++
		case err != nil:
			slog.Warn("PagaYa no responde: el retiro sigue pendiente", "retiro", p.PayoutID, "error", err)
			pending++
		default:
			if _, err := k.core.SettlePayout(ctx, p.PayoutID, services.PayoutSettle{Status: "paid", TransferID: transferID}); err != nil {
				slog.Error("no se pudo cerrar como pagado un retiro pendiente", "retiro", p.PayoutID, "error", err)
				pending++
				continue
			}
			settled++
		}
	}
	if len(stuck) > 0 {
		slog.Info("conciliación de retiros", "tipo", k.label, "pagados", settled, "fallidos", failed, "siguen_pendientes", pending)
	}
	return settled, failed, pending
}

// RunAutoPayouts paga a cada repartidor y a cada tienda con saldo suficiente (retiro automático diario). Antes
// concilia los retiros pendientes, para que nadie quede bloqueado por uno viejo. Nunca falla: lo que
// no se pudo pagar queda en el saldo para la próxima vez.
func (o *Orchestrator) RunAutoPayouts(ctx context.Context) (paid, failed int) {
	o.ReconcilePayouts(ctx)
	for _, k := range o.kinds() {
		p, f := o.runAuto(ctx, k)
		paid, failed = paid+p, failed+f
	}
	return paid, failed
}

func (o *Orchestrator) runAuto(ctx context.Context, k payoutKind) (paid, failed int) {
	due, err := k.core.DuePayouts(ctx)
	if err != nil {
		slog.Error("no se pudo consultar quién tiene saldo para el retiro automático", "tipo", k.label, "error", err)
		return 0, 0
	}
	for _, d := range due {
		if _, err := o.payout(ctx, k, d.UserID, "auto"); err != nil {
			failed++
			slog.Warn("retiro automático no realizado", "tipo", k.label, "cuenta", d.UserID, "error", err)
			continue
		}
		paid++
	}
	slog.Info("retiros automáticos", "tipo", k.label, "pagados", paid, "no_realizados", failed, "pendientes", len(due))
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
