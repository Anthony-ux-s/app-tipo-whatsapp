// Package mercadopago traduce Mercado Pago (Checkout Pro) a los contratos de pago de Parla.
//
// Por qué Mercado Pago en Perú: en un solo checkout la persona paga con Yape, tarjeta (crédito o
// débito) o PagoEfectivo; devuelve todo o una parte por API, firma sus avisos y da credenciales de
// prueba sin trámite. El cobro de Parla es una «preferencia» (checkout): su id es el del cobro hasta
// que se paga; desde el aviso de pago, el pedido guarda el id del pago, que es el que se devuelve.
//
//	POST /checkout/preferences                   crear el checkout (X-Idempotency-Key = pedido)
//	GET  /checkout/preferences/{id}              leer su referencia (para anular)
//	PUT  /checkout/preferences/{id}              vencerlo ya (anular un cobro sin pagar)
//	GET  /v1/payments/search?external_reference  ¿alguien ya pagó este pedido?
//	GET  /v1/payments/{id}                       el pago de un aviso
//	POST /v1/payments/{id}/refunds               devolver todo ({}) o una parte ({"amount"})
package mercadopago

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/parla/gateway/internal/payments"
	"github.com/parla/gateway/internal/services"
	"github.com/parla/gateway/internal/translators/providerapi"
)

const Provider = "Mercado Pago"

// DefaultBaseURL: la API de Mercado Pago (la misma para pruebas y producción; cambia el token).
const DefaultBaseURL = "https://api.mercadopago.com"

// signatureTolerance: un aviso con la marca de tiempo más vieja que esto se rechaza (repetición).
const signatureTolerance = 15 * time.Minute

var paymentID = regexp.MustCompile(`^\d{1,20}$`)

type Client struct {
	BaseURL string
	// AccessToken: credencial privada (TEST-… en pruebas, APP_USR-… en producción).
	AccessToken string
	// WebhookSecret: la clave secreta de los avisos (Tus integraciones → Webhooks).
	WebhookSecret string
	// Sandbox: usa el checkout de pruebas (sandbox_init_point).
	Sandbox bool
	// StatementDescriptor: lo que aparece en el estado de cuenta de la tarjeta.
	StatementDescriptor string
	HTTP                *http.Client
	Now                 func() time.Time
}

func (c Client) now() time.Time {
	if c.Now != nil {
		return c.Now()
	}
	return time.Now()
}

func (c Client) base() string {
	if c.BaseURL != "" {
		return strings.TrimRight(c.BaseURL, "/")
	}
	return DefaultBaseURL
}

func (c Client) call(ctx context.Context, method, path string, in any, idempotencyKey string) (int, []byte, error) {
	headers := map[string]string{"Authorization": "Bearer " + c.AccessToken}
	if idempotencyKey != "" {
		headers["X-Idempotency-Key"] = idempotencyKey
	}
	return providerapi.CallWithHeaders(ctx, c.HTTP, method, c.base()+path, in, headers)
}

// soles: céntimos como número decimal exacto (2340 → 23.40), sin redondeos de float.
func soles(cents int) json.Number {
	return json.Number(fmt.Sprintf("%d.%02d", cents/100, cents%100))
}

func cents(amount float64) int { return int(math.Round(amount * 100)) }

// mpTime: el formato de fechas que pide Mercado Pago (con milisegundos y zona).
func mpTime(t time.Time) string { return t.Format("2006-01-02T15:04:05.000-07:00") }

