package realtime

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
)

// ErrLinkDown: el enlace con el servicio de tiempo real no está disponible.
var ErrLinkDown = errors.New("enlace con el tiempo real caído")

// linkFrame es un marco del enlace multiplexado (ver docs/architecture/realtime-protocol.md).
type linkFrame struct {
	Op    string          `json:"op"`
	Conn  string          `json:"conn,omitempty"`
	Conns []string        `json:"conns,omitempty"`
	User  string          `json:"user,omitempty"`
	T     string          `json:"t,omitempty"`
	D     json.RawMessage `json:"d,omitempty"`
	Ref   string          `json:"ref,omitempty"`
}

// Link mantiene un único WebSocket con el servicio de Elixir y se reconecta solo.
type Link struct {
	url   string
	token string

	mu   sync.Mutex
	conn *websocket.Conn

	onFrame func(linkFrame)
	onDown  func()
}

func NewLink(url, token string) *Link {
	return &Link{url: url, token: token}
}

func (l *Link) Connected() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.conn != nil
}

// Send escribe un marco hacia el servicio de tiempo real (en orden: las escrituras se serializan).
func (l *Link) Send(ctx context.Context, frame linkFrame) error {
	data, err := json.Marshal(frame)
	if err != nil {
		return err
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.conn == nil {
		return ErrLinkDown
	}
	writeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return l.conn.Write(writeCtx, websocket.MessageText, data)
}

// Run conecta y reconecta con espera creciente hasta que el contexto se cancele.
func (l *Link) Run(ctx context.Context) {
	backoff := 250 * time.Millisecond
	for ctx.Err() == nil {
		conn, _, err := websocket.Dial(ctx, l.url, &websocket.DialOptions{
			HTTPHeader: http.Header{"x-internal-token": []string{l.token}},
		})
		if err != nil {
			slog.Warn("no se pudo conectar con el tiempo real; reintentando", "error", err, "en", backoff)
			select {
			case <-ctx.Done():
				return
			case <-time.After(backoff):
			}
			backoff = min(backoff*2, 5*time.Second)
			continue
		}
		backoff = 250 * time.Millisecond
		conn.SetReadLimit(16 << 20)
		l.mu.Lock()
		l.conn = conn
		l.mu.Unlock()
		slog.Info("enlace con el tiempo real conectado", "url", l.url)

		l.read(ctx, conn)

		l.mu.Lock()
		l.conn = nil
		l.mu.Unlock()
		conn.CloseNow()
		slog.Warn("enlace con el tiempo real caído")
		if l.onDown != nil {
			l.onDown()
		}
	}
}

func (l *Link) read(ctx context.Context, conn *websocket.Conn) {
	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			return
		}
		var frame linkFrame
		if json.Unmarshal(data, &frame) == nil && l.onFrame != nil {
			l.onFrame(frame)
		}
	}
}
