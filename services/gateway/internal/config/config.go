// Package config lee y valida la configuración del gateway desde el entorno.
package config

import (
	"errors"
	"net/url"
	"os"
	"strconv"
	"strings"
)

const devInternalToken = "parla-dev-internal-token"
const devJWTSecret = "parla-dev-secret-cambiar-en-produccion"
const devPagayaSecret = "pagaya-dev-secret"
const devMotoyaSecret = "motoya-dev-secret"

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
	// PublicURL: dirección pública del gateway, a la que los proveedores mandan sus avisos.
	PublicURL    string
	PagayaSecret string
	MotoyaSecret string
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
		Production:      production,
		Port:            port,
		CoreURL:         core,
		RealtimeLinkURL: env("REALTIME_LINK_URL", "ws://localhost:4102/link"),
		InternalToken:   env("INTERNAL_TOKEN", devInternalToken),
		JWTSecret:       env("JWT_SECRET", devJWTSecret),
		AllowedOrigins:  originHosts(env("WEB_ORIGIN", "http://localhost:3100")),
		RatePerMinute:   rate,
		ProvidersURL:    strings.TrimRight(providers.String(), "/"),
		PublicURL:       strings.TrimRight(public.String(), "/"),
		PagayaSecret:    env("PAGAYA_WEBHOOK_SECRET", devPagayaSecret),
		MotoyaSecret:    env("MOTOYA_WEBHOOK_SECRET", devMotoyaSecret),
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
		if cfg.MotoyaSecret == devMotoyaSecret || len(cfg.MotoyaSecret) < 24 {
			return Config{}, errors.New("en producción MOTOYA_WEBHOOK_SECRET debe ser un secreto propio de al menos 24 caracteres")
		}
	}
	return cfg, nil
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
