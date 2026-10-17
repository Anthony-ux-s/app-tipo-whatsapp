package orders

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/parla/gateway/internal/services"
	"github.com/parla/gateway/internal/translators/mercaya"
	"github.com/parla/gateway/internal/translators/motoya"
	"github.com/parla/gateway/internal/translators/pagaya"
)

// ── Fakes ─────────────────────────────────────────────────────────────────────

type fakeCommerce struct {
	products map[string]services.Product
	reserved map[string][]services.CartItem
	outOf    string
}

func (f *fakeCommerce) Search(context.Context, string) ([]services.Product, error) {
	list := []services.Product{}
	for _, p := range f.products {
		list = append(list, p)
	}
	return list, nil
}

func (f *fakeCommerce) Product(_ context.Context, id string) (services.Product, error) {
	p, ok := f.products[id]
	if !ok {
		return services.Product{}, mercaya.ErrNotFound
	}
	return p, nil
}

func (f *fakeCommerce) Reserve(_ context.Context, ref string, items []services.CartItem) error {
	if f.outOf != "" {
		return mercaya.OutOfStockError{ProductID: f.outOf}
	}
	f.reserved[ref] = items
	return nil
}

type fakeDelivery struct {
	mu         sync.Mutex
	dispatched []string
	fail       bool
}

func (f *fakeDelivery) Quote(context.Context, services.Address) (motoya.Quote, error) {
	return motoya.Quote{ID: "q_1", FeeCents: 650, ETAMinutes: 30}, nil
}

func (f *fakeDelivery) Dispatch(_ context.Context, quoteID, ref, callback string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.fail {
		return "", errors.New("MotoYa caído")
	}
	f.dispatched = append(f.dispatched, quoteID+"|"+ref+"|"+callback)
	return "dlv_1", nil
}

type fakePayments struct{ last pagaya.ChargeRequest }

func (f *fakePayments) CreateCharge(_ context.Context, req pagaya.ChargeRequest) (pagaya.Charge, error) {
	f.last = req
	return pagaya.Charge{ID: "cob_1", QRText: "http://p/pagar/cob_1", PayURL: "http://p/pagar/cob_1", ExpiresAt: time.Date(2026, 10, 17, 12, 15, 0, 0, time.UTC)}, nil
}

// fakeCore imita las reglas del core: expectStatus distinto → 409.
type fakeCore struct {
	mu      sync.Mutex
	orders  map[string]services.InternalOrder
	updates []services.InternalUpdateOrder
}

func (f *fakeCore) CreateOrder(_ context.Context, in services.InternalCreateOrder) (services.InternalOrder, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	o := services.InternalOrder{
		Order: services.Order{
			ID: in.ID, Service: in.Service, Status: services.PendingPayment, Lines: in.Lines,
			SubtotalCents: in.SubtotalCents, DeliveryFeeCents: in.DeliveryFeeCents, TotalCents: in.TotalCents,
			Currency: in.Currency, Address: in.Address, Payment: in.Payment,
		},
		UserID: in.UserID, DeliveryQuoteID: in.DeliveryQuoteID,
	}
	f.orders[in.ID] = o
	return o, nil
}

func (f *fakeCore) GetOrder(_ context.Context, id string) (services.InternalOrder, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	o, ok := f.orders[id]
	if !ok {
		return o, ErrNotFound
	}
	return o, nil
}

func (f *fakeCore) UpdateOrder(_ context.Context, id string, u services.InternalUpdateOrder) (services.InternalOrder, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	o, ok := f.orders[id]
	if !ok {
		return o, ErrNotFound
	}
	if u.ExpectStatus != "" && o.Status != u.ExpectStatus {
		return o, ErrConflict
	}
	f.updates = append(f.updates, u)
	o.Status = u.Status
	if u.PaidAt != "" {
		o.Payment.PaidAt = &u.PaidAt
	}
	if u.Delivery != nil {
		o.Delivery = u.Delivery
	}
	f.orders[id] = o
	return o, nil
}

type world struct {
	orch     *Orchestrator
	commerce *fakeCommerce
	delivery *fakeDelivery
	payments *fakePayments
	core     *fakeCore
}

func newWorld() world {
	w := world{
		commerce: &fakeCommerce{reserved: map[string][]services.CartItem{}, products: map[string]services.Product{
			"AZU-RUB-1K": {ID: "AZU-RUB-1K", Name: "Azúcar rubia", Unit: "1 kg", PriceCents: 450, Stock: 100, Currency: "PEN"},
			"ARR-EXT-1K": {ID: "ARR-EXT-1K", Name: "Arroz extra", Unit: "1 kg", PriceCents: 480, Stock: 2, Currency: "PEN"},
		}},
		delivery: &fakeDelivery{},
		payments: &fakePayments{},
		core:     &fakeCore{orders: map[string]services.InternalOrder{}},
	}
	w.orch = &Orchestrator{
		Commerce: w.commerce, Delivery: w.delivery, Payments: w.payments, Core: w.core,
		PublicURL: "http://gw", NewID: func() string { return "ord_1" },
		Now: func() time.Time { return time.Date(2026, 10, 17, 12, 0, 0, 0, time.UTC) },
	}
	return w
}

