// Package pagaya traduce la billetera «PagaYa» (cobros con QR al estilo Yape, montos en soles con
// decimales) a los contratos de Parla, incluidos sus avisos firmados.
package pagaya

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/parla/gateway/internal/services"
	"github.com/parla/gateway/internal/translators/providerapi"
	"github.com/parla/gateway/internal/webhook"
)

const Provider = "PagaYa"

var (
	ErrInvalid       = errors.New("datos inválidos de la billetera")
	ErrUnknownStatus = errors.New("estado de cobro desconocido")
	// ErrAlreadyPaid: se quiso anular un cobro que la persona ya pagó (hay que devolverlo).
	ErrAlreadyPaid = errors.New("el cobro ya se pagó")
)

type Client struct {
	BaseURL string
	HTTP    *http.Client
}

// ChargeRequest: lo que Parla cobra.
type ChargeRequest struct {
	AmountCents int
	Concept     string
	Reference   string
	NotifyURL   string
}

// Charge: el cobro creado, listo para mostrar como QR.
type Charge struct {
	ID        string
	QRText    string
	PayURL    string
	ExpiresAt time.Time
}

// soles serializa céntimos como número decimal exacto (2340 → 23.40) sin redondeos de float.
type soles int

func (s soles) MarshalJSON() ([]byte, error) {
	return []byte(fmt.Sprintf("%d.%02d", int(s)/100, int(s)%100)), nil
}

func (c Client) CreateCharge(ctx context.Context, req ChargeRequest) (Charge, error) {
	status, raw, err := providerapi.Call(ctx, c.HTTP, http.MethodPost, c.BaseURL+"/pagaya/cobros", map[string]any{
		"monto": soles(req.AmountCents), "moneda": services.Currency, "concepto": req.Concept,
		"referencia": req.Reference, "notificar_a": req.NotifyURL,
	})
	if err != nil {
		return Charge{}, err
	}
	if status != http.StatusCreated {
		return Charge{}, fmt.Errorf("%w: cobro respondió %d", providerapi.ErrUnavailable, status)
	}
	var body struct {
		ID       string `json:"id_cobro"`
		QRTexto  string `json:"qr_texto"`
		URLPago  string `json:"url_pago"`
		ExpiraEn string `json:"expira_en"`
	}
	if err := providerapi.Decode(raw, &body); err != nil {
		return Charge{}, err
	}
	expires, err := time.Parse(time.RFC3339, body.ExpiraEn)
	if err != nil || !services.ValidID.MatchString(body.ID) || body.QRTexto == "" || len(body.QRTexto) > 2048 || !httpURL(body.URLPago) {
		return Charge{}, fmt.Errorf("%w: cobro %+v", ErrInvalid, body)
	}
	return Charge{ID: body.ID, QRText: body.QRTexto, PayURL: body.URLPago, ExpiresAt: expires}, nil
}

// Cancel anula un cobro sin pagar: ya no se puede pagar. Repetirlo no cambia nada; si la persona
// ya lo pagó, devuelve ErrAlreadyPaid.
func (c Client) Cancel(ctx context.Context, chargeID string) error {
	status, raw, err := providerapi.Call(ctx, c.HTTP, http.MethodPost, c.BaseURL+"/pagaya/cobros/"+url.PathEscape(chargeID)+"/anular", nil)
	if err != nil {
		return err
	}
	switch status {
	case http.StatusOK:
		return nil
	case http.StatusConflict:
		var body struct {
			Error string `json:"error"`
		}
		if json.Unmarshal(raw, &body) == nil && body.Error == "YA_PAGADO" {
			return ErrAlreadyPaid
		}
	}
	return fmt.Errorf("%w: anular respondió %d", providerapi.ErrUnavailable, status)
}

// Refund devuelve un cobro pagado y dice cuándo. Es idempotente: devolver dos veces no duplica.
func (c Client) Refund(ctx context.Context, chargeID string) (time.Time, error) {
	status, raw, err := providerapi.Call(ctx, c.HTTP, http.MethodPost, c.BaseURL+"/pagaya/cobros/"+url.PathEscape(chargeID)+"/devolucion", nil)
	if err != nil {
		return time.Time{}, err
	}
	if status != http.StatusOK {
		return time.Time{}, fmt.Errorf("%w: devolución respondió %d", providerapi.ErrUnavailable, status)
	}
	var body struct {
		Estado     string `json:"estado"`
		DevueltoEn string `json:"devuelto_en"`
	}
	if err := providerapi.Decode(raw, &body); err != nil {
		return time.Time{}, err
	}
	at, err := time.Parse(time.RFC3339, body.DevueltoEn)
	if err != nil || body.Estado != "DEVUELTO" {
		return time.Time{}, fmt.Errorf("%w: devolución %+v", ErrInvalid, body)
	}
	return at, nil
}

func httpURL(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

// Event es un aviso de PagaYa ya traducido.
type Event struct {
	ChargeID  string
	Reference string
	// Status es Paid o PaymentExpired.
	Status services.OrderStatus
	PaidAt *time.Time
}

// ParseWebhook verifica la firma y traduce el aviso.
func ParseWebhook(body []byte, signature, secret string) (Event, error) {
	if err := webhook.Verify(secret, body, signature); err != nil {
		return Event{}, err
	}
	var raw struct {
		ID         string  `json:"id_cobro"`
		Referencia string  `json:"referencia"`
		Estado     string  `json:"estado"`
		PagadoEn   *string `json:"pagado_en"`
	}
	if err := json.Unmarshal(body, &raw); err != nil || !services.ValidID.MatchString(raw.ID) || !services.ValidID.MatchString(raw.Referencia) {
		return Event{}, ErrInvalid
	}
	ev := Event{ChargeID: raw.ID, Reference: raw.Referencia}
	switch raw.Estado {
	case "PAGADO":
		ev.Status = services.Paid
		if raw.PagadoEn == nil {
			return Event{}, ErrInvalid
		}
		paid, err := time.Parse(time.RFC3339, *raw.PagadoEn)
		if err != nil {
			return Event{}, ErrInvalid
		}
		ev.PaidAt = &paid
	case "EXPIRADO":
		ev.Status = services.PaymentExpired
	default:
		return Event{}, fmt.Errorf("%w: %q", ErrUnknownStatus, raw.Estado)
	}
	return ev, nil
}
