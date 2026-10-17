package orders

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/parla/gateway/internal/services"
	"github.com/parla/gateway/internal/translators/mercaya"
	"github.com/parla/gateway/internal/translators/pagaya"
	"github.com/parla/gateway/internal/translators/rapidito"
)

// Recorrido contra los simuladores reales (services/providers): buscar, cotizar, cobrar y pagar. Solo
// corre si se indica dónde están: PARLA_PROVIDERS_URL=http://localhost:4913 go test ./internal/orders -run Integracion
func TestIntegracionPedidoCompletoContraLosSimuladores(t *testing.T) {
	base := os.Getenv("PARLA_PROVIDERS_URL")
	if base == "" {
		t.Skip("define PARLA_PROVIDERS_URL para probar contra los simuladores")
	}
	client := &http.Client{Timeout: 10 * time.Second}
	core := &fakeCore{orders: map[string]services.InternalOrder{}}
	orch := &Orchestrator{
		Commerce: mercaya.Client{BaseURL: base, HTTP: client},
		Delivery: rapidito.Client{BaseURL: base, HTTP: client},
		Payments: pagaya.Client{BaseURL: base, HTTP: client},
		Core:     core,
	}
	hooks := &HTTP{Orch: orch, PagayaSecret: "pagaya-dev-secret"}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /hooks/pagaya", hooks.PagayaHook)
	gw := httptest.NewServer(mux)
	defer gw.Close()
	orch.PublicURL = gw.URL

	ctx := context.Background()
	found, err := orch.Products(ctx, "azucar")
	if err != nil || len(found) == 0 {
		t.Fatalf("búsqueda: %v %v", found, err)
	}
	cart := services.QuoteRequest{
		Items:   []services.CartItem{{ProductID: "AZU-RUB-1K", Quantity: 1}, {ProductID: "ARR-EXT-1K", Quantity: 2}},
		Address: services.Address{Line: "Av. Arequipa 2450, Lince", Reference: "Edificio azul, dpto 302"},
	}
	order, err := orch.Create(ctx, "u_test", cart)
	if err != nil {
		t.Fatal(err)
	}
	if order.SubtotalCents != 450+2*480 || order.TotalCents != order.SubtotalCents+order.DeliveryFeeCents || order.DeliveryFeeCents <= 0 {
		t.Fatalf("montos inesperados: %+v", order)
	}

	// Pagar como lo haría la persona desde la página de la billetera.
	req, _ := http.NewRequest(http.MethodPost, order.Payment.PayURL, nil)
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil || resp.StatusCode != 200 {
		t.Fatalf("pago: %v %v", resp, err)
	}
	resp.Body.Close()

	// El aviso firmado de la billetera llega al gateway: el pedido queda pagado, esperando al negocio
	// (desde ahí lo siguen el core, el negocio y los repartidores de Parla).
	waitStatus(t, core, order.ID, services.Paid)
	if current, _ := core.GetOrder(ctx, order.ID); current.Payment.PaidAt == nil || current.DeliveryQuoteID == "" {
		t.Fatalf("pedido pagado sin datos completos: %+v", current)
	}
}

func waitStatus(t *testing.T, core *fakeCore, id string, want services.OrderStatus) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if current, _ := core.GetOrder(context.Background(), id); current.Status == want {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("el pedido no llegó a %s", want)
}

// Cancelar antes de pagar anula el cobro en la billetera: el QR ya no sirve.
func TestIntegracionCancelarSinPagarAnulaElCobro(t *testing.T) {
	base := os.Getenv("PARLA_PROVIDERS_URL")
	if base == "" {
		t.Skip("define PARLA_PROVIDERS_URL para probar contra los simuladores")
	}
	client := &http.Client{Timeout: 10 * time.Second}
	core := &fakeCore{orders: map[string]services.InternalOrder{}}
	orch := &Orchestrator{
		Commerce:  mercaya.Client{BaseURL: base, HTTP: client},
		Delivery:  rapidito.Client{BaseURL: base, HTTP: client},
		Payments:  pagaya.Client{BaseURL: base, HTTP: client},
		Core:      core,
		PublicURL: "http://localhost:1",
	}
	ctx := context.Background()
	order, err := orch.Create(ctx, "u_test", services.QuoteRequest{
		Items:   []services.CartItem{{ProductID: "AZU-RUB-1K", Quantity: 1}},
		Address: services.Address{Line: "Av. Arequipa 2450, Lince"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if cancelled, err := orch.CancelByCustomer(ctx, "u_test", order.ID); err != nil || cancelled.Status != services.Cancelled {
		t.Fatalf("cancelar: %+v %v", cancelled, err)
	}
	req, _ := http.NewRequest(http.MethodPost, order.Payment.PayURL, nil)
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("un cobro anulado no se debe poder pagar, obtuve %d", resp.StatusCode)
	}
}
