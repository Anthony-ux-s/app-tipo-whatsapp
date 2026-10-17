// Package pagaya simula «PagaYa», una billetera con cobros por QR al estilo Yape. Montos en soles
// con decimales.
//
//	POST /pagaya/cobros       {"monto","moneda","concepto","referencia","notificar_a"} → 201 {"id_cobro","qr_texto","url_pago","expira_en"}
//	GET  /pagaya/cobros/{id}  → {"id_cobro","estado","monto","pagado_en"}
//	GET  /pagaya/pagar/{id}   → página para pagar (simula la app del banco)
//	POST /pagaya/pagar/{id}   → confirma el pago (idempotente) y avisa a notificar_a
//	POST /pagaya/cobros/{id}/anular     → PENDIENTE → ANULADO (idempotente); 409 {"error":"YA_PAGADO"} si ya se pagó
//	POST /pagaya/cobros/{id}/devolucion → PAGADO → DEVUELTO (idempotente) {"id_cobro","estado","devuelto_en"}; 409 {"error":"NO_PAGADO"}
//
// Avisos: {"id_cobro","referencia","estado":"PAGADO"|"EXPIRADO","pagado_en"} con la firma en
// x-pagaya-firma = hex(HMAC-SHA256(secreto, cuerpo)).
package pagaya

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"math"
	"net/http"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/parla/providers/internal/notify"
)

const (
	pendiente = "PENDIENTE"
	pagado    = "PAGADO"
	expirado  = "EXPIRADO"
	anulado   = "ANULADO"
	devuelto  = "DEVUELTO"
)

type cobro struct {
	ID         string
	Cents      int
	Concepto   string
	Referencia string
	NotificarA string
	Estado     string
	ExpiraEn   time.Time
	PagadoEn   *time.Time
	DevueltoEn *time.Time
}

// Service guarda los cobros en memoria.
type Service struct {
	PublicURL string
	Expiry    time.Duration
	Notifier  notify.Notifier
	Now       func() time.Time

	mu     sync.Mutex
	cobros map[string]*cobro
}

func New(publicURL string, expiry time.Duration, notifier notify.Notifier) *Service {
	return &Service{PublicURL: strings.TrimRight(publicURL, "/"), Expiry: expiry, Notifier: notifier, Now: time.Now, cobros: map[string]*cobro{}}
}

func (s *Service) Routes(mux *http.ServeMux) {
	mux.HandleFunc("POST /pagaya/cobros", s.crear)
	mux.HandleFunc("GET /pagaya/cobros/{id}", s.consultar)
	mux.HandleFunc("GET /pagaya/pagar/{id}", s.pagina)
	mux.HandleFunc("POST /pagaya/pagar/{id}", s.pagar)
	mux.HandleFunc("POST /pagaya/cobros/{id}/anular", s.anular)
	mux.HandleFunc("POST /pagaya/cobros/{id}/devolucion", s.devolver)
}

type crearRequest struct {
	Monto      float64 `json:"monto"`
	Moneda     string  `json:"moneda"`
	Concepto   string  `json:"concepto"`
	Referencia string  `json:"referencia"`
	NotificarA string  `json:"notificar_a"`
}

func (s *Service) crear(w http.ResponseWriter, r *http.Request) {
	var req crearRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		notify.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "SOLICITUD_INVALIDA"})
		return
	}
	cents := int(math.Round(req.Monto * 100))
	if req.Moneda != "PEN" || cents <= 0 || cents > 1_000_000 || req.Referencia == "" || !notify.ValidCallback(req.NotificarA) || utf8.RuneCountInString(req.Concepto) > 140 {
		notify.WriteJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": "DATOS_INVALIDOS"})
		return
	}
	c := &cobro{ID: "cob_" + randomHex(8), Cents: cents, Concepto: req.Concepto, Referencia: req.Referencia, NotificarA: req.NotificarA, Estado: pendiente, ExpiraEn: s.Now().Add(s.Expiry)}
	s.mu.Lock()
	s.cobros[c.ID] = c
	s.mu.Unlock()
	time.AfterFunc(s.Expiry, func() { s.expirar(c.ID) })

	url := s.PublicURL + "/pagaya/pagar/" + c.ID
	notify.WriteJSON(w, http.StatusCreated, map[string]any{"id_cobro": c.ID, "qr_texto": url, "url_pago": url, "expira_en": c.ExpiraEn.UTC().Format(time.RFC3339)})
}

