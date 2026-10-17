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

func TestConRecojoYEntregaCobraPorDistancia(t *testing.T) {
	srv := rapidito(t)
	// Bodega en Miraflores → Calle Berlín: ~1.9 km en línea recta, ~2.5 km por las calles.
	status, out := postJSON(t, srv.URL+"/rapidito/api/quotes",
		`{"pickup":{"lat":-12.1268,"lng":-77.0195},"dropoff":{"address":"Calle Berlín 300","lat":-12.1191,"lng":-77.0349}}`)
	if status != 200 {
		t.Fatalf("estado %d %v", status, out)
	}
	km := out["distancia_km"].(float64)
	if km < 2.3 || km > 2.7 {
		t.Fatalf("distancia inesperada: %v", km)
	}
	fee := out["fee"].(map[string]any)["amount"].(string)
	if fee != "6.00" {
		t.Fatalf("tarifa por distancia inesperada: %s (km %v)", fee, km)
	}
	if eta := out["eta_minutes"].(float64); eta < 16 || eta > 18 {
		t.Fatalf("tiempo inesperado: %v", eta)
	}
	// Sin el punto de recojo, tarifa de referencia y sin distancia.
	_, ref := postJSON(t, srv.URL+"/rapidito/api/quotes", `{"dropoff":{"address":"Calle Berlín 300","lat":-12.1191,"lng":-77.0349}}`)
	if _, ok := ref["distancia_km"]; ok {
		t.Fatalf("sin recojo no hay distancia: %v", ref)
	}
}

func TestTarifaPorDistanciaConMinimoYMaximo(t *testing.T) {
	cases := []struct {
		km       float64
		fee, eta int
	}{{0.1, 400, 10}, {2.5, 600, 18}, {4.04, 750, 22}, {30, 2500, 100}}
	for _, c := range cases {
		if fee, eta := distanceQuote(c.km); fee != c.fee || eta != c.eta {
			t.Errorf("%v km: tarifa %d (quería %d), tiempo %d (quería %d)", c.km, fee, c.fee, eta, c.eta)
		}
	}
}
