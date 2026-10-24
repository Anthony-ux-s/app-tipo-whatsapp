// Package config lee y valida la configuración del gateway desde el entorno.
package config

import (
	"errors"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const devInternalToken = "parla-dev-internal-token"
const devJWTSecret = "parla-dev-secret-cambiar-en-produccion"
const devPagayaSecret = "pagaya-dev-secret"
const devMercayaKey = "mercaya-dev-clave"
const devPagayaAPIKey = "pagaya-dev-clave"

type Config struct {
	Production bool
	Port       int
	// CoreURL es el backend de dominio (NestJS) al que se reenvía /api.
	CoreURL *url.URL
	// RealtimeLinkURL es el enlace WebSocket multiplexado con el servicio de Elixir.
	RealtimeLinkURL string
	InternalToken   string
	JWTSecret       string
	// AllowedOrigins: hosts desde los que se acepta el WebSocket de los navegadores.
	AllowedOrigins []string
	// RatePerMinute: peticiones HTTP por IP y minuto.
	RatePerMinute int
	// ProvidersURL: sistemas externos (tienda, delivery, billetera); en desarrollo, los simuladores.
	ProvidersURL string
	// PublicURL: dirección pública del gateway, a la que la billetera manda sus avisos.
	PublicURL    string
	PagayaSecret string
	// MercayaAdminKey: clave de la API de administración de la tienda (catálogo de la dueña).
	MercayaAdminKey string
	// PagayaAPIKey: clave de la API de transferencias de la billetera (retiros de los repartidores).
	PagayaAPIKey string
	// PagayaSimulatorPublic: publica la página de pago de la billetera de prueba (PAGAYA_SIMULATOR_PUBLIC=true). Solo para pruebas.
	PagayaSimulatorPublic bool
	// PayoutAt: hora de Lima («HH:MM») del retiro automático diario a los repartidores; vacío = apagado.
	PayoutAt string
}

func env(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

// Load arma la configuración. En producción exige secretos propios.
func Load() (Config, error) {
	production := os.Getenv("NODE_ENV") == "production" || os.Getenv("APP_ENV") == "production"
	port, err := strconv.Atoi(env("GATEWAY_PORT", "4100"))
	if err != nil || port <= 0 {
		return Config{}, errors.New("GATEWAY_PORT debe ser un número de puerto válido")
	}
	core, err := url.Parse(env("CORE_URL", "http://localhost:4101"))
	if err != nil || core.Host == "" {
		return Config{}, errors.New("CORE_URL no es una URL válida")
	}
	rate, err := strconv.Atoi(env("GATEWAY_RATE_PER_MINUTE", "600"))
	if err != nil || rate <= 0 {
		return Config{}, errors.New("GATEWAY_RATE_PER_MINUTE debe ser un número positivo")
	}

	providers, err := url.Parse(env("PROVIDERS_URL", "http://localhost:4103"))
	if err != nil || providers.Host == "" {
		return Config{}, errors.New("PROVIDERS_URL no es una URL válida")
	}
	public, err := url.Parse(env("GATEWAY_PUBLIC_URL", "http://localhost:4100"))
	if err != nil || public.Host == "" {
		return Config{}, errors.New("GATEWAY_PUBLIC_URL no es una URL válida")
	}

	cfg := Config{
		Production:            production,
		Port:                  port,
		CoreURL:               core,
		RealtimeLinkURL:       env("REALTIME_LINK_URL", "ws://localhost:4102/link"),
		InternalToken:         env("INTERNAL_TOKEN", devInternalToken),
		JWTSecret:             env("JWT_SECRET", devJWTSecret),
		AllowedOrigins:        originHosts(env("WEB_ORIGIN", "http://localhost:3100")),
		RatePerMinute:         rate,
		ProvidersURL:          strings.TrimRight(providers.String(), "/"),
		PublicURL:             strings.TrimRight(public.String(), "/"),
		PagayaSimulatorPublic: strings.EqualFold(env("PAGAYA_SIMULATOR_PUBLIC", ""), "true"),
		PagayaSecret:          env("PAGAYA_WEBHOOK_SECRET", devPagayaSecret),
		MercayaAdminKey:       env("MERCAYA_ADMIN_KEY", devMercayaKey),
		PagayaAPIKey:          env("PAGAYA_API_KEY", devPagayaAPIKey),
		// Se lee tal cual: RAPIDITO_PAYOUT_AT="" (definida y vacía) apaga el retiro automático.
		PayoutAt: payoutAt(),
	}
	if _, err := time.Parse("15:04", cfg.PayoutAt); cfg.PayoutAt != "" && err != nil {
		return Config{}, errors.New("RAPIDITO_PAYOUT_AT debe tener el formato HH:MM (p. ej. 23:00)")
	}

	if production {
		if cfg.InternalToken == devInternalToken || len(cfg.InternalToken) < 24 {
			return Config{}, errors.New("en producción INTERNAL_TOKEN debe ser un secreto propio de al menos 24 caracteres")
		}
		if cfg.JWTSecret == devJWTSecret || len(cfg.JWTSecret) < 32 {
			return Config{}, errors.New("en producción JWT_SECRET debe ser un secreto propio de al menos 32 caracteres")
		}
		if cfg.PagayaSecret == devPagayaSecret || len(cfg.PagayaSecret) < 24 {
			return Config{}, errors.New("en producción PAGAYA_WEBHOOK_SECRET debe ser un secreto propio de al menos 24 caracteres")
		}
		if cfg.MercayaAdminKey == devMercayaKey || len(cfg.MercayaAdminKey) < 24 {
			return Config{}, errors.New("en producción MERCAYA_ADMIN_KEY debe ser una clave propia de al menos 24 caracteres")
		}
		if cfg.PagayaAPIKey == devPagayaAPIKey || len(cfg.PagayaAPIKey) < 24 {
			return Config{}, errors.New("en producción PAGAYA_API_KEY debe ser una clave propia de al menos 24 caracteres")
		}
	}
	return cfg, nil
}

// payoutAt: RAPIDITO_PAYOUT_AT, «23:00» si no está definida (definida y vacía la apaga).
func payoutAt() string {
	if v, ok := os.LookupEnv("RAPIDITO_PAYOUT_AT"); ok {
		return strings.TrimSpace(v)
	}
	return "23:00"
}

// originHosts convierte "http://a:3100,https://b.com" en ["a:3100", "b.com"].
func originHosts(list string) []string {
	var hosts []string
	for _, item := range strings.Split(list, ",") {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		if u, err := url.Parse(item); err == nil && u.Host != "" {
			hosts = append(hosts, u.Host)
		} else {
			hosts = append(hosts, item)
		}
	}
	return hosts
}
