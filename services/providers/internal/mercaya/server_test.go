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

func patch(t *testing.T, srv *httptest.Server, sku, key, body string) (int, map[string]any) {
	t.Helper()
	req, _ := http.NewRequest(http.MethodPatch, srv.URL+"/mercaya/v1/productos/"+sku, strings.NewReader(body))
	req.Header.Set("x-mercaya-clave", key)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

func TestLaTiendaCambiaPrecioOfertaYStock(t *testing.T) {
	srv := server(t)
	if status, _ := patch(t, srv, "AZU-RUB-1K", "otra", `{"stock":1}`); status != http.StatusUnauthorized {
		t.Fatalf("sin la clave correcta debe ser 401, obtuve %d", status)
	}
	status, p := patch(t, srv, "AZU-RUB-1K", DevAdminKey, `{"precio_centimos":400,"precio_antes_centimos":450,"stock":0}`)
	if status != http.StatusOK || p["precio_centimos"].(float64) != 400 || p["precio_antes_centimos"].(float64) != 450 || p["stock"].(float64) != 0 {
		t.Fatalf("cambio inesperado: %d %v", status, p)
	}
	// Sin precio_antes_centimos la oferta queda; con null se quita.
	if _, p = patch(t, srv, "AZU-RUB-1K", DevAdminKey, `{"stock":5}`); p["precio_antes_centimos"] == nil {
		t.Fatalf("la oferta no debía cambiar: %v", p)
	}
	if _, p = patch(t, srv, "AZU-RUB-1K", DevAdminKey, `{"precio_antes_centimos":null}`); p["precio_antes_centimos"] != nil {
		t.Fatalf("null debía quitar la oferta: %v", p)
	}
	// El catálogo devuelve el producto actualizado, también con stock 0.
	_, _ = patch(t, srv, "AZU-RUB-1K", DevAdminKey, `{"stock":0}`)
	resp, _ := http.Get(srv.URL + "/mercaya/v1/catalogo?buscar=azucar+rubia")
	var body struct{ Resultados []Producto }
	_ = json.NewDecoder(resp.Body).Decode(&body)
	if len(body.Resultados) != 1 || body.Resultados[0].PrecioCentimos != 400 || body.Resultados[0].Stock != 0 {
		t.Fatalf("el catálogo debía reflejar el cambio: %+v", body.Resultados)
	}
}

func TestLaTiendaNoGuardaDatosInvalidos(t *testing.T) {
	srv := server(t)
	for _, body := range []string{
		`{"precio_centimos":0}`,
		`{"stock":-1}`,
		`{"stock":100001}`,
		`{"precio_antes_centimos":100}`, // menor que el precio vigente
		`{"precio_antes_centimos":"x"}`,
		`no es json`,
	} {
		if status, _ := patch(t, srv, "AZU-RUB-1K", DevAdminKey, body); status != http.StatusBadRequest {
			t.Fatalf("%s debía ser 400, obtuve %d", body, status)
		}
	}
	if status, _ := patch(t, srv, "NADA", DevAdminKey, `{"stock":1}`); status != http.StatusNotFound {
		t.Fatalf("sku desconocido debía ser 404, obtuve %d", status)
	}
	if _, p := patch(t, srv, "AZU-RUB-1K", DevAdminKey, `{"stock":1}`); p["precio_centimos"].(float64) != 450 {
		t.Fatalf("los intentos inválidos no debían cambiar nada: %v", p)
	}
}
