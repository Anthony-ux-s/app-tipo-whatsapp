// Package orders orquesta un pedido entre sistemas externos: precios y reserva en la tienda, la
// tarifa del delivery (cotización de Rapidito), cobro con QR, y el registro en el core. Desde el pago,
// el pedido sigue en el core: el negocio lo acepta y lo prepara, y lo reparten los repartidores de
// Parla (la flota de Rapidito).
package orders

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/parla/gateway/internal/services"
	"github.com/parla/gateway/internal/translators/mercaya"
	"github.com/parla/gateway/internal/translators/pagaya"
	"github.com/parla/gateway/internal/translators/rapidito"
)

const (
	maxItems    = 30
	maxQuantity = 50
	// maxTipCents: tope de la propina para el repartidor (S/ 100).
	maxTipCents = 10_000
)

// Commerce: lo que el orquestador necesita de la tienda.
type Commerce interface {
	Search(ctx context.Context, query string) ([]services.Product, error)
	Product(ctx context.Context, id string) (services.Product, error)
	Reserve(ctx context.Context, reference string, items []services.CartItem) error
	// Update cambia precio, oferta o stock (lo usa la dueña de la tienda).
	Update(ctx context.Context, id string, patch mercaya.ProductPatch) (services.Product, error)
}

// Delivery: la tarifa y el tiempo estimado del delivery.
type Delivery interface {
	Quote(ctx context.Context, address services.Address) (rapidito.Quote, error)
}

// Payments: lo que necesita de la billetera.
type Payments interface {
	CreateCharge(ctx context.Context, req pagaya.ChargeRequest) (pagaya.Charge, error)
	// Cancel anula un cobro sin pagar (pagaya.ErrAlreadyPaid si ya se pagó).
	Cancel(ctx context.Context, chargeID string) error
	// Refund devuelve un cobro pagado; repetirlo no duplica la devolución.
	Refund(ctx context.Context, chargeID string) (time.Time, error)
}

// Error lleva el código HTTP y el mensaje para la persona.
type Error struct {
	Status  int
	Code    string
	Message string
}

func (e *Error) Error() string { return e.Message }

func invalid(message string) error {
	return &Error{Status: http.StatusBadRequest, Code: "bad_request", Message: message}
}

func unavailable(what string) error {
	return &Error{Status: http.StatusBadGateway, Code: "bad_gateway", Message: what + " no responde. Inténtalo de nuevo en un momento."}
}

type Orchestrator struct {
	Commerce Commerce
	Delivery Delivery
	Payments Payments
	Core     Core
	// PublicURL es la dirección pública del gateway, para los avisos de los proveedores.
	PublicURL string
	Now       func() time.Time
	NewID     func() string
}

// Catalog: los servicios que ofrece Parla.
func Catalog() []services.ServiceInfo {
	return []services.ServiceInfo{
		{ID: services.Mercado, Name: "Mercado", Description: "Abarrotes, frutas y productos del día. Pagas con QR y te lo lleva un repartidor de Rapidito.", Provider: "MercaYa · delivery Rapidito · pago PagaYa", Available: true},
		{ID: services.Salud, Name: "Salud", Description: "Citas médicas, farmacia y resultados en un solo lugar.", Provider: "Próximamente", Available: false},
	}
}

func (o *Orchestrator) now() time.Time {
	if o.Now != nil {
		return o.Now()
	}
	return time.Now()
}

func (o *Orchestrator) newID() string {
	if o.NewID != nil {
		return o.NewID()
	}
	b := make([]byte, 10)
	_, _ = rand.Read(b)
	return "ord_" + hex.EncodeToString(b)
}

// Products busca en la tienda.
func (o *Orchestrator) Products(ctx context.Context, query string) ([]services.Product, error) {
	query = strings.TrimSpace(query)
	if utf8.RuneCountInString(query) > 80 {
		return nil, invalid("La búsqueda es demasiado larga")
	}
	products, err := o.Commerce.Search(ctx, query)
	if err != nil {
		slog.Warn("búsqueda en la tienda falló", "error", err)
		return nil, unavailable("La tienda")
	}
	return products, nil
}

