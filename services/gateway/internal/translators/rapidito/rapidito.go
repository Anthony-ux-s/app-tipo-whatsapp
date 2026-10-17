// Package rapidito traduce la API del delivery «Rapidito» (inglés, montos como texto decimal) a los
// contratos de Parla, incluidos sus avisos firmados.
package rapidito

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/parla/gateway/internal/services"
	"github.com/parla/gateway/internal/translators/providerapi"
	"github.com/parla/gateway/internal/webhook"
)

const Provider = "Rapidito"

var (
	ErrInvalid       = errors.New("datos inválidos del delivery")
	ErrQuoteExpired  = errors.New("la cotización del delivery venció")
	ErrUnknownStatus = errors.New("estado de delivery desconocido")
)

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

// Dispatch pide el motorizado. La referencia (id del pedido) hace el pedido idempotente.
func (c Client) Dispatch(ctx context.Context, quoteID, reference, callbackURL string) (string, error) {
	status, raw, err := providerapi.Call(ctx, c.HTTP, http.MethodPost, c.BaseURL+"/rapidito/api/deliveries", map[string]string{
		"quote_id": quoteID, "reference": reference, "callback_url": callbackURL,
	})
	if err != nil {
		return "", err
	}
	if status == http.StatusGone {
		return "", ErrQuoteExpired
	}
	if status != http.StatusCreated {
		return "", fmt.Errorf("%w: despacho respondió %d", providerapi.ErrUnavailable, status)
	}
	var body struct {
		DeliveryID string `json:"delivery_id"`
	}
	if err := providerapi.Decode(raw, &body); err != nil {
		return "", err
	}
	if !services.ValidID.MatchString(body.DeliveryID) {
		return "", ErrInvalid
	}
	return body.DeliveryID, nil
}

// Event es un aviso de Rapidito ya traducido.
type Event struct {
	DeliveryID string
	Reference  string
	Status     services.OrderStatus
	DriverName string
	Vehicle    string
	ETAMinutes *int
}

// ParseWebhook verifica la firma y traduce el aviso. Solo cambios conocidos llegan al pedido.
func ParseWebhook(body []byte, signature, secret string) (Event, error) {
	if err := webhook.Verify(secret, body, signature); err != nil {
		return Event{}, err
	}
	var raw struct {
		DeliveryID string `json:"delivery_id"`
		Reference  string `json:"reference"`
		Status     string `json:"status"`
		Driver     *struct {
			Name    string `json:"name"`
			Vehicle string `json:"vehicle"`
		} `json:"driver"`
		ETAMinutes *int `json:"eta_minutes"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return Event{}, ErrInvalid
	}
	if !services.ValidID.MatchString(raw.Reference) || !services.ValidID.MatchString(raw.DeliveryID) {
		return Event{}, ErrInvalid
	}
	ev := Event{DeliveryID: raw.DeliveryID, Reference: raw.Reference}
	switch raw.Status {
	case "DRIVER_ASSIGNED":
		ev.Status = services.OnTheWay
	case "DELIVERED":
		ev.Status = services.Delivered
	default:
		return Event{}, fmt.Errorf("%w: %q", ErrUnknownStatus, raw.Status)
	}
	if raw.Driver != nil {
		ev.DriverName = clip(raw.Driver.Name, 80)
		ev.Vehicle = clip(raw.Driver.Vehicle, 40)
	}
	if raw.ETAMinutes != nil && *raw.ETAMinutes >= 0 && *raw.ETAMinutes <= 600 {
		ev.ETAMinutes = raw.ETAMinutes
	}
	return ev, nil
}

func clip(s string, max int) string {
	s = strings.TrimSpace(s)
	if utf8.RuneCountInString(s) > max {
		return string([]rune(s)[:max])
	}
	return s
}
