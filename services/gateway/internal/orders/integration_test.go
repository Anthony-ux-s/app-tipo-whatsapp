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
	"github.com/parla/gateway/internal/translators/motoya"
	"github.com/parla/gateway/internal/translators/pagaya"
)

// Recorrido completo contra los simuladores reales (services/providers). Solo corre si se indica
// dónde están: PARLA_PROVIDERS_URL=http://localhost:4913 go test ./internal/orders -run Integracion
// (conviene arrancarlos con MOTOYA_STEP_MS=200 para no esperar).
func TestIntegracionPedidoCompletoContraLosSimuladores(t *testing.T) {
	base := os.Getenv("PARLA_PROVIDERS_URL")
	if base == "" {
		t.Skip("define PARLA_PROVIDERS_URL para probar contra los simuladores")
	}
	client := &http.Client{Timeout: 10 * time.Second}
	core := &fakeCore{orders: map[string]services.InternalOrder{}}
	orch := &Orchestrator{
		Commerce: mercaya.Client{BaseURL: base, HTTP: client},
		Delivery: motoya.Client{BaseURL: base, HTTP: client},
		Payments: pagaya.Client{BaseURL: base, HTTP: client},
		Core:     core,
	}
	hooks := &HTTP{Orch: orch, PagayaSecret: "pagaya-dev-secret", MotoyaSecret: "motoya-dev-secret"}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /hooks/pagaya", hooks.PagayaHook)
	mux.HandleFunc("POST /hooks/motoya", hooks.MotoyaHook)
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
