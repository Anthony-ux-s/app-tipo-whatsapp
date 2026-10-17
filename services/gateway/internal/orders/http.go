package orders

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"

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

func (h *HTTP) Catalog(w http.ResponseWriter, _ *http.Request, _ string) {
	WriteJSON(w, http.StatusOK, Catalog())
}

func (h *HTTP) Products(w http.ResponseWriter, r *http.Request, _ string) {
	products, err := h.Orch.Products(r.Context(), r.URL.Query().Get("q"))
	if err != nil {
		writeError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, products)
}

func (h *HTTP) Quote(w http.ResponseWriter, r *http.Request, _ string) {
	req, ok := decodeRequest(w, r)
	if !ok {
		return
	}
	quote, err := h.Orch.Quote(r.Context(), req)
	if err != nil {
		writeError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, quote)
}

func (h *HTTP) Create(w http.ResponseWriter, r *http.Request, userID string) {
	req, ok := decodeRequest(w, r)
	if !ok {
		return
	}
	order, err := h.Orch.Create(r.Context(), userID, req)
	if err != nil {
		writeError(w, err)
		return
	}
	WriteJSON(w, http.StatusCreated, order)
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
