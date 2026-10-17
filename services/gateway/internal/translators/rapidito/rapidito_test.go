package rapidito

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/parla/gateway/internal/services"
)

func TestMontoEnTextoACentimosSinFloat(t *testing.T) {
	for in, want := range map[string]int{"6.50": 650, "6.5": 650, "7": 700, "0.05": 5, "123456.99": 12345699} {
		if got, err := parseAmount(in); err != nil || got != want {
			t.Errorf("%q → %d %v, esperaba %d", in, got, err, want)
		}
	}
	for _, bad := range []string{"", "6,50", "-1.00", "1.234", "1e3", "abc"} {
		if _, err := parseAmount(bad); err == nil {
			t.Errorf("%q debía rechazarse", bad)
		}
	}
}

func quoteServer(t *testing.T, body string) Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, body)
	}))
	t.Cleanup(srv.Close)
	return Client{BaseURL: srv.URL, HTTP: srv.Client()}
}

func TestCotizacionValidaYAbsurda(t *testing.T) {
	ctx := context.Background()
	address := services.Address{Line: "Av. Larco 123"}
	q, err := quoteServer(t, `{"quote_id":"q_1","fee":{"amount":"6.50","currency":"PEN"},"eta_minutes":30}`).Quote(ctx, nil, address)
	if err != nil || q.FeeCents != 650 || q.ETAMinutes != 30 || q.ID != "q_1" {
		t.Fatalf("cotización inesperada: %+v %v", q, err)
	}
	for _, body := range []string{
		`{"quote_id":"q_1","fee":{"amount":"999.00","currency":"PEN"},"eta_minutes":30}`,
		`{"quote_id":"q_1","fee":{"amount":"6.50","currency":"USD"},"eta_minutes":30}`,
		`{"quote_id":"q_1","fee":{"amount":"6.50","currency":"PEN"}}`,
		`{"fee":{"amount":"6.50","currency":"PEN"},"eta_minutes":30}`,
	} {
		if _, err := quoteServer(t, body).Quote(ctx, nil, address); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s debía rechazarse, obtuve %v", body, err)
		}
	}
}

func TestConCoordenadasMandaRecojoYEntregaYLeeLaDistancia(t *testing.T) {
	var sent map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sent = nil
		_ = json.NewDecoder(r.Body).Decode(&sent)
		_, _ = io.WriteString(w, `{"quote_id":"q_2","fee":{"amount":"6.00","currency":"PEN"},"eta_minutes":18,"distancia_km":2.5}`)
	}))
	t.Cleanup(srv.Close)
	c := Client{BaseURL: srv.URL, HTTP: srv.Client()}
	store := &services.GeoPoint{Lat: -12.1268, Lng: -77.0195}
	home := services.Address{Line: "Calle Berlín 300", Location: &services.GeoPoint{Lat: -12.1191, Lng: -77.0349}}
	q, err := c.Quote(context.Background(), store, home)
	if err != nil || q.FeeCents != 600 || q.DistanceKm == nil || *q.DistanceKm != 2.5 {
		t.Fatalf("cotización inesperada: %+v %v", q, err)
	}
	pickup := sent["pickup"].(map[string]any)
	dropoff := sent["dropoff"].(map[string]any)
	if pickup["lat"] != -12.1268 || dropoff["lng"] != -77.0349 || dropoff["address"] != "Calle Berlín 300" {
		t.Fatalf("no mandó los puntos: %v", sent)
	}
	// Sin la ubicación de la tienda no manda recojo.
	if _, err := c.Quote(context.Background(), nil, home); err != nil || sent["pickup"] != nil {
		t.Fatalf("sin tienda no debía mandar recojo: %v %v", sent, err)
	}
}
