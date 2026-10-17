// Package webhook verifica la firma de los avisos que mandan los proveedores externos.
package webhook

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
)

var ErrSignature = errors.New("firma del aviso inválida")

// Sign devuelve hex(HMAC-SHA256(secreto, cuerpo)).
func Sign(secret string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

// Verify compara en tiempo constante la firma recibida con la esperada.
func Verify(secret string, body []byte, signature string) error {
	got, err := hex.DecodeString(strings.TrimSpace(signature))
	if err != nil || len(got) != sha256.Size {
		return ErrSignature
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	if !hmac.Equal(got, mac.Sum(nil)) {
		return ErrSignature
	}
	return nil
}
