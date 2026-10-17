// Gateway de Parla: punto de entrada único (API Gateway / orquestador central).
//
//	navegador ──/api──► core NestJS        (HTTP, con límite de peticiones)
//	navegador ──/ws───► realtime Elixir    (WebSocket multiplexado, traductor del chat)
//	navegador ──/api/services──► tienda, delivery y billetera (traductores + orquestador de pedidos)
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/parla/gateway/internal/config"
	"github.com/parla/gateway/internal/httpapi"
	"github.com/parla/gateway/internal/orders"
	"github.com/parla/gateway/internal/ratelimit"
	"github.com/parla/gateway/internal/realtime"
	"github.com/parla/gateway/internal/translators/chat"
	"github.com/parla/gateway/internal/translators/mercaya"
	"github.com/parla/gateway/internal/translators/pagaya"
	"github.com/parla/gateway/internal/translators/rapidito"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		slog.Error("configuración inválida", "error", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	link := realtime.NewLink(cfg.RealtimeLinkURL, cfg.InternalToken)
	hub := realtime.NewHub(link, chat.New(), cfg.JWTSecret, cfg.AllowedOrigins)
	go link.Run(ctx)

	limiter := ratelimit.New(cfg.RatePerMinute)
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				limiter.Sweep(10 * time.Minute)
			}
		}
	}()

	client := &http.Client{Timeout: 10 * time.Second}
	core := orders.HTTPCore{BaseURL: cfg.CoreURL, Token: cfg.InternalToken, HTTP: client}
	wallet := pagaya.Client{BaseURL: cfg.ProvidersURL, HTTP: client, APIKey: cfg.PagayaAPIKey}
	orch := &orders.Orchestrator{
		Commerce:  mercaya.Client{BaseURL: cfg.ProvidersURL, HTTP: client, AdminKey: cfg.MercayaAdminKey},
		Delivery:  rapidito.Client{BaseURL: cfg.ProvidersURL, HTTP: client},
		Payments:  wallet,
		Core:      core,
		Payouts:   core,
		Wallet:    wallet,
		Claims:    core,
		Refunds:   wallet,
		PublicURL: cfg.PublicURL,
	}
	servicesAPI := &orders.HTTP{Orch: orch, PagayaSecret: cfg.PagayaSecret}
	if err := orch.StartPayoutScheduler(ctx, cfg.PayoutAt); err != nil {
		slog.Error("no se pudo programar el retiro automático", "error", err)
		os.Exit(1)
	}

	server := &http.Server{
		Addr: fmt.Sprintf(":%d", cfg.Port),
		Handler: httpapi.New(httpapi.Options{
			Core: cfg.CoreURL, Realtime: hub, LinkUp: link.Connected, Limiter: limiter, TrustProxy: cfg.Production,
			JWTSecret: cfg.JWTSecret, Services: servicesAPI,
		}),
		ReadHeaderTimeout: 10 * time.Second,
	}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}()

	slog.Info("gateway de Parla escuchando", "url", fmt.Sprintf("http://localhost:%d", cfg.Port), "core", cfg.CoreURL.String(), "realtime", cfg.RealtimeLinkURL, "proveedores", cfg.ProvidersURL)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("el gateway se detuvo", "error", err)
		os.Exit(1)
	}
}
