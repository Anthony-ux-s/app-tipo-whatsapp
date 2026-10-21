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

	"github.com/parla/gateway/internal/auth"
	"github.com/parla/gateway/internal/orders"
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
	// JWTSecret valida la sesión en las rutas que atiende el propio gateway (servicios).
	JWTSecret string
	// Services, si existe, atiende /api/services/* y los avisos /hooks/* de los proveedores.
	Services *orders.HTTP
}

// New devuelve el handler del gateway.
//   - /ws               → tiempo real (Elixir), pasando por el traductor del chat
//   - /api/internal/*   → 404: esas rutas son solo entre servicios
//   - /api/services/*   → orquestador de servicios (tienda, delivery, pagos), con sesión
//   - /hooks/*          → avisos firmados de los proveedores externos
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
	limited := func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			if !opts.Limiter.Allow(clientIP(r, opts.TrustProxy)) {
				w.Header().Set("Retry-After", "60")
				writeJSON(w, http.StatusTooManyRequests, map[string]any{"statusCode": 429, "error": "too_many_requests", "message": "Demasiadas solicitudes. Espera un momento."})
				return
			}
			next(w, r)
		}
	}
	if svc := opts.Services; svc != nil {
		authed := func(next orders.UserHandler) http.HandlerFunc {
			return limited(withUser(opts.JWTSecret, next))
		}
		mux.HandleFunc("GET /api/services", authed(svc.Catalog))
		mux.HandleFunc("GET /api/services/mercado/products", authed(svc.Products))
		mux.HandleFunc("POST /api/services/mercado/quote", authed(svc.Quote))
		mux.HandleFunc("POST /api/services/mercado/orders", authed(svc.Create))
		// Cancelar y rechazar mueven dinero (anular o devolver en la billetera): los resuelve el gateway.
		mux.HandleFunc("POST /api/orders/{id}/cancel", authed(svc.CancelOrder))
		mux.HandleFunc("POST /api/business/orders/{id}/reject", authed(svc.RejectOrder))
		mux.HandleFunc("POST /api/business/orders/{id}/cancel", authed(svc.CancelBusinessOrder))
		// Catálogo de la tienda: precios, ofertas y stock viven en MercaYa; la dueña los cambia por aquí.
		mux.HandleFunc("GET /api/business/catalog", authed(svc.StoreCatalog))
		mux.HandleFunc("PATCH /api/business/catalog/{sku}", authed(svc.UpdateStoreProduct))
		// Retiro de ganancias: lo hace el gateway porque mueve dinero en la billetera.
		mux.HandleFunc("POST /api/driver/payouts", authed(svc.Payout))
		// Soporte aprueba un reclamo: el core decide cuánto y si puede; aquí se devuelve en PagaYa.
		mux.HandleFunc("POST /api/admin/claims/{id}/refund", authed(svc.RefundClaim))
		// Soporte destraba un pedido: cancelarlo devuelve el pago en PagaYa.
		mux.HandleFunc("POST /api/admin/orders/{id}/cancel", authed(svc.CancelBySupport))
		mux.HandleFunc("POST /hooks/pagaya", svc.PagayaHook)
	}
	mux.HandleFunc("/api/", limited(proxy.ServeHTTP))
	mux.Handle("/", proxy)
	return logRequests(mux)
}

// withUser exige un JWT válido (Authorization: Bearer) y pasa el id de la persona al handler.
func withUser(secret string, next orders.UserHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, found := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		claims, err := auth.Verify(strings.TrimSpace(token), secret, time.Now())
		if !found || err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"statusCode": 401, "error": "unauthorized", "message": "Inicia sesión para continuar"})
			return
		}
		next(w, r, claims.UserID)
	}
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
