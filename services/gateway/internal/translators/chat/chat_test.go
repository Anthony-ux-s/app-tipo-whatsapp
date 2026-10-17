package chat

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/parla/gateway/internal/translators"
)

func inbound(t *testing.T, raw string) (translators.Event, error) {
	t.Helper()
	return New().Inbound([]byte(raw))
}

func asJSON(t *testing.T, v any) string {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestLimpiaEscribiendoYDescartaCamposDesconocidos(t *testing.T) {
	ev, err := inbound(t, `{"t":"typing","d":{"conversationId":" c1 ","isTyping":true,"userId":"suplantado","x":1},"ref":"r1"}`)
	if err != nil {
		t.Fatal(err)
	}
	if got := asJSON(t, ev.Data); got != `{"conversationId":"c1","isTyping":true}` {
		t.Fatalf("payload no limpio: %s", got)
	}
	if ev.Type != "typing" || ev.Ref != "r1" {
		t.Fatalf("evento inesperado: %+v", ev)
	}
}

func TestValidaLlamadas(t *testing.T) {
	ok := []string{
		`{"t":"call:start","d":{"conversationId":"c1","kind":"video"}}`,
		`{"t":"call:join","d":{"callId":"abc123"}}`,
		`{"t":"call:decline","d":{"callId":"abc123"}}`,
		`{"t":"call:leave","d":{"callId":"abc123"}}`,
		`{"t":"call:signal","d":{"callId":"abc","to":"u2","data":{"type":"offer","sdp":"v=0"}}}`,
		`{"t":"call:signal","d":{"callId":"abc","to":"u2","data":{"type":"candidate","candidate":{"candidate":"candidate:1","sdpMid":"0","sdpMLineIndex":0}}}}`,
	}
	for _, raw := range ok {
		if _, err := inbound(t, raw); err != nil {
			t.Errorf("debía aceptarse %s: %v", raw, err)
		}
	}

	bad := []string{
		`{"t":"call:start","d":{"conversationId":"c1","kind":"fax"}}`,
		`{"t":"call:start","d":{"conversationId":"../../etc","kind":"audio"}}`,
		`{"t":"call:join","d":{}}`,
		`{"t":"call:signal","d":{"callId":"abc","to":"u2","data":{"type":"hack","sdp":"x"}}}`,
		`{"t":"call:signal","d":{"callId":"abc","to":"u2","data":{"type":"offer","sdp":"` + strings.Repeat("x", 100_001) + `"}}}`,
		`{"t":"message:new","d":{}}`,
		`{"t":"typing","d":{"conversationId":"` + strings.Repeat("a", 65) + `"}}`,
		`no es json`,
		`{"t":"typing","d":{"conversationId":"c1"},"ref":"` + strings.Repeat("r", 33) + `"}`,
	}
	for _, raw := range bad {
		if _, err := inbound(t, raw); !errors.Is(err, translators.ErrRejected) {
			t.Errorf("debía rechazarse %.80s…: %v", raw, err)
		}
	}
}

func TestLaSenalSoloLlevaLoQueCorrespondeASuTipo(t *testing.T) {
	ev, err := inbound(t, `{"t":"call:signal","d":{"callId":"abc","to":"u2","data":{"type":"answer","sdp":"v=0","candidate":{"candidate":"x"}}}}`)
	if err != nil {
		t.Fatal(err)
	}
	if got := asJSON(t, ev.Data); got != `{"callId":"abc","to":"u2","data":{"type":"answer","sdp":"v=0"}}` {
		t.Fatalf("señal no limpia: %s", got)
	}
}
