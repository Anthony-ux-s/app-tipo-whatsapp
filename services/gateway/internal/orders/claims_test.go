package orders

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"testing"

	"github.com/parla/gateway/internal/services"
	"github.com/parla/gateway/internal/translators/pagaya"
)

// fakeClaims imita el core: soporte = "admin"; el reclamo cl_1 está abierto con S/ 10 por devolver.
type fakeClaims struct {
	reserved  []int
	settled   []services.ClaimRefundSettle
	settleErr error
}

func (f *fakeClaims) ReserveClaimRefund(_ context.Context, claimID, adminUserID string, amountCents int) (services.ClaimRefundReservation, error) {
	switch {
	case adminUserID != "admin":
		return services.ClaimRefundReservation{}, &CoreError{Status: http.StatusForbidden, Message: "Solo soporte puede aprobar reclamos"}
	case claimID != "cl_1":
		return services.ClaimRefundReservation{}, ErrNotFound
	case amountCents > 1000:
		return services.ClaimRefundReservation{}, &ConflictError{Message: "El monto pasa lo que queda por devolver (S/ 10.00)"}
	}
	f.reserved = append(f.reserved, amountCents)
	return services.ClaimRefundReservation{RefundRef: "rf_1", ChargeID: "cob_1", AmountCents: amountCents}, nil
}

func (f *fakeClaims) SettleClaimRefund(_ context.Context, _ string, settle services.ClaimRefundSettle) (json.RawMessage, error) {
	f.settled = append(f.settled, settle)
	if f.settleErr != nil && settle.Status == "refunded" {
		return nil, f.settleErr
	}
	return json.RawMessage(`{"id":"cl_1","status":"` + settle.Status + `"}`), nil
}

// fakeRefunds imita PagaYa: idempotente por referencia; fail = no responde; exceeds = pasa lo cobrado.
type fakeRefunds struct {
	byRef   map[string]int
	calls   int
	fail    bool
	exceeds bool
}

func (f *fakeRefunds) RefundPartial(_ context.Context, chargeID, reference string, amountCents int) (string, error) {
	f.calls++
	switch {
	case f.fail:
		return "", errors.New("billetera caída")
	case f.exceeds:
		return "", pagaya.ErrExceedsCharge
	}
	if f.byRef == nil {
		f.byRef = map[string]int{}
	}
	if _, ok := f.byRef[reference]; !ok {
		f.byRef[reference] = amountCents
	}
	return "dv_" + reference, nil
}

func claimsWorld() (*Orchestrator, *fakeClaims, *fakeRefunds) {
	claims, refunds := &fakeClaims{}, &fakeRefunds{}
	return &Orchestrator{Claims: claims, Refunds: refunds}, claims, refunds
}

func TestReclamoAprobadoDevuelveEnPagaYaYCierraEnElCore(t *testing.T) {
	o, claims, refunds := claimsWorld()
	claim, err := o.RefundClaim(context.Background(), "admin", "cl_1", 550)
	if err != nil || string(claim) != `{"id":"cl_1","status":"refunded"}` {
		t.Fatalf("devolución del reclamo: %s %v", claim, err)
	}
	if refunds.byRef["rf_1"] != 550 || len(claims.settled) != 1 || claims.settled[0].ProviderRefundID != "dv_rf_1" {
		t.Fatalf("debía devolver S/ 5.50 con la referencia del core y cerrarlo: %+v %+v", refunds.byRef, claims.settled)
	}
}

func TestReclamoConPagaYaCaidoQuedaAbiertoYAvisa(t *testing.T) {
	o, claims, refunds := claimsWorld()
	refunds.fail = true
	_, err := o.RefundClaim(context.Background(), "admin", "cl_1", 550)
	if status(err) != http.StatusBadGateway || len(claims.settled) != 1 || claims.settled[0].Status != "failed" {
		t.Fatalf("PagaYa caído: %v %+v", err, claims.settled)
	}
}

func TestReclamoQuePasaLoCobradoEn409(t *testing.T) {
	o, claims, refunds := claimsWorld()
	refunds.exceeds = true
	_, err := o.RefundClaim(context.Background(), "admin", "cl_1", 900)
	var e *Error
	if !errors.As(err, &e) || e.Status != http.StatusConflict || e.Message != "El monto supera lo que queda por devolver de este pedido." || claims.settled[0].Status != "failed" {
		t.Fatalf("excede: %v %+v", err, claims.settled)
	}
}

func TestReclamoPasaLosErroresDelCoreConSuMensaje(t *testing.T) {
	o, _, refunds := claimsWorld()
	cases := []struct {
		admin, claim string
		amount       int
		status       int
		message      string
	}{
		{"cliente", "cl_1", 100, http.StatusForbidden, "Solo soporte puede aprobar reclamos"},
		{"admin", "cl_x", 100, http.StatusNotFound, "Reclamo no encontrado"},
		{"admin", "cl_1", 5000, http.StatusConflict, "El monto pasa lo que queda por devolver (S/ 10.00)"},
		{"admin", "cl_1", 0, http.StatusBadRequest, "El monto a devolver debe estar entre S/ 0.01 y S/ 10 000"},
	}
	for _, c := range cases {
		_, err := o.RefundClaim(context.Background(), c.admin, c.claim, c.amount)
		var e *Error
		if !errors.As(err, &e) || e.Status != c.status || e.Message != c.message {
			t.Errorf("%+v: obtuve %v", c, err)
		}
	}
	if refunds.calls != 0 {
		t.Fatalf("sin reserva no se toca la billetera: %d llamadas", refunds.calls)
	}
}

func TestSiFallaElCierreTrasDevolverReintentarNoDevuelveDosVeces(t *testing.T) {
	o, claims, refunds := claimsWorld()
	claims.settleErr = errors.New("core caído")
	_, err := o.RefundClaim(context.Background(), "admin", "cl_1", 550)
	var e *Error
	if !errors.As(err, &e) || e.Status != http.StatusBadGateway || e.Message != "Devolución hecha; reintenta para confirmarla" {
		t.Fatalf("cierre fallido: %v", err)
	}
	// El core devuelve la misma referencia pendiente y PagaYa la misma devolución.
	claims.settleErr = nil
	if _, err := o.RefundClaim(context.Background(), "admin", "cl_1", 550); err != nil {
		t.Fatal(err)
	}
	if len(refunds.byRef) != 1 || refunds.byRef["rf_1"] != 550 {
		t.Fatalf("solo una devolución por referencia: %+v", refunds.byRef)
	}
}
