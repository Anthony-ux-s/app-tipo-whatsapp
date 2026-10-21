package pagaya

import (
	"fmt"
	"html/template"
	"net/http"
)

type pageView struct {
	ID       string
	Concepto string
	Monto    string
	Estado   string
}

func viewOf(c *cobro) pageView {
	return pageView{ID: c.ID, Concepto: c.Concepto, Monto: fmt.Sprintf("S/ %d.%02d", c.Cents/100, c.Cents%100), Estado: c.Estado}
}

// La página imita la app del banco: html/template escapa todo lo que viene del cobro.
var page = template.Must(template.New("pagar").Parse(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PagaYa · Pagar</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: linear-gradient(160deg, #5b2a86 0%, #7b3fb4 55%, #a86fd9 100%); color: #1f1530; padding: 16px; }
  .card { width: 100%; max-width: 380px; background: #fff; border-radius: 24px; padding: 28px 24px;
    box-shadow: 0 20px 50px rgba(40, 10, 70, .35); text-align: center; }
  .brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 800; font-size: 20px; color: #5b2a86; }
  .brand span { display: inline-flex; width: 32px; height: 32px; border-radius: 10px; background: #5b2a86; color: #fff;
    align-items: center; justify-content: center; font-size: 18px; }
  .sim { margin-top: 6px; font-size: 12px; color: #8a7a9c; }
  .label { margin-top: 24px; font-size: 14px; color: #6b5c7d; }
  .amount { margin-top: 4px; font-size: 40px; font-weight: 800; letter-spacing: -1px; }
  .concept { margin-top: 8px; font-size: 15px; color: #3d2f50; }
  button { margin-top: 28px; width: 100%; border: 0; border-radius: 14px; padding: 16px; font-size: 17px; font-weight: 700;
    color: #fff; background: #5b2a86; cursor: pointer; }
  button:hover { background: #4a2170; }
  .status { margin-top: 28px; border-radius: 14px; padding: 16px; font-weight: 700; }
  .ok { background: #e7f8ef; color: #0f6b3d; }
  .bad { background: #f6eef0; color: #7a2d3b; }
  .check { font-size: 44px; line-height: 1; }
</style>
</head>
<body>
<main class="card">
  <div class="brand"><span>P</span>PagaYa</div>
  <div class="sim">Billetera simulada para pruebas · no se mueve dinero real</div>
  {{if eq .Estado "NO_EXISTE"}}
    <div class="status bad">Este cobro no existe.</div>
  {{else}}
    <div class="label">Vas a pagar</div>
    <div class="amount">{{.Monto}}</div>
    <div class="concept">{{.Concepto}}</div>
    {{if eq .Estado "PENDIENTE"}}
      <form method="post" action="/pagaya/pagar/{{.ID}}">
        <button type="submit">Pagar {{.Monto}}</button>
      </form>
    {{else if eq .Estado "PAGADO"}}
      <div class="status ok"><div class="check">✓</div>Pago realizado. Ya puedes volver a Parla.</div>
    {{else if eq .Estado "ANULADO"}}
      <div class="status bad">Este cobro fue anulado. No se te cobró nada.</div>
    {{else if eq .Estado "DEVUELTO"}}
      <div class="status ok">Este pago ya fue devuelto a tu billetera.</div>
    {{else}}
      <div class="status bad">Este cobro venció. Genera uno nuevo desde Parla.</div>
    {{end}}
  {{end}}
</main>
</body>
</html>`))

func renderPage(w http.ResponseWriter, status int, view pageView) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	_ = page.Execute(w, view)
}
