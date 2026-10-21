// Package payments define el contrato de Parla con cualquier pasarela de pago (Mercado Pago en
// producción, el simulador PagaYa en desarrollo): crear un cobro, anularlo, devolverlo (todo o una
// parte) y traducir sus avisos. Cada pasarela vive en su traductor (translators/…).
package payments

import (
	"errors"
	"time"

	"github.com/parla/gateway/internal/services"
)

var (
	ErrInvalid       = errors.New("datos inválidos de la pasarela")
	ErrUnknownStatus = errors.New("estado de pago que no nos interesa")
	// ErrAlreadyPaid: se quiso anular un cobro que la persona ya pagó (hay que devolverlo).
	ErrAlreadyPaid = errors.New("el cobro ya se pagó")
	// ErrNotPaid: se quiso devolver un cobro que nadie pagó (no hay nada que devolver).
	ErrNotPaid = errors.New("el cobro no se pagó")
	// ErrExceedsCharge: la devolución parcial pasa lo que queda del cobro.
	ErrExceedsCharge = errors.New("la devolución supera lo cobrado")
)

// ChargeRequest: lo que Parla cobra por un pedido.
type ChargeRequest struct {
	AmountCents int
	Concept     string
	// Reference: el id del pedido; con él la pasarela relaciona el pago y los avisos.
	Reference string
	// NotifyURL: a dónde manda la pasarela sus avisos.
	NotifyURL string
	// ReturnURL: a dónde vuelve la persona después de pagar (si la pasarela redirige).
	ReturnURL string
	// ExpiresIn: cuánto dura el cobro antes de vencer.
	ExpiresIn time.Duration
}

// Charge: el cobro creado, listo para mostrar como QR o abrir en el celular.
type Charge struct {
	ID string
	// Provider: nombre de la pasarela para mostrar («Mercado Pago», «PagaYa»).
	Provider  string
	QRText    string
	PayURL    string
	ExpiresAt time.Time
}

// Event: un aviso de la pasarela ya verificado y traducido.
type Event struct {
	// ChargeID: el id con el que se devuelve este pago (en Mercado Pago, el del pago, no el del checkout).
	ChargeID  string
	Reference string
	// Status es services.Paid o services.PaymentExpired.
	Status services.OrderStatus
	PaidAt *time.Time
}
