package pagaya

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/parla/providers/internal/notify"
)

const secret = "pagaya-test-secret"

type inbox struct {
	mu     sync.Mutex
	events []map[string]any
	signed []bool
	got    chan struct{}
}

func callback(t *testing.T) (*httptest.Server, *inbox) {
	t.Helper()
	in := &inbox{got: make(chan struct{}, 10)}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var ev map[string]any
		_ = json.Unmarshal(body, &ev)
		in.mu.Lock()
		in.events = append(in.events, ev)
		in.signed = append(in.signed, r.Header.Get("x-pagaya-firma") == notify.Sign(secret, body))
		in.mu.Unlock()
		in.got <- struct{}{}
	}))
	t.Cleanup(srv.Close)
	return srv, in
}

func pagaya(t *testing.T, expiry time.Duration) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	srv := httptest.NewServer(mux)
	svc := New(srv.URL, expiry, notify.Notifier{Secret: secret, Header: "x-pagaya-firma", Backoff: time.Millisecond})
	svc.Routes(mux)
	t.Cleanup(srv.Close)
	return srv
}

func crear(t *testing.T, srv *httptest.Server, notifyURL string) map[string]any {
	t.Helper()
	body := `{"monto":23.40,"moneda":"PEN","concepto":"Pedido <b>Parla</b>","referencia":"ord_1","notificar_a":"` + notifyURL + `"}`
	resp, err := http.Post(srv.URL+"/pagaya/cobros", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	if resp.StatusCode != 201 {
		t.Fatalf("esperaba 201, obtuve %d %v", resp.StatusCode, out)
	}
	return out
}

func wait(t *testing.T, in *inbox) {
	t.Helper()
	select {
	case <-in.got:
	case <-time.After(3 * time.Second):
		t.Fatal("no llegó el aviso")
	}
}

func TestCobroConQRYPaginaEscapada(t *testing.T) {
	srv := pagaya(t, time.Minute)
	out := crear(t, srv, "http://localhost:1/hook")
	if out["qr_texto"] != out["url_pago"] || !strings.HasPrefix(out["url_pago"].(string), srv.URL+"/pagaya/pagar/cob_") {
		t.Fatalf("cobro inesperado: %v", out)
	}
	resp, _ := http.Get(out["url_pago"].(string))
	page, _ := io.ReadAll(resp.Body)
	html := string(page)
	if !strings.Contains(html, "S/ 23.40") || strings.Contains(html, "<b>Parla</b>") || !strings.Contains(html, "&lt;b&gt;Parla&lt;/b&gt;") {
		t.Fatal("la página debe mostrar el monto y escapar el concepto")
	}
}

func TestPagarAvisaUnaSolaVezConFirma(t *testing.T) {
	srv := pagaya(t, time.Minute)
	hook, in := callback(t)
	out := crear(t, srv, hook.URL)
	pay := func() int {
		req, _ := http.NewRequest(http.MethodPost, out["url_pago"].(string), nil)
		req.Header.Set("Accept", "application/json")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		return resp.StatusCode
	}
	if pay() != 200 {
		t.Fatal("el pago debía aceptarse")
	}
	wait(t, in)
	if pay() != 200 {
		t.Fatal("pagar otra vez debe ser inofensivo")
	}
	time.Sleep(100 * time.Millisecond)
	in.mu.Lock()
	defer in.mu.Unlock()
	if len(in.events) != 1 || in.events[0]["estado"] != "PAGADO" || in.events[0]["referencia"] != "ord_1" || in.events[0]["pagado_en"] == nil || !in.signed[0] {
		t.Fatalf("aviso inesperado: %v firmado=%v", in.events, in.signed)
	}
	resp, _ := http.Get(srv.URL + "/pagaya/cobros/" + out["id_cobro"].(string))
	var status map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&status)
	if status["estado"] != "PAGADO" || status["monto"].(float64) != 23.4 {
		t.Fatalf("estado inesperado: %v", status)
	}
}

