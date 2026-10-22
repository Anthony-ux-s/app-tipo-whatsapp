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

	"github.com/parla/gateway/internal/payments"
	"github.com/parla/gateway/internal/services"
	"github.com/parla/gateway/internal/translators/mercaya"
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
	// Release anula la reserva (el pedido no siguió) y la tienda devuelve el stock; idempotente.
	Release(ctx context.Context, reference string) error
	// Update cambia precio, oferta o stock (lo usa la dueña de la tienda).
	Update(ctx context.Context, id string, patch mercaya.ProductPatch) (services.Product, error)
}

// Stores: la tienda de los servicios que no son el Mercado (se conectan desde Integraciones del panel
// de soporte, con la API de tienda de Parla: catálogo, productos, reservas y anulaciones).
type Stores interface {
	// For: la tienda del servicio, o ErrServiceOff si no está conectada o está apagada.
	For(ctx context.Context, service services.ServiceID) (Commerce, error)
	// Enabled: si el servicio está conectado y encendido (para mostrarlo disponible).
	Enabled(ctx context.Context, service services.ServiceID) bool
}

// ErrServiceOff: el servicio no tiene una tienda conectada (o soporte la apagó).
var ErrServiceOff = errors.New("servicio sin tienda conectada")

// Delivery: la tarifa y el tiempo estimado del delivery.
type Delivery interface {
	// Quote: pickup es la tienda (nil si no se conoce su ubicación) y address trae el punto de entrega.
	Quote(ctx context.Context, pickup *services.GeoPoint, address services.Address) (rapidito.Quote, error)
}

// Payments: lo que necesita de la billetera.
type Payments interface {
	CreateCharge(ctx context.Context, req payments.ChargeRequest) (payments.Charge, error)
	// Cancel anula un cobro sin pagar (payments.ErrAlreadyPaid si ya se pagó).
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
	// Stores: las tiendas de los otros servicios (p. ej. Tecnología); nil = solo el Mercado.
	Stores   Stores
	Delivery Delivery
	Payments Payments
	Core     Core
	// Payouts y Wallet: retiros de las ganancias de los repartidores a su billetera.
	Payouts PayoutCore
	Wallet  Wallet
	// Claims y Refunds: devoluciones parciales por reclamos que aprueba soporte.
	Claims  ClaimsCore
	Refunds PartialRefunds
	// PublicURL es la dirección pública del gateway, para los avisos de los proveedores.
	PublicURL string
	Now       func() time.Time
	NewID     func() string
}