func (s *Service) consultar(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	c, ok := s.cobros[r.PathValue("id")]
	var body map[string]any
	if ok {
		body = map[string]any{"id_cobro": c.ID, "estado": c.Estado, "monto": float64(c.Cents) / 100, "pagado_en": formatTime(c.PagadoEn)}
	}
	s.mu.Unlock()
	if !ok {
		notify.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "NO_EXISTE"})
		return
	}
	notify.WriteJSON(w, http.StatusOK, body)
}

func (s *Service) pagina(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	c, ok := s.cobros[r.PathValue("id")]
	var view pageView
	if ok {
		view = viewOf(c)
	}
	s.mu.Unlock()
	if !ok {
		renderPage(w, http.StatusNotFound, pageView{Estado: "NO_EXISTE"})
		return
	}
	renderPage(w, http.StatusOK, view)
}

func (s *Service) pagar(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	c, ok := s.cobros[r.PathValue("id")]
	if !ok {
		s.mu.Unlock()
		renderPage(w, http.StatusNotFound, pageView{Estado: "NO_EXISTE"})
		return
	}
	if c.Estado == anulado || c.Estado == devuelto {
		// Anulado o ya devuelto: no se puede pagar (otra vez).
		view := viewOf(c)
		estado := c.Estado
		s.mu.Unlock()
		if strings.Contains(r.Header.Get("Accept"), "application/json") {
			notify.WriteJSON(w, http.StatusConflict, map[string]string{"error": estado})
			return
		}
		renderPage(w, http.StatusConflict, view)
		return
	}
	changed := false
	if c.Estado == pendiente && s.Now().Before(c.ExpiraEn) {
		now := s.Now()
		c.Estado = pagado
		c.PagadoEn = &now
		changed = true
	}
	view := viewOf(c)
	payload := s.aviso(c)
	s.mu.Unlock()

	if changed {
		go s.enviar(payload, c.NotificarA)
	}
	// Respuesta JSON para clientes de API; página para quien paga desde el navegador.
	if strings.Contains(r.Header.Get("Accept"), "application/json") {
		notify.WriteJSON(w, http.StatusOK, payload)
		return
	}
	renderPage(w, http.StatusOK, view)
}

// anular: el comercio cancela un cobro que aún no se pagó; ya no se puede pagar.
func (s *Service) anular(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	c, ok := s.cobros[r.PathValue("id")]
	switch {
	case !ok:
		notify.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "NO_EXISTE"})
	case c.Estado == pagado || c.Estado == devuelto:
		notify.WriteJSON(w, http.StatusConflict, map[string]string{"error": "YA_PAGADO"})
	default:
		// Pendiente o vencido: queda anulado (repetirlo no cambia nada).
		c.Estado = anulado
		notify.WriteJSON(w, http.StatusOK, map[string]any{"id_cobro": c.ID, "estado": c.Estado})
	}
}

// devolver: el comercio devuelve un cobro pagado (idempotente: devolver dos veces no duplica).
func (s *Service) devolver(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	c, ok := s.cobros[r.PathValue("id")]
	switch {
	case !ok:
		notify.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "NO_EXISTE"})
	case c.Estado == pagado:
		now := s.Now()
		c.Estado = devuelto
		c.DevueltoEn = &now
		fallthrough
	case c.Estado == devuelto:
		notify.WriteJSON(w, http.StatusOK, map[string]any{"id_cobro": c.ID, "estado": c.Estado, "devuelto_en": formatTime(c.DevueltoEn)})
	default:
		notify.WriteJSON(w, http.StatusConflict, map[string]string{"error": "NO_PAGADO"})
	}
}

func (s *Service) expirar(id string) {
	s.mu.Lock()
	c, ok := s.cobros[id]
	if !ok || c.Estado != pendiente {
		s.mu.Unlock()
		return
	}
	c.Estado = expirado
	payload := s.aviso(c)
	target := c.NotificarA
	s.mu.Unlock()
	s.enviar(payload, target)
}

func (s *Service) enviar(payload map[string]any, target string) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	_ = s.Notifier.Send(ctx, target, payload)
}

func (s *Service) aviso(c *cobro) map[string]any {
	return map[string]any{"id_cobro": c.ID, "referencia": c.Referencia, "estado": c.Estado, "pagado_en": formatTime(c.PagadoEn)}
}

func formatTime(t *time.Time) any {
	if t == nil {
		return nil
	}
	return t.UTC().Format(time.RFC3339)
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
