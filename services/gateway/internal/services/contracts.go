// Package services define los contratos limpios de Parla para los servicios de terceros (tienda,
// delivery, pagos). Son el espejo de packages/types/src/contracts/services.types.ts: los
// traductores convierten cada API externa a estas estructuras. Montos siempre en céntimos.
package services

import "regexp"

type ServiceID string

const (
	Mercado    ServiceID = "mercado"
	Salud      ServiceID = "salud"
	Tecnologia ServiceID = "tecnologia"
	Ferreteria ServiceID = "ferreteria"
)

// KnownService: los servicios que existen en Parla.
func KnownService(id ServiceID) bool {
	return id == Mercado || id == Salud || id == Tecnologia || id == Ferreteria
}

// Integration: la API de tienda que soporte conectó a un servicio (en Integraciones del panel).
type Integration struct {
	Service ServiceID `json:"service"`
	Name    string    `json:"name"`
	// Format: el idioma de la API («parla», el de MercaYa; «redwiiil», la API v1 de RED WIIIL).
	Format   string `json:"format"`
	Enabled  bool   `json:"enabled"`
	BaseURL  string `json:"baseUrl"`
	Prefix   string `json:"prefix"`
	APIKey   string `json:"apiKey"`
	AdminKey string `json:"adminKey"`
}

const Currency = "PEN"

// ValidID: formato de identificadores que aceptamos de navegadores y proveedores.
var ValidID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

