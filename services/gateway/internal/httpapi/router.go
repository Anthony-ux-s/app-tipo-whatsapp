// Package httpapi arma el punto de entrada HTTP del gateway: proxy al core, WebSocket y salud.
package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"

	"github.com/parla/gateway/internal/ratelimit"
)

// Realtime es lo que el router necesita del hub de tiempo real.
type Realtime interface {
	http.Handler
	Count() int
}

type Options struct {
	Core       *url.URL
	Realtime   Realtime
	LinkUp     func() bool
	Limiter    *ratelimit.Limiter
	TrustProxy bool
}

// New devuelve el handler del gateway.
//   - /ws               → tiempo real (Elixir), pasando por el traductor del chat
//   - /api/internal/*   → 404: esas rutas son solo entre servicios
//   - /api/*            → core (NestJS), con límite de peticiones por IP
//   - resto             → core (en producción sirve la web)
func New(opts Options) http.Handler {
	proxy := &httputil.ReverseProxy{
		Rewrite: func(r *httputil.ProxyRequest) {
			r.SetURL(opts.Core)
			r.SetXForwarded()
			r.Out.Host = r.In.Host
			if r.Out.Header.Get("X-Request-Id") == "" {
				r.Out.Header.Set("X-Request-Id", requestID())
			}
		},
		ErrorHandler: func(w http.ResponseWriter, _ *http.Request, err error) {
			slog.Error("core no disponible", "error", err)
			writeJSON(w, http.StatusBadGateway, map[string]any{
				"statusCode": 502, "error": "bad_gateway", "message": "El servicio no está disponible. Inténtalo de nuevo en un momento.",
			})
		},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /gateway/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "service": "parla-gateway", "realtime": opts.LinkUp(), "connections": opts.Realtime.Count()})
	})
	mux.Handle("GET /ws", opts.Realtime)
	mux.HandleFunc("/api/internal/", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusNotFound, map[string]any{"statusCode": 404, "error": "not_found", "message": "No encontrado"})
	})
	mux.HandleFunc("/socket.io/", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusGone, map[string]any{"statusCode": 410, "error": "gone", "message": "El tiempo real ahora está en /ws. Recarga la página."})
	})
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		if !opts.Limiter.Allow(clientIP(r, opts.TrustProxy)) {
			w.Header().Set("Retry-After", "60")
			writeJSON(w, http.StatusTooManyRequests, map[string]any{"statusCode": 429, "error": "too_many_requests", "message": "Demasiadas solicitudes. Espera un momento."})
			return
		}
		proxy.ServeHTTP(w, r)
	})
	mux.Handle("/", proxy)
	return logRequests(mux)
}

func clientIP(r *http.Request, trustProxy bool) string {
	if trustProxy {
		if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
			return strings.TrimSpace(strings.Split(forwarded, ",")[0])
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func requestID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		if strings.HasPrefix(r.URL.Path, "/api/") {
			slog.Debug("petición", "método", r.Method, "ruta", r.URL.Path, "duración", time.Since(start))
		}
	})
}
