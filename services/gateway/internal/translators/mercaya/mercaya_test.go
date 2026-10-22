package mercaya

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/parla/gateway/internal/translators/providerapi"
)

func fake(t *testing.T, handler http.HandlerFunc) Client {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return Client{BaseURL: srv.URL, HTTP: srv.Client(), AdminKey: "clave-admin-de-prueba"}
}

func TestBuscarTraduceYDescartaProductosMalFormados(t *testing.T) {
	c := fake(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("buscar") != "azúcar rubia" {
			t.Errorf("búsqueda mal codificada: %q", r.URL.RawQuery)
		}
		_, _ = io.WriteString(w, `{"resultados":[
			{"sku":"AZU-RUB-1K","nombre":"Azúcar rubia","presentacion":"1 kg","precio_centimos":450,"stock":200,"categoria":"Abarrotes","imagen":null,"proveedor_interno":"x"},
			{"sku":"MALO","nombre":"Precio negativo","precio_centimos":-5,"stock":1},
			{"sku":"<script>","nombre":"SKU raro","precio_centimos":100,"stock":1},
			{"sku":"SIN-PRECIO","nombre":"Sin precio","stock":1},
			{"sku":"IMG","nombre":"Con imagen insegura","precio_centimos":100,"stock":1,"imagen":"javascript:alert(1)"}
		]}`)
	})
	products, err := c.Search(context.Background(), "azúcar rubia")
	if err != nil {
		t.Fatal(err)
	}
	if len(products) != 2 {
		t.Fatalf("esperaba 2 productos válidos, obtuve %+v", products)
	}
	p := products[0]
	if p.ID != "AZU-RUB-1K" || p.PriceCents != 450 || p.Unit != "1 kg" || p.Currency != "PEN" || p.ImageURL != nil {
		t.Fatalf("traducción inesperada: %+v", p)
	}
	if products[1].ImageURL != nil {
		t.Fatal("una imagen que no es https no debe pasar")
	}
}

func TestOfertaSoloSiElPrecioDeAntesEsMayor(t *testing.T) {
	c := fake(t, func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `{"resultados":[
			{"sku":"ACE-VEG-1L","nombre":"Aceite","precio_centimos":1090,"precio_antes_centimos":1290,"stock":5},
			{"sku":"RARO","nombre":"Antes más barato","precio_centimos":500,"precio_antes_centimos":400,"stock":5},
			{"sku":"NORMAL","nombre":"Sin oferta","precio_centimos":500,"stock":5}
		]}`)
	})
	products, err := c.Search(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	if len(products) != 3 || products[0].ListPriceCents == nil || *products[0].ListPriceCents != 1290 {
		t.Fatalf("la oferta debía traer su precio normal: %+v", products)
	}
	if products[1].ListPriceCents != nil || products[2].ListPriceCents != nil {
		t.Fatal("un precio de antes menor o ausente no es oferta")
	}
}

func TestProductoValidaQueSeaElPedido(t *testing.T) {
	c := fake(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/mercaya/v1/productos/ARR-EXT-1K":
			_, _ = io.WriteString(w, `{"sku":"ARR-EXT-1K","nombre":"Arroz extra","presentacion":"1 kg","precio_centimos":480,"stock":3}`)
		case "/mercaya/v1/productos/OTRO":
			_, _ = io.WriteString(w, `{"sku":"ARR-EXT-1K","nombre":"Arroz extra","precio_centimos":480,"stock":3}`)
		case "/mercaya/v1/productos/CAIDO":
			w.WriteHeader(http.StatusInternalServerError)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	})
	ctx := context.Background()
	if p, err := c.Product(ctx, "ARR-EXT-1K"); err != nil || p.PriceCents != 480 || p.Stock != 3 {
		t.Fatalf("producto inesperado: %+v %v", p, err)
	}
	if _, err := c.Product(ctx, "OTRO"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("un producto distinto al pedido es inválido, obtuve %v", err)
	}
	if _, err := c.Product(ctx, "NADA"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("esperaba ErrNotFound, obtuve %v", err)
	}
	if _, err := c.Product(ctx, "../etc"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("un id con formato raro ni se consulta, obtuve %v", err)
	}
	if _, err := c.Product(ctx, "CAIDO"); !errors.Is(err, providerapi.ErrUnavailable) {
		t.Fatalf("esperaba ErrUnavailable, obtuve %v", err)
	}
}

