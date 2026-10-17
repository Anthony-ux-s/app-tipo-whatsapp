package mercaya

import (
	"context"
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
	return Client{BaseURL: srv.URL, HTTP: srv.Client()}
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
