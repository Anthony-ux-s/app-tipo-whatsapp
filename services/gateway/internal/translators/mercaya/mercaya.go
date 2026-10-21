// Package mercaya traduce la API de la tienda «MercaYa» (español, céntimos) a los contratos de Parla.
package mercaya

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/parla/gateway/internal/services"
	"github.com/parla/gateway/internal/translators/providerapi"
)

var (
	ErrNotFound = errors.New("producto no encontrado")
	// ErrInvalid: el proveedor devolvió datos que no tienen sentido; se descartan.
	ErrInvalid = errors.New("datos inválidos de la tienda")
	// ErrRejected: la tienda no aceptó el cambio de precio, oferta o stock.
	ErrRejected = errors.New("la tienda rechazó el cambio")
)

// DevAdminKey: clave de administración de MercaYa fuera de producción.
const DevAdminKey = "mercaya-dev-clave"

// OutOfStockError: la tienda no tiene suficiente de un producto.
type OutOfStockError struct{ ProductID string }

func (e OutOfStockError) Error() string { return "sin stock: " + e.ProductID }

const maxPriceCents = 1_000_000 // S/ 10 000 por unidad: más que eso es un error del proveedor.

// Client habla con la API REST de la tienda (en producción, el sistema de la tienda; en desarrollo,
// el simulador). Parla solo la consume: busca, consulta productos y reserva o anula el carrito.
type Client struct {
	BaseURL string
	HTTP    *http.Client
	// APIKey: credencial de Parla ante la tienda, en la cabecera APIKeyHeader (x-api-key por defecto).
	APIKey       string
	APIKeyHeader string
	// AdminKey: clave de la API de administración (cambiar precios, ofertas y stock); vacía = la tienda
	// administra su catálogo en su propio sistema y Parla no lo cambia.
	AdminKey string
}

// ErrCatalogReadOnly: el catálogo se administra en el sistema de la tienda.
var ErrCatalogReadOnly = errors.New("el catálogo se administra en el sistema de la tienda")

// retryDelay: espera antes del único reintento (las llamadas son idempotentes).
var retryDelay = 250 * time.Millisecond

// call agrega la credencial de Parla y reintenta una vez si la tienda no respondió: búsquedas,
// productos, reservas (idempotentes por referencia) y anulaciones se pueden repetir sin riesgo.
func (c Client) call(ctx context.Context, method, target string, in any, extra map[string]string) (int, []byte, error) {
	headers := map[string]string{}
	if c.APIKey != "" {
		name := c.APIKeyHeader
		if name == "" {
			name = "x-api-key"
		}
		headers[name] = c.APIKey
	}
	for k, v := range extra {
		headers[k] = v
	}
	status, raw, err := providerapi.CallWithHeaders(ctx, c.HTTP, method, target, in, headers)
	if err != nil && errors.Is(err, providerapi.ErrUnavailable) && method != http.MethodPatch && ctx.Err() == nil {
		select {
		case <-time.After(retryDelay):
		case <-ctx.Done():
			return status, raw, err
		}
		status, raw, err = providerapi.CallWithHeaders(ctx, c.HTTP, method, target, in, headers)
	}
	return status, raw, err
}

// ProductPatch: lo que la dueña cambia de un producto. nil = no cambia; ClearListPrice quita la oferta.
type ProductPatch struct {
	PriceCents     *int
	ListPriceCents *int
	ClearListPrice bool
	Stock          *int
}

type producto struct {
	SKU            string  `json:"sku"`
	Nombre         string  `json:"nombre"`
	Presentacion   string  `json:"presentacion"`
	PrecioCentimos *int    `json:"precio_centimos"`
	Stock          *int    `json:"stock"`
	Categoria      string  `json:"categoria"`
	Imagen         *string `json:"imagen"`
	PrecioAntes    *int    `json:"precio_antes_centimos"`
}

// translate valida un producto de MercaYa y lo convierte; los campos desconocidos se pierden.
func translate(p producto) (services.Product, error) {
	switch {
	case !services.ValidID.MatchString(p.SKU),
		strings.TrimSpace(p.Nombre) == "" || utf8.RuneCountInString(p.Nombre) > 120,
		p.PrecioCentimos == nil || *p.PrecioCentimos <= 0 || *p.PrecioCentimos > maxPriceCents,
		p.Stock == nil || *p.Stock < 0:
		return services.Product{}, fmt.Errorf("%w: %q", ErrInvalid, p.SKU)
	}
	var image *string
	if p.Imagen != nil {
		if u, err := url.Parse(*p.Imagen); err == nil && u.Scheme == "https" && u.Host != "" {
			image = p.Imagen
		}
	}
	// Solo es oferta si el precio de antes es mayor y creíble; si no, se ignora.
	var listPrice *int
	if p.PrecioAntes != nil && *p.PrecioAntes > *p.PrecioCentimos && *p.PrecioAntes <= maxPriceCents {
		listPrice = p.PrecioAntes
	}
	return services.Product{
		ID: p.SKU, Name: strings.TrimSpace(p.Nombre), Unit: strings.TrimSpace(p.Presentacion),
		PriceCents: *p.PrecioCentimos, Currency: services.Currency, Stock: *p.Stock,
		Category: strings.TrimSpace(p.Categoria), ImageURL: image, ListPriceCents: listPrice,
	}, nil
}

