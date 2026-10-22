package httpapi

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/parla/gateway/internal/orders"
	"github.com/parla/gateway/internal/ratelimit"
	"github.com/parla/gateway/internal/services"
	"github.com/parla/gateway/internal/translators/mercaya"
	"github.com/parla/gateway/internal/translators/pagaya"
	"github.com/parla/gateway/internal/translators/rapidito"
	"github.com/parla/gateway/internal/webhook"
)

const (
	jwtSecret    = "secreto-de-prueba-para-el-gateway-1234"
	pagayaSecret = "pagaya-secreto-de-prueba"
)

type shopFake struct{}

func (shopFake) Search(context.Context, string) ([]services.Product, error) {
	return []services.Product{{ID: "AZU-RUB-1K", Name: "Azúcar rubia", PriceCents: 450, Stock: 9, Currency: "PEN"}}, nil
}
func (shopFake) Product(_ context.Context, id string) (services.Product, error) {
	if id != "AZU-RUB-1K" {
		return services.Product{}, mercaya.ErrNotFound
	}
	return services.Product{ID: id, Name: "Azúcar rubia", Unit: "1 kg", PriceCents: 450, Stock: 9, Currency: "PEN"}, nil
}
func (shopFake) Reserve(context.Context, string, []services.CartItem) error { return nil }
func (shopFake) Release(context.Context, string) error                      { return nil }
func (shopFake) Update(_ context.Context, id string, _ mercaya.ProductPatch) (services.Product, error) {
	return services.Product{ID: id, Name: "Azúcar rubia", PriceCents: 450, Stock: 9, Currency: "PEN"}, nil
}

type motoFake struct{}

func (motoFake) Quote(context.Context, *services.GeoPoint, services.Address) (rapidito.Quote, error) {
	return rapidito.Quote{ID: "q_1", FeeCents: 600, ETAMinutes: 30}, nil
}

type coreFake struct{ seen []string }

func (c *coreFake) CreateOrder(_ context.Context, in services.InternalCreateOrder) (services.InternalOrder, error) {
	c.seen = append(c.seen, "create:"+in.UserID)
	return services.InternalOrder{Order: services.Order{ID: in.ID, Status: services.PendingPayment, TotalCents: in.TotalCents}}, nil
}
func (c *coreFake) GetOrder(_ context.Context, id string) (services.InternalOrder, error) {
	c.seen = append(c.seen, "get:"+id)
	return services.InternalOrder{Order: services.Order{ID: id, Status: services.Delivered}}, nil
}
func (c *coreFake) UpdateOrder(context.Context, string, services.InternalUpdateOrder) (services.InternalOrder, error) {
	return services.InternalOrder{}, nil
}
func (c *coreFake) BusinessByService(context.Context, services.ServiceID) (services.Business, error) {
	return services.Business{}, orders.ErrNotFound
}
func (c *coreFake) BusinessByOwner(context.Context, string) (services.Business, error) {
	return services.Business{}, orders.ErrNotFound
}
func (c *coreFake) QuoteCoupon(context.Context, services.CouponQuote) (services.AppliedCoupon, error) {
	return services.AppliedCoupon{}, orders.ErrNotFound
}
func (c *coreFake) IsAdmin(context.Context, string) (bool, error) { return false, nil }

type payFake struct{}

func (payFake) CreateCharge(context.Context, pagaya.ChargeRequest) (pagaya.Charge, error) {
	return pagaya.Charge{ID: "cob_1", QRText: "http://p", PayURL: "http://p", ExpiresAt: time.Now().Add(time.Minute)}, nil
}

func (payFake) Cancel(context.Context, string) error { return nil }

func (payFake) Refund(context.Context, string) (time.Time, error) { return time.Now(), nil }

func servicesGateway(t *testing.T) (*httptest.Server, *coreFake) {
	t.Helper()
	coreSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `{"from":"core"}`)
	}))
	t.Cleanup(coreSrv.Close)
	coreURL, _ := url.Parse(coreSrv.URL)
	core := &coreFake{}
	gw := httptest.NewServer(New(Options{
		Core: coreURL, Realtime: stubRealtime{}, LinkUp: func() bool { return true }, Limiter: ratelimit.New(100),
		JWTSecret: jwtSecret,
		Services: &orders.HTTP{
			Orch:         &orders.Orchestrator{Commerce: shopFake{}, Delivery: motoFake{}, Payments: payFake{}, Core: core, PublicURL: "http://gw"},
			PagayaSecret: pagayaSecret,
		},
	}))
	t.Cleanup(gw.Close)
	return gw, core
}

func jwt(user string) string {
	enc := base64.RawURLEncoding.EncodeToString
	head := enc([]byte(`{"alg":"HS256","typ":"JWT"}`))
	body := enc([]byte(fmt.Sprintf(`{"sub":%q,"exp":%d}`, user, time.Now().Add(time.Hour).Unix())))
	mac := hmac.New(sha256.New, []byte(jwtSecret))
	mac.Write([]byte(head + "." + body))
	return head + "." + body + "." + enc(mac.Sum(nil))
}

