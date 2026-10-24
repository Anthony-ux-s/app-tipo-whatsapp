package orders

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/parla/gateway/internal/services"
)

var (
	// ErrConflict: el pedido ya no estaba en el estado esperado (otro aviso ya lo cambió).
	ErrConflict = errors.New("el pedido cambió de estado")
	ErrNotFound = errors.New("pedido no encontrado")
)

// ConflictError: un 409 del core con su mensaje para la persona (p. ej. «No tienes saldo para
// retirar»). errors.Is(err, ErrConflict) sigue valiendo.
type ConflictError struct{ Message string }

func (e *ConflictError) Error() string        { return e.Message }
func (e *ConflictError) Is(target error) bool { return target == ErrConflict }

// CoreError: otro error del core con su mensaje para la persona (p. ej. un 403 «Solo soporte puede
// aprobar reclamos»), que se pasa tal cual.
type CoreError struct {
	Status  int
	Message string
}

func (e *CoreError) Error() string { return e.Message }

// Core guarda los pedidos (el core NestJS es la fuente de verdad) y avisa al cliente.
type Core interface {
	CreateOrder(ctx context.Context, order services.InternalCreateOrder) (services.InternalOrder, error)
	GetOrder(ctx context.Context, id string) (services.InternalOrder, error)
	UpdateOrder(ctx context.Context, id string, update services.InternalUpdateOrder) (services.InternalOrder, error)
	// BusinessByService: el negocio que atiende un servicio (ErrNotFound si ninguno).
	BusinessByService(ctx context.Context, service services.ServiceID) (services.Business, error)
	// BusinessByOwner: el negocio de una persona (ErrNotFound si no es dueña de ninguno).
	BusinessByOwner(ctx context.Context, userID string) (services.Business, error)
	// QuoteCoupon: cuánto descuenta un cupón (ErrNotFound si no existe; ConflictError con el motivo si no vale).
	QuoteCoupon(ctx context.Context, q services.CouponQuote) (services.AppliedCoupon, error)
	// IsAdmin: si la cuenta es de soporte.
	IsAdmin(ctx context.Context, userID string) (bool, error)
}

// PayoutCore: las ganancias de los repartidores, que lleva el core (saldo = 95 % del delivery +
// propinas, menos lo ya retirado). El gateway solo mueve el dinero en la billetera.
type PayoutCore interface {
	// ReservePayout aparta todo el saldo disponible como un retiro pendiente. 409 (ConflictError) si
	// no hay saldo, falta el número de PagaYa o ya hay un retiro en curso.
	ReservePayout(ctx context.Context, userID, reason string) (services.PayoutReservation, error)
	// SettlePayout cierra el retiro: pagado, o fallido (el dinero vuelve al saldo). Idempotente.
	SettlePayout(ctx context.Context, payoutID string, settle services.PayoutSettle) (services.Payout, error)
	// DuePayouts: repartidores con saldo suficiente para el retiro automático.
	DuePayouts(ctx context.Context) ([]services.DuePayout, error)
	// StuckPayouts: retiros que siguen pendientes hace más de N minutos (para conciliarlos).
	StuckPayouts(ctx context.Context, olderThanMinutes int) ([]services.PayoutReservation, error)
}

// HTTPCore habla con las rutas internas del core con el token entre servicios.
type HTTPCore struct {
	BaseURL *url.URL
	Token   string
	HTTP    *http.Client
}

func (c HTTPCore) CreateOrder(ctx context.Context, order services.InternalCreateOrder) (services.InternalOrder, error) {
	var out services.InternalOrder
	return out, c.call(ctx, http.MethodPost, "/api/internal/orders", order, &out)
}

func (c HTTPCore) GetOrder(ctx context.Context, id string) (services.InternalOrder, error) {
	var out services.InternalOrder
	return out, c.call(ctx, http.MethodGet, "/api/internal/orders/"+url.PathEscape(id), nil, &out)
}

func (c HTTPCore) UpdateOrder(ctx context.Context, id string, update services.InternalUpdateOrder) (services.InternalOrder, error) {
	var out services.InternalOrder
	return out, c.call(ctx, http.MethodPatch, "/api/internal/orders/"+url.PathEscape(id), update, &out)
}

func (c HTTPCore) BusinessByService(ctx context.Context, service services.ServiceID) (services.Business, error) {
	var out services.Business
	return out, c.call(ctx, http.MethodGet, "/api/internal/businesses/by-service/"+url.PathEscape(string(service)), nil, &out)
}

func (c HTTPCore) BusinessByOwner(ctx context.Context, userID string) (services.Business, error) {
	var out services.Business
	return out, c.call(ctx, http.MethodGet, "/api/internal/businesses/by-owner/"+url.PathEscape(userID), nil, &out)
}

func (c HTTPCore) QuoteCoupon(ctx context.Context, q services.CouponQuote) (services.AppliedCoupon, error) {
	var out services.AppliedCoupon
	return out, c.call(ctx, http.MethodPost, "/api/internal/coupons/quote", q, &out)
}

func (c HTTPCore) IsAdmin(ctx context.Context, userID string) (bool, error) {
	var out struct {
		IsAdmin bool `json:"isAdmin"`
	}
	err := c.call(ctx, http.MethodGet, "/api/internal/users/"+url.PathEscape(userID)+"/admin", nil, &out)
	return out.IsAdmin, err
}

