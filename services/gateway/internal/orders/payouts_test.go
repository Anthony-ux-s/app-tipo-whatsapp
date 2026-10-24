package orders

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync"
	"testing"
	"time"

	"github.com/parla/gateway/internal/services"
	"github.com/parla/gateway/internal/translators/pagaya"
)

// fakePayoutCore imita al core: aparta el saldo (un retiro a la vez) y lo cierra.
type fakePayoutCore struct {
	mu        sync.Mutex
	balance   map[string]int
	phone     map[string]string
	pending   map[string]string // repartidor → retiro pendiente
	settled   []services.PayoutSettle
	failSettl bool
	next      int
	// prefix: cómo empiezan los ids de retiro («po_» repartidores, «sp_» tiendas).
	prefix string
}

func (f *fakePayoutCore) ReservePayout(_ context.Context, userID, _ string) (services.PayoutReservation, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	switch {
	case f.phone[userID] == "" && f.balance[userID] == 0 && f.pending[userID] == "":
		return services.PayoutReservation{}, ErrNotFound
	case f.pending[userID] != "":
		return services.PayoutReservation{}, &ConflictError{Message: "Ya tienes un retiro en curso"}
	case f.balance[userID] <= 0:
		return services.PayoutReservation{}, &ConflictError{Message: "No tienes saldo para retirar"}
	}
	f.next++
	prefix := f.prefix
	if prefix == "" {
		prefix = "po_"
	}
	id := prefix + string(rune('0'+f.next))
	f.pending[userID] = id
	return services.PayoutReservation{PayoutID: id, AmountCents: f.balance[userID], Destination: f.phone[userID]}, nil
}

func (f *fakePayoutCore) SettlePayout(_ context.Context, payoutID string, s services.PayoutSettle) (services.Payout, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failSettl && s.Status == "paid" {
		return services.Payout{}, errors.New("core caído")
	}
	f.settled = append(f.settled, s)
	for user, id := range f.pending {
		if id != payoutID {
			continue
		}
		amount := f.balance[user]
		delete(f.pending, user)
		if s.Status == "paid" {
			f.balance[user] = 0
		}
		return services.Payout{PayoutID: id, AmountCents: amount, Status: s.Status, TransferID: s.TransferID}, nil
	}
	return services.Payout{}, ErrNotFound
}

// StuckPayouts: en la prueba, todo retiro pendiente cuenta como trabado (sin mirar la edad).
func (f *fakePayoutCore) StuckPayouts(context.Context, int) ([]services.PayoutReservation, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var stuck []services.PayoutReservation
	for user, id := range f.pending {
		stuck = append(stuck, services.PayoutReservation{PayoutID: id, AmountCents: f.balance[user], Destination: f.phone[user]})
	}
	return stuck, nil
}

func (f *fakePayoutCore) DuePayouts(context.Context) ([]services.DuePayout, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var due []services.DuePayout
	for user, cents := range f.balance {
		if cents >= 500 && f.phone[user] != "" && f.pending[user] == "" {
			due = append(due, services.DuePayout{UserID: user})
		}
	}
	return due, nil
}

// fakeWallet transfiere de verdad solo una vez por referencia, como PagaYa.
type fakeWallet struct {
	mu    sync.Mutex
	sent  map[string]int
	err   error
	calls int
}

func (f *fakeWallet) Transfer(_ context.Context, reference, destination string, amountCents int, concept string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	if f.err != nil {
		return "", f.err
	}
	if (concept != "Rapidito · tus ganancias" && concept != "Parla · tus ventas") || destination == "" {
		return "", errors.New("transferencia mal armada")
	}
	if _, ok := f.sent[reference]; !ok {
		f.sent[reference] = amountCents
	}
	return "tr_" + reference, nil
}

