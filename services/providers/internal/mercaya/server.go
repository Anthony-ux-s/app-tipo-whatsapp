// Package mercaya simula «MercaYa», una tienda en línea con su propia API en español.
//
//	GET  /mercaya/v1/catalogo?buscar=texto  → {"resultados":[Producto…]}
//	GET  /mercaya/v1/productos/{sku}         → Producto | 404 {"error":"NO_EXISTE"}
//	POST /mercaya/v1/pedidos                 → 201 {"numero_pedido","estado":"RESERVADO","total_centimos"}
//	                                           409 {"error":"SIN_STOCK","sku"} si no alcanza
//	DELETE /mercaya/v1/pedidos/{referencia}  → 200 {"estado":"ANULADO"} y devuelve el stock (repetirlo
//	                                           no lo devuelve dos veces) | 404 {"error":"NO_EXISTE"}
//
// Administración (la usa la dueña de la tienda desde Parla, con la clave en x-mercaya-clave):
//
//	PATCH /mercaya/v1/productos/{sku}  {"precio_centimos"?,"precio_antes_centimos"?:int|null,"stock"?}
//	                                   → Producto | 400 DATOS_INVALIDOS | 401 CLAVE_INVALIDA | 404 NO_EXISTE
//	                                   (precio_antes_centimos: null quita la oferta; si no viene, no cambia)
package mercaya

import (
	"bytes"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"sync"

	"github.com/parla/providers/internal/notify"
)

// Store guarda el catálogo y las reservas (en memoria, como un sistema de prueba).
type Store struct {
	// AdminKey protege la API de administración del catálogo.
	AdminKey string

	mu       sync.Mutex
	products []Producto
	// pedidos por referencia del cliente: reservar dos veces lo mismo no descuenta dos veces.
	orders map[string]pedido
}

type pedido struct {
	Numero string
	Total  int
	// Lineas: lo apartado, para devolverlo al stock si se anula.
	Lineas  map[string]int
	Anulado bool
}

func NewStore() *Store {
	return &Store{AdminKey: DevAdminKey, products: catalogoInicial(), orders: map[string]pedido{}}
}

// Routes registra la API de MercaYa.
func (s *Store) Routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /mercaya/v1/catalogo", s.catalogo)
	mux.HandleFunc("GET /mercaya/v1/productos/{sku}", s.producto)
	mux.HandleFunc("POST /mercaya/v1/pedidos", s.pedido)
	mux.HandleFunc("DELETE /mercaya/v1/pedidos/{referencia}", s.anular)
	mux.HandleFunc("PATCH /mercaya/v1/productos/{sku}", s.actualizar)
}

// DevAdminKey: clave de administración fuera de producción.
const DevAdminKey = "mercaya-dev-clave"

const maxStock = 100_000

// cambioProducto: lo que la tienda puede cambiar. precio_antes_centimos distingue «no viene» de null.
type cambioProducto struct {
	PrecioCentimos *int            `json:"precio_centimos"`
	PrecioAntes    json.RawMessage `json:"precio_antes_centimos"`
	Stock          *int            `json:"stock"`
}

func (s *Store) actualizar(w http.ResponseWriter, r *http.Request) {
	if s.AdminKey == "" || subtle.ConstantTimeCompare([]byte(r.Header.Get("x-mercaya-clave")), []byte(s.AdminKey)) != 1 {
		notify.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "CLAVE_INVALIDA"})
		return
	}
	var req cambioProducto
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&req); err != nil {
		notify.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "DATOS_INVALIDOS"})
		return
	}
	// precio_antes: ausente → no cambia; null → quita la oferta; número → nueva oferta.
	clearOffer := bytes.Equal(bytes.TrimSpace(req.PrecioAntes), []byte("null"))
	var antes *int
	if len(req.PrecioAntes) > 0 && !clearOffer {
		var n int
		if err := json.Unmarshal(req.PrecioAntes, &n); err != nil {
			notify.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "DATOS_INVALIDOS"})
			return
		}
		antes = &n
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.find(r.PathValue("sku"))
	if !ok {
		notify.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "NO_EXISTE"})
		return
	}
	// Se valida sobre el resultado: el precio de antes tiene que seguir siendo mayor que el vigente.
	next := *p
	if req.PrecioCentimos != nil {
		next.PrecioCentimos = *req.PrecioCentimos
	}
	if clearOffer {
		next.PrecioAntesCentimos = nil
	} else if antes != nil {
		next.PrecioAntesCentimos = antes
	}
	if req.Stock != nil {
		next.Stock = *req.Stock
	}
	if next.PrecioCentimos <= 0 || next.Stock < 0 || next.Stock > maxStock ||
		(next.PrecioAntesCentimos != nil && *next.PrecioAntesCentimos <= next.PrecioCentimos) {
		notify.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "DATOS_INVALIDOS"})
		return
	}
	*p = next
	notify.WriteJSON(w, http.StatusOK, next)
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
		if existing.Anulado {
			notify.WriteJSON(w, http.StatusConflict, map[string]string{"error": "PEDIDO_ANULADO"})
			return
		}
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
	lineas := map[string]int{}
	for _, l := range req.Lineas {
		p, _ := s.find(l.SKU)
		p.Stock -= l.Cantidad
		lineas[l.SKU] += l.Cantidad
	}
	order := pedido{Numero: "MY-" + randomHex(4), Total: total, Lineas: lineas}
	s.orders[req.Referencia] = order
	notify.WriteJSON(w, http.StatusCreated, map[string]any{"numero_pedido": order.Numero, "estado": "RESERVADO", "total_centimos": total})
}

// anular deshace una reserva (pedido cancelado, rechazado o sin pagar) y devuelve su stock una sola vez.
func (s *Store) anular(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	order, ok := s.orders[r.PathValue("referencia")]
	if !ok {
		notify.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "NO_EXISTE"})
		return
	}
	if !order.Anulado {
		for sku, cantidad := range order.Lineas {
			if p, ok := s.find(sku); ok {
				p.Stock = min(maxStock, p.Stock+cantidad)
			}
		}
		order.Anulado = true
		s.orders[r.PathValue("referencia")] = order
	}
	notify.WriteJSON(w, http.StatusOK, map[string]string{"numero_pedido": order.Numero, "estado": "ANULADO"})
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