func (c HTTPCore) ReservePayout(ctx context.Context, userID, reason string) (services.PayoutReservation, error) {
	var out services.PayoutReservation
	return out, c.call(ctx, http.MethodPost, "/api/internal/drivers/"+url.PathEscape(userID)+"/payouts", map[string]string{"reason": reason}, &out)
}

func (c HTTPCore) SettlePayout(ctx context.Context, payoutID string, settle services.PayoutSettle) (services.Payout, error) {
	var out services.Payout
	return out, c.call(ctx, http.MethodPatch, "/api/internal/payouts/"+url.PathEscape(payoutID), settle, &out)
}

func (c HTTPCore) DuePayouts(ctx context.Context) ([]services.DuePayout, error) {
	var out []services.DuePayout
	return out, c.call(ctx, http.MethodGet, "/api/internal/payouts/due", nil, &out)
}

func (c HTTPCore) StuckPayouts(ctx context.Context, olderThanMinutes int) ([]services.PayoutReservation, error) {
	var out []services.PayoutReservation
	return out, c.call(ctx, http.MethodGet, fmt.Sprintf("/api/internal/payouts/stuck?olderThanMinutes=%d", olderThanMinutes), nil, &out)
}

func (c HTTPCore) ReserveClaimRefund(ctx context.Context, claimID, adminUserID string, amountCents int) (services.ClaimRefundReservation, error) {
	var out services.ClaimRefundReservation
	return out, c.call(ctx, http.MethodPost, "/api/internal/claims/"+url.PathEscape(claimID)+"/refund-reservations",
		map[string]any{"adminUserId": adminUserID, "amountCents": amountCents}, &out)
}

func (c HTTPCore) SettleClaimRefund(ctx context.Context, claimID string, settle services.ClaimRefundSettle) (json.RawMessage, error) {
	var out json.RawMessage
	return out, c.call(ctx, http.MethodPatch, "/api/internal/claims/"+url.PathEscape(claimID)+"/refund", settle, &out)
}

func (c HTTPCore) call(ctx context.Context, method, path string, in, out any) error {
	var body io.Reader
	if in != nil {
		raw, err := json.Marshal(in)
		if err != nil {
			return err
		}
		body = bytes.NewReader(raw)
	}
	// JoinPath escaparía el «?»: la consulta va aparte.
	path, query, _ := strings.Cut(path, "?")
	target := c.BaseURL.JoinPath(path)
	target.RawQuery = query
	req, err := http.NewRequestWithContext(ctx, method, target.String(), body)
	if err != nil {
		return err
	}
	req.Header.Set("x-internal-token", c.Token)
	req.Header.Set("Accept", "application/json")
	if in != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return fmt.Errorf("core no disponible: %w", err)
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode == http.StatusNotFound:
		return ErrNotFound
	case resp.StatusCode == http.StatusConflict:
		var body struct {
			Message string `json:"message"`
		}
		if json.NewDecoder(io.LimitReader(resp.Body, 64<<10)).Decode(&body) == nil && body.Message != "" {
			return &ConflictError{Message: body.Message}
		}
		return ErrConflict
	case resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusUnprocessableEntity || resp.StatusCode == http.StatusBadRequest:
		var body struct {
			Message any `json:"message"`
		}
		_ = json.NewDecoder(io.LimitReader(resp.Body, 64<<10)).Decode(&body)
		message, _ := body.Message.(string)
		if message == "" {
			message = http.StatusText(resp.StatusCode)
		}
		return &CoreError{Status: resp.StatusCode, Message: message}
	case resp.StatusCode >= 300:
		return fmt.Errorf("core respondió %d", resp.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(out)
}

// StorePayoutCore: los retiros de las tiendas (sus ventas menos la comisión). Misma interfaz que PayoutCore, con las
// rutas internas del core para tiendas.
type StorePayoutCore struct{ HTTPCore }

func (c StorePayoutCore) ReservePayout(ctx context.Context, userID, reason string) (services.PayoutReservation, error) {
	var out services.PayoutReservation
	return out, c.call(ctx, http.MethodPost, "/api/internal/businesses/"+url.PathEscape(userID)+"/payouts", map[string]string{"reason": reason}, &out)
}

func (c StorePayoutCore) SettlePayout(ctx context.Context, payoutID string, settle services.PayoutSettle) (services.Payout, error) {
	var out services.Payout
	return out, c.call(ctx, http.MethodPatch, "/api/internal/store-payouts/"+url.PathEscape(payoutID), settle, &out)
}

func (c StorePayoutCore) DuePayouts(ctx context.Context) ([]services.DuePayout, error) {
	var out []services.DuePayout
	return out, c.call(ctx, http.MethodGet, "/api/internal/store-payouts/due", nil, &out)
}

func (c StorePayoutCore) StuckPayouts(ctx context.Context, olderThanMinutes int) ([]services.PayoutReservation, error) {
	var out []services.PayoutReservation
	return out, c.call(ctx, http.MethodGet, fmt.Sprintf("/api/internal/store-payouts/stuck?olderThanMinutes=%d", olderThanMinutes), nil, &out)
}
