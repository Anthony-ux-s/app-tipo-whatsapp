package redwiiil

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/parla/gateway/internal/services"
	"github.com/parla/gateway/internal/translators/mercaya"
)

const key = "wiiil_prueba"

// fakeRedWiiil responde como la API v1 de RED WIIIL (docs/api-externa.md): dos páginas de productos,
// ventas que descuentan stock y anulaciones.
func fakeRedWiiil(t *testing.T) (*httptest.Server, *[]string) {
	t.Helper()
	stock := map[string]float64{"7": 50, "8": 1}
	sales := map[string]string{}
	calls := []string{}
	product := func(id string) map[string]any {
		if id == "7" {
			return map[string]any{
				"id": 7, "codigo": "CIN-01", "nombre": "Cinta aislante", "categoria": "⚡ Eléctrico", "activo": true,
				"imagenUrl": "/api/public/product-image/7", "unidadBase": "Rollo",
				"presentaciones": []map[string]any{
					{"id": "base", "nombre": "Rollo", "precioVenta": 4, "disponible": stock["7"]},
					{"id": "caja", "nombre": "Caja x12", "precioVenta": 40, "disponible": float64(int(stock["7"] / 12))},
				},
			}
		}
		return map[string]any{
			"id": 8, "codigo": "MAR-01", "nombre": "Martillo de uña", "categoria": "Herramientas", "activo": true, "imagenUrl": nil,
			"presentaciones": []map[string]any{{"id": "base", "nombre": "Unidad", "precioVenta": 25.5, "disponible": stock["8"]}},
		}
	}
	mux := http.NewServeMux()
	auth := func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			calls = append(calls, r.Method+" "+r.URL.Path)
			if r.Header.Get("Authorization") != "Bearer "+key {
				w.WriteHeader(http.StatusUnauthorized)
				_, _ = w.Write([]byte(`{"error":{"code":"llave_invalida"}}`))
				return
			}
			next(w, r)
		}
	}
	mux.HandleFunc("GET /api/v1/products", auth(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("cursor") == "" {
			_ = json.NewEncoder(w).Encode(map[string]any{"data": []any{product("7"), map[string]any{"id": 9, "nombre": "Inactivo", "activo": false}}, "siguiente": "2"})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"data": []any{product("8"), map[string]any{"id": 10, "nombre": "Polo", "activo": true, "variantes": []any{map[string]any{"id": "v1"}}}}, "siguiente": nil})
	}))
	mux.HandleFunc("GET /api/v1/products/{id}", auth(func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if id != "7" && id != "8" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"data": product(id)})
	}))
	mux.HandleFunc("POST /api/v1/sales", auth(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Ref   string `json:"referenciaExterna"`
			Items []struct {
				ProductID      json.Number `json:"productId"`
				Cantidad       float64     `json:"cantidad"`
				PresentacionID string      `json:"presentacionId"`
			} `json:"items"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		for _, it := range body.Items {
			factor := 1.0
			if it.PresentacionID == "caja" {
				factor = 12
			}
			if stock[it.ProductID.String()] < it.Cantidad*factor {
				w.WriteHeader(http.StatusConflict)
				_, _ = w.Write([]byte(`{"error":{"code":"stock_insuficiente"}}`))
				return
			}
		}
		for _, it := range body.Items {
			factor := 1.0
			if it.PresentacionID == "caja" {
				factor = 12
			}
			stock[it.ProductID.String()] -= it.Cantidad * factor
		}
		sales[body.Ref] = "api_" + body.Ref
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"id": sales[body.Ref], "referenciaExterna": body.Ref}})
	}))
	mux.HandleFunc("GET /api/v1/sales", auth(func(w http.ResponseWriter, r *http.Request) {
		id, ok := sales[r.URL.Query().Get("referenciaExterna")]
		if !ok {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"id": id}})
	}))
	mux.HandleFunc("POST /api/v1/sales/{id}/cancel", auth(func(w http.ResponseWriter, r *http.Request) {
		stock["8"]++ // el pedido de la prueba era un martillo
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"data":{"anulada":true}}`))
	}))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv, &calls
}

