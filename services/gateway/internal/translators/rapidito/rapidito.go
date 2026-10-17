// Package rapidito traduce la cotización del delivery «Rapidito» (inglés, montos como texto decimal)
// a los contratos de Parla. La tarifa y el tiempo estimado salen de aquí; el reparto en sí lo hacen
// los repartidores de Parla, desde el core.
package rapidito

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/parla/gateway/internal/services"
	"github.com/parla/gateway/internal/translators/providerapi"
)

const Provider = "Rapidito"

var ErrInvalid = errors.New("datos inválidos del delivery")

const maxFeeCents = 10_000 // más de S/ 100 por un delivery urbano es un error del proveedor.

type Client struct {
	BaseURL string
	HTTP    *http.Client
}

// Quote: cotización de delivery traducida.
type Quote struct {
	ID         string
	FeeCents   int
	ETAMinutes int
	// DistanceKm: la distancia que cobró Rapidito (con el factor de calles); nil si cotizó sin coordenadas.
	DistanceKm *float64
}

var amountPattern = regexp.MustCompile(`^\d{1,6}(\.\d{1,2})?$`)

// parseAmount convierte "6.50" en 650 céntimos sin pasar por float.
func parseAmount(s string) (int, error) {
	if !amountPattern.MatchString(s) {
		return 0, ErrInvalid
	}
	whole, frac, _ := strings.Cut(s, ".")
	soles, _ := strconv.Atoi(whole)
	cents := 0
	if frac != "" {
		if len(frac) == 1 {
			frac += "0"
		}
		cents, _ = strconv.Atoi(frac)
	}
	return soles*100 + cents, nil
}

// Quote cotiza el delivery. Con el punto de recojo (la tienda) y el de entrega, Rapidito cobra por
// distancia; sin alguno de los dos, por su tarifa de referencia.
func (c Client) Quote(ctx context.Context, pickup *services.GeoPoint, address services.Address) (Quote, error) {
	dropoff := map[string]any{"address": address.Line, "notes": address.Reference}
	if address.Location != nil {
		dropoff["lat"], dropoff["lng"] = address.Location.Lat, address.Location.Lng
	}
	payload := map[string]any{"dropoff": dropoff}
	if pickup != nil {
		payload["pickup"] = map[string]float64{"lat": pickup.Lat, "lng": pickup.Lng}
	}
	status, raw, err := providerapi.Call(ctx, c.HTTP, http.MethodPost, c.BaseURL+"/rapidito/api/quotes", payload)
	if err != nil {
		return Quote{}, err
	}
	if status != http.StatusOK {
		return Quote{}, fmt.Errorf("%w: cotización respondió %d", providerapi.ErrUnavailable, status)
	}
	var body struct {
		QuoteID string `json:"quote_id"`
		Fee     struct {
			Amount   string `json:"amount"`
			Currency string `json:"currency"`
		} `json:"fee"`
		ETAMinutes *int     `json:"eta_minutes"`
		DistanceKm *float64 `json:"distancia_km"`
	}
	if err := providerapi.Decode(raw, &body); err != nil {
		return Quote{}, err
	}
	fee, err := parseAmount(body.Fee.Amount)
	if err != nil || fee <= 0 || fee > maxFeeCents || body.Fee.Currency != services.Currency ||
		!services.ValidID.MatchString(body.QuoteID) || body.ETAMinutes == nil || *body.ETAMinutes <= 0 || *body.ETAMinutes > 600 {
		return Quote{}, fmt.Errorf("%w: cotización %+v", ErrInvalid, body)
	}
	q := Quote{ID: body.QuoteID, FeeCents: fee, ETAMinutes: *body.ETAMinutes}
	if d := body.DistanceKm; d != nil && *d >= 0 && *d <= 500 {
		q.DistanceKm = d
	}
	return q, nil
}
