package orders

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/parla/gateway/internal/services"
	"github.com/parla/gateway/internal/translators/pagaya"
)

const maxClaimRefundCents = 1_000_000

// ClaimsCore: los reclamos los lleva el core (quién puede aprobarlos, cuánto queda por devolver).
// El gateway solo mueve el dinero en la billetera.
type ClaimsCore interface {
	// ReserveClaimRefund aparta la devolución de un reclamo abierto: 403 (CoreError) si quien la pide
	// no es de soporte, 404 si el reclamo no existe, 409 (ConflictError) si no está abierto o el monto
	// pasa lo que queda por devolver. Repetirla para el mismo reclamo devuelve la misma referencia
	// pendiente (así un reintento no devuelve dos veces).
	ReserveClaimRefund(ctx context.Context, claimID, adminUserID string, amountCents int) (services.ClaimRefundReservation, error)
	// SettleClaimRefund cierra la devolución (refunded o failed) y devuelve el reclamo tal como lo da
	// el core, para pasarlo sin cambios al navegador. Idempotente para el mismo estado final.
	SettleClaimRefund(ctx context.Context, claimID string, settle services.ClaimRefundSettle) (json.RawMessage, error)
}

// PartialRefunds: devolver parte de un cobro en la billetera (idempotente por referencia).
type PartialRefunds interface {
	RefundPartial(ctx context.Context, chargeID, reference string, amountCents int) (string, error)
}

// RefundClaim devuelve parte de un pedido por un reclamo aprobado por soporte:
//
//  1. el core aparta la devolución (verifica que sea de soporte, que el reclamo siga abierto y que el
//     monto no pase lo que queda por devolver);
//  2. se devuelve en PagaYa con la referencia del core (idempotente);
//  3. se cierra en el core: refunded, o failed si PagaYa no lo hizo (el reclamo sigue abierto).
//
// Si la devolución salió pero cerrar en el core falla, se responde 502 «Devolución hecha; reintenta
// para confirmarla»: al reintentar, el core entrega la misma referencia pendiente y PagaYa responde la
// misma devolución sin devolver de nuevo, así que el cierre se completa sin pagar dos veces.
func (o *Orchestrator) RefundClaim(ctx context.Context, adminUserID, claimID string, amountCents int) (json.RawMessage, error) {
	if o.Claims == nil || o.Refunds == nil {
		return nil, unavailable("Las devoluciones")
	}
	if amountCents < 1 || amountCents > maxClaimRefundCents {
		return nil, invalid("El monto a devolver debe estar entre S/ 0.01 y S/ 10 000")
	}
	reservation, err := o.Claims.ReserveClaimRefund(ctx, claimID, adminUserID, amountCents)
	if mapped := coreClaimError(err); mapped != nil {
		if mapped == errUnexpected {
			slog.Error("no se pudo apartar la devolución del reclamo", "reclamo", claimID, "error", err)
			return nil, unavailable("Parla")
		}
		return nil, mapped
	}

	refundID, err := o.Refunds.RefundPartial(ctx, reservation.ChargeID, reservation.RefundRef, reservation.AmountCents)
	if err != nil {
		exceeds := errors.Is(err, pagaya.ErrExceedsCharge)
		failure := "PagaYa no responde"
		if exceeds {
			failure = "La devolución supera lo cobrado"
		}
		slog.Warn("la devolución del reclamo falló", "reclamo", claimID, "error", err)
		if _, settleErr := o.Claims.SettleClaimRefund(ctx, claimID, services.ClaimRefundSettle{Status: "failed", FailureReason: failure}); settleErr != nil {
			slog.Error("no se pudo marcar la devolución fallida en el core", "reclamo", claimID, "error", settleErr)
		}
		if exceeds {
			return nil, &Error{Status: http.StatusConflict, Code: "conflict", Message: "El monto supera lo que queda por devolver de este pedido."}
		}
		return nil, &Error{Status: http.StatusBadGateway, Code: "bad_gateway", Message: "PagaYa no responde. El reclamo sigue abierto; vuelve a intentarlo."}
	}

	claim, err := o.Claims.SettleClaimRefund(ctx, claimID, services.ClaimRefundSettle{Status: "refunded", ProviderRefundID: refundID})
	if err != nil {
		slog.Error("la devolución salió pero no se pudo confirmar en el core", "reclamo", claimID, "devolucion", refundID, "error", err)
		return nil, &Error{Status: http.StatusBadGateway, Code: "bad_gateway", Message: "Devolución hecha; reintenta para confirmarla"}
	}
	return claim, nil
}

// errUnexpected marca un error del core que no es para la persona (se registra y se responde 502).
var errUnexpected = errors.New("error inesperado del core")

// coreClaimError traduce lo que respondió el core al apartar: 403, 404 y 409 pasan con su mensaje.
func coreClaimError(err error) error {
	var coreErr *CoreError
	var conflict *ConflictError
	switch {
	case err == nil:
		return nil
	case errors.As(err, &coreErr):
		code := strings.ToLower(strings.ReplaceAll(http.StatusText(coreErr.Status), " ", "_"))
		return &Error{Status: coreErr.Status, Code: code, Message: coreErr.Message}
	case errors.As(err, &conflict):
		return &Error{Status: http.StatusConflict, Code: "conflict", Message: conflict.Message}
	case errors.Is(err, ErrConflict):
		return &Error{Status: http.StatusConflict, Code: "conflict", Message: "Este reclamo ya no se puede devolver"}
	case errors.Is(err, ErrNotFound):
		return &Error{Status: http.StatusNotFound, Code: "not_found", Message: "Reclamo no encontrado"}
	}
	return errUnexpected
}
