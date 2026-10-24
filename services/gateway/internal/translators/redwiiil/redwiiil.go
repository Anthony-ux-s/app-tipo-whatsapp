// Package redwiiil traduce la «API para sistemas externos» de RED WIIIL (/api/v1, docs/api-externa.md
// de ese sistema) a la tienda que usa Parla: catálogo, producto, reservar (registrar la venta, que
// descuenta el stock) y anular (devuelve el stock).
//
//	GET  /api/v1/products?limit&cursor          → {"data":[Producto…],"siguiente":cursor|null}
//	GET  /api/v1/products/{id}                   → {"data":Producto}
//	POST /api/v1/sales {referenciaExterna,items} → 201 venta | 200 repetida | 409 stock_insuficiente
//	GET  /api/v1/sales?referenciaExterna=…       → {"data":venta}
//	POST /api/v1/sales/{id}/cancel               → anula y devuelve el stock
//
// Autenticación: Authorization: Bearer wiiil_…  (la llave queda atada a una sola tienda de RED WIIIL).
package redwiiil

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/parla/gateway/internal/services"
	"github.com/parla/gateway/internal/translators/mercaya"
	"github.com/parla/gateway/internal/translators/providerapi"
)

// KeyPrefix: las llaves de RED WIIIL empiezan así (Parla lo usa para reconocerlas).
const KeyPrefix = "wiiil_"

const (
	pageSize = 500
	// maxPages: hasta 10 000 productos por catálogo.
	maxPages = 20
	// catalogTTL: el catálogo se reusa 5 minutos (RED WIIIL lee de Firestore, que cobra por lectura, y
	// tarda: 15–25 s por página). Vencido, se sigue mostrando mientras se actualiza por detrás.
	catalogTTL = 5 * time.Minute
	// slowTimeout: RED WIIIL puede tardar bastante más que las demás tiendas.
	slowTimeout = 90 * time.Second
	// separator entre el id del producto y el de su presentación en el id que ve Parla («7-caja»).
	separator = "-"
)

var safeID = regexp.MustCompile(`^[A-Za-z0-9_]{1,30}$`)

// Client habla con RED WIIIL. Varias instancias pueden compartir el mismo caché (por URL y llave).
type Client struct {
	BaseURL string
	APIKey  string
	HTTP    *http.Client
	// BigTotalCents y BigUnits: desde cuándo un pedido es «grande» para esta ferretería (0 = no se marca).
	BigTotalCents int
	BigUnits      int
}

type presentacion struct {
	ID          string   `json:"id"`
	Nombre      string   `json:"nombre"`
	PrecioVenta *float64 `json:"precioVenta"`
	Disponible  *float64 `json:"disponible"`
}

type producto struct {
	ID             json.Number      `json:"id"`
	Codigo         string           `json:"codigo"`
	Nombre         string           `json:"nombre"`
	Categoria      string           `json:"categoria"`
	Marca          string           `json:"marca"`
	Activo         bool             `json:"activo"`
	ImagenURL      *string          `json:"imagenUrl"`
	UnidadBase     string           `json:"unidadBase"`
	Presentaciones []presentacion   `json:"presentaciones"`
	Variantes      []map[string]any `json:"variantes"`
}

type cached struct {
	products []services.Product
	at       time.Time
}

var (
	cacheMu    sync.Mutex
	cache      = map[string]cached{}
	refreshing = map[string]bool{}
	// slowClient: el cliente del gateway espera 10 s; RED WIIIL necesita más.
	slowClient = &http.Client{Timeout: slowTimeout}
)

func (c Client) cacheKey() string { return c.BaseURL + "|" + c.APIKey }

func (c Client) call(ctx context.Context, method, path string, in any) (int, []byte, error) {
	return providerapi.CallWithHeaders(ctx, c.client(), method, strings.TrimRight(c.BaseURL, "/")+path, in, map[string]string{"authorization": "Bearer " + c.APIKey})
}

func (c Client) client() *http.Client {
	if c.HTTP != nil && c.HTTP.Timeout > slowTimeout {
		return c.HTTP
	}
	if c.HTTP != nil && c.HTTP.Transport != nil {
		return &http.Client{Timeout: slowTimeout, Transport: c.HTTP.Transport}
	}
	return slowClient
}

