package services

import "context"

// SaleInfo: lo que se sabe de un pedido al reservarlo en la tienda. Va por el contexto (y no por la interfaz de la
// tienda) para que solo lo use quien lo entiende: la API de RED WIIIL lo manda como datos opcionales de la venta
// (canal, entrega y si es un pedido grande); las demás tiendas lo ignoran.
type SaleInfo struct {
	TotalCents       int
	Units            int
	DeliveryFeeCents int
	TipCents         int
	// Address: adónde se entrega (una sola línea).
	Address string
}

type saleInfoKey struct{}

// WithSaleInfo agrega los datos del pedido al contexto de la reserva.
func WithSaleInfo(ctx context.Context, info SaleInfo) context.Context {
	return context.WithValue(ctx, saleInfoKey{}, info)
}

// SaleInfoFrom lee los datos del pedido del contexto, si los hay.
func SaleInfoFrom(ctx context.Context) (SaleInfo, bool) {
	info, ok := ctx.Value(saleInfoKey{}).(SaleInfo)
	return info, ok
}
