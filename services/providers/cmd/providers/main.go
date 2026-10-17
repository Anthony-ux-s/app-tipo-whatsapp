// Simuladores de los sistemas externos con los que se integra Parla, para desarrollo y pruebas:
//
//	/mercaya/*  tienda en línea (catálogo y reservas)
//	/rapidito/*   delivery en moto (cotización, despacho y avisos)
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
	port := env("PROVIDERS_PORT", "4103")
	publicURL := env("PROVIDERS_PUBLIC_URL", "http://localhost:"+port)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		notify.WriteJSON(w, http.StatusOK, map[string]any{"status": "ok", "service": "parla-providers", "systems": []string{"mercaya", "rapidito", "pagaya"}})
	})
	mercaya.NewStore().Routes(mux)
	rapidito.New(millis("RAPIDITO_STEP_MS", 4000), notify.Notifier{
		Secret: env("RAPIDITO_WEBHOOK_SECRET", "rapidito-dev-secret"), Header: "x-rapidito-signature", Retries: 4, Backoff: time.Second,
	}).Routes(mux)
	pagaya.New(publicURL, millis("PAGAYA_EXPIRY_MS", 15*60*1000), notify.Notifier{
		Secret: env("PAGAYA_WEBHOOK_SECRET", "pagaya-dev-secret"), Header: "x-pagaya-firma", Retries: 4, Backoff: time.Second,
	}).Routes(mux)

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
