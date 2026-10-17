// Package auth verifica los JWT (HS256) que emite el core, sin dependencias externas.
package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

var (
	ErrMalformed = errors.New("token mal formado")
	ErrSignature = errors.New("firma inválida")
	ErrExpired   = errors.New("token vencido")
)

// Claims son los datos del token que le importan al gateway.
type Claims struct {
	UserID    string
	ExpiresAt time.Time
}

type header struct {
	Alg string `json:"alg"`
	Typ string `json:"typ"`
}

type payload struct {
	Sub string `json:"sub"`
	Exp int64  `json:"exp"`
}

// Verify comprueba firma, algoritmo y vencimiento. Solo acepta HS256 (nunca "none").
func Verify(token, secret string, now time.Time) (Claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return Claims{}, ErrMalformed
	}
	var h header
	if err := decode(parts[0], &h); err != nil || h.Alg != "HS256" {
		return Claims{}, ErrMalformed
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(parts[0] + "." + parts[1]))
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil || !hmac.Equal(signature, mac.Sum(nil)) {
		return Claims{}, ErrSignature
	}
	var p payload
	if err := decode(parts[1], &p); err != nil || p.Sub == "" || p.Exp == 0 {
		return Claims{}, ErrMalformed
	}
	expires := time.Unix(p.Exp, 0)
	if !now.Before(expires) {
		return Claims{}, ErrExpired
	}
	return Claims{UserID: p.Sub, ExpiresAt: expires}, nil
}

func decode(segment string, into any) error {
	raw, err := base64.RawURLEncoding.DecodeString(segment)
	if err != nil {
		return err
	}
	return json.Unmarshal(raw, into)
}
