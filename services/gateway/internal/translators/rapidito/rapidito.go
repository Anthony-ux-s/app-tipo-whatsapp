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

func (c Client) Quote(ctx context.Context, address services.Address) (Quote, error) {
	status, raw, err := providerapi.Call(ctx, c.HTTP, http.MethodPost, c.BaseURL+"/rapidito/api/quotes", map[string]any{
		"dropoff": map[string]string{"address": address.Line, "notes": address.Reference},
	})
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
		ETAMinutes *int `json:"eta_minutes"`
	}
	if err := providerapi.Decode(raw, &body); err != nil {
		return Quote{}, err
	}
	fee, err := parseAmount(body.Fee.Amount)
	if err != nil || fee <= 0 || fee > maxFeeCents || body.Fee.Currency != services.Currency ||
		!services.ValidID.MatchString(body.QuoteID) || body.ETAMinutes == nil || *body.ETAMinutes <= 0 || *body.ETAMinutes > 600 {
		return Quote{}, fmt.Errorf("%w: cotización %+v", ErrInvalid, body)
	}
	return Quote{ID: body.QuoteID, FeeCents: fee, ETAMinutes: *body.ETAMinutes}, nil
}
