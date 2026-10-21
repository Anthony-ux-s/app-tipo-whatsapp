package mercadopago

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/parla/gateway/internal/payments"
	"github.com/parla/gateway/internal/services"
)

const prefID = "202809963-920c288b-4ebb-40be-966f-700250fa5370"

var now = time.Date(2026, 10, 17, 12, 0, 0, 0, time.UTC)

// fakeMP imita lo justo de la API de Mercado Pago.
type fakeMP struct {
	mu        sync.Mutex
	requests  []string
	bodies    map[string]map[string]any
	headers   map[string]http.Header
	paid      bool
	refunded  float64
	refundKey map[string]int
	expired   bool
}

func newFake(t *testing.T) (*fakeMP, Client) {
	f := &fakeMP{bodies: map[string]map[string]any{}, headers: map[string]http.Header{}, refundKey: map[string]int{}}
	srv := httptest.NewServer(http.HandlerFunc(f.serve))
	t.Cleanup(srv.Close)
	return f, Client{BaseURL: srv.URL, AccessToken: "TEST-123", WebhookSecret: "secreto-webhook", HTTP: srv.Client(), Now: func() time.Time { return now }}
}

func (f *fakeMP) serve(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	key := r.Method + " " + r.URL.Path
	f.requests = append(f.requests, key)
	f.headers[key] = r.Header.Clone()
	raw, _ := io.ReadAll(r.Body)
	var body map[string]any
	_ = json.Unmarshal(raw, &body)
	f.bodies[key] = body
	if r.Header.Get("Authorization") != "Bearer TEST-123" {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	payment := func() map[string]any {
		status := "approved"
		if f.refunded >= 23.40 {
			status = "refunded"
		}
		return map[string]any{"id": 1234567890, "status": status, "external_reference": "ord_1", "date_approved": "2026-10-17T11:58:00.000-05:00", "transaction_amount": 23.40, "transaction_amount_refunded": f.refunded}
	}
	switch {
	case key == "POST /checkout/preferences":
		w.WriteHeader(http.StatusCreated)
		_, _ = io.WriteString(w, `{"id":"`+prefID+`","init_point":"https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=`+prefID+`","sandbox_init_point":"https://sandbox.mercadopago.com.pe/checkout/v1/redirect?pref_id=`+prefID+`"}`)
	case key == "GET /checkout/preferences/"+prefID:
		_, _ = io.WriteString(w, `{"id":"`+prefID+`","external_reference":"ord_1"}`)
	case key == "PUT /checkout/preferences/"+prefID:
		f.expired = true
		_, _ = io.WriteString(w, `{"id":"`+prefID+`"}`)
	case key == "GET /v1/payments/search":
		results := []map[string]any{}
		if f.paid {
			results = append(results, payment())
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"results": results})
	case key == "GET /v1/payments/1234567890":
		_ = json.NewEncoder(w).Encode(payment())
	case key == "POST /v1/payments/1234567890/refunds":
		idem := r.Header.Get("X-Idempotency-Key")
		if id, ok := f.refundKey[idem]; ok {
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(map[string]any{"id": id, "date_created": "2026-10-17T12:00:00.000-05:00"})
			return
		}
		amount := 23.40 - f.refunded
		if a, ok := body["amount"].(float64); ok {
			amount = a
		}
		if amount > 23.40-f.refunded+1e-9 {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = io.WriteString(w, `{"message":"Invalid refund amount","status":400}`)
			return
		}
		f.refunded += amount
		id := 900 + len(f.refundKey)
		f.refundKey[idem] = id
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]any{"id": id, "date_created": "2026-10-17T12:00:00.000-05:00"})
	default:
		w.WriteHeader(http.StatusNotFound)
	}
}

func TestCreaElCheckoutConElMontoExactoYLaReferencia(t *testing.T) {
	f, c := newFake(t)
	charge, err := c.CreateCharge(context.Background(), payments.ChargeRequest{
		AmountCents: 2340, Concept: "Pedido Parla · 3 productos + delivery", Reference: "ord_1",
		NotifyURL: "https://parla.pe/hooks/mercadopago", ReturnURL: "https://parla.pe/app/pedidos/ord_1", ExpiresIn: 15 * time.Minute,
	})
	if err != nil || charge.ID != prefID || charge.Provider != "Mercado Pago" || !strings.HasPrefix(charge.PayURL, "https://www.mercadopago.com.pe/") || charge.QRText != charge.PayURL {
		t.Fatalf("checkout: %+v %v", charge, err)
	}
	if !charge.ExpiresAt.Equal(now.Add(15 * time.Minute)) {
		t.Fatalf("vence en 15 min: %v", charge.ExpiresAt)
	}
	body := f.bodies["POST /checkout/preferences"]
	item := body["items"].([]any)[0].(map[string]any)
	if item["unit_price"] != 23.4 || item["currency_id"] != "PEN" || body["external_reference"] != "ord_1" || body["auto_return"] != "approved" || body["expires"] != true {
		t.Fatalf("cuerpo del checkout: %+v", body)
	}
	if got := f.headers["POST /checkout/preferences"].Get("X-Idempotency-Key"); got != "pref-ord_1" {
		t.Fatalf("idempotencia por pedido: %q", got)
	}
	c.Sandbox = true
	if charge, _ := c.CreateCharge(context.Background(), payments.ChargeRequest{AmountCents: 100, Reference: "ord_1"}); !strings.HasPrefix(charge.PayURL, "https://sandbox.") {
		t.Fatalf("en pruebas usa el checkout de prueba: %s", charge.PayURL)
	}
}