func payoutWorld() (*Orchestrator, *fakePayoutCore, *fakeWallet) {
	core := &fakePayoutCore{
		balance: map[string]int{"carlos": 1234, "lucia": 900, "pobre": 0},
		phone:   map[string]string{"carlos": "987654321", "lucia": "912345678", "pobre": "999999999"},
		pending: map[string]string{},
	}
	wallet := &fakeWallet{sent: map[string]int{}}
	return &Orchestrator{Payouts: core, Wallet: wallet}, core, wallet
}

func TestRetiroTransfiereElSaldoYLoCierraPagado(t *testing.T) {
	orch, core, wallet := payoutWorld()
	payout, err := orch.Payout(context.Background(), "carlos", "manual")
	if err != nil || payout.Status != "paid" || payout.AmountCents != 1234 || payout.TransferID != "tr_po_1" {
		t.Fatalf("retiro inesperado: %+v %v", payout, err)
	}
	if wallet.sent["po_1"] != 1234 || core.balance["carlos"] != 0 || core.settled[0].Status != "paid" {
		t.Fatalf("el dinero debía llegar y el saldo quedar en cero: %v %v", wallet.sent, core.balance)
	}
}

func TestRetiroSinSaldoDevuelveElMensajeDelCore(t *testing.T) {
	orch, _, wallet := payoutWorld()
	_, err := orch.Payout(context.Background(), "pobre", "manual")
	var e *Error
	if !errors.As(err, &e) || e.Status != http.StatusConflict || e.Message != "No tienes saldo para retirar" || wallet.calls != 0 {
		t.Fatalf("esperaba 409 con el mensaje del core y sin transferir, obtuve %v (transferencias %d)", err, wallet.calls)
	}
	if _, err := orch.Payout(context.Background(), "nadie", "manual"); status(err) != http.StatusNotFound {
		t.Fatalf("quien no reparte recibe 404, obtuve %v", err)
	}
}

func TestSiPagaYaNoRespondeElSaldoSigueDisponible(t *testing.T) {
	orch, core, wallet := payoutWorld()
	wallet.err = errors.New("caído")
	_, err := orch.Payout(context.Background(), "carlos", "manual")
	var e *Error
	if !errors.As(err, &e) || e.Status != http.StatusBadGateway || e.Message != "PagaYa no responde. Tu saldo sigue disponible." {
		t.Fatalf("esperaba 502, obtuve %v", err)
	}
	if len(core.settled) != 1 || core.settled[0].Status != "failed" || core.balance["carlos"] != 1234 || core.pending["carlos"] != "" {
		t.Fatalf("el retiro debía cerrarse fallido y el saldo volver: %+v %v", core.settled, core.balance)
	}
	// Con PagaYa de vuelta, el siguiente intento paga.
	wallet.err = nil
	if p, err := orch.Payout(context.Background(), "carlos", "manual"); err != nil || p.Status != "paid" {
		t.Fatalf("el reintento debía pagar: %+v %v", p, err)
	}
}

func TestNumeroDePagaYaInvalido(t *testing.T) {
	orch, core, wallet := payoutWorld()
	wallet.err = pagaya.ErrInvalidDestination
	_, err := orch.Payout(context.Background(), "carlos", "manual")
	var e *Error
	if !errors.As(err, &e) || e.Status != http.StatusBadRequest || e.Message != "Tu número de PagaYa no es válido. Corrígelo en tu perfil." {
		t.Fatalf("esperaba 400, obtuve %v", err)
	}
	if core.settled[0].Status != "failed" || core.settled[0].FailureReason == "" {
		t.Fatalf("debía cerrarse fallido con el motivo: %+v", core.settled)
	}
}

func TestSiElCoreNoCierraTrasTransferirIgualEsExito(t *testing.T) {
	orch, core, wallet := payoutWorld()
	core.failSettl = true
	payout, err := orch.Payout(context.Background(), "carlos", "manual")
	if err != nil || payout.Status != "paid" || wallet.sent["po_1"] != 1234 {
		t.Fatalf("el dinero ya salió: debía responder éxito, obtuve %+v %v", payout, err)
	}
	// El retiro queda pendiente: otro intento no transfiere de nuevo (el core responde «en curso»).
	if _, err := orch.Payout(context.Background(), "carlos", "manual"); status(err) != http.StatusConflict || wallet.calls != 1 {
		t.Fatalf("no debía haber un segundo pago, obtuve %v (transferencias %d)", err, wallet.calls)
	}
}