func TestReservaTraduceSinStock(t *testing.T) {
	var sent string
	c := fake(t, func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		sent = string(body)
		w.WriteHeader(http.StatusConflict)
		_, _ = io.WriteString(w, `{"error":"SIN_STOCK","sku":"QUE-FRE-500"}`)
	})
	err := c.Reserve(context.Background(), "ord_1", nil)
	var stock OutOfStockError
	if !errors.As(err, &stock) || stock.ProductID != "QUE-FRE-500" {
		t.Fatalf("esperaba OutOfStockError, obtuve %v", err)
	}
	if !strings.Contains(sent, `"referencia":"ord_1"`) {
		t.Fatalf("la reserva debe llevar la referencia: %s", sent)
	}
}

func TestUpdateMandaLaClaveYDistingueQuitarOferta(t *testing.T) {
	var got []map[string]any
	c := fake(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPatch || r.URL.Path != "/mercaya/v1/productos/AZU-RUB-1K" || r.Header.Get("x-mercaya-clave") != "clave" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		got = append(got, body)
		_, _ = io.WriteString(w, `{"sku":"AZU-RUB-1K","nombre":"Azúcar rubia","presentacion":"1 kg","precio_centimos":400,"stock":0}`)
	})
	c.AdminKey = "clave"
	price, stock := 400, 0
	p, err := c.Update(context.Background(), "AZU-RUB-1K", ProductPatch{PriceCents: &price, ClearListPrice: true, Stock: &stock})
	if err != nil || p.PriceCents != 400 || p.Stock != 0 || p.ListPriceCents != nil {
		t.Fatalf("traducción inesperada: %+v %v", p, err)
	}
	if v, ok := got[0]["precio_antes_centimos"]; !ok || v != nil {
		t.Fatalf("quitar la oferta debe mandar null explícito: %v", got[0])
	}
	if _, err := c.Update(context.Background(), "AZU-RUB-1K", ProductPatch{Stock: &stock}); err != nil {
		t.Fatal(err)
	}
	if _, ok := got[1]["precio_antes_centimos"]; ok {
		t.Fatalf("sin cambio de oferta no se manda el campo: %v", got[1])
	}
	c.AdminKey = "otra"
	if _, err := c.Update(context.Background(), "AZU-RUB-1K", ProductPatch{Stock: &stock}); !errors.Is(err, providerapi.ErrUnavailable) {
		t.Fatalf("clave rechazada = mala configuración (no disponible), obtuve %v", err)
	}
}

func TestUpdateTraduceRechazoYNoExiste(t *testing.T) {
	c := fake(t, func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/NADA") {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusBadRequest)
		_, _ = io.WriteString(w, `{"error":"DATOS_INVALIDOS"}`)
	})
	stock := 1
	if _, err := c.Update(context.Background(), "NADA", ProductPatch{Stock: &stock}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("esperaba ErrNotFound, obtuve %v", err)
	}
	if _, err := c.Update(context.Background(), "AZU-RUB-1K", ProductPatch{Stock: &stock}); !errors.Is(err, ErrRejected) {
		t.Fatalf("esperaba ErrRejected, obtuve %v", err)
	}
}

func TestReleaseAnulaLaReservaPorReferencia(t *testing.T) {
	var method, path string
	c := fake(t, func(w http.ResponseWriter, r *http.Request) {
		method, path = r.Method, r.URL.Path
		if r.URL.Path == "/mercaya/v1/pedidos/ord_x" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		if r.URL.Path == "/mercaya/v1/pedidos/caido" {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		_, _ = io.WriteString(w, `{"estado":"ANULADO"}`)
	})
	ctx := context.Background()
	if err := c.Release(ctx, "ord_1"); err != nil || method != http.MethodDelete || path != "/mercaya/v1/pedidos/ord_1" {
		t.Fatalf("esperaba DELETE de la reserva: %v %s %s", err, method, path)
	}
	if err := c.Release(ctx, "ord_x"); err != nil {
		t.Fatalf("sin reserva no hay nada que devolver: %v", err)
	}
	if err := c.Release(ctx, "caido"); !errors.Is(err, providerapi.ErrUnavailable) {
		t.Fatalf("esperaba ErrUnavailable, obtuve %v", err)
	}
}
