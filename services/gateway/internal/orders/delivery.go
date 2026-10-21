package orders

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/parla/gateway/internal/services"
	"github.com/parla/gateway/internal/translators/rapidito"
)

// maxDeliveryFeeCents: más de S/ 100 por un delivery urbano es un error de configuración.
const maxDeliveryFeeCents = 10_000

// CoreDelivery cotiza el delivery con la tarifa que configura soporte en el core (base, por km y
// combustible, con la distancia por las calles). Rapidito es la flota de Parla: si el core no
// responde, se usa la cotización del proveedor (Fallback) para no frenar las compras.
type CoreDelivery struct {
	Core     HTTPCore
	Fallback Delivery
}

func (d CoreDelivery) Quote(ctx context.Context, pickup *services.GeoPoint, address services.Address) (rapidito.Quote, error) {
	var out struct {
		FeeCents   int     `json:"feeCents"`
		ETAMinutes int     `json:"etaMinutes"`
		DistanceKm float64 `json:"distanceKm"`
		Method     string  `json:"method"`
	}
	err := d.Core.call(ctx, http.MethodPost, "/api/internal/delivery/quote", map[string]any{"pickup": pickup, "dropoff": address.Location}, &out)
	if err == nil && (out.FeeCents <= 0 || out.FeeCents > maxDeliveryFeeCents || out.ETAMinutes <= 0 || out.ETAMinutes > 600) {
		err = fmt.Errorf("%w: cotización del core %+v", rapidito.ErrInvalid, out)
	}
	if err != nil {
		if d.Fallback == nil {
			return rapidito.Quote{}, err
		}
		slog.Warn("tarifa del core no disponible; se cotiza con el proveedor", "error", err)
		return d.Fallback.Quote(ctx, pickup, address)
	}
	q := rapidito.Quote{ID: quoteID(out.Method), FeeCents: out.FeeCents, ETAMinutes: out.ETAMinutes}
	if out.Method != "flat" {
		km := out.DistanceKm
		q.DistanceKm = &km
	}
	return q, nil
}

// quoteID: identificador de la cotización («parla_streets_…»), para la constancia del pedido.
func quoteID(method string) string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	if !services.ValidID.MatchString(method) || len(method) > 20 {
		method = "km"
	}
	return "parla_" + method + "_" + hex.EncodeToString(b)
}
