// Package orders orquesta un pedido entre sistemas externos: precios y reserva en la tienda,
// cotización y despacho del delivery (Rapidito), cobro con QR, y el registro en el core. Entre el
// pago y el delivery está el negocio: acepta el pedido, lo prepara y avisa cuando está listo.
package orders

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
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
)

// Commerce: lo que el orquestador necesita de la tienda.
type Commerce interface {
	Search(ctx context.Context, query string) ([]services.Product, error)
	Product(ctx context.Context, id string) (services.Product, error)
	Reserve(ctx context.Context, reference string, items []services.CartItem) error
}

// Delivery: lo que necesita del delivery.
type Delivery interface {
	Quote(ctx context.Context, address services.Address) (rapidito.Quote, error)
	Dispatch(ctx context.Context, quoteID, reference, callbackURL string) (string, error)
}

// Payments: lo que necesita de la billetera.
type Payments interface {
	CreateCharge(ctx context.Context, req pagaya.ChargeRequest) (pagaya.Charge, error)
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
		{ID: services.Mercado, Name: "Mercado", Description: "Abarrotes, frutas y productos del día. Pagas con QR y te lo lleva un motorizado.", Provider: "MercaYa · delivery Rapidito · pago PagaYa", Available: true},
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
	return req, nil
}

// quote calcula el pedido con los precios vigentes de la tienda (nunca los del navegador) y la
// tarifa del delivery, y devuelve también la cotización del delivery para despacharla después.
func (o *Orchestrator) quote(ctx context.Context, req services.QuoteRequest) (services.OrderQuote, services.QuoteRequest, rapidito.Quote, error) {
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
	q.TotalCents = q.SubtotalCents + q.DeliveryFeeCents
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
	charge, err := o.Payments.CreateCharge(ctx, pagaya.ChargeRequest{
		AmountCents: q.TotalCents,
		Concept:     fmt.Sprintf("Pedido Parla · %d productos + delivery", units),
		Reference:   id,
		NotifyURL:   o.PublicURL + "/hooks/pagaya",
	})
	if err != nil {
		slog.Warn("cobro en la billetera falló", "pedido", id, "error", err)
		return services.Order{}, unavailable("El pago")
	}

	saved, err := o.Core.CreateOrder(ctx, services.InternalCreateOrder{
		ID: id, UserID: userID, Service: services.Mercado, Lines: q.Lines,
		SubtotalCents: q.SubtotalCents, DeliveryFeeCents: q.DeliveryFeeCents, TotalCents: q.TotalCents, Currency: services.Currency,
		Address: req.Address,
		Payment: services.OrderPayment{
			Provider: pagaya.Provider, QRText: charge.QRText, PayURL: charge.PayURL,
			ExpiresAt: charge.ExpiresAt.UTC().Format(time.RFC3339),
		},
		DeliveryQuoteID: delivery.ID,
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

	if order.Status != services.PendingPayment {
		return nil
	}
	paidAt := o.now()
	if ev.PaidAt != nil {
		paidAt = *ev.PaidAt
	}
	_, err = o.Core.UpdateOrder(ctx, order.ID, services.InternalUpdateOrder{
		ExpectStatus: services.PendingPayment, Status: services.Paid, PaidAt: paidAt.UTC().Format(time.RFC3339),
	})
	if errors.Is(err, ErrConflict) {
		return nil
	}
	return err
}

// Ready: el dueño del negocio avisa que el pedido está listo y Rapidito sale a recogerlo. Solo lo
// puede hacer el dueño, y solo con el pedido en preparación; si el delivery falla, el pedido sigue
// en preparación y el dueño puede volver a intentarlo. Repetirlo no despacha dos motorizados.
func (o *Orchestrator) Ready(ctx context.Context, userID, orderID string) (services.Order, error) {
	order, err := o.Core.GetOrder(ctx, orderID)
	if errors.Is(err, ErrNotFound) || (err == nil && (order.BusinessOwnerID == nil || *order.BusinessOwnerID != userID)) {
		// También 404 si el pedido es de otro negocio: no se revela que existe.
		return services.Order{}, &Error{Status: http.StatusNotFound, Code: "not_found", Message: "Pedido no encontrado"}
	}
	if err != nil {
		slog.Error("no se pudo leer el pedido en el core", "pedido", orderID, "error", err)
		return services.Order{}, unavailable("Parla")
	}
	switch order.Status {
	case services.SearchingDriver, services.OnTheWay, services.Delivered:
		return order.Order, nil
	case services.Preparing:
	default:
		return services.Order{}, &Error{Status: http.StatusConflict, Code: "conflict", Message: "Primero acepta el pedido para prepararlo"}
	}
	if _, err := o.Delivery.Dispatch(ctx, order.DeliveryQuoteID, order.ID, o.PublicURL+"/hooks/rapidito"); err != nil {
		slog.Error("no se pudo despachar el delivery", "pedido", order.ID, "error", err)
		return services.Order{}, unavailable("Rapidito")
	}
	updated, err := o.Core.UpdateOrder(ctx, order.ID, services.InternalUpdateOrder{
		ExpectStatus: services.Preparing, Status: services.SearchingDriver,
		Delivery: &services.OrderDelivery{Provider: rapidito.Provider, UpdatedAt: o.now().UTC().Format(time.RFC3339)},
	})
	if errors.Is(err, ErrConflict) {
		if updated, err = o.Core.GetOrder(ctx, order.ID); err == nil {
			return updated.Order, nil
		}
	}
	if err != nil {
		slog.Error("no se pudo guardar el despacho en el core", "pedido", order.ID, "error", err)
		return services.Order{}, unavailable("Parla")
	}
	return updated.Order, nil
}

// DeliveryEvent aplica un aviso del delivery (motorizado asignado, entregado).
func (o *Orchestrator) DeliveryEvent(ctx context.Context, ev rapidito.Event) error {
	order, err := o.Core.GetOrder(ctx, ev.Reference)
	if errors.Is(err, ErrNotFound) {
		slog.Warn("aviso de delivery de un pedido desconocido", "pedido", ev.Reference)
		return nil
	}
	if err != nil {
		return err
	}
	allowed := map[services.OrderStatus][]services.OrderStatus{
		services.OnTheWay:  {services.SearchingDriver},
		services.Delivered: {services.SearchingDriver, services.OnTheWay},
	}
	ok := false
	for _, from := range allowed[ev.Status] {
		ok = ok || order.Status == from
	}
	if !ok {
		return nil // aviso repetido o fuera de orden
	}
	delivery := services.OrderDelivery{Provider: rapidito.Provider, ETAMinutes: ev.ETAMinutes, UpdatedAt: o.now().UTC().Format(time.RFC3339)}
	if order.Delivery != nil {
		delivery.DriverName, delivery.Vehicle = order.Delivery.DriverName, order.Delivery.Vehicle
	}
	if ev.DriverName != "" {
		delivery.DriverName = &ev.DriverName
	}
	if ev.Vehicle != "" {
		delivery.Vehicle = &ev.Vehicle
	}
	_, err = o.Core.UpdateOrder(ctx, order.ID, services.InternalUpdateOrder{ExpectStatus: order.Status, Status: ev.Status, Delivery: &delivery})
	if errors.Is(err, ErrConflict) {
		return nil
	}
	return err
}
