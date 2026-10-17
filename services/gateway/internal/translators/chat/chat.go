// Package chat es el traductor de datos del chat en tiempo real.
//
// Acepta solo los eventos del contrato (docs/architecture/realtime-protocol.md), valida cada campo
// y vuelve a serializar desde estructuras tipadas: cualquier campo desconocido se descarta y nada
// que no esté en la lista llega al servicio de Elixir.
package chat

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/parla/gateway/internal/translators"
)

const (
	maxIDLength  = 64
	maxSDPLength = 100_000
	maxRefLength = 32
)

var idPattern = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

type Translator struct{}

func New() Translator { return Translator{} }

func (Translator) Name() string { return "chat" }

type frame struct {
	T   string          `json:"t"`
	D   json.RawMessage `json:"d"`
	Ref string          `json:"ref"`
}

// Payloads limpios que salen hacia el backend.
type Typing struct {
	ConversationID string `json:"conversationId"`
	IsTyping       bool   `json:"isTyping"`
}

type CallStart struct {
	ConversationID string `json:"conversationId"`
	Kind           string `json:"kind"`
}

type CallRef struct {
	CallID string `json:"callId"`
}

type Candidate struct {
	Candidate     string  `json:"candidate"`
	SdpMid        *string `json:"sdpMid"`
	SdpMLineIndex *int    `json:"sdpMLineIndex"`
}

type SignalData struct {
	Type      string     `json:"type"`
	SDP       string     `json:"sdp,omitempty"`
	Candidate *Candidate `json:"candidate,omitempty"`
}

type CallSignal struct {
	CallID string     `json:"callId"`
	To     string     `json:"to"`
	Data   SignalData `json:"data"`
}

func reject(format string, args ...any) error {
	return fmt.Errorf("%w: %s", translators.ErrRejected, fmt.Sprintf(format, args...))
}

func id(value, field string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" || len(value) > maxIDLength || !idPattern.MatchString(value) {
		return "", reject("%s no es un identificador válido", field)
	}
	return value, nil
}

func (Translator) Inbound(raw []byte) (translators.Event, error) {
	var f frame
	if err := json.Unmarshal(raw, &f); err != nil {
		return translators.Event{}, reject("JSON inválido")
	}
	if len(f.Ref) > maxRefLength {
		return translators.Event{}, reject("ref demasiado largo")
	}
	data, err := clean(f.T, f.D)
	if err != nil {
		return translators.Event{}, err
	}
	return translators.Event{Type: f.T, Data: data, Ref: f.Ref}, nil
}

func clean(event string, d json.RawMessage) (any, error) {
	switch event {
	case "typing":
		var p Typing
		if err := json.Unmarshal(d, &p); err != nil {
			return nil, reject("typing inválido")
		}
		var err error
		if p.ConversationID, err = id(p.ConversationID, "conversationId"); err != nil {
			return nil, err
		}
		return p, nil

	case "call:start":
		var p CallStart
		if err := json.Unmarshal(d, &p); err != nil {
			return nil, reject("call:start inválido")
		}
		var err error
		if p.ConversationID, err = id(p.ConversationID, "conversationId"); err != nil {
			return nil, err
		}
		if p.Kind != "audio" && p.Kind != "video" {
			return nil, reject("tipo de llamada inválido")
		}
		return p, nil

	case "call:join", "call:decline", "call:leave":
		var p CallRef
		if err := json.Unmarshal(d, &p); err != nil {
			return nil, reject("%s inválido", event)
		}
		var err error
		if p.CallID, err = id(p.CallID, "callId"); err != nil {
			return nil, err
		}
		return p, nil

	case "call:signal":
		var p CallSignal
		if err := json.Unmarshal(d, &p); err != nil {
			return nil, reject("call:signal inválido")
		}
		var err error
		if p.CallID, err = id(p.CallID, "callId"); err != nil {
			return nil, err
		}
		if p.To, err = id(p.To, "to"); err != nil {
			return nil, err
		}
		switch p.Data.Type {
		case "offer", "answer":
			if p.Data.SDP == "" || len(p.Data.SDP) > maxSDPLength {
				return nil, reject("SDP inválido")
			}
			p.Data.Candidate = nil
		case "candidate":
			if p.Data.Candidate == nil || len(p.Data.Candidate.Candidate) > 2_000 {
				return nil, reject("candidato ICE inválido")
			}
			p.Data.SDP = ""
		default:
			return nil, reject("tipo de señal inválido")
		}
		return p, nil

	default:
		return nil, reject("evento %q no permitido", event)
	}
}
