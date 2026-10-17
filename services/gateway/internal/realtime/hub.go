// Package realtime conecta los navegadores (/ws) con el servicio de tiempo real en Elixir.
//
// Cada navegador es una conexión virtual dentro de un único enlace multiplexado. El gateway
// autentica (JWT), pasa cada evento por el traductor del chat y añade la persona autenticada:
// el servicio de Elixir nunca confía en lo que diga el navegador sobre quién es.
package realtime

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"
	"github.com/parla/gateway/internal/auth"
	"github.com/parla/gateway/internal/translators"
)

const (
	maxClientFrame = 64 << 10
	sendBuffer     = 256
	// Código de cierre cuando vence la sesión: el navegador debe volver a iniciar sesión.
	closeSessionExpired websocket.StatusCode = 4401
)

type client struct {
	id   string
	user string
	send chan []byte
	conn *websocket.Conn
}

// Hub registra las conexiones de navegador y reparte lo que llega del enlace.
type Hub struct {
	link       *Link
	translator translators.Translator
	jwtSecret  string
	origins    []string

	mu      sync.RWMutex
	clients map[string]*client
	seq     atomic.Uint64
}

func NewHub(link *Link, translator translators.Translator, jwtSecret string, origins []string) *Hub {
	h := &Hub{link: link, translator: translator, jwtSecret: jwtSecret, origins: origins, clients: map[string]*client{}}
	link.onFrame = h.fromLink
	link.onDown = h.closeAll
	return h
}

// Count devuelve cuántos navegadores hay conectados (salud y pruebas).
func (h *Hub) Count() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// ServeHTTP atiende GET /ws?token=<JWT>.
func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	claims, err := auth.Verify(r.URL.Query().Get("token"), h.jwtSecret, time.Now())
	if err != nil {
		http.Error(w, `{"statusCode":401,"error":"unauthorized","message":"Inicia sesión para continuar"}`, http.StatusUnauthorized)
		return
	}
	if !h.link.Connected() {
		http.Error(w, `{"statusCode":503,"error":"unavailable","message":"El chat en tiempo real se está reiniciando"}`, http.StatusServiceUnavailable)
		return
	}
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: h.origins})
	if err != nil {
		return
	}
	conn.SetReadLimit(maxClientFrame)

	c := &client{id: fmt.Sprintf("g%d", h.seq.Add(1)), user: claims.UserID, send: make(chan []byte, sendBuffer), conn: conn}
	ctx, cancel := context.WithDeadline(r.Context(), claims.ExpiresAt)
	defer cancel()

	h.mu.Lock()
	h.clients[c.id] = c
	h.mu.Unlock()
	defer h.remove(c)

	if err := h.link.Send(ctx, linkFrame{Op: "open", Conn: c.id, User: c.user}); err != nil {
		conn.Close(websocket.StatusTryAgainLater, "realtime no disponible")
		return
	}
	go h.write(ctx, c)
	h.read(ctx, c)

	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		conn.Close(closeSessionExpired, "sesión vencida")
	}
}

func (h *Hub) read(ctx context.Context, c *client) {
	for {
		_, data, err := c.conn.Read(ctx)
		if err != nil {
			return
		}
		event, err := h.translator.Inbound(data)
		if err != nil {
			slog.Debug("evento descartado por el traductor", "conn", c.id, "error", err)
			continue
		}
		payload, err := json.Marshal(event.Data)
		if err != nil {
			continue
		}
		frame := linkFrame{Op: "event", Conn: c.id, User: c.user, T: event.Type, D: payload, Ref: event.Ref}
		if err := h.link.Send(ctx, frame); err != nil {
			return
		}
	}
}

func (h *Hub) write(ctx context.Context, c *client) {
	for {
		select {
		case <-ctx.Done():
			return
		case data, ok := <-c.send:
			if !ok {
				c.conn.Close(websocket.StatusServiceRestart, "reconectando")
				return
			}
			writeCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
			err := c.conn.Write(writeCtx, websocket.MessageText, data)
			cancel()
			if err != nil {
				c.conn.CloseNow()
				return
			}
		}
	}
}

func (h *Hub) remove(c *client) {
	h.mu.Lock()
	_, present := h.clients[c.id]
	delete(h.clients, c.id)
	h.mu.Unlock()
	if present {
		_ = h.link.Send(context.Background(), linkFrame{Op: "close", Conn: c.id})
	}
	c.conn.CloseNow()
}

// fromLink reparte lo que llega del servicio de tiempo real a las conexiones indicadas.
func (h *Hub) fromLink(frame linkFrame) {
	switch frame.Op {
	case "deliver":
		data, err := json.Marshal(struct {
			T string          `json:"t"`
			D json.RawMessage `json:"d"`
		}{frame.T, frame.D})
		if err != nil {
			return
		}
		for _, id := range frame.Conns {
			h.push(id, data)
		}
	case "ack":
		data, err := json.Marshal(struct {
			T   string          `json:"t"`
			Ref string          `json:"ref"`
			D   json.RawMessage `json:"d"`
		}{"ack", frame.Ref, frame.D})
		if err == nil {
			h.push(frame.Conn, data)
		}
	}
}

func (h *Hub) push(id string, data []byte) {
	// Se mantiene el candado de lectura mientras se encola: closeAll cierra los canales con el
	// candado de escritura, así nunca se envía a un canal ya cerrado.
	h.mu.RLock()
	defer h.mu.RUnlock()
	c := h.clients[id]
	if c == nil {
		return
	}
	select {
	case c.send <- data:
	default:
		// Navegador demasiado lento: se cierra para que se reconecte y recupere lo pendiente.
		slog.Warn("conexión lenta cerrada", "conn", id)
		c.conn.CloseNow()
	}
}

// closeAll cierra todos los navegadores cuando el enlace se cae: se reconectan solos.
func (h *Hub) closeAll() {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, c := range h.clients {
		close(c.send)
	}
	h.clients = map[string]*client{}
}