func validateRequest(req services.QuoteRequest) (services.QuoteRequest, error) {
	if len(req.Items) == 0 {
		return req, invalid("Agrega al menos un producto")
	}
	if len(req.Items) > maxItems {
		return req, invalid(fmt.Sprintf("Un pedido admite hasta %d productos distintos", maxItems))
	}
	seen := map[string]bool{}
	for _, item := range req.Items {
		if !services.ValidID.MatchString(item.ProductID) {
			return req, invalid("Hay un producto no válido en el carrito")
		}
		if seen[item.ProductID] {
			return req, invalid("Hay un producto repetido en el carrito")
		}
		seen[item.ProductID] = true
		if item.Quantity < 1 || item.Quantity > maxQuantity {
			return req, invalid(fmt.Sprintf("La cantidad de cada producto debe estar entre 1 y %d", maxQuantity))
		}
	}
	req.Address.Line = strings.TrimSpace(req.Address.Line)
	req.Address.Reference = strings.TrimSpace(req.Address.Reference)
	if n := utf8.RuneCountInString(req.Address.Line); n < 5 || n > 200 {
		return req, invalid("Escribe la dirección de entrega (entre 5 y 200 caracteres)")
	}
	if utf8.RuneCountInString(req.Address.Reference) > 200 {
		return req, invalid("La referencia puede tener hasta 200 caracteres")
	}
	if p := req.Address.Location; p != nil && (math.IsNaN(p.Lat) || math.IsNaN(p.Lng) || math.Abs(p.Lat) > 90 || math.Abs(p.Lng) > 180) {
		return req, invalid("La ubicación marcada en el mapa no es válida")
	}
	if req.TipCents < 0 || req.TipCents > maxTipCents {
		return req, invalid("La propina debe estar entre S/ 0 y S/ 100")
	}
	return req, nil
}

// quote calcula el pedido con los precios vigentes de la tienda (nunca los del navegador) y la
// tarifa del delivery, y devuelve también la cotización del delivery (el core la guarda con el pedido).
func (o *Orchestrator) quote(ctx context.Context, req services.QuoteRequest) (services.OrderQuote, services.QuoteRequest, rapidito.Quote, error) {
	if err := o.storeOpen(ctx, services.Mercado); err != nil {
		return services.OrderQuote{}, req, rapidito.Quote{}, err
	}
	req, err := validateRequest(req)
	if err != nil {
		return services.OrderQuote{}, req, rapidito.Quote{}, err
	}

	products := make([]services.Product, len(req.Items))
	errs := make([]error, len(req.Items))
	var wg sync.WaitGroup
	for i, item := range req.Items {
		wg.Add(1)
		go func() {
			defer wg.Done()
			products[i], errs[i] = o.Commerce.Product(ctx, item.ProductID)
		}()
	}
	wg.Wait()

	q := services.OrderQuote{Lines: make([]services.OrderLine, len(req.Items)), Currency: services.Currency}
	for i, item := range req.Items {
		if err := errs[i]; err != nil {
			if errors.Is(err, mercaya.ErrNotFound) {
				return q, req, rapidito.Quote{}, invalid("Un producto del carrito ya no está disponible")
			}
			slog.Warn("precio de la tienda falló", "producto", item.ProductID, "error", err)
			return q, req, rapidito.Quote{}, unavailable("La tienda")
		}
		p := products[i]
		if p.Stock < item.Quantity {
			return q, req, rapidito.Quote{}, &Error{Status: http.StatusConflict, Code: "conflict", Message: fmt.Sprintf("Solo quedan %d de «%s»", p.Stock, p.Name)}
		}
		line := services.OrderLine{ProductID: p.ID, Name: p.Name, Unit: p.Unit, Quantity: item.Quantity, UnitPriceCents: p.PriceCents, TotalCents: p.PriceCents * item.Quantity}
		q.Lines[i] = line
		q.SubtotalCents += line.TotalCents
	}

	delivery, err := o.Delivery.Quote(ctx, req.Address)
	if err != nil {
		slog.Warn("cotización del delivery falló", "error", err)
		return q, req, rapidito.Quote{}, unavailable("El delivery")
	}
	q.DeliveryFeeCents = delivery.FeeCents
	// La propina va íntegra al repartidor: se suma aparte del delivery.
	q.TipCents = req.TipCents
	q.TotalCents = q.SubtotalCents + q.DeliveryFeeCents + q.TipCents
	q.ETAMinutes = delivery.ETAMinutes
	return q, req, delivery, nil
}

