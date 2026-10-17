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

	cfg := Config{
		Production:      production,
		Port:            port,
		CoreURL:         core,
		RealtimeLinkURL: env("REALTIME_LINK_URL", "ws://localhost:4102/link"),
		InternalToken:   env("INTERNAL_TOKEN", devInternalToken),
		JWTSecret:       env("JWT_SECRET", devJWTSecret),
		AllowedOrigins:  originHosts(env("WEB_ORIGIN", "http://localhost:3100")),
		RatePerMinute:   rate,
	}

	if production {
		if cfg.InternalToken == devInternalToken || len(cfg.InternalToken) < 24 {
			return Config{}, errors.New("en producción INTERNAL_TOKEN debe ser un secreto propio de al menos 24 caracteres")
		}
		if cfg.JWTSecret == devJWTSecret || len(cfg.JWTSecret) < 32 {
			return Config{}, errors.New("en producción JWT_SECRET debe ser un secreto propio de al menos 32 caracteres")
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