// CreateCharge crea el checkout del pedido. Repetirlo con la misma referencia devuelve el mismo.
func (c Client) CreateCharge(ctx context.Context, req payments.ChargeRequest) (payments.Charge, error) {
	expires := req.ExpiresIn
	if expires <= 0 {
		expires = 15 * time.Minute
	}
	now := c.now()
	title := req.Concept
	if utf8.RuneCountInString(title) > 250 {
		title = string([]rune(title)[:250])
	}
	body := map[string]any{
		"items": []map[string]any{{
			"id": req.Reference, "title": title, "quantity": 1, "currency_id": services.Currency, "unit_price": soles(req.AmountCents),
		}},
		"external_reference":   req.Reference,
		"notification_url":     req.NotifyURL,
		"expires":              true,
		"expiration_date_from": mpTime(now.Add(-time.Minute)),
		"expiration_date_to":   mpTime(now.Add(expires)),
		// Un solo pago, sin cuotas: el pedido se cobra completo.
		"payment_methods": map[string]any{"installments": 1},
	}
	if c.StatementDescriptor != "" {
		body["statement_descriptor"] = c.StatementDescriptor
	}
	if req.ReturnURL != "" {
		body["back_urls"] = map[string]string{"success": req.ReturnURL, "pending": req.ReturnURL, "failure": req.ReturnURL}
		if strings.HasPrefix(req.ReturnURL, "https://") {
			body["auto_return"] = "approved"
		}
	}
	status, raw, err := c.call(ctx, http.MethodPost, "/checkout/preferences", body, "pref-"+req.Reference)
	if err != nil {
		return payments.Charge{}, err
	}
	if status != http.StatusCreated && status != http.StatusOK {
		return payments.Charge{}, fmt.Errorf("%w: checkout respondió %d %s", providerapi.ErrUnavailable, status, short(raw))
	}
	var pref struct {
		ID               string `json:"id"`
		InitPoint        string `json:"init_point"`
		SandboxInitPoint string `json:"sandbox_init_point"`
	}
	if err := providerapi.Decode(raw, &pref); err != nil {
		return payments.Charge{}, err
	}
	link := pref.InitPoint
	if c.Sandbox && pref.SandboxInitPoint != "" {
		link = pref.SandboxInitPoint
	}
	if !validPreferenceID(pref.ID) || !httpsURL(link) {
		return payments.Charge{}, fmt.Errorf("%w: checkout %+v", payments.ErrInvalid, pref)
	}
	return payments.Charge{ID: pref.ID, Provider: Provider, QRText: link, PayURL: link, ExpiresAt: now.Add(expires)}, nil
}

// Cancel vence el checkout de un pedido sin pagar. Si alguien ya lo pagó, devuelve ErrAlreadyPaid
// (hay que devolverlo). Repetirlo no cambia nada.
func (c Client) Cancel(ctx context.Context, chargeID string) error {
	if paymentID.MatchString(chargeID) {
		return payments.ErrAlreadyPaid
	}
	ref, err := c.preferenceReference(ctx, chargeID)
	if err != nil {
		return err
	}
	if paid, err := c.approvedPayment(ctx, ref); err != nil {
		return err
	} else if paid != nil {
		return payments.ErrAlreadyPaid
	}
	status, raw, err := c.call(ctx, http.MethodPut, "/checkout/preferences/"+url.PathEscape(chargeID), map[string]any{
		"expires": true, "expiration_date_to": mpTime(c.now().Add(-time.Second)),
	}, "")
	if err != nil {
		return err
	}
	if status != http.StatusOK {
		return fmt.Errorf("%w: vencer checkout respondió %d %s", providerapi.ErrUnavailable, status, short(raw))
	}
	return nil
}

// Refund devuelve el pago completo y dice cuándo. Idempotente: si ya estaba devuelto, responde la
// fecha de esa devolución.
func (c Client) Refund(ctx context.Context, chargeID string) (time.Time, error) {
	p, err := c.resolvePayment(ctx, chargeID)
	if err != nil {
		return time.Time{}, err
	}
	if p.Status == "refunded" {
		return p.lastRefundAt(c.now()), nil
	}
	status, raw, err := c.call(ctx, http.MethodPost, "/v1/payments/"+strconv.FormatInt(p.ID, 10)+"/refunds", map[string]any{}, "refund-all-"+strconv.FormatInt(p.ID, 10))
	if err != nil {
		return time.Time{}, err
	}
	if status != http.StatusCreated && status != http.StatusOK {
		return time.Time{}, fmt.Errorf("%w: devolución respondió %d %s", providerapi.ErrUnavailable, status, short(raw))
	}
	var refund struct {
		DateCreated string `json:"date_created"`
	}
	_ = json.Unmarshal(raw, &refund)
	if at, err := time.Parse(time.RFC3339, refund.DateCreated); err == nil {
		return at, nil
	}
	return c.now(), nil
}

