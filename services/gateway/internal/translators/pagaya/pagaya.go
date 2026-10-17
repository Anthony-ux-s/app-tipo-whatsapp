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
	// ErrInvalidDestination: el número de billetera al que se quiso transferir no es válido.
	ErrInvalidDestination = errors.New("destino de la transferencia inválido")
	// ErrExceedsCharge: la devolución parcial pasa lo que queda del cobro.
	ErrExceedsCharge = errors.New("la devolución supera lo cobrado")
)

// DevAPIKey: clave de la API de transferencias del simulador fuera de producción.
const DevAPIKey = "pagaya-dev-clave"

type Client struct {
	BaseURL string
	HTTP    *http.Client
	// APIKey autoriza las transferencias (salida de dinero), en la cabecera x-pagaya-clave.
	APIKey string
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

// RefundPartial devuelve parte de un cobro pagado (un reclamo: faltó un producto, llegó mal). Es
// idempotente por referencia: repetirla con la misma referencia no devuelve dos veces.
func (c Client) RefundPartial(ctx context.Context, chargeID, reference string, amountCents int) (string, error) {
	status, raw, err := providerapi.Call(ctx, c.HTTP, http.MethodPost, c.BaseURL+"/pagaya/cobros/"+url.PathEscape(chargeID)+"/devolucion", map[string]any{
		"monto": soles(amountCents), "referencia": reference,
	})
	if err != nil {
		return "", err
	}
	var body struct {
		ID    string `json:"id_devolucion"`
		Error string `json:"error"`
	}
	if err := providerapi.Decode(raw, &body); err != nil && status == http.StatusOK {
		return "", err
	}
	switch {
	case status == http.StatusConflict && body.Error == "EXCEDE_COBRO":
		return "", ErrExceedsCharge
	case status != http.StatusOK:
		return "", fmt.Errorf("%w: devolución parcial respondió %d %s", providerapi.ErrUnavailable, status, body.Error)
	case !services.ValidID.MatchString(body.ID):
		return "", fmt.Errorf("%w: devolución parcial %+v", ErrInvalid, body)
	}
	return body.ID, nil
}

// Transfer envía dinero de la cuenta de Parla a una billetera PagaYa (las ganancias de un
// repartidor). Es idempotente por referencia: repetirla con la misma referencia no paga dos veces.
func (c Client) Transfer(ctx context.Context, reference, destination string, amountCents int, concept string) (string, error) {
	status, raw, err := providerapi.CallWithHeaders(ctx, c.HTTP, http.MethodPost, c.BaseURL+"/pagaya/transferencias", map[string]any{
		"destino": destination, "monto": soles(amountCents), "concepto": concept, "referencia": reference,
	}, map[string]string{"x-pagaya-clave": c.APIKey})
	if err != nil {
		return "", err
	}
	var body struct {
		ID     string `json:"id_transferencia"`
		Estado string `json:"estado"`
		Error  string `json:"error"`
	}
	_ = json.Unmarshal(raw, &body)
	switch {
	case status == http.StatusBadRequest && body.Error == "DESTINO_INVALIDO":
		return "", ErrInvalidDestination
	case status != http.StatusCreated:
		return "", fmt.Errorf("%w: transferencia respondió %d %s", providerapi.ErrUnavailable, status, body.Error)
	case body.Estado != "COMPLETADA" || !services.ValidID.MatchString(body.ID):
		return "", fmt.Errorf("%w: transferencia %+v", ErrInvalid, body)
	}
	return body.ID, nil
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
