package mercaya

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func server(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	NewStore().Routes(mux)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func TestBuscaSinTildesNiMayusculas(t *testing.T) {
	srv := server(t)
	resp, err := http.Get(srv.URL + "/mercaya/v1/catalogo?buscar=AZUCAR")
	if err != nil {
		t.Fatal(err)
	}
	var body struct{ Resultados []Producto }
	_ = json.NewDecoder(resp.Body).Decode(&body)
	if len(body.Resultados) != 2 || !strings.HasPrefix(body.Resultados[0].Nombre, "Azúcar") {
		t.Fatalf("esperaba las dos azúcares, obtuve %+v", body.Resultados)
	}

	resp, _ = http.Get(srv.URL + "/mercaya/v1/catalogo")
	_ = json.NewDecoder(resp.Body).Decode(&body)
	if len(body.Resultados) < 30 {
		t.Fatalf("sin búsqueda devuelve todo el catálogo, obtuve %d", len(body.Resultados))
	}
}

func TestProductoPorSKU(t *testing.T) {
	srv := server(t)
	resp, _ := http.Get(srv.URL + "/mercaya/v1/productos/ARR-EXT-1K")
	var p Producto
	_ = json.NewDecoder(resp.Body).Decode(&p)
	if resp.StatusCode != 200 || p.PrecioCentimos != 480 || p.Imagen != nil {
		t.Fatalf("producto inesperado: %d %+v", resp.StatusCode, p)
	}
	resp, _ = http.Get(srv.URL + "/mercaya/v1/productos/NO-EXISTE")
	if resp.StatusCode != 404 {
		t.Fatalf("esperaba 404, obtuve %d", resp.StatusCode)
	}
}

func post(t *testing.T, url, body string) (*http.Response, map[string]any) {
	t.Helper()
	resp, err := http.Post(url, "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp, out
}

func TestReservaDescuentaStockYEsIdempotentePorReferencia(t *testing.T) {
	srv := server(t)
	url := srv.URL + "/mercaya/v1/pedidos"
	resp, out := post(t, url, `{"referencia":"ord_1","lineas":[{"sku":"QUE-FRE-500","cantidad":20}]}`)
	if resp.StatusCode != 201 || out["estado"] != "RESERVADO" || out["total_centimos"].(float64) != 25800 {
		t.Fatalf("reserva inesperada: %d %v", resp.StatusCode, out)
	}
	// Repetir la misma referencia no vuelve a descontar.
	resp, again := post(t, url, `{"referencia":"ord_1","lineas":[{"sku":"QUE-FRE-500","cantidad":20}]}`)
	if resp.StatusCode != 201 || again["numero_pedido"] != out["numero_pedido"] {
		t.Fatalf("la reserva repetida debía devolver la misma: %v", again)
	}
	// Quedan 10: pedir 11 falla sin tocar nada.
	resp, out = post(t, url, `{"referencia":"ord_2","lineas":[{"sku":"QUE-FRE-500","cantidad":11}]}`)
	if resp.StatusCode != 409 || out["error"] != "SIN_STOCK" || out["sku"] != "QUE-FRE-500" {
		t.Fatalf("esperaba SIN_STOCK, obtuve %d %v", resp.StatusCode, out)
	}
	resp, _ = post(t, url, `{"referencia":"ord_3","lineas":[{"sku":"QUE-FRE-500","cantidad":10}]}`)
	if resp.StatusCode != 201 {
		t.Fatalf("los 10 restantes sí se podían reservar: %d", resp.StatusCode)
	}
}

func TestReservaRechazaSKUDesconocidoYSolicitudInvalida(t *testing.T) {
	srv := server(t)
	url := srv.URL + "/mercaya/v1/pedidos"
	if resp, _ := post(t, url, `{"referencia":"x","lineas":[{"sku":"NADA","cantidad":1}]}`); resp.StatusCode != 422 {
		t.Fatalf("esperaba 422, obtuve %d", resp.StatusCode)
	}
	if resp, _ := post(t, url, `{"lineas":[]}`); resp.StatusCode != 400 {
		t.Fatalf("esperaba 400, obtuve %d", resp.StatusCode)
	}
}
