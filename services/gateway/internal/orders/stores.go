package orders

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/parla/gateway/internal/services"
	"github.com/parla/gateway/internal/translators/mercaya"
	"github.com/parla/gateway/internal/translators/redwiiil"
)

// integrationTTL: cuánto se confía en la integración leída del core (un cambio de soporte se nota
// a los pocos segundos sin consultar al core en cada búsqueda).
const integrationTTL = 15 * time.Second

// CoreStores: las tiendas de los demás servicios según lo que soporte conectó en Integraciones.
// Hablan la API de tienda de Parla (la misma de MercaYa), en la URL y el prefijo configurados.
type CoreStores struct {
	Core HTTPCore
	HTTP *http.Client

	mu    sync.Mutex
	cache map[services.ServiceID]cachedIntegration
}

type cachedIntegration struct {
	integration services.Integration
	ok          bool
	at          time.Time
}

func (s *CoreStores) integration(ctx context.Context, service services.ServiceID) (services.Integration, bool, error) {
	s.mu.Lock()
	if c, hit := s.cache[service]; hit && time.Since(c.at) < integrationTTL {
		s.mu.Unlock()
		return c.integration, c.ok, nil
	}
	s.mu.Unlock()
	var out services.Integration
	err := s.Core.call(ctx, http.MethodGet, "/api/internal/integrations/"+url.PathEscape(string(service)), nil, &out)
	ok := err == nil && out.Enabled && out.BaseURL != ""
	if err != nil && !errors.Is(err, ErrNotFound) {
		return services.Integration{}, false, err
	}
	s.mu.Lock()
	if s.cache == nil {
		s.cache = map[services.ServiceID]cachedIntegration{}
	}
	s.cache[service] = cachedIntegration{integration: out, ok: ok, at: time.Now()}
	s.mu.Unlock()
	return out, ok, nil
}

func (s *CoreStores) For(ctx context.Context, service services.ServiceID) (Commerce, error) {
	in, ok, err := s.integration(ctx, service)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrServiceOff
	}
	if in.Format == "redwiiil" {
		return redwiiil.Client{BaseURL: in.BaseURL, APIKey: in.APIKey, HTTP: s.HTTP}, nil
	}
	return mercaya.Client{BaseURL: in.BaseURL, Prefix: in.Prefix, APIKey: in.APIKey, AdminKey: in.AdminKey, HTTP: s.HTTP}, nil
}

func (s *CoreStores) Enabled(ctx context.Context, service services.ServiceID) bool {
	in, ok, err := s.integration(ctx, service)
	if err != nil || !ok {
		return false
	}
	// RED WIIIL tarda en entregar el catálogo: se precarga apenas alguien mira los servicios.
	if in.Format == "redwiiil" {
		if c := (redwiiil.Client{BaseURL: in.BaseURL, APIKey: in.APIKey, HTTP: s.HTTP}); !c.Fresh() {
			c.Warm()
		}
	}
	return true
}