// RefundPartial devuelve una parte del pago (un reclamo). La referencia va como clave de
// idempotencia: repetirla devuelve la misma devolución sin devolver dos veces.
func (c Client) RefundPartial(ctx context.Context, chargeID, reference string, amountCents int) (string, error) {
	p, err := c.resolvePayment(ctx, chargeID)
	if err != nil {
		return "", err
	}
	id := strconv.FormatInt(p.ID, 10)
	status, raw, err := c.call(ctx, http.MethodPost, "/v1/payments/"+id+"/refunds", map[string]any{"amount": soles(amountCents)}, reference)
	if err != nil {
		return "", err
	}
	if status == http.StatusBadRequest {
		if remaining := cents(p.Amount) - cents(p.Refunded); amountCents > remaining {
			return "", payments.ErrExceedsCharge
		}
	}
	if status != http.StatusCreated && status != http.StatusOK {
		return "", fmt.Errorf("%w: devolución parcial respondió %d %s", providerapi.ErrUnavailable, status, short(raw))
	}
	var refund struct {
		ID json.Number `json:"id"`
	}
	if err := providerapi.Decode(raw, &refund); err != nil || refund.ID == "" {
		return "", fmt.Errorf("%w: devolución parcial %s", payments.ErrInvalid, short(raw))
	}
	return "mp_" + refund.ID.String(), nil
}

// Notification: lo que trae un aviso de Mercado Pago (cabeceras, la consulta y el cuerpo).
type Notification struct {
	Signature string // cabecera x-signature: «ts=…,v1=…»
	RequestID string // cabecera x-request-id
	DataID    string // consulta data.id
	Body      []byte
}

