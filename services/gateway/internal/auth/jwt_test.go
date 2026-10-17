package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"testing"
	"time"
)

func sign(t *testing.T, header, payload, secret string) string {
	t.Helper()
	enc := base64.RawURLEncoding
	h := enc.EncodeToString([]byte(header))
	p := enc.EncodeToString([]byte(payload))
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(h + "." + p))
	return h + "." + p + "." + enc.EncodeToString(mac.Sum(nil))
}

const hs256 = `{"alg":"HS256","typ":"JWT"}`

func TestVerifyAceptaUnTokenValido(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	token := sign(t, hs256, `{"sub":"u1","exp":1800000600}`, "secreto")
	claims, err := Verify(token, "secreto", now)
	if err != nil || claims.UserID != "u1" || !claims.ExpiresAt.Equal(time.Unix(1_800_000_600, 0)) {
		t.Fatalf("esperaba u1 válido, obtuve %+v, %v", claims, err)
	}
}

func TestVerifyRechazaFirmaVencimientoYAlgoritmo(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	cases := map[string]struct {
		token string
		want  error
	}{
		"otro secreto":   {sign(t, hs256, `{"sub":"u1","exp":1800000600}`, "otro"), ErrSignature},
		"vencido":        {sign(t, hs256, `{"sub":"u1","exp":1799999999}`, "secreto"), ErrExpired},
		"alg none":       {sign(t, `{"alg":"none"}`, `{"sub":"u1","exp":1800000600}`, "secreto"), ErrMalformed},
		"sin sub":        {sign(t, hs256, `{"exp":1800000600}`, "secreto"), ErrMalformed},
		"mal formado":    {"abc.def", ErrMalformed},
		"firma alterada": {sign(t, hs256, `{"sub":"u1","exp":1800000600}`, "secreto") + "x", ErrSignature},
	}
	for name, tc := range cases {
		if _, err := Verify(tc.token, "secreto", now); err != tc.want {
			t.Errorf("%s: esperaba %v, obtuve %v", name, tc.want, err)
		}
	}
}