// Catalog: los servicios que ofrece Parla.
func Catalog() []services.ServiceInfo {
	return []services.ServiceInfo{
		{ID: services.Mercado, Name: "Mercado", Description: "Abarrotes, frutas y productos del día. Pagas con QR y te lo lleva un repartidor de Rapidito.", Provider: "MercaYa · delivery Rapidito · pago PagaYa", Available: true},
		{ID: services.Tecnologia, Name: "Tecnología", Description: "Celulares, laptops y accesorios con garantía y entrega en el día.", Provider: "Próximamente", Available: false},
		{ID: services.Ferreteria, Name: "Ferretería", Description: "Herramientas, pinturas, gasfitería y electricidad para la casa y la obra.", Provider: "Próximamente", Available: false},
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

// store: la tienda de una clave de tienda (el id de la tienda en Parla). Cada tienda se atiende con su
// API: la de Parla (catálogo propio, servido por el core) o la que su dueño conectó. Commerce, si está,
// es una tienda fija para el servicio «mercado» (o para cualquiera si no hay Stores): solo pruebas.
func (o *Orchestrator) store(ctx context.Context, service services.ServiceID) (Commerce, error) {
	if o.Commerce != nil && (service == "" || service == services.Mercado || o.Stores == nil) {
		return o.Commerce, nil
	}
	if o.Stores == nil {
		return nil, notAvailable()
	}
	c, err := o.Stores.For(ctx, service)
	if errors.Is(err, ErrServiceOff) {
		return nil, notAvailable()
	}
	if err != nil {
		slog.Warn("no se pudo cargar la integración del servicio", "servicio", service, "error", err)
		return nil, unavailable("Parla")
	}
	return c, nil
}

func notAvailable() error {
	return &Error{Status: http.StatusNotFound, Code: "not_found", Message: "Este servicio todavía no está disponible"}
}

// CatalogFor: los servicios, con Tecnología (y los demás) disponibles solo si soporte los conectó.
func (o *Orchestrator) CatalogFor(ctx context.Context) []services.ServiceInfo {
	list := Catalog()
	for i := range list {
		if list[i].ID != services.Mercado && o.Stores != nil && o.Stores.Enabled(ctx, list[i].ID) {
			list[i].Available = true
			list[i].Provider = "Tienda conectada"
		}
	}
	return list
}

// ProductsByID trae de la tienda los productos pedidos (para «Volver a pedir»), con su precio y stock
// de ahora. Los que ya no existen no vienen.
func (o *Orchestrator) ProductsByID(ctx context.Context, service services.ServiceID, ids []string) ([]services.Product, error) {
	if len(ids) > maxItems {
		return nil, invalid(fmt.Sprintf("Se pueden pedir hasta %d productos", maxItems))
	}
	for _, id := range ids {
		if !services.ValidID.MatchString(id) {
			return nil, invalid("Hay un producto no válido")
		}
	}
	shop, err := o.store(ctx, service)
	if err != nil {
		return nil, err
	}
	products := make([]services.Product, len(ids))
	errs := make([]error, len(ids))
	var wg sync.WaitGroup
	for i, id := range ids {
		wg.Add(1)
		go func() {
			defer wg.Done()
			products[i], errs[i] = shop.Product(ctx, id)
		}()
	}
	wg.Wait()
	found := make([]services.Product, 0, len(ids))
	for i, err := range errs {
		if errors.Is(err, mercaya.ErrNotFound) {
			continue
		}
		if err != nil {
			slog.Warn("producto de la tienda falló", "producto", ids[i], "error", err)
			return nil, unavailable("La tienda")
		}
		found = append(found, products[i])
	}
	return found, nil
}

// Products busca en la tienda.
func (o *Orchestrator) Products(ctx context.Context, service services.ServiceID, query string) ([]services.Product, error) {
	query = strings.TrimSpace(query)
	if utf8.RuneCountInString(query) > 80 {
		return nil, invalid("La búsqueda es demasiado larga")
	}
	shop, err := o.store(ctx, service)
	if err != nil {
		return nil, err
	}
	products, err := shop.Search(ctx, query)
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
func (o *Orchestrator) quote(ctx context.Context, userID string, req services.QuoteRequest) (services.OrderQuote, services.QuoteRequest, rapidito.Quote, error) {
	// Una sola consulta al core: si la tienda atiende y desde dónde sale el repartidor.
	if req.Service == "" {
		req.Service = services.Mercado
	}
	shop, err := o.store(ctx, req.Service)
	if err != nil {
		return services.OrderQuote{}, req, rapidito.Quote{}, err
	}
	pickup, err := o.storeOpen(ctx, req.Service)
	if err != nil {
		return services.OrderQuote{}, req, rapidito.Quote{}, err
	}
	req, err = validateRequest(req)
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
			products[i], errs[i] = shop.Product(ctx, item.ProductID)
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

	delivery, err := o.Delivery.Quote(ctx, pickup, req.Address)
	if err != nil {
		slog.Warn("cotización del delivery falló", "error", err)
		return q, req, rapidito.Quote{}, unavailable("El delivery")
	}
	q.DeliveryFeeCents = delivery.FeeCents
	// La propina va íntegra al repartidor: se suma aparte del delivery.
	q.TipCents = req.TipCents
	q.ETAMinutes = delivery.ETAMinutes
	q.DistanceKm = delivery.DistanceKm
	// El cupón lo evalúa el core (usos, primer pedido, compra mínima); nunca descuenta la propina.
	if code := strings.TrimSpace(req.CouponCode); code != "" {
		coupon, err := o.Core.QuoteCoupon(ctx, services.CouponQuote{Code: code, UserID: userID, SubtotalCents: q.SubtotalCents, DeliveryFeeCents: q.DeliveryFeeCents})
		var conflict *ConflictError
		switch {
		case errors.Is(err, ErrNotFound):
			return q, req, rapidito.Quote{}, &Error{Status: http.StatusUnprocessableEntity, Code: "coupon", Message: "Ese cupón no existe"}
		case errors.As(err, &conflict):
			return q, req, rapidito.Quote{}, &Error{Status: http.StatusUnprocessableEntity, Code: "coupon", Message: conflict.Message}
		case err != nil:
			slog.Warn("no se pudo evaluar el cupón", "error", err)
			return q, req, rapidito.Quote{}, unavailable("Parla")
		}
		q.Coupon = &coupon
		q.DiscountCents = coupon.DiscountCents
	}
	q.TotalCents = q.SubtotalCents + q.DeliveryFeeCents + q.TipCents - q.DiscountCents
	return q, req, delivery, nil
}

// Quote: productos + delivery + propina − cupón = total, sin crear nada.
func (o *Orchestrator) Quote(ctx context.Context, userID string, req services.QuoteRequest) (services.OrderQuote, error) {
	q, _, _, err := o.quote(ctx, userID, req)
	return q, err
}

// Create recotiza, reserva en la tienda, genera el cobro con QR y guarda el pedido en el core.
func (o *Orchestrator) Create(ctx context.Context, userID string, req services.QuoteRequest) (services.Order, error) {
	q, req, delivery, err := o.quote(ctx, userID, req)
	if err != nil {
		return services.Order{}, err
	}
	id := o.newID()
	shop, err := o.store(ctx, req.Service)
	if err != nil {
		return services.Order{}, err
	}

	if err := shop.Reserve(ctx, id, req.Items); err != nil {
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
	couponCode := ""
	if q.Coupon != nil {
		concept += " − cupón " + q.Coupon.Code
		couponCode = q.Coupon.Code
	}
	charge, err := o.Payments.CreateCharge(ctx, payments.ChargeRequest{
		AmountCents: q.TotalCents,
		Concept:     concept,
		Reference:   id,
		NotifyURL:   o.PublicURL + "/hooks/pagaya",
	})
	if err != nil {
		slog.Warn("cobro en la billetera falló", "pedido", id, "error", err)
		o.release(ctx, req.Service, id)
		return services.Order{}, unavailable("El pago")
	}

	saved, err := o.Core.CreateOrder(ctx, services.InternalCreateOrder{
		ID: id, UserID: userID, Service: req.Service, Lines: q.Lines,
		SubtotalCents: q.SubtotalCents, DeliveryFeeCents: q.DeliveryFeeCents, TipCents: q.TipCents, TotalCents: q.TotalCents, Currency: services.Currency,
		DiscountCents: q.DiscountCents, CouponCode: couponCode,
		Address: req.Address,
		Payment: services.OrderPayment{
			Provider: charge.Provider, ChargeID: charge.ID, QRText: charge.QRText, PayURL: charge.PayURL,
			ExpiresAt: charge.ExpiresAt.UTC().Format(time.RFC3339),
		},
		DeliveryQuoteID: delivery.ID,
		ETAMinutes:      delivery.ETAMinutes,
	})
	if err != nil {
		// Sin pedido en el core nadie lo seguiría: se anula el cobro (para que el QR no se pueda pagar) y
		// se devuelve el stock. Si justo lo pagaron, el aviso de pago de un pedido desconocido lo devuelve.
		slog.Error("no se pudo guardar el pedido en el core; se deshace", "pedido", id, "error", err)
		if err := o.Payments.Cancel(ctx, charge.ID); err != nil && !errors.Is(err, payments.ErrAlreadyPaid) {
			slog.Error("no se pudo anular el cobro de un pedido fallido", "pedido", id, "cobro", charge.ID, "error", err)
		}
		o.release(ctx, req.Service, id)
		return services.Order{}, unavailable("Parla")
	}
	return saved.Order, nil
}

// release devuelve a la tienda el stock de un pedido que no siguió. Si la tienda no responde se
// anota en el log: la reserva queda apartada hasta que alguien la anule (es idempotente).
func (o *Orchestrator) release(ctx context.Context, service services.ServiceID, orderID string) {
	shop, err := o.store(ctx, service)
	if err == nil {
		err = shop.Release(ctx, orderID)
	}
	if err != nil {
		slog.Error("no se pudo devolver el stock a la tienda", "pedido", orderID, "error", err)
	}
}

// PaymentEvent aplica un aviso de la billetera: pagado → queda esperando al negocio; vencido → lo marca.
// Es idempotente: los avisos repetidos no cambian nada.
func (o *Orchestrator) PaymentEvent(ctx context.Context, ev payments.Event) error {
	order, err := o.Core.GetOrder(ctx, ev.Reference)
	if errors.Is(err, ErrNotFound) {
		// Un pedido que no llegó a guardarse (el core falló al crearlo): si igual lo pagaron, se devuelve.
		slog.Warn("aviso de pago de un pedido desconocido", "pedido", ev.Reference)
		if ev.Status == services.Paid && ev.ChargeID != "" {
			if _, err := o.Payments.Refund(ctx, ev.ChargeID); err != nil {
				slog.Error("no se pudo devolver el pago de un pedido desconocido", "pedido", ev.Reference, "error", err)
				return err
			}
		}
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
			if err == nil {
				o.release(ctx, order.Service, order.ID)
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
		// El id del pago que llegó en el aviso es el que se devuelve (el del pedido puede ser el del checkout).
		chargeID := ev.ChargeID
		if chargeID == "" {
			chargeID = order.Payment.ChargeID
		}
		refundedAt, err := o.Payments.Refund(ctx, chargeID)
		if err != nil {
			// Se devuelve el error para que la billetera reintente el aviso y volvamos a devolver.
			slog.Error("no se pudo devolver un pago que llegó tras cancelar", "pedido", order.ID, "error", err)
			return err
		}
		_, err = o.Core.UpdateOrder(ctx, order.ID, services.InternalUpdateOrder{
			ExpectStatus: order.Status, Status: order.Status,
			PaidAt: paidAt.UTC().Format(time.RFC3339), RefundedAt: refundedAt.UTC().Format(time.RFC3339), ChargeID: chargeID,
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
	update := services.InternalUpdateOrder{ExpectStatus: services.PendingPayment, Status: services.Paid, PaidAt: paidAt.UTC().Format(time.RFC3339)}
	if ev.ChargeID != "" && ev.ChargeID != order.Payment.ChargeID {
		update.ChargeID = ev.ChargeID
	}
	_, err = o.Core.UpdateOrder(ctx, order.ID, update)
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
	// bySupport: soporte destraba un pedido (p. ej. sin repartidor por mucho tiempo).
	bySupport
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
	supportCancel = cancellation{
		who: bySupport, target: services.Cancelled,
		from: map[services.OrderStatus]bool{
			services.PendingPayment: true, services.Paid: true, services.Preparing: true, services.SearchingDriver: true, services.DriverAssigned: true,
		},
		late: "Ya no se puede cancelar: el pedido va en camino o terminó",
		note: "Cancelado por soporte · pago devuelto",
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

// CancelBySupport: soporte cancela un pedido trabado y devuelve el pago (o anula el cobro sin pagar).
func (o *Orchestrator) CancelBySupport(ctx context.Context, userID, orderID string) (services.Order, error) {
	isAdmin, err := o.Core.IsAdmin(ctx, userID)
	if err != nil {
		slog.Error("no se pudo verificar la cuenta de soporte", "error", err)
		return services.Order{}, unavailable("Parla")
	}
	if !isAdmin {
		return services.Order{}, &Error{Status: http.StatusForbidden, Code: "forbidden", Message: "Solo soporte puede hacer esto"}
	}
	return o.close(ctx, userID, orderID, supportCancel)
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
		if c.who == bySupport {
			update.Note = "Cancelado por soporte"
		}
		err := o.Payments.Cancel(ctx, order.Payment.ChargeID)
		if errors.Is(err, payments.ErrAlreadyPaid) {
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
	o.release(ctx, order.Service, order.ID)
	return updated.Order, nil
}

func (o *Orchestrator) allowed(order services.InternalOrder, userID string, who actor) bool {
	switch who {
	case byCustomer:
		return order.UserID == userID
	case bySupport:
		return true
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
// Si ningún negocio atiende el servicio, se vende igual (la tienda externa siempre atiende). Devuelve
// la ubicación de la tienda (punto de recojo para la tarifa por distancia), o nil si no se conoce.
func (o *Orchestrator) storeOpen(ctx context.Context, service services.ServiceID) (*services.GeoPoint, error) {
	business, err := o.Core.BusinessByService(ctx, service)
	switch {
	case errors.Is(err, ErrNotFound):
		return nil, nil
	case err != nil:
		slog.Error("no se pudo consultar el horario de la tienda", "servicio", service, "error", err)
		return nil, unavailable("Parla")
	case business.Open:
		return business.Location, nil
	}
	message := "La tienda está cerrada ahora"
	if business.ClosedMessage != nil && strings.TrimSpace(*business.ClosedMessage) != "" {
		message = *business.ClosedMessage
	}
	return nil, conflict(message)
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

// ownStore comprueba que la persona es dueña de una tienda y devuelve la API de esa tienda.
func (o *Orchestrator) ownStore(ctx context.Context, userID string) (Commerce, error) {
	business, err := o.Core.BusinessByOwner(ctx, userID)
	switch {
	case errors.Is(err, ErrNotFound):
		return nil, noBusiness()
	case err != nil:
		slog.Error("no se pudo consultar el negocio", "error", err)
		return nil, unavailable("Parla")
	}
	return o.store(ctx, services.ServiceID(business.ID))
}

// StoreCatalog: todo el catálogo de la tienda, también lo agotado, por categoría y nombre.
func (o *Orchestrator) StoreCatalog(ctx context.Context, userID string) ([]services.Product, error) {
	shop, err := o.ownStore(ctx, userID)
	if err != nil {
		return nil, err
	}
	products, err := shop.Search(ctx, "")
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
	shop, err := o.ownStore(ctx, userID)
	if err != nil {
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
			current, err := shop.Product(ctx, productID)
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
	product, err := shop.Update(ctx, productID, mercaya.ProductPatch{
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