// Quote: subtotal de productos + delivery = total, sin crear nada.
func (o *Orchestrator) Quote(ctx context.Context, req services.QuoteRequest) (services.OrderQuote, error) {
	q, _, _, err := o.quote(ctx, req)
	return q, err
}

// Create recotiza, reserva en la tienda, genera el cobro con QR y guarda el pedido en el core.
func (o *Orchestrator) Create(ctx context.Context, userID string, req services.QuoteRequest) (services.Order, error) {
	q, req, delivery, err := o.quote(ctx, req)
	if err != nil {
		return services.Order{}, err
	}
	id := o.newID()

	if err := o.Commerce.Reserve(ctx, id, req.Items); err != nil {
		var stock mercaya.OutOfStockError
		if errors.As(err, &stock) {
			return services.Order{}, &Error{Status: http.StatusConflict, Code: "conflict", Message: "Uno de los productos se agotó mientras armabas el pedido. Revisa el carrito."}
		}
		slog.Warn("reserva en la tienda falló", "pedido", id, "error", err)
		return services.Order{}, unavailable("La tienda")
	}

	units := 0
	for _, line := range q.Lines {
		units += line.Quantity
	}
	concept := fmt.Sprintf("Pedido Parla · %d productos + delivery", units)
	if q.TipCents > 0 {
		concept += " + propina"
	}
	charge, err := o.Payments.CreateCharge(ctx, pagaya.ChargeRequest{
		AmountCents: q.TotalCents,
		Concept:     concept,
		Reference:   id,
		NotifyURL:   o.PublicURL + "/hooks/pagaya",
	})
	if err != nil {
		slog.Warn("cobro en la billetera falló", "pedido", id, "error", err)
		return services.Order{}, unavailable("El pago")
	}

	saved, err := o.Core.CreateOrder(ctx, services.InternalCreateOrder{
		ID: id, UserID: userID, Service: services.Mercado, Lines: q.Lines,
		SubtotalCents: q.SubtotalCents, DeliveryFeeCents: q.DeliveryFeeCents, TipCents: q.TipCents, TotalCents: q.TotalCents, Currency: services.Currency,
		Address: req.Address,
		Payment: services.OrderPayment{
			Provider: pagaya.Provider, ChargeID: charge.ID, QRText: charge.QRText, PayURL: charge.PayURL,
			ExpiresAt: charge.ExpiresAt.UTC().Format(time.RFC3339),
		},
		DeliveryQuoteID: delivery.ID,
		ETAMinutes:      delivery.ETAMinutes,
	})
	if err != nil {
		slog.Error("no se pudo guardar el pedido en el core", "pedido", id, "error", err)
		return services.Order{}, unavailable("Parla")
	}
	return saved.Order, nil
}