// toProducts: cada presentación vendible de un producto activo es un producto de Parla («7-base»,
// «7-caja»). Los productos con variantes (talla, color) todavía no se ofrecen.
func (c Client) toProducts(p producto) []services.Product {
	pid := p.ID.String()
	if !p.Activo || len(p.Variantes) > 0 || !safeID.MatchString(pid) {
		return nil
	}
	var image *string
	if p.ImagenURL != nil && *p.ImagenURL != "" {
		img := *p.ImagenURL
		if strings.HasPrefix(img, "/") {
			img = strings.TrimRight(c.BaseURL, "/") + img
		}
		image = &img
	}
	out := []services.Product{}
	for _, pr := range p.Presentaciones {
		if pr.PrecioVenta == nil || *pr.PrecioVenta <= 0 || !safeID.MatchString(pr.ID) {
			continue
		}
		cents := int(math.Round(*pr.PrecioVenta * 100))
		stock := 0
		if pr.Disponible != nil && *pr.Disponible > 0 {
			stock = int(math.Floor(*pr.Disponible))
		}
		name := strings.TrimSpace(p.Nombre)
		if len(p.Presentaciones) > 1 && pr.ID != "base" {
			name += " (" + pr.Nombre + ")"
		}
		// «🏗️ Ferretería General» → «Ferretería General»: sin los emojis del inicio.
		category := strings.TrimSpace(strings.TrimLeftFunc(p.Categoria, func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsDigit(r) }))
		if category == "" {
			category = "Ferretería"
		}
		out = append(out, services.Product{
			ID: pid + separator + pr.ID, Name: name, Unit: pr.Nombre, PriceCents: cents, Currency: services.Currency,
			Stock: stock, Category: category, ImageURL: image,
		})
	}
	return out
}

// catalog: todos los productos. Fresco, del caché; vencido, el del caché mientras se actualiza por
// detrás; sin caché, se espera la primera carga.
func (c Client) catalog(ctx context.Context) ([]services.Product, error) {
	cacheMu.Lock()
	hit, ok := cache[c.cacheKey()]
	cacheMu.Unlock()
	if ok && time.Since(hit.at) < catalogTTL {
		return hit.products, nil
	}
	if ok {
		c.Warm()
		return hit.products, nil
	}
	return c.load(ctx)
}

// Warm carga (o actualiza) el catálogo por detrás, una sola carga a la vez.
func (c Client) Warm() {
	key := c.cacheKey()
	cacheMu.Lock()
	if refreshing[key] {
		cacheMu.Unlock()
		return
	}
	refreshing[key] = true
	cacheMu.Unlock()
	go func() {
		defer func() {
			cacheMu.Lock()
			delete(refreshing, key)
			cacheMu.Unlock()
		}()
		ctx, cancel := context.WithTimeout(context.Background(), time.Duration(maxPages)*slowTimeout)
		defer cancel()
		_, _ = c.load(ctx)
	}()
}

// Fresh: si el catálogo está en memoria y vigente.
func (c Client) Fresh() bool {
	cacheMu.Lock()
	defer cacheMu.Unlock()
	hit, ok := cache[c.cacheKey()]
	return ok && time.Since(hit.at) < catalogTTL
}

// load trae todo el catálogo, página por página, y lo deja en el caché.
func (c Client) load(ctx context.Context) ([]services.Product, error) {
	all := []services.Product{}
	cursor := ""
	for page := 0; page < maxPages; page++ {
		q := url.Values{"limit": {fmt.Sprint(pageSize)}}
		if cursor != "" {
			q.Set("cursor", cursor)
		}
		status, raw, err := c.call(ctx, http.MethodGet, "/api/v1/products?"+q.Encode(), nil)
		if err != nil {
			return nil, err
		}
		if status != http.StatusOK {
			return nil, fmt.Errorf("%w: catálogo respondió %d", providerapi.ErrUnavailable, status)
		}
		var body struct {
			Data      []producto `json:"data"`
			Siguiente *string    `json:"siguiente"`
		}
		if err := json.Unmarshal(raw, &body); err != nil {
			return nil, fmt.Errorf("%w: catálogo ilegible", mercaya.ErrInvalid)
		}
		for _, p := range body.Data {
			all = append(all, c.toProducts(p)...)
		}
		if body.Siguiente == nil || *body.Siguiente == "" {
			break
		}
		cursor = *body.Siguiente
	}
	cacheMu.Lock()
	cache[c.cacheKey()] = cached{products: all, at: time.Now()}
	cacheMu.Unlock()
	return all, nil
}

func fold(s string) string {
	r := strings.NewReplacer("á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u", "ü", "u", "ñ", "n")
	return r.Replace(strings.ToLower(s))
}

// Search: busca por nombre, unidad o categoría (todas las palabras), en el catálogo en caché.
func (c Client) Search(ctx context.Context, query string) ([]services.Product, error) {
	all, err := c.catalog(ctx)
	if err != nil {
		return nil, err
	}
	words := strings.Fields(fold(query))
	if len(words) == 0 {
		return all, nil
	}
	found := []services.Product{}
	for _, p := range all {
		text := fold(p.Name + " " + p.Category + " " + p.Unit)
		match := true
		for _, w := range words {
			if !strings.Contains(text, w) {
				match = false
				break
			}
		}
		if match {
			found = append(found, p)
		}
	}
	return found, nil
}

