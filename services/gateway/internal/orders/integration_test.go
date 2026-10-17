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

// Recorrido completo contra los simuladores reales (services/providers). Solo corre si se indica
// dónde están: PARLA_PROVIDERS_URL=http://localhost:4913 go test ./internal/orders -run Integracion
// (conviene arrancarlos con RAPIDITO_STEP_MS=200 para no esperar).
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
	hooks := &HTTP{Orch: orch, PagayaSecret: "pagaya-dev-secret", RapiditoSecret: "rapidito-dev-secret"}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /hooks/pagaya", hooks.PagayaHook)
	mux.HandleFunc("POST /hooks/rapidito", hooks.RapiditoHook)
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

	// El negocio acepta (en el core) y avisa que está listo: sale el motorizado.
	waitStatus(t, core, order.ID, services.Paid)
	if _, err := core.UpdateOrder(ctx, order.ID, services.InternalUpdateOrder{ExpectStatus: services.Paid, Status: services.Preparing}); err != nil {
		t.Fatal(err)
	}
	if _, err := orch.Ready(ctx, owner, order.ID); err != nil {
		t.Fatal(err)
	}

	deadline := time.Now().Add(20 * time.Second)
	var seen []services.OrderStatus
	for time.Now().Before(deadline) {
		current, _ := core.GetOrder(ctx, order.ID)
		if len(seen) == 0 || seen[len(seen)-1] != current.Status {
			seen = append(seen, current.Status)
		}
		if current.Status == services.Delivered {
			if current.Delivery == nil || current.Delivery.DriverName == nil || current.Payment.PaidAt == nil {
				t.Fatalf("pedido entregado sin datos completos: %+v", current)
			}
			t.Logf("estados: %v · motorizado: %s", seen, *current.Delivery.DriverName)
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("el pedido no llegó a entregado; estados vistos: %v", seen)
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