func call(t *testing.T, method, url, token, body string, headers map[string]string) (int, string) {
	t.Helper()
	req, _ := http.NewRequest(method, url, strings.NewReader(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(raw)
}

func TestServiciosExigenSesion(t *testing.T) {
	gw, _ := servicesGateway(t)
	for _, path := range []string{"/api/services", "/api/services/mercado/products?q=azucar"} {
		if status, _ := call(t, http.MethodGet, gw.URL+path, "", "", nil); status != http.StatusUnauthorized {
			t.Errorf("%s sin sesión: esperaba 401, obtuve %d", path, status)
		}
		if status, _ := call(t, http.MethodGet, gw.URL+path, "token.falso.x", "", nil); status != http.StatusUnauthorized {
			t.Errorf("%s con token falso: esperaba 401, obtuve %d", path, status)
		}
	}
	// El retiro de ganancias mueve dinero: sin sesión no existe.
	if status, _ := call(t, http.MethodPost, gw.URL+"/api/driver/payouts", "", "", nil); status != http.StatusUnauthorized {
		t.Errorf("retiro sin sesión: esperaba 401, obtuve %d", status)
	}
	// Devolver dinero por un reclamo tampoco existe sin sesión.
	if status, _ := call(t, http.MethodPost, gw.URL+"/api/admin/claims/cl_1/refund", "", `{"amountCents":100}`, nil); status != http.StatusUnauthorized {
		t.Errorf("devolución sin sesión: esperaba 401, obtuve %d", status)
	}
	status, body := call(t, http.MethodGet, gw.URL+"/api/services", jwt("u_1"), "", nil)
	var catalog []services.ServiceInfo
	_ = json.Unmarshal([]byte(body), &catalog)
	// Mercado disponible; Tecnología, Ferretería y Salud, próximamente (hasta que soporte las conecte).
	if status != 200 || len(catalog) != 4 || !catalog[0].Available || catalog[1].Available || catalog[2].Available || catalog[3].Available {
		t.Fatalf("catálogo inesperado: %d %s", status, body)
	}
}

func TestLaCotizacionIgnoraPreciosDelNavegador(t *testing.T) {
	gw, _ := servicesGateway(t)
	// El navegador intenta poner su propio precio y total: se descartan.
	body := `{"items":[{"productId":"AZU-RUB-1K","quantity":2,"priceCents":1}],"address":{"line":"Av. Larco 123","reference":""},"totalCents":1}`
	status, raw := call(t, http.MethodPost, gw.URL+"/api/services/mercado/quote", jwt("u_1"), body, nil)
	var q services.OrderQuote
	_ = json.Unmarshal([]byte(raw), &q)
	if status != 200 || q.SubtotalCents != 900 || q.DeliveryFeeCents != 600 || q.TotalCents != 1500 {
		t.Fatalf("cotización inesperada: %d %s", status, raw)
	}
	// La propina sí la elige el cliente: se suma al total que calcula el gateway.
	tipped := `{"items":[{"productId":"AZU-RUB-1K","quantity":2,"priceCents":1}],"address":{"line":"Av. Larco 123","reference":""},"tipCents":200,"totalCents":1}`
	status, raw = call(t, http.MethodPost, gw.URL+"/api/services/mercado/quote", jwt("u_1"), tipped, nil)
	q = services.OrderQuote{}
	_ = json.Unmarshal([]byte(raw), &q)
	if status != 200 || q.TipCents != 200 || q.TotalCents != 1700 {
		t.Fatalf("cotización con propina inesperada: %d %s", status, raw)
	}
	status, raw = call(t, http.MethodPost, gw.URL+"/api/services/mercado/quote", jwt("u_1"), `{"items":[]`, nil)
	if status != 400 || !strings.Contains(raw, `"statusCode":400`) {
		t.Fatalf("un JSON roto debe dar 400 con el formato de errores: %d %s", status, raw)
	}
}

func TestCrearPedidoUsaLaPersonaDelToken(t *testing.T) {
	gw, core := servicesGateway(t)
	body := `{"items":[{"productId":"AZU-RUB-1K","quantity":1}],"address":{"line":"Av. Larco 123","reference":""},"userId":"u_otro"}`
	status, raw := call(t, http.MethodPost, gw.URL+"/api/services/mercado/orders", jwt("u_laura"), body, nil)
	if status != 201 || len(core.seen) != 1 || core.seen[0] != "create:u_laura" {
		t.Fatalf("el pedido debía ser de quien tiene la sesión: %d %s %v", status, raw, core.seen)
	}
}

func TestAvisosDeProveedoresExigenFirma(t *testing.T) {
	gw, core := servicesGateway(t)
	payload := `{"id_cobro":"cob_1","referencia":"ord_1","estado":"PAGADO","pagado_en":"2026-10-17T12:05:00Z"}`
	if status, _ := call(t, http.MethodPost, gw.URL+"/hooks/pagaya", "", payload, map[string]string{"x-pagaya-firma": webhook.Sign("otro", []byte(payload))}); status != http.StatusUnauthorized {
		t.Fatalf("firma ajena: esperaba 401, obtuve %d", status)
	}
	if len(core.seen) != 0 {
		t.Fatal("un aviso sin firma válida no debe tocar el core")
	}
	if status, _ := call(t, http.MethodPost, gw.URL+"/hooks/pagaya", "", payload, map[string]string{"x-pagaya-firma": webhook.Sign(pagayaSecret, []byte(payload))}); status != http.StatusNoContent {
		t.Fatalf("aviso válido: esperaba 204, obtuve %d", status)
	}
}

func TestElRestoDeLaAPISigueYendoAlCore(t *testing.T) {
	gw, _ := servicesGateway(t)
	if status, body := call(t, http.MethodGet, gw.URL+"/api/orders", "", "", nil); status != 200 || body != `{"from":"core"}` {
		t.Fatalf("/api/orders debía ir al core: %d %s", status, body)
	}
}