func TestCobroVencidoAvisaExpirado(t *testing.T) {
	srv := pagaya(t, 30*time.Millisecond)
	hook, in := callback(t)
	crear(t, srv, hook.URL)
	wait(t, in)
	in.mu.Lock()
	defer in.mu.Unlock()
	if in.events[0]["estado"] != "EXPIRADO" || in.events[0]["pagado_en"] != nil {
		t.Fatalf("esperaba EXPIRADO, obtuve %v", in.events[0])
	}
}

func TestRechazaDatosInvalidos(t *testing.T) {
	srv := pagaya(t, time.Minute)
	for _, body := range []string{
		`{"monto":0,"moneda":"PEN","referencia":"r","notificar_a":"http://x.y/h"}`,
		`{"monto":5,"moneda":"USD","referencia":"r","notificar_a":"http://x.y/h"}`,
		`{"monto":5,"moneda":"PEN","referencia":"r","notificar_a":"javascript:alert(1)"}`,
	} {
		resp, _ := http.Post(srv.URL+"/pagaya/cobros", "application/json", strings.NewReader(body))
		if resp.StatusCode != 422 {
			t.Fatalf("esperaba 422 para %s, obtuve %d", body, resp.StatusCode)
		}
	}
}

func post(t *testing.T, url string) (int, map[string]any) {
	t.Helper()
	req, _ := http.NewRequest(http.MethodPost, url, nil)
	req.Header.Set("Accept", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

func TestAnularUnCobroPendienteImpidePagarlo(t *testing.T) {
	srv := pagaya(t, time.Minute)
	out := crear(t, srv, "http://localhost:1/hook")
	id := out["id_cobro"].(string)
	for i := 0; i < 2; i++ { // anular dos veces es inofensivo
		if status, body := post(t, srv.URL+"/pagaya/cobros/"+id+"/anular"); status != 200 || body["estado"] != "ANULADO" {
			t.Fatalf("anular: %d %v", status, body)
		}
	}
	if status, body := post(t, out["url_pago"].(string)); status != 409 || body["error"] != "ANULADO" {
		t.Fatalf("un cobro anulado no se paga: %d %v", status, body)
	}
	resp, _ := http.Get(out["url_pago"].(string))
	page, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(page), "Este cobro fue anulado") {
		t.Fatal("la página debe decir que el cobro fue anulado")
	}
	if status, _ := post(t, srv.URL+"/pagaya/cobros/cob_nada/anular"); status != 404 {
		t.Fatalf("cobro desconocido: %d", status)
	}
}

func TestDevolverUnCobroPagado(t *testing.T) {
	srv := pagaya(t, time.Minute)
	hook, in := callback(t)
	out := crear(t, srv, hook.URL)
	id := out["id_cobro"].(string)
	if status, body := post(t, srv.URL+"/pagaya/cobros/"+id+"/devolucion"); status != 409 || body["error"] != "NO_PAGADO" {
		t.Fatalf("sin pagar no se devuelve: %d %v", status, body)
	}
	post(t, out["url_pago"].(string))
	wait(t, in)
	if status, body := post(t, srv.URL+"/pagaya/cobros/"+id+"/anular"); status != 409 || body["error"] != "YA_PAGADO" {
		t.Fatalf("pagado no se anula: %d %v", status, body)
	}
	status, first := post(t, srv.URL+"/pagaya/cobros/"+id+"/devolucion")
	if status != 200 || first["estado"] != "DEVUELTO" || first["devuelto_en"] == nil {
		t.Fatalf("devolución: %d %v", status, first)
	}
	if status, again := post(t, srv.URL+"/pagaya/cobros/"+id+"/devolucion"); status != 200 || again["devuelto_en"] != first["devuelto_en"] {
		t.Fatalf("devolver otra vez debe ser idempotente: %d %v", status, again)
	}
	if status, _ := post(t, out["url_pago"].(string)); status != 409 {
		t.Fatalf("un cobro devuelto no se vuelve a pagar: %d", status)
	}
}
