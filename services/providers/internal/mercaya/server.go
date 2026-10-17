// Package mercaya simula «MercaYa», una tienda en línea con su propia API en español.
//
//	GET  /mercaya/v1/catalogo?buscar=texto  → {"resultados":[Producto…]}
//	GET  /mercaya/v1/productos/{sku}         → Producto | 404 {"error":"NO_EXISTE"}
//	POST /mercaya/v1/pedidos                 → 201 {"numero_pedido","estado":"RESERVADO","total_centimos"}
//	                                           409 {"error":"SIN_STOCK","sku"} si no alcanza
package mercaya

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"sync"

	"github.com/parla/providers/internal/notify"
)

// Store guarda el catálogo y las reservas (en memoria, como un sistema de prueba).
type Store struct {
	mu       sync.Mutex
	products []Producto
	// pedidos por referencia del cliente: reservar dos veces lo mismo no descuenta dos veces.
	orders map[string]pedido
}

type pedido struct {
	Numero string
	Total  int
}

func NewStore() *Store {
	return &Store{products: catalogoInicial(), orders: map[string]pedido{}}
}

// Routes registra la API de MercaYa.
func (s *Store) Routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /mercaya/v1/catalogo", s.catalogo)
	mux.HandleFunc("GET /mercaya/v1/productos/{sku}", s.producto)
	mux.HandleFunc("POST /mercaya/v1/pedidos", s.pedido)
}

func (s *Store) catalogo(w http.ResponseWriter, r *http.Request) {
	query := normalize(r.URL.Query().Get("buscar"))
	s.mu.Lock()
	defer s.mu.Unlock()
	results := []Producto{}
	for _, p := range s.products {
		if query == "" || strings.Contains(normalize(p.Nombre+" "+p.Categoria+" "+p.Presentacion), query) {
			results = append(results, p)
		}
	}
	notify.WriteJSON(w, http.StatusOK, map[string]any{"resultados": results})
}

func (s *Store) producto(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if p, ok := s.find(r.PathValue("sku")); ok {
		notify.WriteJSON(w, http.StatusOK, *p)
		return
	}
	notify.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "NO_EXISTE"})
}

type pedidoRequest struct {
	Referencia string `json:"referencia"`
	Lineas     []struct {
		SKU      string `json:"sku"`
		Cantidad int    `json:"cantidad"`
	} `json:"lineas"`
}

func (s *Store) pedido(w http.ResponseWriter, r *http.Request) {
	var req pedidoRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&req); err != nil || req.Referencia == "" || len(req.Lineas) == 0 {
		notify.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "SOLICITUD_INVALIDA"})
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if existing, ok := s.orders[req.Referencia]; ok {
		notify.WriteJSON(w, http.StatusCreated, map[string]any{"numero_pedido": existing.Numero, "estado": "RESERVADO", "total_centimos": existing.Total})
		return
	}
	// Primero se valida todo; solo si alcanza el stock de cada línea se descuenta.
	total := 0
	for _, l := range req.Lineas {
		p, ok := s.find(l.SKU)
		if !ok {
			notify.WriteJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": "SKU_DESCONOCIDO", "sku": l.SKU})
			return
		}
		if l.Cantidad <= 0 {
			notify.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "CANTIDAD_INVALIDA", "sku": l.SKU})
			return
		}
		if p.Stock < l.Cantidad {
			notify.WriteJSON(w, http.StatusConflict, map[string]string{"error": "SIN_STOCK", "sku": l.SKU})
			return
		}
		total += p.PrecioCentimos * l.Cantidad
	}
	for _, l := range req.Lineas {
		p, _ := s.find(l.SKU)
		p.Stock -= l.Cantidad
	}
	order := pedido{Numero: "MY-" + randomHex(4), Total: total}
	s.orders[req.Referencia] = order
	notify.WriteJSON(w, http.StatusCreated, map[string]any{"numero_pedido": order.Numero, "estado": "RESERVADO", "total_centimos": total})
}

func (s *Store) find(sku string) (*Producto, bool) {
	for i := range s.products {
		if s.products[i].SKU == sku {
			return &s.products[i], true
		}
	}
	return nil, false
}

var accents = strings.NewReplacer("á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u", "ü", "u", "ñ", "n")

// normalize: minúsculas y sin tildes, para que «azucar» encuentre «Azúcar».
func normalize(s string) string {
	return accents.Replace(strings.ToLower(strings.TrimSpace(s)))
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return strings.ToUpper(hex.EncodeToString(b))
}