// Search busca en el catálogo. Los productos mal formados se omiten en vez de romper la lista.
func (c Client) Search(ctx context.Context, query string) ([]services.Product, error) {
	status, raw, err := c.call(ctx, http.MethodGet, c.BaseURL+"/mercaya/v1/catalogo?buscar="+url.QueryEscape(query), nil, nil)
	if err != nil {
		return nil, err
	}
	if status != http.StatusOK {
		return nil, fmt.Errorf("%w: catálogo respondió %d", providerapi.ErrUnavailable, status)
	}
	var body struct {
		Resultados []producto `json:"resultados"`
	}
	if err := providerapi.Decode(raw, &body); err != nil {
		return nil, err
	}
	products := make([]services.Product, 0, len(body.Resultados))
	for _, p := range body.Resultados {
		if product, err := translate(p); err == nil {
			products = append(products, product)
		}
	}
	return products, nil
}

// Product trae el precio y stock vigentes de un producto.
func (c Client) Product(ctx context.Context, id string) (services.Product, error) {
	if !services.ValidID.MatchString(id) {
		return services.Product{}, ErrNotFound
	}
	status, raw, err := c.call(ctx, http.MethodGet, c.BaseURL+"/mercaya/v1/productos/"+url.PathEscape(id), nil, nil)
	if err != nil {
		return services.Product{}, err
	}
	switch status {
	case http.StatusOK:
	case http.StatusNotFound:
		return services.Product{}, ErrNotFound
	default:
		return services.Product{}, fmt.Errorf("%w: producto respondió %d", providerapi.ErrUnavailable, status)
	}
	var p producto
	if err := providerapi.Decode(raw, &p); err != nil {
		return services.Product{}, err
	}
	product, err := translate(p)
	if err != nil {
		return services.Product{}, err
	}
	if product.ID != id {
		return services.Product{}, fmt.Errorf("%w: pedí %q y llegó %q", ErrInvalid, id, product.ID)
	}
	return product, nil
}

// Reserve aparta el stock del pedido. La referencia (id del pedido) hace la reserva idempotente.
func (c Client) Reserve(ctx context.Context, reference string, items []services.CartItem) error {
	type linea struct {
		SKU      string `json:"sku"`
		Cantidad int    `json:"cantidad"`
	}
	lineas := make([]linea, len(items))
	for i, item := range items {
		lineas[i] = linea{SKU: item.ProductID, Cantidad: item.Quantity}
	}
	status, raw, err := c.call(ctx, http.MethodPost, c.BaseURL+"/mercaya/v1/pedidos", map[string]any{"referencia": reference, "lineas": lineas}, nil)
	if err != nil {
		return err
	}
	var body struct {
		Estado string `json:"estado"`
		Error  string `json:"error"`
		SKU    string `json:"sku"`
	}
	_ = providerapi.Decode(raw, &body)
	switch {
	case status == http.StatusCreated && body.Estado == "RESERVADO":
		return nil
	case status == http.StatusConflict && body.Error == "SIN_STOCK":
		return OutOfStockError{ProductID: body.SKU}
	case status == http.StatusUnprocessableEntity:
		return ErrNotFound
	default:
		return fmt.Errorf("%w: reserva respondió %d %s", providerapi.ErrUnavailable, status, body.Error)
	}
}

// Release anula la reserva del pedido y la tienda devuelve su stock. Es idempotente; si la tienda no
// conoce la referencia (nunca se reservó), no hay nada que devolver.
func (c Client) Release(ctx context.Context, reference string) error {
	status, raw, err := c.call(ctx, http.MethodDelete, c.BaseURL+"/mercaya/v1/pedidos/"+url.PathEscape(reference), nil, nil)
	if err != nil {
		return err
	}
	if status == http.StatusOK || status == http.StatusNotFound {
		return nil
	}
	var body struct {
		Error string `json:"error"`
	}
	_ = providerapi.Decode(raw, &body)
	return fmt.Errorf("%w: anular reserva respondió %d %s", providerapi.ErrUnavailable, status, body.Error)
}

// Update cambia precio, oferta o stock de un producto en la tienda y devuelve cómo quedó.
func (c Client) Update(ctx context.Context, id string, patch ProductPatch) (services.Product, error) {
	if !services.ValidID.MatchString(id) {
		return services.Product{}, ErrNotFound
	}
	if c.AdminKey == "" {
		return services.Product{}, ErrCatalogReadOnly
	}
	body := map[string]any{}
	if patch.PriceCents != nil {
		body["precio_centimos"] = *patch.PriceCents
	}
	if patch.ClearListPrice {
		body["precio_antes_centimos"] = nil
	} else if patch.ListPriceCents != nil {
		body["precio_antes_centimos"] = *patch.ListPriceCents
	}
	if patch.Stock != nil {
		body["stock"] = *patch.Stock
	}
	status, raw, err := c.call(ctx, http.MethodPatch, c.BaseURL+"/mercaya/v1/productos/"+url.PathEscape(id), body, map[string]string{"x-mercaya-clave": c.AdminKey})
	if err != nil {
		return services.Product{}, err
	}
	switch status {
	case http.StatusOK:
	case http.StatusNotFound:
		return services.Product{}, ErrNotFound
	case http.StatusBadRequest:
		return services.Product{}, ErrRejected
	default:
		// 401: la clave del gateway no coincide con la de la tienda (configuración), u otra respuesta rara.
		return services.Product{}, fmt.Errorf("%w: administración respondió %d", providerapi.ErrUnavailable, status)
	}
	var p producto
	if err := providerapi.Decode(raw, &p); err != nil {
		return services.Product{}, err
	}
	product, err := translate(p)
	if err != nil {
		return services.Product{}, err
	}
	if product.ID != id {
		return services.Product{}, fmt.Errorf("%w: cambié %q y llegó %q", ErrInvalid, id, product.ID)
	}
	return product, nil
}
