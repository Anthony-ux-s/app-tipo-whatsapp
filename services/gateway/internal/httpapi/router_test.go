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