// ParseWebhook verifica la firma del aviso y, si es de un pago aprobado, lo trae de la API (el aviso
// solo dice «cambió el pago N»). Otros estados o tipos de aviso dan ErrUnknownStatus (se confirman sin
// hacer nada).
func (c Client) ParseWebhook(ctx context.Context, n Notification) (payments.Event, error) {
	var body struct {
		Type string `json:"type"`
		Data struct {
			ID json.RawMessage `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(n.Body, &body); err != nil {
		return payments.Event{}, payments.ErrInvalid
	}
	dataID := n.DataID
	if dataID == "" {
		dataID = strings.Trim(string(body.Data.ID), `"`)
	}
	if err := c.verify(n.Signature, n.RequestID, dataID); err != nil {
		return payments.Event{}, err
	}
	if body.Type != "payment" {
		return payments.Event{}, fmt.Errorf("%w: aviso %q", payments.ErrUnknownStatus, body.Type)
	}
	if !paymentID.MatchString(dataID) {
		return payments.Event{}, payments.ErrInvalid
	}
	p, err := c.payment(ctx, dataID)
	if err != nil {
		return payments.Event{}, err
	}
	if p.Status != "approved" {
		return payments.Event{}, fmt.Errorf("%w: pago %s", payments.ErrUnknownStatus, p.Status)
	}
	if !services.ValidID.MatchString(p.ExternalReference) {
		return payments.Event{}, payments.ErrInvalid
	}
	ev := payments.Event{ChargeID: strconv.FormatInt(p.ID, 10), Reference: p.ExternalReference, Status: services.Paid}
	if at, err := time.Parse(time.RFC3339, p.DateApproved); err == nil {
		ev.PaidAt = &at
	} else {
		now := c.now()
		ev.PaidAt = &now
	}
	return ev, nil
}

// ErrSignature: el aviso no viene firmado por Mercado Pago (o es una repetición vieja).
var ErrSignature = errors.New("firma del aviso de Mercado Pago inválida")

// verify: HMAC-SHA256 de «id:{data.id};request-id:{x-request-id};ts:{ts};» con la clave secreta.
func (c Client) verify(signature, requestID, dataID string) error {
	var ts, v1 string
	for _, part := range strings.Split(signature, ",") {
		k, v, _ := strings.Cut(strings.TrimSpace(part), "=")
		switch k {
		case "ts":
			ts = v
		case "v1":
			v1 = v
		}
	}
	got, err := hex.DecodeString(v1)
	if ts == "" || err != nil || len(got) != sha256.Size || c.WebhookSecret == "" {
		return ErrSignature
	}
	var manifest strings.Builder
	if dataID != "" {
		// Mercado Pago firma el id en minúsculas si es alfanumérico.
		manifest.WriteString("id:" + strings.ToLower(dataID) + ";")
	}
	if requestID != "" {
		manifest.WriteString("request-id:" + requestID + ";")
	}
	manifest.WriteString("ts:" + ts + ";")
	mac := hmac.New(sha256.New, []byte(c.WebhookSecret))
	mac.Write([]byte(manifest.String()))
	if !hmac.Equal(got, mac.Sum(nil)) {
		return ErrSignature
	}
	// ts viene en milisegundos (o segundos en avisos viejos).
	n, err := strconv.ParseInt(ts, 10, 64)
	if err != nil {
		return ErrSignature
	}
	at := time.UnixMilli(n)
	if n < 1e12 {
		at = time.Unix(n, 0)
	}
	if d := c.now().Sub(at); d > signatureTolerance || d < -signatureTolerance {
		return ErrSignature
	}
	return nil
}

type payment struct {
	ID                int64   `json:"id"`
	Status            string  `json:"status"`
	ExternalReference string  `json:"external_reference"`
	DateApproved      string  `json:"date_approved"`
	Amount            float64 `json:"transaction_amount"`
	Refunded          float64 `json:"transaction_amount_refunded"`
	Refunds           []struct {
		DateCreated string `json:"date_created"`
	} `json:"refunds"`
}

func (p payment) lastRefundAt(fallback time.Time) time.Time {
	if n := len(p.Refunds); n > 0 {
		if at, err := time.Parse(time.RFC3339, p.Refunds[n-1].DateCreated); err == nil {
			return at
		}
	}
	return fallback
}

func (c Client) payment(ctx context.Context, id string) (payment, error) {
	status, raw, err := c.call(ctx, http.MethodGet, "/v1/payments/"+url.PathEscape(id), nil, "")
	if err != nil {
		return payment{}, err
	}
	if status != http.StatusOK {
		return payment{}, fmt.Errorf("%w: pago respondió %d", providerapi.ErrUnavailable, status)
	}
	var p payment
	if err := providerapi.Decode(raw, &p); err != nil {
		return payment{}, err
	}
	return p, nil
}

// resolvePayment: el pago a devolver. El pedido guarda el id del pago desde el aviso; si todavía
// tiene el del checkout (el aviso no llegó), se busca el pago aprobado por la referencia del pedido.
func (c Client) resolvePayment(ctx context.Context, chargeID string) (payment, error) {
	if paymentID.MatchString(chargeID) {
		return c.payment(ctx, chargeID)
	}
	ref, err := c.preferenceReference(ctx, chargeID)
	if err != nil {
		return payment{}, err
	}
	p, err := c.approvedPayment(ctx, ref)
	if err != nil {
		return payment{}, err
	}
	if p == nil {
		return payment{}, payments.ErrNotPaid
	}
	return *p, nil
}

func (c Client) preferenceReference(ctx context.Context, prefID string) (string, error) {
	if !validPreferenceID(prefID) {
		return "", payments.ErrInvalid
	}
	status, raw, err := c.call(ctx, http.MethodGet, "/checkout/preferences/"+url.PathEscape(prefID), nil, "")
	if err != nil {
		return "", err
	}
	if status != http.StatusOK {
		return "", fmt.Errorf("%w: checkout respondió %d", providerapi.ErrUnavailable, status)
	}
	var pref struct {
		ExternalReference string `json:"external_reference"`
	}
	if err := providerapi.Decode(raw, &pref); err != nil || !services.ValidID.MatchString(pref.ExternalReference) {
		return "", fmt.Errorf("%w: checkout sin referencia", payments.ErrInvalid)
	}
	return pref.ExternalReference, nil
}

// approvedPayment: el pago aprobado (o ya devuelto) de un pedido, o nil si nadie lo pagó.
func (c Client) approvedPayment(ctx context.Context, reference string) (*payment, error) {
	q := url.Values{"external_reference": {reference}, "sort": {"date_created"}, "criteria": {"desc"}}
	status, raw, err := c.call(ctx, http.MethodGet, "/v1/payments/search?"+q.Encode(), nil, "")
	if err != nil {
		return nil, err
	}
	if status != http.StatusOK {
		return nil, fmt.Errorf("%w: búsqueda de pagos respondió %d", providerapi.ErrUnavailable, status)
	}
	var found struct {
		Results []payment `json:"results"`
	}
	if err := providerapi.Decode(raw, &found); err != nil {
		return nil, err
	}
	for _, p := range found.Results {
		if p.ExternalReference == reference && (p.Status == "approved" || p.Status == "refunded") {
			return &p, nil
		}
	}
	return nil, nil
}

// El id de una preferencia es «{collector}-{uuid}».
var preferenceID = regexp.MustCompile(`^[0-9]+-[0-9a-fA-F-]{8,64}$`)

func validPreferenceID(id string) bool { return preferenceID.MatchString(id) }

func httpsURL(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && u.Scheme == "https" && u.Host != ""
}

func short(raw []byte) string {
	if len(raw) > 300 {
		raw = raw[:300]
	}
	return string(raw)
}
