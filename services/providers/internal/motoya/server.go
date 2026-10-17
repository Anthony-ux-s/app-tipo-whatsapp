// Package motoya simula «MotoYa», un servicio de delivery en moto con su propia API en inglés y
// montos como texto decimal.
//
//	POST /motoya/api/quotes      {"dropoff":{"address","notes"}} → {"quote_id","fee":{"amount","currency"},"eta_minutes","expires_at"}
//	POST /motoya/api/deliveries  {"quote_id","reference","callback_url"} → 201 {"delivery_id","status":"SEARCHING_DRIVER"}
//	GET  /motoya/api/deliveries/{id}
//
// Tras crear un delivery avisa a callback_url: DRIVER_ASSIGNED y luego DELIVERED, firmado con
// x-motoya-signature = hex(HMAC-SHA256(secreto, cuerpo)).
package motoya

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/parla/providers/internal/notify"
)

const quoteTTL = 30 * time.Minute

var drivers = []struct{ Name, Plate string }{
	{"Carlos Huamán", "B7K-482"},
	{"Rosa Quispe", "C3M-915"},
	{"Jorge Mendoza", "A9P-207"},
	{"Lucía Ramos", "D5T-663"},
	{"Miguel Torres", "F2H-138"},
}

type quote struct {
	ID        string
	FeeCents  int
	ETA       int
	ExpiresAt time.Time
}

type delivery struct {
	ID        string
	Reference string
	Status    string
	Driver    int
	ETA       int
}

// Service guarda cotizaciones y deliveries en memoria y simula el avance del motorizado.
type Service struct {
	// Step es el tiempo entre cada cambio de estado del delivery.
	Step     time.Duration
	Notifier notify.Notifier
	Now      func() time.Time

	mu         sync.Mutex
	quotes     map[string]quote
	deliveries map[string]*delivery
	byRef      map[string]*delivery
	next       int
}

func New(step time.Duration, notifier notify.Notifier) *Service {
	return &Service{Step: step, Notifier: notifier, Now: time.Now, quotes: map[string]quote{}, deliveries: map[string]*delivery{}, byRef: map[string]*delivery{}}
}

func (s *Service) Routes(mux *http.ServeMux) {
	mux.HandleFunc("POST /motoya/api/quotes", s.createQuote)
	mux.HandleFunc("POST /motoya/api/deliveries", s.createDelivery)
	mux.HandleFunc("GET /motoya/api/deliveries/{id}", s.getDelivery)
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
	q := quote{ID: "q_" + randomHex(6), FeeCents: fee, ETA: 25 + length%16, ExpiresAt: s.Now().Add(quoteTTL)}
	s.mu.Lock()
	s.quotes[q.ID] = q
	s.mu.Unlock()
	notify.WriteJSON(w, http.StatusOK, map[string]any{
		"quote_id":    q.ID,
		"fee":         map[string]string{"amount": fmt.Sprintf("%d.%02d", fee/100, fee%100), "currency": "PEN"},
		"eta_minutes": q.ETA,
		"expires_at":  q.ExpiresAt.UTC().Format(time.RFC3339),
	})
}

type deliveryRequest struct {
	QuoteID     string `json:"quote_id"`
	Reference   string `json:"reference"`
	CallbackURL string `json:"callback_url"`
}

func (s *Service) createDelivery(w http.ResponseWriter, r *http.Request) {
	var req deliveryRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil || req.Reference == "" || !notify.ValidCallback(req.CallbackURL) {
		notify.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request"})
		return
	}
	s.mu.Lock()
	// El mismo reference devuelve el delivery ya creado (reintentos seguros).
	if d, ok := s.byRef[req.Reference]; ok {
		s.mu.Unlock()
		notify.WriteJSON(w, http.StatusCreated, map[string]string{"delivery_id": d.ID, "status": d.Status})
		return
	}
	q, ok := s.quotes[req.QuoteID]
	if !ok {
		s.mu.Unlock()
		notify.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "quote_not_found"})
		return
	}
	if s.Now().After(q.ExpiresAt) {
		s.mu.Unlock()
		notify.WriteJSON(w, http.StatusGone, map[string]string{"error": "quote_expired"})
		return
	}
	delete(s.quotes, q.ID)
	d := &delivery{ID: "dlv_" + randomHex(6), Reference: req.Reference, Status: "SEARCHING_DRIVER", Driver: s.next % len(drivers), ETA: q.ETA}
	s.next++
	s.deliveries[d.ID] = d
	s.byRef[d.Reference] = d
	s.mu.Unlock()

	go s.simulate(d, req.CallbackURL)
	notify.WriteJSON(w, http.StatusCreated, map[string]string{"delivery_id": d.ID, "status": d.Status})
}

func (s *Service) getDelivery(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	d, ok := s.deliveries[r.PathValue("id")]
	var snapshot map[string]any
	if ok {
		snapshot = s.event(d)
	}
	s.mu.Unlock()
	if !ok {
		notify.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "delivery_not_found"})
		return
	}
	notify.WriteJSON(w, http.StatusOK, snapshot)
}

// simulate: el motorizado acepta el pedido y luego lo entrega.
func (s *Service) simulate(d *delivery, callback string) {
	for _, status := range []string{"DRIVER_ASSIGNED", "DELIVERED"} {
		time.Sleep(s.Step)
		s.mu.Lock()
		d.Status = status
		if status == "DELIVERED" {
			d.ETA = 0
		}
		payload := s.event(d)
		s.mu.Unlock()
		ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
		_ = s.Notifier.Send(ctx, callback, payload)
		cancel()
	}
}

func (s *Service) event(d *delivery) map[string]any {
	payload := map[string]any{"delivery_id": d.ID, "reference": d.Reference, "status": d.Status, "eta_minutes": d.ETA}
	if d.Status != "SEARCHING_DRIVER" {
		driver := drivers[d.Driver]
		payload["driver"] = map[string]string{"name": driver.Name, "vehicle": "Moto · " + driver.Plate}
	}
	return payload
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