var cart = services.QuoteRequest{
	Items:   []services.CartItem{{ProductID: "AZU-RUB-1K", Quantity: 2}, {ProductID: "ARR-EXT-1K", Quantity: 1}},
	Address: services.Address{Line: "  Av. Larco 123, Miraflores ", Reference: "Puerta verde"},
}

func status(err error) int {
	var e *Error
	if errors.As(err, &e) {
		return e.Status
	}
	return 0
}

// ── Pruebas ───────────────────────────────────────────────────────────────────

func TestCotizaConPreciosDeLaTiendaYSumaElDelivery(t *testing.T) {
	q, err := newWorld().orch.Quote(context.Background(), cart)
	if err != nil {
		t.Fatal(err)
	}
	// 2 × 4.50 + 1 × 4.80 = 13.80; + delivery 6.50 = 20.30
	if q.SubtotalCents != 1380 || q.DeliveryFeeCents != 650 || q.TotalCents != 2030 || q.ETAMinutes != 30 || q.Currency != "PEN" {
		t.Fatalf("cotización inesperada: %+v", q)
	}
	if q.Lines[0].TotalCents != 900 || q.Lines[0].UnitPriceCents != 450 || q.Lines[0].Name != "Azúcar rubia" {
		t.Fatalf("línea inesperada: %+v", q.Lines[0])
	}
}

func TestValidaElCarritoYElStock(t *testing.T) {
	o := newWorld().orch
	ctx := context.Background()
	cases := map[string]services.QuoteRequest{
		"vacío":      {Address: cart.Address},
		"repetido":   {Items: []services.CartItem{{ProductID: "AZU-RUB-1K", Quantity: 1}, {ProductID: "AZU-RUB-1K", Quantity: 1}}, Address: cart.Address},
		"cantidad":   {Items: []services.CartItem{{ProductID: "AZU-RUB-1K", Quantity: 51}}, Address: cart.Address},
		"id raro":    {Items: []services.CartItem{{ProductID: "../x", Quantity: 1}}, Address: cart.Address},
		"dirección":  {Items: []services.CartItem{{ProductID: "AZU-RUB-1K", Quantity: 1}}, Address: services.Address{Line: "  a "}},
		"no existe":  {Items: []services.CartItem{{ProductID: "NADA", Quantity: 1}}, Address: cart.Address},
		"muchísimos": {Items: make([]services.CartItem, 31), Address: cart.Address},
	}
	for name, req := range cases {
		if _, err := o.Quote(ctx, req); status(err) != http.StatusBadRequest {
			t.Errorf("%s: esperaba 400, obtuve %v", name, err)
		}
	}
	tooMany := services.QuoteRequest{Items: []services.CartItem{{ProductID: "ARR-EXT-1K", Quantity: 3}}, Address: cart.Address}
	if _, err := o.Quote(ctx, tooMany); status(err) != http.StatusConflict || err.Error() != "Solo quedan 2 de «Arroz extra»" {
		t.Fatalf("esperaba 409 por stock, obtuve %v", err)
	}
}

func TestCrearReservaCobraElTotalYGuardaEnElCore(t *testing.T) {
	w := newWorld()
	order, err := w.orch.Create(context.Background(), "u_laura", cart)
	if err != nil {
		t.Fatal(err)
	}
	if order.ID != "ord_1" || order.Status != services.PendingPayment || order.TotalCents != 2030 || order.Payment.QRText == "" || order.Address.Line != "Av. Larco 123, Miraflores" {
		t.Fatalf("pedido inesperado: %+v", order)
	}
	if len(w.commerce.reserved["ord_1"]) != 2 {
		t.Fatal("debía reservar en la tienda con el id del pedido")
	}
	if w.payments.last.AmountCents != 2030 || w.payments.last.Reference != "ord_1" || w.payments.last.NotifyURL != "http://gw/hooks/pagaya" {
		t.Fatalf("cobro inesperado: %+v", w.payments.last)
	}
	saved := w.core.orders["ord_1"]
	if saved.UserID != "u_laura" || saved.DeliveryQuoteID != "q_1" || saved.Payment.Provider != "PagaYa" || saved.Payment.ExpiresAt != "2026-10-17T12:15:00Z" {
		t.Fatalf("lo guardado en el core no es lo esperado: %+v", saved)
	}
}

func TestCrearSinStockNoCobra(t *testing.T) {
	w := newWorld()
	w.commerce.outOf = "AZU-RUB-1K"
	if _, err := w.orch.Create(context.Background(), "u", cart); status(err) != http.StatusConflict {
		t.Fatalf("esperaba 409, obtuve %v", err)
	}
	if w.payments.last.AmountCents != 0 || len(w.core.orders) != 0 {
		t.Fatal("sin reserva no se cobra ni se guarda nada")
	}
}

