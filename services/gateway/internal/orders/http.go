package orders

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"github.com/parla/gateway/internal/services"
	"github.com/parla/gateway/internal/translators/pagaya"
)

const (
	maxRequestBody = 32 << 10
	maxWebhookBody = 64 << 10
)

// HTTP expone el orquestador: rutas de servicios (con sesión) y el aviso de la billetera.
type HTTP struct {
	Orch         *Orchestrator
	PagayaSecret string
}

// UserHandler recibe la persona autenticada (el id sale del JWT, nunca del cuerpo).
type UserHandler func(w http.ResponseWriter, r *http.Request, userID string)

func (h *HTTP) Catalog(w http.ResponseWriter, r *http.Request, _ string) {
	WriteJSON(w, http.StatusOK, h.Orch.CatalogFor(r.Context()))
}

// serviceOf: la clave de tienda de la ruta (/api/services/{service}/…: el id de la tienda); false si no
// tiene forma de id (ya respondió 404). Que la tienda exista y esté aprobada lo comprueba después el orquestador.
func serviceOf(w http.ResponseWriter, r *http.Request) (services.ServiceID, bool) {
	id := services.ServiceID(r.PathValue("service"))
	if id == "" {
		return services.Mercado, true
	}
	if !services.ValidID.MatchString(string(id)) {
		writeError(w, &Error{Status: http.StatusNotFound, Code: "not_found", Message: "Tienda no encontrada"})
		return "", false
	}
	return id, true
}

func (h *HTTP) Products(w http.ResponseWriter, r *http.Request, _ string) {
	var (
		products []services.Product
		err      error
	)
	service, ok := serviceOf(w, r)
	if !ok {
		return
	}
	// ?ids=A,B trae esos productos (para «Volver a pedir»); si no, busca con ?q=.
	if ids := r.URL.Query().Get("ids"); ids != "" {
		products, err = h.Orch.ProductsByID(r.Context(), service, strings.Split(ids, ","))
	} else {
		products, err = h.Orch.Products(r.Context(), service, r.URL.Query().Get("q"))
	}
	if err != nil {
		writeError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, products)
}

func (h *HTTP) Quote(w http.ResponseWriter, r *http.Request, userID string) {
	service, ok := serviceOf(w, r)
	if !ok {
		return
	}
	req, ok := decodeRequest(w, r)
	if !ok {
		return
	}
	req.Service = service
	quote, err := h.Orch.Quote(r.Context(), userID, req)
	if err != nil {
		writeError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, quote)
}

func (h *HTTP) Create(w http.ResponseWriter, r *http.Request, userID string) {
	service, ok := serviceOf(w, r)
	if !ok {
		return
	}
	req, ok := decodeRequest(w, r)
	if !ok {
		return
	}
	req.Service = service
	order, err := h.Orch.Create(r.Context(), userID, req)
	if err != nil {
		writeError(w, err)
		return
	}
	WriteJSON(w, http.StatusCreated, order)
}

// CancelOrder: el cliente cancela su pedido antes de que la tienda lo acepte (se anula o devuelve el pago).
func (h *HTTP) CancelOrder(w http.ResponseWriter, r *http.Request, userID string) {
	h.respond(w)(h.Orch.CancelByCustomer(r.Context(), userID, r.PathValue("id")))
}

// RejectOrder: la tienda no acepta un pedido pagado; se devuelve el pago.
func (h *HTTP) RejectOrder(w http.ResponseWriter, r *http.Request, userID string) {
	h.respond(w)(h.Orch.RejectByOwner(r.Context(), userID, r.PathValue("id")))
}

// CancelBusinessOrder: la tienda cancela un pedido aceptado que aún no salió; se devuelve el pago.
func (h *HTTP) CancelBusinessOrder(w http.ResponseWriter, r *http.Request, userID string) {
	h.respond(w)(h.Orch.CancelByOwner(r.Context(), userID, r.PathValue("id")))
}

// StoreCatalog: el catálogo completo de la tienda, para la dueña.
func (h *HTTP) StoreCatalog(w http.ResponseWriter, r *http.Request, userID string) {
	products, err := h.Orch.StoreCatalog(r.Context(), userID)
	if err != nil {
		writeError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, products)
}

// catalogPatchBody: listPriceCents puede no venir (no cambia), venir null (quita la oferta) o un número.
type catalogPatchBody struct {
	PriceCents     *int            `json:"priceCents"`
	ListPriceCents json.RawMessage `json:"listPriceCents"`
	Stock          *int            `json:"stock"`
}

// UpdateStoreProduct: la dueña cambia precio, oferta o stock de un producto.
func (h *HTTP) UpdateStoreProduct(w http.ResponseWriter, r *http.Request, userID string) {
	var body catalogPatchBody
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxRequestBody)).Decode(&body); err != nil {
		writeError(w, invalid("La solicitud no es válida"))
		return
	}
	patch := CatalogPatch{PriceCents: body.PriceCents, Stock: body.Stock}
	if raw := bytes.TrimSpace(body.ListPriceCents); len(raw) > 0 {
		patch.ListPriceSet = true
		if !bytes.Equal(raw, []byte("null")) {
			var n int
			if err := json.Unmarshal(raw, &n); err != nil {
				writeError(w, invalid("El precio normal no es válido"))
				return
			}
			patch.ListPriceCents = &n
		}
	}
	product, err := h.Orch.UpdateStoreProduct(r.Context(), userID, r.PathValue("sku"), patch)
	if err != nil {
		writeError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, product)
}

