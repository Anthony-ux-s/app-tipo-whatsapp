package rapidito

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func rapidito(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	New().Routes(mux)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func postJSON(t *testing.T, url, body string) (int, map[string]any) {
	t.Helper()
	resp, err := http.Post(url, "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

func TestCotizaConTarifaEnTextoDecimal(t *testing.T) {
	srv := rapidito(t)
	status, out := postJSON(t, srv.URL+"/rapidito/api/quotes", `{"dropoff":{"address":"Av. Larco 123, Miraflores"}}`)
	fee := out["fee"].(map[string]any)
	if status != 200 || fee["currency"] != "PEN" || !strings.Contains(fee["amount"].(string), ".") || out["quote_id"] == "" {
		t.Fatalf("cotización inesperada: %d %v", status, out)
	}
	if expires, err := time.Parse(time.RFC3339, out["expires_at"].(string)); err != nil || time.Until(expires) < quoteTTL-time.Minute {
		t.Fatalf("la cotización debe valer mientras el negocio prepara el pedido: %v %v", out["expires_at"], err)
	}
	if status, _ := postJSON(t, srv.URL+"/rapidito/api/quotes", `{"dropoff":{"address":"x"}}`); status != 422 {
		t.Fatalf("una dirección vacía debía rechazarse, obtuve %d", status)
	}
	if status, _ := postJSON(t, srv.URL+"/rapidito/api/quotes", `no es json`); status != 400 {
		t.Fatalf("un cuerpo inválido debía rechazarse, obtuve %d", status)
	}
}

func TestYaNoDespachaMotorizados(t *testing.T) {
	srv := rapidito(t)
	if status, _ := postJSON(t, srv.URL+"/rapidito/api/deliveries", `{"quote_id":"q_1","reference":"r"}`); status != http.StatusNotFound && status != http.StatusMethodNotAllowed {
		t.Fatalf("el reparto lo hacen los repartidores de Parla, obtuve %d", status)
	}
}