func TestTraduceElCatalogoDeRedWiiil(t *testing.T) {
	srv, _ := fakeRedWiiil(t)
	c := Client{BaseURL: srv.URL, APIKey: key, HTTP: srv.Client()}
	all, err := c.Search(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	// Cinta (rollo y caja) + martillo; ni el inactivo ni el que tiene variantes.
	if len(all) != 3 {
		t.Fatalf("esperaba 3 productos, obtuve %d: %+v", len(all), all)
	}
	byID := map[string]services.Product{}
	for _, p := range all {
		byID[p.ID] = p
	}
	caja := byID["7-caja"]
	if caja.Name != "Cinta aislante (Caja x12)" || caja.PriceCents != 4000 || caja.Stock != 4 || caja.Category != "Eléctrico" {
		t.Fatalf("caja mal traducida: %+v", caja)
	}
	if img := byID["7-base"].ImageURL; img == nil || *img != srv.URL+"/api/public/product-image/7" {
		t.Fatalf("la imagen debería ser absoluta, obtuve %v", img)
	}
	if byID["8-base"].PriceCents != 2550 {
		t.Fatalf("S/ 25.50 son 2550 céntimos, obtuve %d", byID["8-base"].PriceCents)
	}
	found, _ := c.Search(context.Background(), "MARTILLO")
	if len(found) != 1 || found[0].ID != "8-base" {
		t.Fatalf("buscar martillo: %+v", found)
	}
}

func TestVendeAnulaYRespetaElStock(t *testing.T) {
	srv, calls := fakeRedWiiil(t)
	c := Client{BaseURL: srv.URL, APIKey: key, HTTP: srv.Client()}
	ctx := context.Background()

	if p, err := c.Product(ctx, "8-base"); err != nil || p.Stock != 1 {
		t.Fatalf("producto: %+v %v", p, err)
	}
	if _, err := c.Product(ctx, "99-base"); !errors.Is(err, mercaya.ErrNotFound) {
		t.Fatalf("producto que no existe: %v", err)
	}
	// Dos martillos con uno en stock: no alcanza.
	var out mercaya.OutOfStockError
	if err := c.Reserve(ctx, "ord_1", []services.CartItem{{ProductID: "8-base", Quantity: 2}}); !errors.As(err, &out) {
		t.Fatalf("esperaba sin stock, obtuve %v", err)
	}
	if err := c.Reserve(ctx, "ord_2", []services.CartItem{{ProductID: "8-base", Quantity: 1}}); err != nil {
		t.Fatal(err)
	}
	if p, _ := c.Product(ctx, "8-base"); p.Stock != 0 {
		t.Fatalf("la venta debió descontar el stock, quedan %d", p.Stock)
	}
	// El pedido no se pagó: se anula la venta y el stock vuelve.
	if err := c.Release(ctx, "ord_2"); err != nil {
		t.Fatal(err)
	}
	if p, _ := c.Product(ctx, "8-base"); p.Stock != 1 {
		t.Fatalf("la anulación debió devolver el stock, hay %d", p.Stock)
	}
	if !strings.Contains(strings.Join(*calls, ","), "POST /api/v1/sales/api_ord_2/cancel") {
		t.Fatalf("no se anuló la venta en RED WIIIL: %v", *calls)
	}
	// Anular un pedido que nunca llegó a venderse no es un error.
	if err := c.Release(ctx, "ord_nunca"); err != nil {
		t.Fatal(err)
	}
}

func TestLlaveEquivocada(t *testing.T) {
	srv, _ := fakeRedWiiil(t)
	c := Client{BaseURL: srv.URL, APIKey: "wiiil_otra", HTTP: srv.Client()}
	if _, err := c.Search(context.Background(), ""); err == nil {
		t.Fatal("con una llave equivocada debería fallar")
	}
}

// capturaVenta: una RED WIIIL que solo guarda el cuerpo de la venta que recibe.
func capturaVenta(t *testing.T) (*httptest.Server, *map[string]any) {
	t.Helper()
	var got map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&got)
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"data":{"id":"v1"}}`))
	}))
	t.Cleanup(srv.Close)
	return srv, &got
}

func TestLaVentaLlevaCanalEntregaYSiEsGrande(t *testing.T) {
	items := []services.CartItem{{ProductID: "8-base", Quantity: 30}}
	casos := []struct {
		nombre string
		client Client
		info   services.SaleInfo
		grande bool
	}{
		{"por total", Client{BigTotalCents: 60000, BigUnits: 25}, services.SaleInfo{TotalCents: 70650, Units: 3}, true},
		{"por unidades", Client{BigTotalCents: 60000, BigUnits: 25}, services.SaleInfo{TotalCents: 3650, Units: 30}, true},
		{"normal", Client{BigTotalCents: 60000, BigUnits: 25}, services.SaleInfo{TotalCents: 2070, Units: 3}, false},
		{"sin umbrales no se marca", Client{}, services.SaleInfo{TotalCents: 999999, Units: 999}, false},
	}
	for _, c := range casos {
		t.Run(c.nombre, func(t *testing.T) {
			srv, got := capturaVenta(t)
			c.client.BaseURL, c.client.APIKey, c.client.HTTP = srv.URL, key, srv.Client()
			c.info.DeliveryFeeCents, c.info.TipCents, c.info.Address = 650, 200, "Av. Larco 123, Miraflores"
			ctx := services.WithSaleInfo(context.Background(), c.info)
			if err := c.client.Reserve(ctx, "ord_1", items); err != nil {
				t.Fatal(err)
			}
			if (*got)["canal"] != "parla" || (*got)["grande"] != c.grande {
				t.Fatalf("canal/grande: %v", *got)
			}
			entrega, _ := (*got)["entrega"].(map[string]any)
			if entrega["direccion"] != "Av. Larco 123, Miraflores" || entrega["costo"] != 6.5 || entrega["propina"] != 2.0 {
				t.Fatalf("entrega: %v", entrega)
			}
		})
	}
}

func TestSinDatosDelPedidoLaVentaQuedaComoSiempre(t *testing.T) {
	srv, got := capturaVenta(t)
	c := Client{BaseURL: srv.URL, APIKey: key, HTTP: srv.Client(), BigTotalCents: 1, BigUnits: 1}
	if err := c.Reserve(context.Background(), "ord_2", []services.CartItem{{ProductID: "8-base", Quantity: 1}}); err != nil {
		t.Fatal(err)
	}
	for _, campo := range []string{"canal", "grande", "entrega"} {
		if _, hay := (*got)[campo]; hay {
			t.Fatalf("la venta no debía llevar %q: %v", campo, *got)
		}
	}
}
