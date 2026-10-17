// Package notify envía los avisos (webhooks) firmados que los sistemas simulados mandan a quien
// los contrata, con reintentos como hacen los proveedores reales.
package notify

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"time"
)

// Sign devuelve hex(HMAC-SHA256(secreto, cuerpo)).
func Sign(secret string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

// ValidCallback acepta solo URLs http(s) absolutas.
func ValidCallback(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

// Notifier publica un JSON firmado en la cabecera indicada.
type Notifier struct {
	Client  *http.Client
	Secret  string
	Header  string
	Retries int
	Backoff time.Duration
}

// Send intenta entregar el aviso; reintenta ante errores de red o respuestas 5xx/429.
func (n Notifier) Send(ctx context.Context, target string, payload any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	client := n.Client
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	attempts := n.Retries + 1
	var last error
	for i := 0; i < attempts; i++ {
		if i > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(n.Backoff * time.Duration(1<<(i-1))):
			}
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, target, bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set(n.Header, Sign(n.Secret, body))
		resp, err := client.Do(req)
		if err != nil {
			last = err
			continue
		}
		resp.Body.Close()
		if resp.StatusCode < 300 {
			return nil
		}
		last = fmt.Errorf("respuesta %d", resp.StatusCode)
		if resp.StatusCode < 500 && resp.StatusCode != http.StatusTooManyRequests {
			break
		}
	}
	slog.Warn("no se pudo entregar el aviso", "destino", target, "error", last)
	return last
}

// WriteJSON responde con JSON.
func WriteJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