func TestRetiroAutomaticoPagaACadaRepartidorConSaldo(t *testing.T) {
	orch, core, wallet := payoutWorld()
	paid, failed := orch.RunAutoPayouts(context.Background())
	if paid != 2 || failed != 0 || len(wallet.sent) != 2 || core.balance["carlos"] != 0 || core.balance["lucia"] != 0 {
		t.Fatalf("debía pagar a Carlos y a Lucía: pagados %d, fallidos %d, %v", paid, failed, wallet.sent)
	}
	// Al día siguiente sin saldo nuevo, nadie más cobra.
	if paid, _ := orch.RunAutoPayouts(context.Background()); paid != 0 {
		t.Fatalf("sin saldo no se paga de nuevo, pagados %d", paid)
	}
}

func TestCuandoTocaElRetiroAutomatico(t *testing.T) {
	lima := time.FixedZone("Lima", -5*3600)
	at := func(hhmm string) time.Time {
		t, _ := time.ParseInLocation("2006-01-02 15:04", "2026-10-17 "+hhmm, lima)
		return t
	}
	if due, _ := PayoutDue(at("22:59"), lima, 23, 0, ""); due {
		t.Fatal("antes de la hora no toca")
	}
	due, today := PayoutDue(at("23:00"), lima, 23, 0, "")
	if !due || today != "2026-10-17" {
		t.Fatalf("a la hora toca: %v %s", due, today)
	}
	if due, _ := PayoutDue(at("23:30"), lima, 23, 0, "2026-10-17"); due {
		t.Fatal("una sola vez por día")
	}
	// La hora se compara en Lima aunque el servidor esté en UTC (23:00 Lima = 04:00 UTC del día siguiente).
	if due, today := PayoutDue(at("23:05").UTC(), lima, 23, 0, "2026-10-16"); !due || today != "2026-10-17" {
		t.Fatalf("debía usar la fecha de Lima: %v %s", due, today)
	}
	for _, c := range []struct {
		in      string
		enabled bool
		bad     bool
	}{{"23:00", true, false}, {"", false, false}, {"7:5", false, true}, {"25:00", false, true}} {
		_, _, enabled, err := ParsePayoutAt(c.in)
		if enabled != c.enabled || (err != nil) != c.bad {
			t.Errorf("%q: enabled=%v err=%v", c.in, enabled, err)
		}
	}
}

func TestConciliarUnRetiroTrabadoLoCierraPagadoSinPagarDosVeces(t *testing.T) {
	orch, core, wallet := payoutWorld()
	// El dinero salió pero el core no pudo cerrar el retiro: queda pendiente.
	core.failSettl = true
	if _, err := orch.Payout(context.Background(), "carlos", "manual"); err != nil {
		t.Fatal(err)
	}
	core.failSettl = false
	settled, failed, pending := orch.ReconcilePayouts(context.Background())
	if settled != 1 || failed != 0 || pending != 0 || core.pending["carlos"] != "" || core.balance["carlos"] != 0 {
		t.Fatalf("debía cerrarse pagado: %d %d %d %v", settled, failed, pending, core.pending)
	}
	// Se reintentó la misma referencia: PagaYa devolvió la misma transferencia, una sola vez pagada.
	if wallet.calls != 2 || len(wallet.sent) != 1 || wallet.sent["po_1"] != 1234 {
		t.Fatalf("la transferencia debía ser una sola: llamadas %d, enviadas %v", wallet.calls, wallet.sent)
	}
	if last := core.settled[len(core.settled)-1]; last.Status != "paid" || last.TransferID != "tr_po_1" {
		t.Fatalf("cierre inesperado: %+v", last)
	}
}

