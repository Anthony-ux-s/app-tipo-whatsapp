// Package rapidito simula la cotización de «Rapidito», el delivery en moto, con su propia API en
// inglés y montos como texto decimal. Da la tarifa y el tiempo estimado; el reparto lo hacen los
// repartidores de Parla desde el core.
//
//	POST /rapidito/api/quotes  {"dropoff":{"address","notes","lat"?,"lng"?},"pickup"?:{"lat","lng"}}
//	                           → {"quote_id","fee":{"amount","currency"},"eta_minutes","expires_at","distancia_km"?}
//
// Con recojo y entrega en el mapa cobra por distancia (como Rappi o PedidosYa): S/ 3.50 más S/ 1.00
// por km recorrido (línea recta × 1.35 por las calles), redondeado a 10 céntimos, entre S/ 4 y S/ 25.
// Sin coordenadas, una tarifa de referencia según la dirección.
package rapidito

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/parla/providers/internal/notify"
)

// La cotización vale mientras el negocio prepara el pedido.
const quoteTTL = 6 * time.Hour

// Service cotiza el delivery.
type Service struct {
	Now func() time.Time
}

func New() *Service {
	return &Service{Now: time.Now}
}

func (s *Service) Routes(mux *http.ServeMux) {
	mux.HandleFunc("POST /rapidito/api/quotes", s.createQuote)
}

type point struct {
	Lat *float64 `json:"lat"`
	Lng *float64 `json:"lng"`
}

func (p *point) valid() bool {
	return p != nil && p.Lat != nil && p.Lng != nil && !math.IsNaN(*p.Lat) && !math.IsNaN(*p.Lng) && math.Abs(*p.Lat) <= 90 && math.Abs(*p.Lng) <= 180
}

type quoteRequest struct {
	Dropoff struct {
		Address string   `json:"address"`
		Notes   string   `json:"notes"`
		Lat     *float64 `json:"lat"`
		Lng     *float64 `json:"lng"`
	} `json:"dropoff"`
	Pickup *point `json:"pickup"`
}

const (
	streetFactor = 1.35
	baseFeeCents = 350
	perKmCents   = 100
	minFeeCents  = 400
	maxFeeCents  = 2500
)

// haversineKm: distancia en línea recta entre dos puntos.
func haversineKm(lat1, lng1, lat2, lng2 float64) float64 {
	rad := func(d float64) float64 { return d * math.Pi / 180 }
	dLat, dLng := rad(lat2-lat1), rad(lng2-lng1)
	h := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(rad(lat1))*math.Cos(rad(lat2))*math.Sin(dLng/2)*math.Sin(dLng/2)
	return 6371 * 2 * math.Asin(math.Sqrt(h))
}

// distanceQuote: tarifa y tiempo por la distancia recorrida (km con el factor de calles).
func distanceQuote(km float64) (feeCents, etaMinutes int) {
	fee := int(math.Round((baseFeeCents+perKmCents*km)/10)) * 10
	fee = max(minFeeCents, min(maxFeeCents, fee))
	return fee, int(math.Round(10 + km*3))
}

func (s *Service) createQuote(w http.ResponseWriter, r *http.Request) {
	var req quoteRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		notify.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request"})
		return
	}
	address := strings.TrimSpace(req.Dropoff.Address)
	length := utf8.RuneCountInString(address)
	if length < 3 || length > 300 {
		notify.WriteJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": "invalid_address"})
		return
	}
	// Sin coordenadas: tarifa de referencia, base S/ 5.00 más un recargo según el largo de la dirección.
	fee := 500 + (length%9)*50
	if fee > 900 {
		fee = 900
	}
	eta := 25 + length%16
	body := map[string]any{
		"quote_id":   "q_" + randomHex(6),
		"expires_at": s.Now().Add(quoteTTL).UTC().Format(time.RFC3339),
	}
	if drop := (&point{Lat: req.Dropoff.Lat, Lng: req.Dropoff.Lng}); req.Pickup.valid() && drop.valid() {
		km := haversineKm(*req.Pickup.Lat, *req.Pickup.Lng, *drop.Lat, *drop.Lng) * streetFactor
		fee, eta = distanceQuote(km)
		body["distancia_km"] = math.Round(km*10) / 10
	}
	body["fee"] = map[string]string{"amount": fmt.Sprintf("%d.%02d", fee/100, fee%100), "currency": "PEN"}
	body["eta_minutes"] = eta
	notify.WriteJSON(w, http.StatusOK, body)
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