// PaymentEvent aplica un aviso de la billetera: pagado → queda esperando al negocio; vencido → lo marca.
// Es idempotente: los avisos repetidos no cambian nada.
func (o *Orchestrator) PaymentEvent(ctx context.Context, ev pagaya.Event) error {
	order, err := o.Core.GetOrder(ctx, ev.Reference)
	if errors.Is(err, ErrNotFound) {
		slog.Warn("aviso de pago de un pedido desconocido", "pedido", ev.Reference)
		return nil
	}
	if err != nil {
		return err
	}

	if ev.Status == services.PaymentExpired {
		if order.Status == services.PendingPayment {
			_, err := o.Core.UpdateOrder(ctx, order.ID, services.InternalUpdateOrder{ExpectStatus: services.PendingPayment, Status: services.PaymentExpired})
			if err != nil && !errors.Is(err, ErrConflict) {
				return err
			}
		}
		return nil
	}

	paidAt := o.now()
	if ev.PaidAt != nil {
		paidAt = *ev.PaidAt
	}
	// Pagó después de que se canceló o rechazó (o mientras se cancelaba): se le devuelve.
	if (order.Status == services.Cancelled || order.Status == services.Rejected) && order.Payment.RefundedAt == nil {
		chargeID := order.Payment.ChargeID
		if chargeID == "" {
			chargeID = ev.ChargeID
		}
		refundedAt, err := o.Payments.Refund(ctx, chargeID)
		if err != nil {
			// Se devuelve el error para que la billetera reintente el aviso y volvamos a devolver.
			slog.Error("no se pudo devolver un pago que llegó tras cancelar", "pedido", order.ID, "error", err)
			return err
		}
		_, err = o.Core.UpdateOrder(ctx, order.ID, services.InternalUpdateOrder{
			ExpectStatus: order.Status, Status: order.Status,
			PaidAt: paidAt.UTC().Format(time.RFC3339), RefundedAt: refundedAt.UTC().Format(time.RFC3339),
			Note: "Pago recibido tras cancelar · devuelto",
		})
		if errors.Is(err, ErrConflict) {
			return nil
		}
		return err
	}
	if order.Status != services.PendingPayment {
		return nil
	}
	_, err = o.Core.UpdateOrder(ctx, order.ID, services.InternalUpdateOrder{
		ExpectStatus: services.PendingPayment, Status: services.Paid, PaidAt: paidAt.UTC().Format(time.RFC3339),
	})
	if errors.Is(err, ErrConflict) {
		return nil
	}
	return err
}

// Quién pide cancelar o rechazar: el cliente del pedido o el dueño del negocio que lo atiende.
type actor int

const (
	byCustomer actor = iota
	byOwner
)

// cancellation describe una forma de cerrar el pedido devolviendo el pago.
type cancellation struct {
	who    actor
	target services.OrderStatus
	// from: estados desde los que se puede; otro estado → 409 con late.
	from map[services.OrderStatus]bool
	late string
	// note: lo que queda en la línea de tiempo cuando se devuelve el pago.
	note string
}

var (
	customerCancel = cancellation{
		who: byCustomer, target: services.Cancelled,
		from: map[services.OrderStatus]bool{services.PendingPayment: true, services.Paid: true},
		late: "La tienda ya aceptó tu pedido. Escríbele para cancelarlo.",
		note: "Cancelado por el cliente · pago devuelto",
	}
	ownerReject = cancellation{
		who: byOwner, target: services.Rejected,
		from: map[services.OrderStatus]bool{services.Paid: true},
		late: "Este pedido ya no está esperando tu respuesta",
		note: "Rechazado por la tienda · pago devuelto",
	}
	ownerCancel = cancellation{
		who: byOwner, target: services.Cancelled,
		from: map[services.OrderStatus]bool{services.Preparing: true, services.SearchingDriver: true, services.DriverAssigned: true},
		late: "Ya no se puede cancelar: el pedido va en camino o terminó",
		note: "Cancelado por la tienda · pago devuelto",
	}
)

// CancelByCustomer: el cliente cancela antes de que la tienda acepte. Si no pagó, se anula el cobro;
// si pagó, se le devuelve.
func (o *Orchestrator) CancelByCustomer(ctx context.Context, userID, orderID string) (services.Order, error) {
	return o.close(ctx, userID, orderID, customerCancel)
}

// RejectByOwner: la tienda no acepta un pedido pagado y se le devuelve el pago al cliente.
func (o *Orchestrator) RejectByOwner(ctx context.Context, userID, orderID string) (services.Order, error) {
	return o.close(ctx, userID, orderID, ownerReject)
}

// CancelByOwner: la tienda cancela un pedido aceptado que aún no sale de la tienda; se devuelve el pago.
func (o *Orchestrator) CancelByOwner(ctx context.Context, userID, orderID string) (services.Order, error) {
	return o.close(ctx, userID, orderID, ownerCancel)
}