func TestAnularVenceElCheckoutOAvisaQueYaSePago(t *testing.T) {
	f, c := newFake(t)
	ctx := context.Background()
	if err := c.Cancel(ctx, prefID); err != nil || !f.expired {
		t.Fatalf("sin pagar se vence: %v", err)
	}
	f.paid = true
	if err := c.Cancel(ctx, prefID); !errors.Is(err, payments.ErrAlreadyPaid) {
		t.Fatalf("ya pagado: %v", err)
	}
	if err := c.Cancel(ctx, "1234567890"); !errors.Is(err, payments.ErrAlreadyPaid) {
		t.Fatalf("con id de pago, ya está pagado: %v", err)
	}
}

func TestDevuelveTodoUnaVezAunqueSeRepita(t *testing.T) {
	f, c := newFake(t)
	f.paid = true
	ctx := context.Background()
	// Con el id del checkout (el aviso aún no llegó) encuentra el pago por la referencia
	at, err := c.Refund(ctx, prefID)
	if err != nil || at.IsZero() || f.refunded != 23.40 {
		t.Fatalf("devolución: %v %v %v", at, err, f.refunded)
	}
	if _, err := c.Refund(ctx, "1234567890"); err != nil || f.refunded != 23.40 {
		t.Fatalf("repetir no devuelve dos veces: %v %v", err, f.refunded)
	}
	f.paid = false
	f.refunded = 0
	if _, err := c.Refund(ctx, prefID); !errors.Is(err, payments.ErrNotPaid) {
		t.Fatalf("sin pago no hay qué devolver: %v", err)
	}
}

func TestDevolucionParcialIdempotenteYConTope(t *testing.T) {
	f, c := newFake(t)
	f.paid = true
	ctx := context.Background()
	id, err := c.RefundPartial(ctx, "1234567890", "rf_abc", 450)
	if err != nil || id != "mp_900" || f.bodies["POST /v1/payments/1234567890/refunds"]["amount"] != 4.5 {
		t.Fatalf("parcial: %q %v %+v", id, err, f.bodies)
	}
	if again, _ := c.RefundPartial(ctx, "1234567890", "rf_abc", 450); again != id || f.refunded != 4.5 {
		t.Fatalf("misma referencia, misma devolución: %q %v", again, f.refunded)
	}
	if _, err := c.RefundPartial(ctx, "1234567890", "rf_otro", 5000); !errors.Is(err, payments.ErrExceedsCharge) {
		t.Fatalf("más de lo que queda: %v", err)
	}
}

func sign(secret, dataID, requestID string, ts int64) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte("id:" + dataID + ";request-id:" + requestID + ";ts:" + itoa(ts) + ";"))
	return "ts=" + itoa(ts) + ",v1=" + hex.EncodeToString(mac.Sum(nil))
}

func itoa(n int64) string { return strconv.FormatInt(n, 10) }

func TestElAvisoFirmadoTraeElPagoAprobado(t *testing.T) {
	f, c := newFake(t)
	f.paid = true
	ctx := context.Background()
	body := []byte(`{"action":"payment.updated","type":"payment","data":{"id":"1234567890"}}`)
	ts := now.UnixMilli()
	ev, err := c.ParseWebhook(ctx, Notification{Signature: sign("secreto-webhook", "1234567890", "req-1", ts), RequestID: "req-1", DataID: "1234567890", Body: body})
	if err != nil || ev.ChargeID != "1234567890" || ev.Reference != "ord_1" || ev.Status != services.Paid || ev.PaidAt == nil {
		t.Fatalf("aviso: %+v %v", ev, err)
	}
	// Firma de otra clave, o vieja, se rechaza
	if _, err := c.ParseWebhook(ctx, Notification{Signature: sign("otra", "1234567890", "req-1", ts), RequestID: "req-1", DataID: "1234567890", Body: body}); !errors.Is(err, ErrSignature) {
		t.Fatalf("firma falsa: %v", err)
	}
	old := now.Add(-time.Hour).UnixMilli()
	if _, err := c.ParseWebhook(ctx, Notification{Signature: sign("secreto-webhook", "1234567890", "req-1", old), RequestID: "req-1", DataID: "1234567890", Body: body}); !errors.Is(err, ErrSignature) {
		t.Fatalf("aviso repetido de hace una hora: %v", err)
	}
	// Otros tipos de aviso se confirman sin hacer nada
	other := []byte(`{"type":"merchant_order","data":{"id":"555"}}`)
	if _, err := c.ParseWebhook(ctx, Notification{Signature: sign("secreto-webhook", "555", "req-2", ts), RequestID: "req-2", DataID: "555", Body: other}); !errors.Is(err, payments.ErrUnknownStatus) {
		t.Fatalf("otro tipo: %v", err)
	}
}