func TestConciliarConDestinoInvalidoLoCierraFallido(t *testing.T) {
	orch, core, wallet := payoutWorld()
	core.failSettl = true
	_, _ = orch.Payout(context.Background(), "carlos", "manual")
	core.failSettl = false
	wallet.err = pagaya.ErrInvalidDestination
	settled, failed, pending := orch.ReconcilePayouts(context.Background())
	last := core.settled[len(core.settled)-1]
	if settled != 0 || failed != 1 || pending != 0 || last.Status != "failed" || last.FailureReason != "Número de PagaYa inválido" {
		t.Fatalf("debía cerrarse fallido: %d %d %d %+v", settled, failed, pending, last)
	}
	if core.pending["carlos"] != "" {
		t.Fatal("el retiro fallido ya no debe quedar pendiente")
	}
}

func TestConciliarConPagaYaCaidoLoDejaPendiente(t *testing.T) {
	orch, core, wallet := payoutWorld()
	core.failSettl = true
	_, _ = orch.Payout(context.Background(), "carlos", "manual")
	core.failSettl = false
	before := len(core.settled)
	wallet.err = errors.New("caído")
	settled, failed, pending := orch.ReconcilePayouts(context.Background())
	if settled != 0 || failed != 0 || pending != 1 || core.pending["carlos"] == "" || len(core.settled) != before {
		t.Fatalf("debía seguir pendiente sin cerrarse: %d %d %d %v", settled, failed, pending, core.pending)
	}
	// Cuando PagaYa vuelve, la próxima conciliación lo cierra.
	wallet.err = nil
	if settled, _, _ := orch.ReconcilePayouts(context.Background()); settled != 1 {
		t.Fatalf("la siguiente conciliación debía cerrarlo, cerró %d", settled)
	}
}

func TestElRetiroAutomaticoConciliaPrimero(t *testing.T) {
	orch, core, _ := payoutWorld()
	core.failSettl = true
	_, _ = orch.Payout(context.Background(), "carlos", "manual") // queda pendiente
	core.failSettl = false
	core.balance["carlos"] = 0 // ya se le pagó; el retiro solo falta cerrarlo
	paid, _ := orch.RunAutoPayouts(context.Background())
	if core.pending["carlos"] != "" || paid != 1 { // Lucía cobra en el automático
		t.Fatalf("el automático debía conciliar a Carlos y pagar a Lucía: pagados %d, pendientes %v", paid, core.pending)
	}
}

func TestHTTPCoreRetirosTrabadosYMensajeDel409(t *testing.T) {
	var gotURI string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotURI = r.URL.RequestURI()
		if r.URL.Path == "/api/internal/drivers/u_1/payouts" {
			w.WriteHeader(http.StatusConflict)
			_, _ = io.WriteString(w, `{"statusCode":409,"error":"conflict","message":"No tienes saldo para retirar"}`)
			return
		}
		_, _ = io.WriteString(w, `[{"payoutId":"po_1","amountCents":500,"destination":"987654321"}]`)
	}))
	t.Cleanup(srv.Close)
	base, _ := url.Parse(srv.URL)
	core := HTTPCore{BaseURL: base, Token: "t", HTTP: srv.Client()}
	stuck, err := core.StuckPayouts(context.Background(), 10)
	if err != nil || gotURI != "/api/internal/payouts/stuck?olderThanMinutes=10" || len(stuck) != 1 || stuck[0].PayoutID != "po_1" {
		t.Fatalf("consulta inesperada: %q %+v %v", gotURI, stuck, err)
	}
	_, err = core.ReservePayout(context.Background(), "u_1", "manual")
	var conflict *ConflictError
	if !errors.As(err, &conflict) || conflict.Message != "No tienes saldo para retirar" || !errors.Is(err, ErrConflict) {
		t.Fatalf("el 409 debía traer el mensaje del core: %v", err)
	}
}