// close cierra el pedido según c. Primero mueve el dinero (anular o devolver, ambos idempotentes) y
// solo si eso salió bien lo registra en el core: si la billetera falla, el pedido no cambia y se
// puede reintentar sin cobrar ni devolver dos veces.
func (o *Orchestrator) close(ctx context.Context, userID, orderID string, c cancellation) (services.Order, error) {
	order, err := o.Core.GetOrder(ctx, orderID)
	if err == nil && !o.allowed(order, userID, c.who) {
		err = ErrNotFound
	}
	if errors.Is(err, ErrNotFound) {
		return services.Order{}, &Error{Status: http.StatusNotFound, Code: "not_found", Message: "Pedido no encontrado"}
	}
	if err != nil {
		slog.Error("no se pudo leer el pedido en el core", "pedido", orderID, "error", err)
		return services.Order{}, unavailable("Parla")
	}
	if order.Status == c.target {
		return order.Order, nil
	}
	if !c.from[order.Status] {
		return services.Order{}, conflict(c.late)
	}

	update := services.InternalUpdateOrder{ExpectStatus: order.Status, Status: c.target, Note: c.note}
	if order.Status == services.PendingPayment {
		// Sin pagar: se anula el cobro. Si justo se pagó (carrera con el pago), se devuelve.
		update.Note = "Cancelado por el cliente"
		err := o.Payments.Cancel(ctx, order.Payment.ChargeID)
		if errors.Is(err, pagaya.ErrAlreadyPaid) {
			err = o.refund(ctx, order, &update)
			update.Note = c.note
		}
		if err != nil {
			slog.Warn("no se pudo anular el cobro", "pedido", order.ID, "error", err)
			return services.Order{}, unavailable("El pago")
		}
	} else if err := o.refund(ctx, order, &update); err != nil {
		slog.Warn("no se pudo devolver el pago", "pedido", order.ID, "error", err)
		return services.Order{}, unavailable("El pago")
	}

	updated, err := o.Core.UpdateOrder(ctx, order.ID, update)
	if errors.Is(err, ErrConflict) {
		// Cambió mientras tanto: si ya quedó como se pedía, listo; si no, ya no se puede.
		if current, err := o.Core.GetOrder(ctx, order.ID); err == nil && current.Status == c.target {
			return current.Order, nil
		}
		return services.Order{}, conflict(c.late)
	}
	if err != nil {
		slog.Error("no se pudo guardar la cancelación en el core", "pedido", order.ID, "error", err)
		return services.Order{}, unavailable("Parla")
	}
	return updated.Order, nil
}

func (o *Orchestrator) allowed(order services.InternalOrder, userID string, who actor) bool {
	if who == byCustomer {
		return order.UserID == userID
	}
	return order.BusinessOwnerID != nil && *order.BusinessOwnerID == userID
}

// refund devuelve el pago del pedido y anota cuándo en update.
func (o *Orchestrator) refund(ctx context.Context, order services.InternalOrder, update *services.InternalUpdateOrder) error {
	at, err := o.Payments.Refund(ctx, order.Payment.ChargeID)
	if err != nil {
		return err
	}
	update.RefundedAt = at.UTC().Format(time.RFC3339)
	return nil
}

func conflict(message string) error {
	return &Error{Status: http.StatusConflict, Code: "conflict", Message: message}
}

// storeOpen: con la tienda cerrada (por horario o porque la dueña la cerró) no se cotiza ni se pide.
// Si ningún negocio atiende el servicio, se vende igual (la tienda externa siempre atiende).
func (o *Orchestrator) storeOpen(ctx context.Context, service services.ServiceID) error {
	business, err := o.Core.BusinessByService(ctx, service)
	switch {
	case errors.Is(err, ErrNotFound):
		return nil
	case err != nil:
		slog.Error("no se pudo consultar el horario de la tienda", "servicio", service, "error", err)
		return unavailable("Parla")
	case business.Open:
		return nil
	}
	message := "La tienda está cerrada ahora"
	if business.ClosedMessage != nil && strings.TrimSpace(*business.ClosedMessage) != "" {
		message = *business.ClosedMessage
	}
	return conflict(message)
}

// ── Catálogo de la tienda (lo administra la dueña) ────────────────────────────

const (
	minPriceCents = 10
	maxPriceCents = 1_000_000
	maxStock      = 100_000
)

