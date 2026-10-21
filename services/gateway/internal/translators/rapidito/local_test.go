package rapidito

import (
	"context"
	"testing"

	"github.com/parla/gateway/internal/services"
)

func TestLaTarifaPropiaVaPorDistanciaConTopes(t *testing.T) {
	l := Local{Tariff: DefaultTariff}
	store := &services.GeoPoint{Lat: -12.1268, Lng: -77.0195}
	near := services.Address{Line: "x", Location: &services.GeoPoint{Lat: -12.1191, Lng: -77.0349}}
	q, _ := l.Quote(context.Background(), store, near)
	if q.DistanceKm == nil || *q.DistanceKm < 2 || *q.DistanceKm > 3 || q.FeeCents < 550 || q.FeeCents > 650 || q.FeeCents%10 != 0 {
		t.Fatalf("a ~2.5 km: %+v %v", q, *q.DistanceKm)
	}
	same, _ := l.Quote(context.Background(), store, services.Address{Location: store})
	if same.FeeCents != 400 {
		t.Fatalf("mínimo S/ 4: %+v", same)
	}
	far, _ := l.Quote(context.Background(), store, services.Address{Location: &services.GeoPoint{Lat: -11.5, Lng: -77.0}})
	if far.FeeCents != 2500 {
		t.Fatalf("máximo S/ 25: %+v", far)
	}
	flat, _ := l.Quote(context.Background(), nil, near)
	if flat.FeeCents != 650 || flat.DistanceKm != nil {
		t.Fatalf("sin tienda, tarifa plana: %+v", flat)
	}
}