type ServiceInfo struct {
	ID          ServiceID `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Provider    string    `json:"provider"`
	Available   bool      `json:"available"`
}

type Product struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Unit       string  `json:"unit"`
	PriceCents int     `json:"priceCents"`
	Currency   string  `json:"currency"`
	Stock      int     `json:"stock"`
	Category   string  `json:"category"`
	ImageURL   *string `json:"imageUrl"`
	// ListPriceCents: precio normal cuando el producto está en oferta.
	ListPriceCents *int `json:"listPriceCents,omitempty"`
}

type CartItem struct {
	ProductID string `json:"productId"`
	Quantity  int    `json:"quantity"`
}

// GeoPoint: un punto en el mapa (grados decimales).
type GeoPoint struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

type Address struct {
	Line      string `json:"line"`
	Reference string `json:"reference"`
	// Location: dónde lo marcó el cliente en el mapa (opcional).
	Location *GeoPoint `json:"location,omitempty"`
}

type QuoteRequest struct {
	// Service: lo pone el gateway según la ruta (/api/services/{service}/…), nunca el navegador.
	Service ServiceID  `json:"-"`
	Items   []CartItem `json:"items"`
	Address Address    `json:"address"`
	// TipCents: propina para el repartidor (opcional, la elige el cliente).
	TipCents int `json:"tipCents"`
	// CouponCode: cupón de descuento o envío gratis (opcional).
	CouponCode string `json:"couponCode,omitempty"`
}

// AppliedCoupon: el cupón que vale para este carrito y cuánto descuenta (lo decide el core).
type AppliedCoupon struct {
	Code          string `json:"code"`
	Description   string `json:"description"`
	Kind          string `json:"kind"`
	DiscountCents int    `json:"discountCents"`
}

// CouponQuote: lo que el core necesita para evaluar un cupón.
type CouponQuote struct {
	Code             string `json:"code"`
	UserID           string `json:"userId"`
	SubtotalCents    int    `json:"subtotalCents"`
	DeliveryFeeCents int    `json:"deliveryFeeCents"`
}

type OrderLine struct {
	ProductID      string `json:"productId"`
	Name           string `json:"name"`
	Unit           string `json:"unit"`
	Quantity       int    `json:"quantity"`
	UnitPriceCents int    `json:"unitPriceCents"`
	TotalCents     int    `json:"totalCents"`
}

type OrderQuote struct {
	Lines            []OrderLine `json:"lines"`
	SubtotalCents    int         `json:"subtotalCents"`
	DeliveryFeeCents int         `json:"deliveryFeeCents"`
	TipCents         int         `json:"tipCents"`
	// DiscountCents: lo que descuenta el cupón (ya restado del total).
	DiscountCents int            `json:"discountCents"`
	Coupon        *AppliedCoupon `json:"coupon"`
	TotalCents    int            `json:"totalCents"`
	Currency      string         `json:"currency"`
	ETAMinutes    int            `json:"etaMinutes"`
	// DistanceKm: distancia de la tienda al punto de entrega (si ambos se conocen), para mostrar «a 2.3 km».
	DistanceKm *float64 `json:"distanceKm,omitempty"`
}

type OrderStatus string

const (
	PendingPayment  OrderStatus = "pending_payment"
	Paid            OrderStatus = "paid"
	Preparing       OrderStatus = "preparing"
	Rejected        OrderStatus = "rejected"
	SearchingDriver OrderStatus = "searching_driver"
	DriverAssigned  OrderStatus = "driver_assigned"
	OnTheWay        OrderStatus = "on_the_way"
	Delivered       OrderStatus = "delivered"
	PaymentExpired  OrderStatus = "payment_expired"
	Cancelled       OrderStatus = "cancelled"
)

type OrderPayment struct {
	Provider  string  `json:"provider"`
	ChargeID  string  `json:"chargeId,omitempty"`
	QRText    string  `json:"qrText"`
	PayURL    string  `json:"payUrl"`
	ExpiresAt string  `json:"expiresAt"`
	PaidAt    *string `json:"paidAt"`
	// RefundedAt: cuándo se devolvió el pago (cancelado o rechazado); null si no se devolvió.
	RefundedAt *string `json:"refundedAt"`
}

type OrderDelivery struct {
	Provider   string  `json:"provider"`
	DriverName *string `json:"driverName"`
	Vehicle    *string `json:"vehicle"`
	ETAMinutes *int    `json:"etaMinutes"`
	UpdatedAt  string  `json:"updatedAt"`
}

// OrderBusiness: negocio que prepara el pedido (lo asigna el core).
type OrderBusiness struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	OwnerID string `json:"ownerId"`
	Address string `json:"address"`
}

// OrderTimelineEntry: un paso del pedido con su hora (lo lleva el core).
type OrderTimelineEntry struct {
	Status OrderStatus `json:"status"`
	At     string      `json:"at"`
	Note   string      `json:"note,omitempty"`
}

type Order struct {
	ID               string               `json:"id"`
	Service          ServiceID            `json:"service"`
	Business         *OrderBusiness       `json:"business"`
	Status           OrderStatus          `json:"status"`
	Lines            []OrderLine          `json:"lines"`
	SubtotalCents    int                  `json:"subtotalCents"`
	DeliveryFeeCents int                  `json:"deliveryFeeCents"`
	TipCents         int                  `json:"tipCents"`
	DiscountCents    int                  `json:"discountCents"`
	CouponCode       *string              `json:"couponCode"`
	TotalCents       int                  `json:"totalCents"`
	Currency         string               `json:"currency"`
	Address          Address              `json:"address"`
	Payment          OrderPayment         `json:"payment"`
	Delivery         *OrderDelivery       `json:"delivery"`
	Timeline         []OrderTimelineEntry `json:"timeline"`
	CreatedAt        string               `json:"createdAt"`
	UpdatedAt        string               `json:"updatedAt"`
}

// ── Contratos internos gateway ↔ core ─────────────────────────────────────────

type InternalCreateOrder struct {
	ID               string       `json:"id"`
	UserID           string       `json:"userId"`
	Service          ServiceID    `json:"service"`
	Lines            []OrderLine  `json:"lines"`
	SubtotalCents    int          `json:"subtotalCents"`
	DeliveryFeeCents int          `json:"deliveryFeeCents"`
	TipCents         int          `json:"tipCents"`
	DiscountCents    int          `json:"discountCents"`
	CouponCode       string       `json:"couponCode,omitempty"`
	TotalCents       int          `json:"totalCents"`
	Currency         string       `json:"currency"`
	Address          Address      `json:"address"`
	Payment          OrderPayment `json:"payment"`
	DeliveryQuoteID  string       `json:"deliveryQuoteId"`
	// ETAMinutes: lo que Rapidito estimó para el envío.
	ETAMinutes int `json:"etaMinutes"`
}

type InternalUpdateOrder struct {
	ExpectStatus OrderStatus `json:"expectStatus,omitempty"`
	Status       OrderStatus `json:"status"`
	PaidAt       string      `json:"paidAt,omitempty"`
	RefundedAt   string      `json:"refundedAt,omitempty"`
	// ChargeID: el id del pago en la pasarela al confirmarse (en Mercado Pago no es el del checkout).
	ChargeID string         `json:"chargeId,omitempty"`
	Delivery *OrderDelivery `json:"delivery,omitempty"`
	// Note: detalle para la línea de tiempo del pedido (p. ej. «Cancelado por el cliente · pago devuelto»).
	Note string `json:"note,omitempty"`
}

type InternalOrder struct {
	Order
	UserID          string `json:"userId"`
	DeliveryQuoteID string `json:"deliveryQuoteId"`
	// BusinessOwnerID: dueño del negocio que atiende el pedido (null en pedidos sin negocio).
	BusinessOwnerID *string `json:"businessOwnerId"`
}

// Business: negocio que atiende un servicio, con su dueño y si está abierto ahora (lo calcula el core
// con el horario y el interruptor de la tienda).
type Business struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	Service       ServiceID `json:"service"`
	OwnerID       string    `json:"ownerId"`
	Open          bool      `json:"open"`
	ClosedMessage *string   `json:"closedMessage"`
	// Location: dónde recoge el repartidor (para la tarifa por distancia); null si no se conoce.
	Location *GeoPoint `json:"location"`
}

// ── Retiros de los repartidores (gateway ↔ core) ──────────────────────────────

// PayoutReservation: el saldo apartado para transferir a la billetera del repartidor.
type PayoutReservation struct {
	PayoutID    string `json:"payoutId"`
	AmountCents int    `json:"amountCents"`
	// Destination: número de la billetera PagaYa del repartidor (9 dígitos).
	Destination string `json:"destination"`
}

// PayoutSettle: cómo terminó la transferencia.
type PayoutSettle struct {
	Status        string `json:"status"` // paid | failed
	TransferID    string `json:"transferId,omitempty"`
	FailureReason string `json:"failureReason,omitempty"`
}

// Payout: el retiro tal como lo ve el repartidor.
type Payout struct {
	PayoutID    string `json:"payoutId"`
	AmountCents int    `json:"amountCents"`
	Status      string `json:"status"`
	TransferID  string `json:"transferId"`
}

// ── Reclamos (gateway ↔ core) ─────────────────────────────────────────────────

// ClaimRefundReservation: la devolución apartada de un reclamo (refundRef es la referencia en PagaYa).
type ClaimRefundReservation struct {
	RefundRef   string `json:"refundRef"`
	ChargeID    string `json:"chargeId"`
	AmountCents int    `json:"amountCents"`
}

// ClaimRefundSettle: cómo terminó la devolución en la billetera.
type ClaimRefundSettle struct {
	Status           string `json:"status"` // refunded | failed
	ProviderRefundID string `json:"providerRefundId,omitempty"`
	FailureReason    string `json:"failureReason,omitempty"`
}

// DuePayout: repartidor con saldo para el retiro automático.
type DuePayout struct {
	UserID string `json:"userId"`
}