// Las tiendas cobran por el mismo camino que los repartidores, con su propio saldo y su propio concepto.
func storePayoutWorld() (*Orchestrator, *fakePayoutCore, *fakePayoutCore, *fakeWallet) {
	orch, drivers, wallet := payoutWorld()
	stores := &fakePayoutCore{
		balance: map[string]int{"elena": 45000, "sinsaldo": 0},
		phone:   map[string]string{"elena": "955111222", "sinsaldo": "955333444"},
		pending: map[string]string{},
		prefix:  "sp_",
	}
	orch.StorePayouts = stores
	return orch, drivers, stores, wallet
}

func TestLaTiendaRetiraSusVentasPorSuPropioCamino(t *testing.T) {
	orch, drivers, stores, wallet := storePayoutWorld()
	payout, err := orch.StorePayout(context.Background(), "elena", "manual")
	if err != nil || payout.Status != "paid" || payout.AmountCents != 45000 {
		t.Fatalf("retiro de tienda inesperado: %+v %v", payout, err)
	}
	if stores.balance["elena"] != 0 || drivers.balance["carlos"] != 1234 || wallet.sent["sp_1"] != 45000 {
		t.Fatalf("solo debía moverse el saldo de la tienda: %v %v", stores.balance, drivers.balance)
	}
	// Quien no tiene tienda recibe su propio mensaje, no el de los repartidores.
	_, err = orch.StorePayout(context.Background(), "nadie", "manual")
	var apiErr *Error
	if !errors.As(err, &apiErr) || apiErr.Status != http.StatusNotFound || apiErr.Message != "Tu cuenta no tiene una tienda en Parla" {
		t.Fatalf("mensaje de «sin tienda» inesperado: %v", err)
	}
}

func TestSinRetirosDeTiendasEncendidosNoHayNada(t *testing.T) {
	orch, _, _ := payoutWorld()
	if _, err := orch.StorePayout(context.Background(), "elena", "manual"); err == nil {
		t.Fatal("con los retiros de tiendas apagados debía avisar que no están disponibles")
	}
}

func TestElRetiroAutomaticoPagaTambienALasTiendasConSaldo(t *testing.T) {
	orch, _, stores, wallet := storePayoutWorld()
	paid, failed := orch.RunAutoPayouts(context.Background())
	// Dos repartidores con saldo y una tienda con saldo; la tienda sin saldo no cobra.
	if paid != 3 || failed != 0 || len(wallet.sent) != 3 || stores.balance["elena"] != 0 {
		t.Fatalf("debía pagar a 2 repartidores y a 1 tienda: pagados %d, fallidos %d, %v", paid, failed, wallet.sent)
	}
}

func TestHTTPCoreDeTiendasUsaSusRutas(t *testing.T) {
	var uris []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		uris = append(uris, r.Method+" "+r.URL.RequestURI())
		_, _ = io.WriteString(w, `{"payoutId":"sp_1","amountCents":500,"destination":"987654321","status":"paid"}`)
	}))
	t.Cleanup(srv.Close)
	base, _ := url.Parse(srv.URL)
	core := StorePayoutCore{HTTPCore{BaseURL: base, Token: "t", HTTP: srv.Client()}}
	ctx := context.Background()
	_, _ = core.ReservePayout(ctx, "u_1", "manual")
	_, _ = core.SettlePayout(ctx, "sp_1", services.PayoutSettle{Status: "paid", TransferID: "tr_1"})
	_, _ = core.StuckPayouts(ctx, 10)
	want := []string{
		"POST /api/internal/businesses/u_1/payouts",
		"PATCH /api/internal/store-payouts/sp_1",
		"GET /api/internal/store-payouts/stuck?olderThanMinutes=10",
	}
	for i, w := range want {
		if i >= len(uris) || uris[i] != w {
			t.Fatalf("rutas inesperadas: %v", uris)
		}
	}
}