func paidEvent() pagaya.Event {
	at := time.Date(2026, 10, 17, 12, 5, 0, 0, time.UTC)
	return pagaya.Event{ChargeID: "cob_1", Reference: "ord_1", Status: services.Paid, PaidAt: &at}
}

func TestPagoDespachaElDeliveryUnaSolaVez(t *testing.T) {
	w := newWorld()
	ctx := context.Background()
	if _, err := w.orch.Create(ctx, "u", cart); err != nil {
		t.Fatal(err)
	}
	if err := w.orch.PaymentEvent(ctx, paidEvent()); err != nil {
		t.Fatal(err)
	}
	// La billetera repite el aviso: no hay un segundo motorizado.
	if err := w.orch.PaymentEvent(ctx, paidEvent()); err != nil {
		t.Fatal(err)
	}
	order := w.core.orders["ord_1"]
	if order.Status != services.SearchingDriver || *order.Payment.PaidAt != "2026-10-17T12:05:00Z" || order.Delivery.Provider != "MotoYa" {
		t.Fatalf("pedido inesperado tras el pago: %+v", order)
	}
	if len(w.delivery.dispatched) != 1 || w.delivery.dispatched[0] != "q_1|ord_1|http://gw/hooks/motoya" {
		t.Fatalf("despachos inesperados: %v", w.delivery.dispatched)
	}
}

func TestSiElDeliveryFallaElReintentoDelAvisoLoDespacha(t *testing.T) {
	w := newWorld()
	ctx := context.Background()
	_, _ = w.orch.Create(ctx, "u", cart)
	w.delivery.fail = true
	if err := w.orch.PaymentEvent(ctx, paidEvent()); err == nil {
		t.Fatal("debía devolver error para que la billetera reintente")
	}
	if w.core.orders["ord_1"].Status != services.Paid {
		t.Fatal("el pago queda registrado aunque el delivery falle")
	}
	w.delivery.fail = false
	if err := w.orch.PaymentEvent(ctx, paidEvent()); err != nil {
		t.Fatal(err)
	}
	if w.core.orders["ord_1"].Status != services.SearchingDriver || len(w.delivery.dispatched) != 1 {
		t.Fatalf("el reintento debía despachar: %+v", w.core.orders["ord_1"])
	}
}

func TestCobroVencidoYAvisoDesconocido(t *testing.T) {
	w := newWorld()
	ctx := context.Background()
	_, _ = w.orch.Create(ctx, "u", cart)
	if err := w.orch.PaymentEvent(ctx, pagaya.Event{Reference: "ord_1", Status: services.PaymentExpired}); err != nil {
		t.Fatal(err)
	}
	if w.core.orders["ord_1"].Status != services.PaymentExpired {
		t.Fatal("debía quedar vencido")
	}
	// Un pago que llega después del vencimiento no despacha nada.
	if err := w.orch.PaymentEvent(ctx, paidEvent()); err != nil || len(w.delivery.dispatched) != 0 {
		t.Fatalf("no debía despachar: %v %v", err, w.delivery.dispatched)
	}
	if err := w.orch.PaymentEvent(ctx, pagaya.Event{Reference: "ord_x", Status: services.Paid}); err != nil {
		t.Fatalf("un pedido desconocido se ignora, obtuve %v", err)
	}
}

func TestAvisosDelDeliveryAvanzanElPedido(t *testing.T) {
	w := newWorld()
	ctx := context.Background()
	_, _ = w.orch.Create(ctx, "u", cart)
	_ = w.orch.PaymentEvent(ctx, paidEvent())
	eta := 18
	if err := w.orch.DeliveryEvent(ctx, motoya.Event{Reference: "ord_1", Status: services.OnTheWay, DriverName: "Rosa Quispe", Vehicle: "Moto · C3M-915", ETAMinutes: &eta}); err != nil {
		t.Fatal(err)
	}
	order := w.core.orders["ord_1"]
	if order.Status != services.OnTheWay || *order.Delivery.DriverName != "Rosa Quispe" || *order.Delivery.ETAMinutes != 18 {
		t.Fatalf("pedido inesperado: %+v %+v", order, order.Delivery)
	}
	zero := 0
	if err := w.orch.DeliveryEvent(ctx, motoya.Event{Reference: "ord_1", Status: services.Delivered, ETAMinutes: &zero}); err != nil {
		t.Fatal(err)
	}
	order = w.core.orders["ord_1"]
	if order.Status != services.Delivered || *order.Delivery.DriverName != "Rosa Quispe" {
		t.Fatalf("al entregar se conserva el motorizado: %+v %+v", order, order.Delivery)
	}
	// Un aviso viejo que llega tarde no hace retroceder el pedido.
	before := len(w.core.updates)
	_ = w.orch.DeliveryEvent(ctx, motoya.Event{Reference: "ord_1", Status: services.OnTheWay})
	if len(w.core.updates) != before || w.core.orders["ord_1"].Status != services.Delivered {
		t.Fatal("un aviso fuera de orden no debe cambiar nada")
	}
}