// CatalogPatch: lo que pide cambiar la dueña. ListPriceSet distingue «no viene» de «null» (quitar oferta).
type CatalogPatch struct {
	PriceCents     *int
	ListPriceSet   bool
	ListPriceCents *int
	Stock          *int
}

func noBusiness() error {
	return &Error{Status: http.StatusNotFound, Code: "not_found", Message: "No tienes un negocio en Parla"}
}

// ownStore comprueba que la persona es dueña de la tienda del Mercado (la única con catálogo hoy).
func (o *Orchestrator) ownStore(ctx context.Context, userID string) error {
	business, err := o.Core.BusinessByOwner(ctx, userID)
	switch {
	case errors.Is(err, ErrNotFound):
		return noBusiness()
	case err != nil:
		slog.Error("no se pudo consultar el negocio", "error", err)
		return unavailable("Parla")
	case business.Service != services.Mercado:
		return noBusiness()
	}
	return nil
}

// StoreCatalog: todo el catálogo de la tienda, también lo agotado, por categoría y nombre.
func (o *Orchestrator) StoreCatalog(ctx context.Context, userID string) ([]services.Product, error) {
	if err := o.ownStore(ctx, userID); err != nil {
		return nil, err
	}
	products, err := o.Commerce.Search(ctx, "")
	if err != nil {
		slog.Warn("catálogo de la tienda falló", "error", err)
		return nil, unavailable("La tienda")
	}
	sort.SliceStable(products, func(i, j int) bool {
		if products[i].Category != products[j].Category {
			return products[i].Category < products[j].Category
		}
		return products[i].Name < products[j].Name
	})
	return products, nil
}

// UpdateStoreProduct: la dueña cambia precio, oferta o stock de un producto de su tienda.
func (o *Orchestrator) UpdateStoreProduct(ctx context.Context, userID, productID string, patch CatalogPatch) (services.Product, error) {
	if err := o.ownStore(ctx, userID); err != nil {
		return services.Product{}, err
	}
	if patch.PriceCents == nil && !patch.ListPriceSet && patch.Stock == nil {
		return services.Product{}, invalid("No hay cambios")
	}
	if p := patch.PriceCents; p != nil && (*p < minPriceCents || *p > maxPriceCents) {
		return services.Product{}, invalid("El precio debe estar entre S/ 0.10 y S/ 10 000")
	}
	if s := patch.Stock; s != nil && (*s < 0 || *s > maxStock) {
		return services.Product{}, invalid("El stock debe estar entre 0 y 100 000")
	}
	if patch.ListPriceSet && patch.ListPriceCents != nil {
		list := *patch.ListPriceCents
		price := patch.PriceCents
		if price == nil {
			// Sin precio nuevo, la oferta se compara con el precio vigente de la tienda.
			current, err := o.Commerce.Product(ctx, productID)
			if errors.Is(err, mercaya.ErrNotFound) {
				return services.Product{}, &Error{Status: http.StatusNotFound, Code: "not_found", Message: "Producto no encontrado"}
			}
			if err != nil {
				return services.Product{}, unavailable("La tienda")
			}
			price = &current.PriceCents
		}
		if list <= *price || list > maxPriceCents {
			return services.Product{}, invalid("El precio normal debe ser mayor que el de oferta")
		}
	}
	product, err := o.Commerce.Update(ctx, productID, mercaya.ProductPatch{
		PriceCents: patch.PriceCents, ListPriceCents: patch.ListPriceCents,
		ClearListPrice: patch.ListPriceSet && patch.ListPriceCents == nil, Stock: patch.Stock,
	})
	switch {
	case errors.Is(err, mercaya.ErrNotFound):
		return services.Product{}, &Error{Status: http.StatusNotFound, Code: "not_found", Message: "Producto no encontrado"}
	case errors.Is(err, mercaya.ErrRejected):
		// Con el precio nuevo, la oferta que ya tenía dejó de ser mayor.
		return services.Product{}, invalid("El precio normal debe ser mayor que el de oferta")
	case err != nil:
		slog.Warn("cambio en el catálogo falló", "producto", productID, "error", err)
		return services.Product{}, unavailable("La tienda")
	}
	return product, nil
}
