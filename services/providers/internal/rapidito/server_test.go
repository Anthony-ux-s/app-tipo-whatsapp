package rapidito

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/parla/providers/internal/notify"
)

const secret = "rapidito-test-secret"

type received struct {
	mu     sync.Mutex
	events []map[string]any
	valid  []bool
	done   chan struct{}
}

func callbackServer(t *testing.T, want int) (*httptest.Server, *received) {
	t.Helper()
	rec := &received{done: make(chan struct{})}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var ev map[string]any
		_ = json.Unmarshal(body, &ev)
		rec.mu.Lock()
		rec.events = append(rec.events, ev)
		rec.valid = append(rec.valid, r.Header.Get("x-rapidito-signature") == notify.Sign(secret, body))
		if len(rec.events) == want {
			close(rec.done)
		}
		rec.mu.Unlock()
	}))
	t.Cleanup(srv.Close)
	return srv, rec
}

func rapidito(t *testing.T, now func() time.Time) *httptest.Server {
	t.Helper()
	svc := New(10*time.Millisecond, notify.Notifier{Secret: secret, Header: "x-rapidito-signature", Backoff: time.Millisecond})
	if now != nil {
		svc.Now = now
	}
	mux := http.NewServeMux()
	svc.Routes(mux)
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
	srv := rapidito(t, nil)
	status, out := postJSON(t, srv.URL+"/rapidito/api/quotes", `{"dropoff":{"address":"Av. Larco 123, Miraflores"}}`)
	fee := out["fee"].(map[string]any)
	if status != 200 || fee["currency"] != "PEN" || !strings.Contains(fee["amount"].(string), ".") || out["quote_id"] == "" {
		t.Fatalf("cotización inesperada: %d %v", status, out)
	}
	if status, _ := postJSON(t, srv.URL+"/rapidito/api/quotes", `{"dropoff":{"address":"x"}}`); status != 422 {
		t.Fatalf("una dirección vacía debía rechazarse, obtuve %d", status)
	}
}

func TestDeliveryAvisaAsignadoYEntregadoConFirma(t *testing.T) {
	srv := rapidito(t, nil)
	cb, rec := callbackServer(t, 2)
	_, q := postJSON(t, srv.URL+"/rapidito/api/quotes", `{"dropoff":{"address":"Jr. Cusco 456, Lima"}}`)
	status, d := postJSON(t, srv.URL+"/rapidito/api/deliveries", `{"quote_id":"`+q["quote_id"].(string)+`","reference":"ord_1","callback_url":"`+cb.URL+`"}`)
	if status != 201 || d["status"] != "SEARCHING_DRIVER" {
		t.Fatalf("delivery inesperado: %d %v", status, d)
	}
	// Reintentar con la misma referencia devuelve el mismo delivery.
	if _, again := postJSON(t, srv.URL+"/rapidito/api/deliveries", `{"quote_id":"otro","reference":"ord_1","callback_url":"`+cb.URL+`"}`); again["delivery_id"] != d["delivery_id"] {
		t.Fatalf("la referencia repetida debía devolver el mismo delivery: %v", again)
	}
	select {
	case <-rec.done:
	case <-time.After(3 * time.Second):
		t.Fatal("no llegaron los avisos")
	}
	rec.mu.Lock()
	defer rec.mu.Unlock()
	if rec.events[0]["status"] != "DRIVER_ASSIGNED" || rec.events[1]["status"] != "DELIVERED" || rec.events[0]["reference"] != "ord_1" {
		t.Fatalf("avisos inesperados: %v", rec.events)
	}
	if driver := rec.events[0]["driver"].(map[string]any); !strings.HasPrefix(driver["vehicle"].(string), "Moto · ") {
		t.Fatalf("falta el vehículo: %v", driver)
	}
	if !rec.valid[0] || !rec.valid[1] {
		t.Fatal("los avisos deben ir firmados")
	}
}

func TestCotizacionVencidaODesconocida(t *testing.T) {
	var offset atomic.Int64
	srv := rapidito(t, func() time.Time { return time.Now().Add(time.Duration(offset.Load())) })
	_, q := postJSON(t, srv.URL+"/rapidito/api/quotes", `{"dropoff":{"address":"Calle Lima 1"}}`)
	offset.Store(int64(quoteTTL + time.Minute))
	if status, _ := postJSON(t, srv.URL+"/rapidito/api/deliveries", `{"quote_id":"`+q["quote_id"].(string)+`","reference":"r","callback_url":"http://localhost:1/x"}`); status != 410 {
		t.Fatalf("esperaba 410, obtuve %d", status)
	}
	if status, _ := postJSON(t, srv.URL+"/rapidito/api/deliveries", `{"quote_id":"nada","reference":"r2","callback_url":"http://localhost:1/x"}`); status != 404 {
		t.Fatalf("esperaba 404, obtuve %d", status)
	}
	if status, _ := postJSON(t, srv.URL+"/rapidito/api/deliveries", `{"quote_id":"nada","reference":"r3","callback_url":"ftp://x"}`); status != 400 {
		t.Fatalf("esperaba 400 por callback inválido, obtuve %d", status)
	}
}
