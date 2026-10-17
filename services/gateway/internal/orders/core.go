package orders

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"

	"github.com/parla/gateway/internal/services"
)

var (
	// ErrConflict: el pedido ya no estaba en el estado esperado (otro aviso ya lo cambió).
	ErrConflict = errors.New("el pedido cambió de estado")
	ErrNotFound = errors.New("pedido no encontrado")
)

// Core guarda los pedidos (el core NestJS es la fuente de verdad) y avisa al cliente.
type Core interface {
	CreateOrder(ctx context.Context, order services.InternalCreateOrder) (services.InternalOrder, error)
	GetOrder(ctx context.Context, id string) (services.InternalOrder, error)
	UpdateOrder(ctx context.Context, id string, update services.InternalUpdateOrder) (services.InternalOrder, error)
	// BusinessByService: el negocio que atiende un servicio (ErrNotFound si ninguno).
	BusinessByService(ctx context.Context, service services.ServiceID) (services.Business, error)
	// BusinessByOwner: el negocio de una persona (ErrNotFound si no es dueña de ninguno).
	BusinessByOwner(ctx context.Context, userID string) (services.Business, error)
}

// HTTPCore habla con las rutas internas del core con el token entre servicios.
type HTTPCore struct {
	BaseURL *url.URL
	Token   string
	HTTP    *http.Client
}

func (c HTTPCore) CreateOrder(ctx context.Context, order services.InternalCreateOrder) (services.InternalOrder, error) {
	var out services.InternalOrder
	return out, c.call(ctx, http.MethodPost, "/api/internal/orders", order, &out)
}

func (c HTTPCore) GetOrder(ctx context.Context, id string) (services.InternalOrder, error) {
	var out services.InternalOrder
	return out, c.call(ctx, http.MethodGet, "/api/internal/orders/"+url.PathEscape(id), nil, &out)
}

func (c HTTPCore) UpdateOrder(ctx context.Context, id string, update services.InternalUpdateOrder) (services.InternalOrder, error) {
	var out services.InternalOrder
	return out, c.call(ctx, http.MethodPatch, "/api/internal/orders/"+url.PathEscape(id), update, &out)
}

func (c HTTPCore) BusinessByService(ctx context.Context, service services.ServiceID) (services.Business, error) {
	var out services.Business
	return out, c.call(ctx, http.MethodGet, "/api/internal/businesses/by-service/"+url.PathEscape(string(service)), nil, &out)
}

func (c HTTPCore) BusinessByOwner(ctx context.Context, userID string) (services.Business, error) {
	var out services.Business
	return out, c.call(ctx, http.MethodGet, "/api/internal/businesses/by-owner/"+url.PathEscape(userID), nil, &out)
}

func (c HTTPCore) call(ctx context.Context, method, path string, in, out any) error {
	var body io.Reader
	if in != nil {
		raw, err := json.Marshal(in)
		if err != nil {
			return err
		}
		body = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.BaseURL.JoinPath(path).String(), body)
	if err != nil {
		return err
	}
	req.Header.Set("x-internal-token", c.Token)
	req.Header.Set("Accept", "application/json")
	if in != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return fmt.Errorf("core no disponible: %w", err)
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode == http.StatusNotFound:
		return ErrNotFound
	case resp.StatusCode == http.StatusConflict:
		return ErrConflict
	case resp.StatusCode >= 300:
		return fmt.Errorf("core respondió %d", resp.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(out)
}
