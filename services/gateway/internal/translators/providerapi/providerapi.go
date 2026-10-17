// Package providerapi hace las llamadas HTTP+JSON a los sistemas externos con límites de tamaño y
// tiempo, para que los traductores solo se ocupen de convertir formatos.
package providerapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
)

// ErrUnavailable: el proveedor no respondió o respondió algo que no se entiende.
var ErrUnavailable = errors.New("proveedor no disponible")

const maxResponse = 1 << 20

// Call envía in (si no es nil) como JSON y decodifica la respuesta en out según el código:
// devuelve el código HTTP y el cuerpo crudo para que el traductor interprete los errores.
func Call(ctx context.Context, client *http.Client, method, url string, in any) (int, []byte, error) {
	return CallWithHeaders(ctx, client, method, url, in, nil)
}

// CallWithHeaders es Call con cabeceras propias del proveedor (p. ej. su clave de administración).
func CallWithHeaders(ctx context.Context, client *http.Client, method, url string, in any, headers map[string]string) (int, []byte, error) {
	var body io.Reader
	if in != nil {
		raw, err := json.Marshal(in)
		if err != nil {
			return 0, nil, err
		}
		body = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("Accept", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	if in != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := client.Do(req)
	if err != nil {
		return 0, nil, fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxResponse+1))
	if err != nil || len(raw) > maxResponse {
		return 0, nil, fmt.Errorf("%w: respuesta ilegible o demasiado grande", ErrUnavailable)
	}
	if resp.StatusCode >= 500 {
		return resp.StatusCode, raw, fmt.Errorf("%w: respuesta %d", ErrUnavailable, resp.StatusCode)
	}
	return resp.StatusCode, raw, nil
}

// Decode convierte el cuerpo; un JSON roto del proveedor cuenta como no disponible.
func Decode(raw []byte, out any) error {
	if err := json.Unmarshal(raw, out); err != nil {
		return fmt.Errorf("%w: JSON inválido: %v", ErrUnavailable, err)
	}
	return nil
}
