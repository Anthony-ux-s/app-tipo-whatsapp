package httpapi

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/parla/gateway/internal/ratelimit"
)

type stubRealtime struct{}

func (stubRealtime) ServeHTTP(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusTeapot)
}
func (stubRealtime) Count() int { return 0 }

func gateway(t *testing.T, perMinute int) (*httptest.Server, *[]*http.Request) {
	t.Helper()
	var seen []*http.Request
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = append(seen, r)
		_, _ = io.WriteString(w, `{"from":"core"}`)
	}))
	t.Cleanup(core.Close)
	coreURL, _ := url.Parse(core.URL)
	gw := httptest.NewServer(New(Options{
		Core: coreURL, Realtime: stubRealtime{}, LinkUp: func() bool { return true }, Limiter: ratelimit.New(perMinute),
	}))
	t.Cleanup(gw.Close)
	return gw, &seen
}

func get(t *testing.T, url string) (*http.Response, string) {
	t.Helper()
	resp, err := http.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return resp, string(body)
}

func TestReenviaLaAPIAlCoreConIdDePeticion(t *testing.T) {
	gw, seen := gateway(t, 100)
	resp, body := get(t, gw.URL+"/api/workspaces")
	if resp.StatusCode != 200 || body != `{"from":"core"}` {
		t.Fatalf("esperaba respuesta del core, obtuve %d %s", resp.StatusCode, body)
	}
	if (*seen)[0].Header.Get("X-Request-Id") == "" || (*seen)[0].Header.Get("X-Forwarded-For") == "" {
		t.Fatal("faltan cabeceras de trazabilidad")
	}
}

func TestLasRutasInternasNoSonAccesiblesDesdeFuera(t *testing.T) {
	gw, seen := gateway(t, 100)
	resp, _ := get(t, gw.URL+"/api/internal/presence")
	if resp.StatusCode != http.StatusNotFound || len(*seen) != 0 {
		t.Fatalf("esperaba 404 sin llegar al core, obtuve %d (%d al core)", resp.StatusCode, len(*seen))
	}
}

func TestLimiteDePeticionesPorIP(t *testing.T) {
	gw, _ := gateway(t, 2)
	get(t, gw.URL+"/api/a")
	get(t, gw.URL+"/api/b")
	resp, _ := get(t, gw.URL+"/api/c")
	if resp.StatusCode != http.StatusTooManyRequests || resp.Header.Get("Retry-After") == "" {
		t.Fatalf("esperaba 429, obtuve %d", resp.StatusCode)
	}
}

func TestWebSocketYSalud(t *testing.T) {
	gw, _ := gateway(t, 100)
	if resp, _ := get(t, gw.URL+"/ws"); resp.StatusCode != http.StatusTeapot {
		t.Fatalf("/ws debía ir al tiempo real, obtuve %d", resp.StatusCode)
	}
	if resp, body := get(t, gw.URL+"/gateway/health"); resp.StatusCode != 200 || body == "" {
		t.Fatalf("salud: %d %s", resp.StatusCode, body)
	}
	if resp, _ := get(t, gw.URL+"/socket.io/?EIO=4"); resp.StatusCode != http.StatusGone {
		t.Fatalf("socket.io debía responder 410, obtuve %d", resp.StatusCode)
	}
}

func TestLaPaginaDePagoDePruebaSoloSePublicaSiSeActiva(t *testing.T) {
	sim := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "pagina:"+r.Method+":"+r.URL.Path)
	}))
	t.Cleanup(sim.Close)
	simURL, _ := url.Parse(sim.URL)
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = io.WriteString(w, "core") }))
	t.Cleanup(core.Close)
	coreURL, _ := url.Parse(core.URL)
	build := func(pay *url.URL) *httptest.Server {
		gw := httptest.NewServer(New(Options{Core: coreURL, Realtime: stubRealtime{}, LinkUp: func() bool { return true }, Limiter: ratelimit.New(100), PayPage: pay}))
		t.Cleanup(gw.Close)
		return gw
	}

	// Apagada (lo normal en producción): la ruta cae al core, nunca llega al simulador.
	if _, body := get(t, build(nil).URL+"/pagaya/pagar/abc"); body != "core" {
		t.Fatalf("apagada, debía ir al core; obtuve %q", body)
	}
	// Encendida: solo la página de pago (GET y POST), nada más del simulador.
	on := build(simURL)
	if _, body := get(t, on.URL+"/pagaya/pagar/abc"); body != "pagina:GET:/pagaya/pagar/abc" {
		t.Fatalf("encendida, debía ir al simulador; obtuve %q", body)
	}
	resp, err := http.Post(on.URL+"/pagaya/pagar/abc", "application/x-www-form-urlencoded", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if b, _ := io.ReadAll(resp.Body); string(b) != "pagina:POST:/pagaya/pagar/abc" {
		t.Fatalf("el POST debía llegar al simulador; obtuve %q", b)
	}
	if _, body := get(t, on.URL+"/pagaya/cobros/abc"); body != "core" {
		t.Fatalf("la API de cobros no debe quedar pública; obtuve %q", body)
	}
}