func (h *HTTP) respond(w http.ResponseWriter) func(services.Order, error) {
	return func(order services.Order, err error) {
		if err != nil {
			writeError(w, err)
			return
		}
		WriteJSON(w, http.StatusOK, order)
	}
}

// Payout: «Retirar ahora» — el repartidor retira su saldo a su billetera PagaYa.
func (h *HTTP) Payout(w http.ResponseWriter, r *http.Request, userID string) {
	payout, err := h.Orch.Payout(r.Context(), userID, "manual")
	if err != nil {
		writeError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, payout)
}

// StorePayout: «Retirar ahora» — la tienda retira su saldo (ventas menos comisión) a su billetera PagaYa.
func (h *HTTP) StorePayout(w http.ResponseWriter, r *http.Request, userID string) {
	payout, err := h.Orch.StorePayout(r.Context(), userID, "manual")
	if err != nil {
		writeError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, payout)
}

// RefundClaim: soporte aprueba un reclamo y devuelve parte del pedido en la billetera del cliente.
// CancelBySupport: soporte cancela un pedido trabado (con devolución del pago).
func (h *HTTP) CancelBySupport(w http.ResponseWriter, r *http.Request, userID string) {
	h.respond(w)(h.Orch.CancelBySupport(r.Context(), userID, r.PathValue("id")))
}

func (h *HTTP) RefundClaim(w http.ResponseWriter, r *http.Request, userID string) {
	var body struct {
		AmountCents *int `json:"amountCents"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxRequestBody))
	if err := decoder.Decode(&body); err != nil || body.AmountCents == nil {
		writeError(w, invalid("Indica el monto a devolver"))
		return
	}
	claim, err := h.Orch.RefundClaim(r.Context(), userID, r.PathValue("id"), *body.AmountCents)
	if err != nil {
		writeError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(claim)
}

// PagayaHook: aviso firmado de la billetera.
func (h *HTTP) PagayaHook(w http.ResponseWriter, r *http.Request) {
	body, ok := readWebhook(w, r)
	if !ok {
		return
	}
	ev, err := pagaya.ParseWebhook(body, r.Header.Get("x-pagaya-firma"), h.PagayaSecret)
	if !h.accept(w, err, "pagaya") {
		return
	}
	h.finish(w, h.Orch.PaymentEvent(r.Context(), ev), "pagaya")
}

func (h *HTTP) accept(w http.ResponseWriter, err error, provider string) bool {
	switch {
	case err == nil:
		return true
	case errors.Is(err, pagaya.ErrUnknownStatus):
		// Estados que no nos interesan: se confirman para que el proveedor no reintente.
		w.WriteHeader(http.StatusNoContent)
	case errors.Is(err, pagaya.ErrInvalid):
		WriteJSON(w, http.StatusBadRequest, errorBody(http.StatusBadRequest, "bad_request", "Aviso inválido"))
	default:
		slog.Warn("aviso con firma inválida", "proveedor", provider)
		WriteJSON(w, http.StatusUnauthorized, errorBody(http.StatusUnauthorized, "unauthorized", "Firma inválida"))
	}
	return false
}

func (h *HTTP) finish(w http.ResponseWriter, err error, provider string) {
	if err != nil {
		slog.Error("no se pudo aplicar el aviso; el proveedor reintentará", "proveedor", provider, "error", err)
		WriteJSON(w, http.StatusServiceUnavailable, errorBody(http.StatusServiceUnavailable, "unavailable", "Reintenta más tarde"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func readWebhook(w http.ResponseWriter, r *http.Request) ([]byte, bool) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxWebhookBody))
	if err != nil {
		WriteJSON(w, http.StatusRequestEntityTooLarge, errorBody(http.StatusRequestEntityTooLarge, "payload_too_large", "Aviso demasiado grande"))
		return nil, false
	}
	return body, true
}

// decodeRequest lee el carrito en structs tipados: cualquier campo extra (p. ej. un precio
// inventado por el navegador) se descarta.
func decodeRequest(w http.ResponseWriter, r *http.Request) (req services.QuoteRequest, ok bool) {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxRequestBody))
	if err := decoder.Decode(&req); err != nil {
		writeError(w, invalid("La solicitud no es válida"))
		return req, false
	}
	return req, true
}

func writeError(w http.ResponseWriter, err error) {
	var e *Error
	if errors.As(err, &e) {
		WriteJSON(w, e.Status, errorBody(e.Status, e.Code, e.Message))
		return
	}
	slog.Error("error inesperado en servicios", "error", err)
	WriteJSON(w, http.StatusInternalServerError, errorBody(http.StatusInternalServerError, "internal_error", "Algo salió mal. Inténtalo de nuevo."))
}

func errorBody(status int, code, message string) map[string]any {
	return map[string]any{"statusCode": status, "error": code, "message": message}
}

// WriteJSON responde con JSON.
func WriteJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
