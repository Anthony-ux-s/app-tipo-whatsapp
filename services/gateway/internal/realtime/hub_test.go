package realtime

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/parla/gateway/internal/translators/chat"
)

const secret = "secreto-de-prueba"

func token(t *testing.T, user string, ttl time.Duration) string {
	t.Helper()
	enc := base64.RawURLEncoding
	h := enc.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	p := enc.EncodeToString([]byte(fmt.Sprintf(`{"sub":%q,"exp":%d}`, user, time.Now().Add(ttl).Unix())))
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(h + "." + p))
	return h + "." + p + "." + enc.EncodeToString(mac.Sum(nil))
}

// fakeRealtime hace de servicio de Elixir: acepta el enlace y deja leer/escribir sus marcos.
type fakeRealtime struct {
	server *httptest.Server
	frames chan linkFrame
	conn   chan *websocket.Conn
}

func newFakeRealtime(t *testing.T) *fakeRealtime {
	f := &fakeRealtime{frames: make(chan linkFrame, 32), conn: make(chan *websocket.Conn, 1)}
	f.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-internal-token") != "interno" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		c, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		f.conn <- c
		for {
			_, data, err := c.Read(context.Background())
			if err != nil {
				return
			}
			var frame linkFrame
			_ = json.Unmarshal(data, &frame)
			f.frames <- frame
		}
	}))
	t.Cleanup(f.server.Close)
	return f
}

func (f *fakeRealtime) next(t *testing.T) linkFrame {
	t.Helper()
	select {
	case frame := <-f.frames:
		return frame
	case <-time.After(3 * time.Second):
		t.Fatal("el realtime no recibió ningún marco")
		return linkFrame{}
	}
}

func setup(t *testing.T) (*fakeRealtime, *httptest.Server, *websocket.Conn, *Hub) {
	t.Helper()
	fake := newFakeRealtime(t)
	link := NewLink("ws"+strings.TrimPrefix(fake.server.URL, "http"), "interno")
	hub := NewHub(link, chat.New(), secret, []string{"*"})
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	go link.Run(ctx)
	var realtimeConn *websocket.Conn
	select {
	case realtimeConn = <-fake.conn:
	case <-time.After(3 * time.Second):
		t.Fatal("el enlace no se conectó")
	}
	for !link.Connected() {
		time.Sleep(5 * time.Millisecond)
	}
	gateway := httptest.NewServer(hub)
	t.Cleanup(gateway.Close)
	return fake, gateway, realtimeConn, hub
}

func dial(t *testing.T, gateway *httptest.Server, tok string) (*websocket.Conn, *http.Response, error) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	return websocket.Dial(ctx, "ws"+strings.TrimPrefix(gateway.URL, "http")+"?token="+tok, nil)
}

func TestSinTokenValidoNoHayWebSocket(t *testing.T) {
	_, gateway, _, _ := setup(t)
	if _, resp, err := dial(t, gateway, "falso"); err == nil || resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("esperaba 401, obtuve %v", err)
	}
}

func TestElNavegadorHablaConElRealtimeComoLaPersonaAutenticada(t *testing.T) {
	fake, gateway, realtime, _ := setup(t)
	browser, _, err := dial(t, gateway, token(t, "laura", time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	defer browser.CloseNow()

	open := fake.next(t)
	if open.Op != "open" || open.User != "laura" || open.Conn == "" {
		t.Fatalf("esperaba open de laura, obtuve %+v", open)
	}

	ctx := context.Background()
	// Evento no permitido: el traductor lo descarta. Evento válido: llega limpio y con la persona del token.
	_ = browser.Write(ctx, websocket.MessageText, []byte(`{"t":"message:new","d":{"x":1}}`))
	_ = browser.Write(ctx, websocket.MessageText, []byte(`{"t":"typing","d":{"conversationId":"c1","isTyping":true,"userId":"andres"},"ref":"r7"}`))
	event := fake.next(t)
	if event.Op != "event" || event.T != "typing" || event.User != "laura" || event.Ref != "r7" || event.Conn != open.Conn {
		t.Fatalf("evento inesperado: %+v", event)
	}
	if string(event.D) != `{"conversationId":"c1","isTyping":true}` {
		t.Fatalf("payload no limpio: %s", event.D)
	}

	// Lo que entrega el realtime le llega al navegador, y los ack con su ref.
	deliver := fmt.Sprintf(`{"op":"deliver","conns":[%q],"t":"message:new","d":{"id":"m1"}}`, open.Conn)
	ack := fmt.Sprintf(`{"op":"ack","conn":%q,"ref":"r7","d":{"ok":true}}`, open.Conn)
	_ = realtime.Write(ctx, websocket.MessageText, []byte(deliver))
	_ = realtime.Write(ctx, websocket.MessageText, []byte(ack))

	for _, want := range []string{`{"t":"message:new","d":{"id":"m1"}}`, `{"t":"ack","ref":"r7","d":{"ok":true}}`} {
		readCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
		_, data, err := browser.Read(readCtx)
		cancel()
		if err != nil || string(data) != want {
			t.Fatalf("esperaba %s, obtuve %s (%v)", want, data, err)
		}
	}

	browser.Close(websocket.StatusNormalClosure, "")
	if closeFrame := fake.next(t); closeFrame.Op != "close" || closeFrame.Conn != open.Conn {
		t.Fatalf("esperaba close, obtuve %+v", closeFrame)
	}
}

func TestSiSeCaeElEnlaceSeCierranLosNavegadoresParaQueSeReconecten(t *testing.T) {
	fake, gateway, realtime, hub := setup(t)
	browser, _, err := dial(t, gateway, token(t, "laura", time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	fake.next(t) // open
	realtime.Close(websocket.StatusGoingAway, "reinicio")

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_, _, err = browser.Read(ctx)
	if websocket.CloseStatus(err) != websocket.StatusServiceRestart {
		t.Fatalf("esperaba cierre 1012, obtuve %v", err)
	}
	for i := 0; i < 100 && hub.Count() > 0; i++ {
		time.Sleep(10 * time.Millisecond)
	}
	if hub.Count() != 0 {
		t.Fatalf("quedaron %d conexiones", hub.Count())
	}
}

func TestElGatewayManda_latidos_para_que_el_navegador_sepa_que_sigue_vivo(t *testing.T) {
	old := heartbeatEvery
	heartbeatEvery = 40 * time.Millisecond
	t.Cleanup(func() { heartbeatEvery = old })

	_, gateway, _, _ := setup(t)
	browser, _, err := dial(t, gateway, token(t, "laura", time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	defer browser.CloseNow()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	for i := 0; i < 2; i++ {
		_, data, err := browser.Read(ctx)
		if err != nil {
			t.Fatalf("esperaba un latido, obtuve %v", err)
		}
		if string(data) != `{"t":"hb"}` {
			t.Fatalf("latido inesperado: %s", data)
		}
	}
}
