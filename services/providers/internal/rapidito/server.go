// Package rapidito simula la cotización de «Rapidito», el delivery en moto, con su propia API en
// inglés y montos como texto decimal. Da la tarifa y el tiempo estimado; el reparto lo hacen los
// repartidores de Parla desde el core.
//
//	POST /rapidito/api/quotes  {"dropoff":{"address","notes"}} → {"quote_id","fee":{"amount","currency"},"eta_minutes","expires_at"}
package rapidito

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
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

type quoteRequest struct {
	Dropoff struct {
		Address string `json:"address"`
		Notes   string `json:"notes"`
	} `json:"dropoff"`
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
	// Tarifa determinista: base S/ 5.00 más un recargo según la «distancia» (largo de la dirección).
	fee := 500 + (length%9)*50
	if fee > 900 {
		fee = 900
	}
	eta := 25 + length%16
	notify.WriteJSON(w, http.StatusOK, map[string]any{
		"quote_id":    "q_" + randomHex(6),
		"fee":         map[string]string{"amount": fmt.Sprintf("%d.%02d", fee/100, fee%100), "currency": "PEN"},
		"eta_minutes": eta,
		"expires_at":  s.Now().Add(quoteTTL).UTC().Format(time.RFC3339),
	})
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
