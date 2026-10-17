package pagaya

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/parla/gateway/internal/services"
	"github.com/parla/gateway/internal/webhook"
)

func TestCobroEnviaMontoExactoYTraduceRespuesta(t *testing.T) {
	var sent string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		sent = string(body)
		w.WriteHeader(http.StatusCreated)
		_, _ = io.WriteString(w, `{"id_cobro":"cob_1","qr_texto":"http://p/pagaya/pagar/cob_1","url_pago":"http://p/pagaya/pagar/cob_1","expira_en":"2026-10-17T12:15:00Z"}`)
	}))
	t.Cleanup(srv.Close)
	c := Client{BaseURL: srv.URL, HTTP: srv.Client()}
	charge, err := c.CreateCharge(context.Background(), ChargeRequest{AmountCents: 2340, Concept: "Pedido", Reference: "ord_1", NotifyURL: "http://gw/hooks/pagaya"})
	if err != nil || charge.ID != "cob_1" || charge.PayURL != "http://p/pagaya/pagar/cob_1" || charge.ExpiresAt.Minute() != 15 {
		t.Fatalf("cobro inesperado: %+v %v", charge, err)
	}
	if !strings.Contains(sent, `"monto":23.40`) || !strings.Contains(sent, `"moneda":"PEN"`) || !strings.Contains(sent, `"referencia":"ord_1"`) {
		t.Fatalf("solicitud inesperada: %s", sent)
	}
}

func TestCobroConURLDePagoSospechosaSeRechaza(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusCreated)
		_, _ = io.WriteString(w, `{"id_cobro":"cob_1","qr_texto":"x","url_pago":"javascript:alert(1)","expira_en":"2026-10-17T12:15:00Z"}`)
	}))
	t.Cleanup(srv.Close)
	_, err := Client{BaseURL: srv.URL, HTTP: srv.Client()}.CreateCharge(context.Background(), ChargeRequest{AmountCents: 100, Reference: "r"})
	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("esperaba ErrInvalid, obtuve %v", err)
	}
}

const secret = "pagaya-test-secret"

func TestAvisosPagadoYExpirado(t *testing.T) {
	paid := []byte(`{"id_cobro":"cob_1","referencia":"ord_1","estado":"PAGADO","pagado_en":"2026-10-17T12:05:00Z"}`)
	ev, err := ParseWebhook(paid, webhook.Sign(secret, paid), secret)
	if err != nil || ev.Status != services.Paid || ev.Reference != "ord_1" || ev.PaidAt == nil {
		t.Fatalf("aviso inesperado: %+v %v", ev, err)
	}
	expired := []byte(`{"id_cobro":"cob_1","referencia":"ord_1","estado":"EXPIRADO","pagado_en":null}`)
	if ev, err := ParseWebhook(expired, webhook.Sign(secret, expired), secret); err != nil || ev.Status != services.PaymentExpired {
		t.Fatalf("esperaba vencido: %+v %v", ev, err)
	}
	noDate := []byte(`{"id_cobro":"cob_1","referencia":"ord_1","estado":"PAGADO"}`)
	if _, err := ParseWebhook(noDate, webhook.Sign(secret, noDate), secret); !errors.Is(err, ErrInvalid) {
		t.Fatalf("un pago sin fecha es inválido, obtuve %v", err)
	}
	tampered := []byte(strings.Replace(string(paid), "ord_1", "ord_2", 1))
	if _, err := ParseWebhook(tampered, webhook.Sign(secret, paid), secret); !errors.Is(err, webhook.ErrSignature) {
		t.Fatalf("un aviso alterado debe rechazarse, obtuve %v", err)
	}
}
