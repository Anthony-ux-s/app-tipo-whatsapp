package orders

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/parla/gateway/internal/services"
	"github.com/parla/gateway/internal/translators/mercaya"
	"github.com/parla/gateway/internal/translators/pagaya"
	"github.com/parla/gateway/internal/translators/rapidito"
)

// ── Fakes ─────────────────────────────────────────────────────────────────────

type fakeCommerce struct {
	products map[string]services.Product
	reserved map[string][]services.CartItem
	outOf    string
	patches  []mercaya.ProductPatch
	// updateErr simula que la tienda rechaza o no responde un cambio del catálogo.
	updateErr error
}

func (f *fakeCommerce) Update(_ context.Context, id string, patch mercaya.ProductPatch) (services.Product, error) {
	if f.updateErr != nil {
		return services.Product{}, f.updateErr
	}
	p, ok := f.products[id]
	if !ok {
		return services.Product{}, mercaya.ErrNotFound
	}
	f.patches = append(f.patches, patch)
	if patch.PriceCents != nil {
		p.PriceCents = *patch.PriceCents
	}
	if patch.ClearListPrice {
		p.ListPriceCents = nil
	} else if patch.ListPriceCents != nil {
		p.ListPriceCents = patch.ListPriceCents
	}
	if patch.Stock != nil {
		p.Stock = *patch.Stock
	}
	f.products[id] = p
	return p, nil
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

type fakeDelivery struct{}

func (f *fakeDelivery) Quote(context.Context, services.Address) (rapidito.Quote, error) {
	return rapidito.Quote{ID: "q_1", FeeCents: 650, ETAMinutes: 30}, nil
}

// fakePayments imita la billetera: anular y devolver son idempotentes; fail simula que no responde.
type fakePayments struct {
	last      pagaya.ChargeRequest
	fail      bool
	paid      bool // la persona ya pagó el cobro (anular → ErrAlreadyPaid)
	cancelled []string
	refunded  []string
}

func (f *fakePayments) Cancel(_ context.Context, chargeID string) error {
	if f.fail {
		return errors.New("billetera caída")
	}
	if f.paid {
		return pagaya.ErrAlreadyPaid
	}
	f.cancelled = append(f.cancelled, chargeID)
	return nil
}

func (f *fakePayments) Refund(_ context.Context, chargeID string) (time.Time, error) {
	if f.fail {
		return time.Time{}, errors.New("billetera caída")
	}
	f.refunded = append(f.refunded, chargeID)
	return time.Date(2026, 10, 17, 12, 30, 0, 0, time.UTC), nil
}

func (f *fakePayments) CreateCharge(_ context.Context, req pagaya.ChargeRequest) (pagaya.Charge, error) {
	f.last = req
	return pagaya.Charge{ID: "cob_1", QRText: "http://p/pagar/cob_1", PayURL: "http://p/pagar/cob_1", ExpiresAt: time.Date(2026, 10, 17, 12, 15, 0, 0, time.UTC)}, nil
}

// fakeCore imita las reglas del core: expectStatus distinto → 409.
type fakeCore struct {
	mu      sync.Mutex
	orders  map[string]services.InternalOrder
	updates []services.InternalUpdateOrder
	// business: el negocio del Mercado (nil = ninguno); businessErr simula que el core no responde.
	business    *services.Business
	businessErr error
}

func (f *fakeCore) BusinessByService(_ context.Context, service services.ServiceID) (services.Business, error) {
	if f.businessErr != nil {
		return services.Business{}, f.businessErr
	}
	if f.business == nil || f.business.Service != service {
		return services.Business{}, ErrNotFound
	}
	return *f.business, nil
}

func (f *fakeCore) BusinessByOwner(_ context.Context, userID string) (services.Business, error) {
	if f.businessErr != nil {
		return services.Business{}, f.businessErr
	}
	if f.business == nil || f.business.OwnerID != userID {
		return services.Business{}, ErrNotFound
	}
	return *f.business, nil
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
		UserID: in.UserID, DeliveryQuoteID: in.DeliveryQuoteID, BusinessOwnerID: &owner,
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
	if u.RefundedAt != "" {
		o.Payment.RefundedAt = &u.RefundedAt
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

// owner: dueño del negocio que atiende los pedidos de prueba.
var owner = "dueño"

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

func TestPagoEsperaAlNegocio(t *testing.T) {
	w := newWorld()
	ctx := context.Background()
	if _, err := w.orch.Create(ctx, "u", cart); err != nil {
		t.Fatal(err)
	}
	if err := w.orch.PaymentEvent(ctx, paidEvent()); err != nil {
		t.Fatal(err)
	}
	// La billetera repite el aviso: no cambia nada.
	if err := w.orch.PaymentEvent(ctx, paidEvent()); err != nil {
		t.Fatal(err)
	}
	order := w.core.orders["ord_1"]
	if order.Status != services.Paid || *order.Payment.PaidAt != "2026-10-17T12:05:00Z" {
		t.Fatalf("tras el pago el pedido espera al negocio: %+v", order)
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
	// Un pago que llega después del vencimiento no revive el pedido.
	if err := w.orch.PaymentEvent(ctx, paidEvent()); err != nil || w.core.orders["ord_1"].Status != services.PaymentExpired {
		t.Fatalf("debía seguir vencido: %v %+v", err, w.core.orders["ord_1"])
	}
	if err := w.orch.PaymentEvent(ctx, pagaya.Event{Reference: "ord_x", Status: services.Paid}); err != nil {
		t.Fatalf("un pedido desconocido se ignora, obtuve %v", err)
	}
}

// at deja el pedido de prueba en un estado (como si el core lo hubiera avanzado).
func (w world) at(status services.OrderStatus) {
	o := w.core.orders["ord_1"]
	o.Status = status
	w.core.orders["ord_1"] = o
}

func TestCrearGuardaElCobroYElTiempoEstimado(t *testing.T) {
	w := newWorld()
	if _, err := w.orch.Create(context.Background(), "u", cart); err != nil {
		t.Fatal(err)
	}
	if w.core.orders["ord_1"].Payment.ChargeID != "cob_1" {
		t.Fatalf("el pedido debe guardar el cobro para anularlo o devolverlo: %+v", w.core.orders["ord_1"].Payment)
	}
}

func TestClienteCancelaSinPagarYSeAnulaElCobro(t *testing.T) {
	w := newWorld()
	ctx := context.Background()
	_, _ = w.orch.Create(ctx, "u", cart)
	if _, err := w.orch.CancelByCustomer(ctx, "otra", "ord_1"); status(err) != http.StatusNotFound {
		t.Fatalf("otra persona no puede cancelarlo, obtuve %v", err)
	}
	order, err := w.orch.CancelByCustomer(ctx, "u", "ord_1")
	if err != nil || order.Status != services.Cancelled || len(w.payments.cancelled) != 1 || len(w.payments.refunded) != 0 {
		t.Fatalf("cancelar sin pagar anula el cobro: %+v %v %+v", order, err, w.payments)
	}
	if last := w.core.updates[len(w.core.updates)-1]; last.Note != "Cancelado por el cliente" || last.RefundedAt != "" {
		t.Fatalf("nota inesperada: %+v", last)
	}
	// Repetirlo no vuelve a tocar la billetera.
	if again, err := w.orch.CancelByCustomer(ctx, "u", "ord_1"); err != nil || again.Status != services.Cancelled || len(w.payments.cancelled) != 1 {
		t.Fatalf("cancelar dos veces es idempotente: %+v %v", again, err)
	}
}

func TestClienteCancelaPagadoYSeLeDevuelve(t *testing.T) {
	w := newWorld()
	ctx := context.Background()
	_, _ = w.orch.Create(ctx, "u", cart)
	_ = w.orch.PaymentEvent(ctx, paidEvent())
	order, err := w.orch.CancelByCustomer(ctx, "u", "ord_1")
	if err != nil || order.Status != services.Cancelled || *order.Payment.RefundedAt != "2026-10-17T12:30:00Z" || len(w.payments.refunded) != 1 {
		t.Fatalf("cancelar pagado devuelve el pago: %+v %v", order, err)
	}
	if last := w.core.updates[len(w.core.updates)-1]; last.Note != "Cancelado por el cliente · pago devuelto" || last.ExpectStatus != services.Paid {
		t.Fatalf("actualización inesperada: %+v", last)
	}
}

func TestClienteCancelaJustoCuandoPagaba(t *testing.T) {
	w := newWorld()
	ctx := context.Background()
	_, _ = w.orch.Create(ctx, "u", cart)
	w.payments.paid = true // pagó, pero el aviso aún no llega
	order, err := w.orch.CancelByCustomer(ctx, "u", "ord_1")
	if err != nil || order.Status != services.Cancelled || order.Payment.RefundedAt == nil || len(w.payments.refunded) != 1 {
		t.Fatalf("si ya pagó, se cancela devolviendo: %+v %v", order, err)
	}
	// Cuando llega el aviso del pago, ya está devuelto: no se devuelve dos veces.
	if err := w.orch.PaymentEvent(ctx, paidEvent()); err != nil || len(w.payments.refunded) != 1 {
		t.Fatalf("el aviso tardío no devuelve otra vez: %v %v", err, w.payments.refunded)
	}
}

func TestClienteNoCancelaSiLaTiendaYaAcepto(t *testing.T) {
	w := newWorld()
	ctx := context.Background()
	_, _ = w.orch.Create(ctx, "u", cart)
	w.at(services.Preparing)
	if _, err := w.orch.CancelByCustomer(ctx, "u", "ord_1"); status(err) != http.StatusConflict {
		t.Fatalf("esperaba 409, obtuve %v", err)
	}
	if len(w.payments.refunded) != 0 || w.core.orders["ord_1"].Status != services.Preparing {
		t.Fatal("no debía tocar nada")
	}
}

func TestSiLaBilleteraFallaElPedidoNoCambia(t *testing.T) {
	w := newWorld()
	ctx := context.Background()
	_, _ = w.orch.Create(ctx, "u", cart)
	_ = w.orch.PaymentEvent(ctx, paidEvent())
	w.payments.fail = true
	before := len(w.core.updates)
	if _, err := w.orch.CancelByCustomer(ctx, "u", "ord_1"); status(err) != http.StatusBadGateway {
		t.Fatalf("esperaba 502, obtuve %v", err)
	}
	if _, err := w.orch.RejectByOwner(ctx, owner, "ord_1"); status(err) != http.StatusBadGateway {
		t.Fatalf("esperaba 502, obtuve %v", err)
	}
	if len(w.core.updates) != before || w.core.orders["ord_1"].Status != services.Paid {
		t.Fatal("si la billetera falla, el pedido sigue igual para reintentar")
	}
	w.payments.fail = false
	if order, err := w.orch.CancelByCustomer(ctx, "u", "ord_1"); err != nil || order.Status != services.Cancelled {
		t.Fatalf("el reintento debía funcionar: %+v %v", order, err)
	}
}

func TestTiendaRechazaPagadoYDevuelve(t *testing.T) {
	w := newWorld()
	ctx := context.Background()
	_, _ = w.orch.Create(ctx, "u", cart)
	_ = w.orch.PaymentEvent(ctx, paidEvent())
	if _, err := w.orch.RejectByOwner(ctx, "u", "ord_1"); status(err) != http.StatusNotFound {
		t.Fatalf("el cliente no puede rechazar, obtuve %v", err)
	}
	order, err := w.orch.RejectByOwner(ctx, owner, "ord_1")
	if err != nil || order.Status != services.Rejected || order.Payment.RefundedAt == nil {
		t.Fatalf("rechazar devuelve el pago: %+v %v", order, err)
	}
	if last := w.core.updates[len(w.core.updates)-1]; last.Note != "Rechazado por la tienda · pago devuelto" {
		t.Fatalf("nota inesperada: %+v", last)
	}
	if again, err := w.orch.RejectByOwner(ctx, owner, "ord_1"); err != nil || again.Status != services.Rejected || len(w.payments.refunded) != 1 {
		t.Fatalf("rechazar dos veces es idempotente: %+v %v", again, err)
	}
	w.at(services.Preparing)
	if _, err := w.orch.RejectByOwner(ctx, owner, "ord_1"); status(err) != http.StatusConflict {
		t.Fatalf("aceptado ya no se rechaza, obtuve %v", err)
	}
}

func TestTiendaCancelaAntesDeQueSalga(t *testing.T) {
	for _, from := range []services.OrderStatus{services.Preparing, services.SearchingDriver, services.DriverAssigned} {
		w := newWorld()
		ctx := context.Background()
		_, _ = w.orch.Create(ctx, "u", cart)
		_ = w.orch.PaymentEvent(ctx, paidEvent())
		w.at(from)
		order, err := w.orch.CancelByOwner(ctx, owner, "ord_1")
		if err != nil || order.Status != services.Cancelled || order.Payment.RefundedAt == nil {
			t.Fatalf("desde %s: %+v %v", from, order, err)
		}
		if last := w.core.updates[len(w.core.updates)-1]; last.ExpectStatus != from || last.Note != "Cancelado por la tienda · pago devuelto" {
			t.Fatalf("actualización inesperada: %+v", last)
		}
	}
	w := newWorld()
	ctx := context.Background()
	_, _ = w.orch.Create(ctx, "u", cart)
	w.at(services.OnTheWay)
	if _, err := w.orch.CancelByOwner(ctx, owner, "ord_1"); status(err) != http.StatusConflict {
		t.Fatalf("en camino ya no se cancela, obtuve %v", err)
	}
	if _, err := w.orch.CancelByOwner(ctx, "u", "ord_1"); status(err) != http.StatusNotFound {
		t.Fatalf("el cliente no usa la cancelación de la tienda, obtuve %v", err)
	}
}

func TestPagoQueLlegaTrasCancelarSeDevuelve(t *testing.T) {
	w := newWorld()
	ctx := context.Background()
	_, _ = w.orch.Create(ctx, "u", cart)
	_, _ = w.orch.CancelByCustomer(ctx, "u", "ord_1") // anuló sin pagar
	if err := w.orch.PaymentEvent(ctx, paidEvent()); err != nil {
		t.Fatal(err)
	}
	order := w.core.orders["ord_1"]
	if order.Status != services.Cancelled || order.Payment.RefundedAt == nil || order.Payment.PaidAt == nil || len(w.payments.refunded) != 1 {
		t.Fatalf("un pago tardío se devuelve y el pedido sigue cancelado: %+v", order)
	}
	if last := w.core.updates[len(w.core.updates)-1]; last.Note != "Pago recibido tras cancelar · devuelto" || last.ExpectStatus != services.Cancelled {
		t.Fatalf("actualización inesperada: %+v", last)
	}
	// El aviso repetido no devuelve dos veces.
	if err := w.orch.PaymentEvent(ctx, paidEvent()); err != nil || len(w.payments.refunded) != 1 {
		t.Fatalf("idempotente: %v %v", err, w.payments.refunded)
	}
}

// ── Horario y catálogo de la tienda ───────────────────────────────────────────

func store(open bool) *services.Business {
	msg := "Bodega MercaYa abre a las 08:00"
	return &services.Business{ID: "biz_1", Name: "Bodega MercaYa", Service: services.Mercado, OwnerID: owner, Open: open, ClosedMessage: &msg}
}

func TestTiendaCerradaNoCotizaNiVende(t *testing.T) {
	w := newWorld()
	ctx := context.Background()
	w.core.business = store(false)
	if _, err := w.orch.Quote(ctx, cart); status(err) != http.StatusConflict || err.Error() != "Bodega MercaYa abre a las 08:00" {
		t.Fatalf("cerrada no cotiza, obtuve %v", err)
	}
	if _, err := w.orch.Create(ctx, "u", cart); status(err) != http.StatusConflict {
		t.Fatalf("cerrada no vende, obtuve %v", err)
	}
	if len(w.commerce.reserved) != 0 || w.payments.last.Reference != "" {
		t.Fatal("con la tienda cerrada no se reserva ni se cobra")
	}
	// Sin mensaje del core, uno genérico.
	w.core.business.ClosedMessage = nil
	if _, err := w.orch.Quote(ctx, cart); err == nil || err.Error() != "La tienda está cerrada ahora" {
		t.Fatalf("mensaje genérico esperado, obtuve %v", err)
	}
	w.core.business = store(true)
	if _, err := w.orch.Quote(ctx, cart); err != nil {
		t.Fatalf("abierta cotiza: %v", err)
	}
}

func TestSinNegocioSeVendeYSiElCoreFallaEs502(t *testing.T) {
	w := newWorld()
	ctx := context.Background()
	if _, err := w.orch.Quote(ctx, cart); err != nil {
		t.Fatalf("sin negocio la tienda atiende igual: %v", err)
	}
	w.core.businessErr = errors.New("core caído")
	if _, err := w.orch.Quote(ctx, cart); status(err) != http.StatusBadGateway {
		t.Fatalf("si no se sabe el horario, 502; obtuve %v", err)
	}
}

func TestSoloLaDuenaVeYCambiaElCatalogo(t *testing.T) {
	w := newWorld()
	ctx := context.Background()
	if _, err := w.orch.StoreCatalog(ctx, owner); status(err) != http.StatusNotFound {
		t.Fatalf("sin negocio, 404; obtuve %v", err)
	}
	w.core.business = store(true)
	if _, err := w.orch.StoreCatalog(ctx, "u"); status(err) != http.StatusNotFound {
		t.Fatalf("otra persona no ve el catálogo, obtuve %v", err)
	}
	ten := 10
	if _, err := w.orch.UpdateStoreProduct(ctx, "u", "AZU-RUB-1K", CatalogPatch{Stock: &ten}); status(err) != http.StatusNotFound {
		t.Fatalf("otra persona no cambia el catálogo, obtuve %v", err)
	}
	list, err := w.orch.StoreCatalog(ctx, owner)
	if err != nil || len(list) != 2 || list[0].ID != "ARR-EXT-1K" {
		t.Fatalf("catálogo ordenado esperado: %+v %v", list, err)
	}
	w.core.business.Service = services.Salud
	if _, err := w.orch.StoreCatalog(ctx, owner); status(err) != http.StatusNotFound {
		t.Fatalf("un negocio de otro servicio no tiene catálogo de MercaYa, obtuve %v", err)
	}
}

func TestValidacionesDelCatalogo(t *testing.T) {
	w := newWorld()
	ctx := context.Background()
	w.core.business = store(true)
	n := func(v int) *int { return &v }
	cases := []struct {
		patch CatalogPatch
		want  string
	}{
		{CatalogPatch{}, "No hay cambios"},
		{CatalogPatch{PriceCents: n(5)}, "El precio debe estar entre S/ 0.10 y S/ 10 000"},
		{CatalogPatch{PriceCents: n(1_000_001)}, "El precio debe estar entre S/ 0.10 y S/ 10 000"},
		{CatalogPatch{Stock: n(-1)}, "El stock debe estar entre 0 y 100 000"},
		{CatalogPatch{Stock: n(100_001)}, "El stock debe estar entre 0 y 100 000"},
		{CatalogPatch{PriceCents: n(500), ListPriceSet: true, ListPriceCents: n(500)}, "El precio normal debe ser mayor que el de oferta"},
		// Sin precio nuevo, se compara con el vigente (450).
		{CatalogPatch{ListPriceSet: true, ListPriceCents: n(400)}, "El precio normal debe ser mayor que el de oferta"},
	}
	for _, c := range cases {
		if _, err := w.orch.UpdateStoreProduct(ctx, owner, "AZU-RUB-1K", c.patch); status(err) != http.StatusBadRequest || err.Error() != c.want {
			t.Fatalf("%+v: esperaba «%s», obtuve %v", c.patch, c.want, err)
		}
	}
	if len(w.commerce.patches) != 0 {
		t.Fatal("ningún cambio inválido debe llegar a la tienda")
	}
	if _, err := w.orch.UpdateStoreProduct(ctx, owner, "NADA", CatalogPatch{Stock: n(1)}); status(err) != http.StatusNotFound {
		t.Fatalf("producto desconocido, 404; obtuve %v", err)
	}
	w.commerce.updateErr = errors.New("tienda caída")
	if _, err := w.orch.UpdateStoreProduct(ctx, owner, "AZU-RUB-1K", CatalogPatch{Stock: n(1)}); status(err) != http.StatusBadGateway {
		t.Fatalf("tienda caída, 502; obtuve %v", err)
	}
}

func TestOfertaNullLaQuitaYAusenteNoLaToca(t *testing.T) {
	w := newWorld()
	ctx := context.Background()
	w.core.business = store(true)
	n := func(v int) *int { return &v }
	p, err := w.orch.UpdateStoreProduct(ctx, owner, "AZU-RUB-1K", CatalogPatch{PriceCents: n(400), ListPriceSet: true, ListPriceCents: n(450)})
	if err != nil || p.PriceCents != 400 || p.ListPriceCents == nil || *p.ListPriceCents != 450 {
		t.Fatalf("oferta esperada: %+v %v", p, err)
	}
	if p, _ = w.orch.UpdateStoreProduct(ctx, owner, "AZU-RUB-1K", CatalogPatch{Stock: n(0)}); p.ListPriceCents == nil || p.Stock != 0 {
		t.Fatalf("sin listPriceCents la oferta queda: %+v", p)
	}
	if w.commerce.patches[1].ClearListPrice || w.commerce.patches[1].ListPriceCents != nil {
		t.Fatalf("ausente no debe tocar la oferta: %+v", w.commerce.patches[1])
	}
	if p, _ = w.orch.UpdateStoreProduct(ctx, owner, "AZU-RUB-1K", CatalogPatch{ListPriceSet: true}); p.ListPriceCents != nil {
		t.Fatalf("null quita la oferta: %+v", p)
	}
	if !w.commerce.patches[2].ClearListPrice {
		t.Fatal("null debe llegar a la tienda como «quitar oferta»")
	}
}

func TestElCuerpoDistingueOfertaAusenteNullYNumero(t *testing.T) {
	w := newWorld()
	w.core.business = store(true)
	h := &HTTP{Orch: w.orch}
	send := func(body string) int {
		req := httptest.NewRequest(http.MethodPatch, "/api/business/catalog/AZU-RUB-1K", strings.NewReader(body))
		req.SetPathValue("sku", "AZU-RUB-1K")
		rec := httptest.NewRecorder()
		h.UpdateStoreProduct(rec, req, owner)
		return rec.Code
	}
	if code := send(`{"priceCents":400,"listPriceCents":450}`); code != http.StatusOK {
		t.Fatalf("oferta: %d", code)
	}
	if code := send(`{"stock":3}`); code != http.StatusOK || w.commerce.patches[1].ClearListPrice || w.commerce.patches[1].ListPriceCents != nil {
		t.Fatalf("ausente no toca la oferta: %d %+v", code, w.commerce.patches[1])
	}
	if code := send(`{"listPriceCents":null}`); code != http.StatusOK || !w.commerce.patches[2].ClearListPrice {
		t.Fatalf("null quita la oferta: %d %+v", code, w.commerce.patches)
	}
	if code := send(`{"listPriceCents":"x"}`); code != http.StatusBadRequest {
		t.Fatalf("oferta inválida: %d", code)
	}
	if code := send(`{}`); code != http.StatusBadRequest {
		t.Fatalf("sin cambios: %d", code)
	}
}

func TestLaUbicacionDelMapaLlegaAlCoreYSeValida(t *testing.T) {
	w := newWorld()
	ctx := context.Background()
	req := cart
	req.Address.Location = &services.GeoPoint{Lat: -12.12, Lng: -77.03}
	if _, err := w.orch.Create(ctx, "u", req); err != nil {
		t.Fatal(err)
	}
	if loc := w.core.orders["ord_1"].Address.Location; loc == nil || loc.Lat != -12.12 {
		t.Fatalf("el punto del mapa debía guardarse: %+v", w.core.orders["ord_1"].Address)
	}
	bad := cart
	bad.Address.Location = &services.GeoPoint{Lat: 120, Lng: 0}
	if _, err := w.orch.Quote(ctx, bad); status(err) != http.StatusBadRequest {
		t.Fatalf("un punto fuera del mapa debía rechazarse, obtuve %v", err)
	}
}