func splitID(id string) (string, string, bool) {
	i := strings.LastIndex(id, separator)
	if i <= 0 || i == len(id)-1 {
		return "", "", false
	}
	return id[:i], id[i+1:], true
}

// Product: el precio y el stock de ahora (sin caché: se usa al cotizar y al cobrar).
func (c Client) Product(ctx context.Context, id string) (services.Product, error) {
	pid, presID, ok := splitID(id)
	if !ok || !safeID.MatchString(pid) {
		return services.Product{}, mercaya.ErrNotFound
	}
	status, raw, err := c.call(ctx, http.MethodGet, "/api/v1/products/"+url.PathEscape(pid), nil)
	if err != nil {
		return services.Product{}, err
	}
	if status == http.StatusNotFound {
		return services.Product{}, mercaya.ErrNotFound
	}
	if status != http.StatusOK {
		return services.Product{}, fmt.Errorf("%w: producto respondió %d", providerapi.ErrUnavailable, status)
	}
	var body struct {
		Data producto `json:"data"`
	}
	if err := json.Unmarshal(raw, &body); err != nil {
		return services.Product{}, fmt.Errorf("%w: producto ilegible", mercaya.ErrInvalid)
	}
	for _, p := range c.toProducts(body.Data) {
		if p.ID == pid+separator+presID {
			return p, nil
		}
	}
	return services.Product{}, mercaya.ErrNotFound
}

type apiError struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

// Reserve registra la venta en RED WIIIL (descuenta el stock al instante). Es idempotente por la
// referencia: repetirla no descuenta dos veces.
func (c Client) Reserve(ctx context.Context, reference string, items []services.CartItem) error {
	lines := make([]map[string]any, 0, len(items))
	for _, it := range items {
		pid, presID, ok := splitID(it.ProductID)
		if !ok {
			return mercaya.OutOfStockError{ProductID: it.ProductID}
		}
		var productID any = pid
		if n, err := json.Number(pid).Int64(); err == nil {
			productID = n
		}
		lines = append(lines, map[string]any{"productId": productID, "cantidad": it.Quantity, "presentacionId": presID})
	}
	sale := map[string]any{"referenciaExterna": reference, "metodoPago": "yape", "items": lines}
	// Datos opcionales de la venta: una ferretería que no los conoce los ignora.
	if info, ok := services.SaleInfoFrom(ctx); ok {
		sale["canal"] = "parla"
		sale["grande"] = c.isBig(info)
		sale["entrega"] = map[string]any{"direccion": info.Address, "costo": float64(info.DeliveryFeeCents) / 100, "propina": float64(info.TipCents) / 100}
	}
	status, raw, err := c.call(ctx, http.MethodPost, "/api/v1/sales", sale)
	if err != nil {
		return err
	}
	switch {
	case status == http.StatusCreated || status == http.StatusOK:
		return nil
	case status == http.StatusConflict, status == http.StatusUnprocessableEntity, status == http.StatusNotFound:
		var e apiError
		_ = json.Unmarshal(raw, &e)
		first := ""
		if len(items) > 0 {
			first = items[0].ProductID
		}
		return mercaya.OutOfStockError{ProductID: first}
	default:
		return fmt.Errorf("%w: venta respondió %d", providerapi.ErrUnavailable, status)
	}
}

// isBig: pedido de obra o de mucha cantidad, según los umbrales de la ferretería.
func (c Client) isBig(info services.SaleInfo) bool {
	return (c.BigTotalCents > 0 && info.TotalCents >= c.BigTotalCents) || (c.BigUnits > 0 && info.Units >= c.BigUnits)
}

// Release anula la venta del pedido (devuelve el stock). Si no existe, no hay nada que anular.
func (c Client) Release(ctx context.Context, reference string) error {
	status, raw, err := c.call(ctx, http.MethodGet, "/api/v1/sales?referenciaExterna="+url.QueryEscape(reference), nil)
	if err != nil {
		return err
	}
	if status == http.StatusNotFound {
		return nil
	}
	if status != http.StatusOK {
		return fmt.Errorf("%w: consulta de venta respondió %d", providerapi.ErrUnavailable, status)
	}
	var body struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &body); err != nil || body.Data.ID == "" {
		return nil
	}
	status, _, err = c.call(ctx, http.MethodPost, "/api/v1/sales/"+url.PathEscape(body.Data.ID)+"/cancel", nil)
	if err != nil {
		return err
	}
	if status == http.StatusOK || status == http.StatusNotFound || status == http.StatusNoContent {
		return nil
	}
	return fmt.Errorf("%w: anulación respondió %d", providerapi.ErrUnavailable, status)
}

// Update: los precios y el stock se administran en RED WIIIL, no desde Parla.
func (c Client) Update(context.Context, string, mercaya.ProductPatch) (services.Product, error) {
	return services.Product{}, mercaya.ErrCatalogReadOnly
}
