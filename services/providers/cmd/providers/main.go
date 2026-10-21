// Simuladores de los sistemas externos con los que se integra Parla, para desarrollo y pruebas:
//
//	/mercaya/*  tienda en línea (catálogo y reservas)
//	/rapidito/* tarifa del delivery en moto (cotización)
//	/pagaya/*   billetera con cobros por QR al estilo Yape
//
// Cada uno tiene su propio formato de API; el gateway los traduce a los contratos de Parla.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/parla/providers/internal/mercaya"
	"github.com/parla/providers/internal/notify"
	"github.com/parla/providers/internal/pagaya"
	"github.com/parla/providers/internal/rapidito"
)

func env(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func millis(key string, fallback int) time.Duration {
	n, err := strconv.Atoi(env(key, strconv.Itoa(fallback)))
	if err != nil || n <= 0 {
		n = fallback
	}
	return time.Duration(n) * time.Millisecond
}

func main() {
	production := os.Getenv("NODE_ENV") == "production" || os.Getenv("APP_ENV") == "production"
	port := env("PROVIDERS_PORT", "4103")
	publicURL := env("PROVIDERS_PUBLIC_URL", "http://localhost:"+port)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		notify.WriteJSON(w, http.StatusOK, map[string]any{"status": "ok", "service": "parla-providers", "systems": []string{"mercaya", "rapidito", "pagaya"}})
	})
	store := mercaya.NewStore()
	store.AdminKey = env("MERCAYA_ADMIN_KEY", mercaya.DevAdminKey)
	if production && (store.AdminKey == mercaya.DevAdminKey || len(store.AdminKey) < 24) {
		slog.Error("en producción MERCAYA_ADMIN_KEY debe ser una clave propia de al menos 24 caracteres")
		os.Exit(1)
	}
	store.Routes(mux)
	rapidito.New().Routes(mux)
	wallet := pagaya.New(publicURL, millis("PAGAYA_EXPIRY_MS", 15*60*1000), notify.Notifier{
		Secret: env("PAGAYA_WEBHOOK_SECRET", "pagaya-dev-secret"), Header: "x-pagaya-firma", Retries: 4, Backoff: time.Second,
	})
	// Las transferencias sacan dinero de la cuenta del comercio: se protegen con su propia clave.
	wallet.APIKey = env("PAGAYA_API_KEY", pagaya.DevAPIKey)
	if production && (wallet.APIKey == pagaya.DevAPIKey || len(wallet.APIKey) < 24) {
		slog.Error("en producción PAGAYA_API_KEY debe ser una clave propia de al menos 24 caracteres")
		os.Exit(1)
	}
	wallet.Routes(mux)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	server := &http.Server{Addr: ":" + port, Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}()

	slog.Info("simuladores de proveedores escuchando", "url", fmt.Sprintf("http://localhost:%s", port), "público", publicURL)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("los simuladores se detuvieron", "error", err)
		os.Exit(1)
	}
}
