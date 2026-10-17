package rapidito

import (
	"context"
	"math"

	"github.com/parla/gateway/internal/services"
)

// Tariff: la tarifa propia de Rapidito (la flota es de Parla, así que no hace falta un proveedor
// externo): base + por km recorrido (línea recta × factor de calles), redondeado a 10 céntimos y
// entre un mínimo y un máximo. Sin coordenadas, una tarifa plana.
type Tariff struct {
	BaseCents    int
	PerKmCents   int
	MinCents     int
	MaxCents     int
	FlatCents    int
	StreetFactor float64
}

// DefaultTariff: S/ 3.50 + S/ 1.00 por km, entre S/ 4 y S/ 25; sin mapa, S/ 6.50.
var DefaultTariff = Tariff{BaseCents: 350, PerKmCents: 100, MinCents: 400, MaxCents: 2500, FlatCents: 650, StreetFactor: 1.35}

// Local cotiza con la tarifa propia, en el gateway.
type Local struct{ Tariff Tariff }

func (l Local) Quote(_ context.Context, pickup *services.GeoPoint, address services.Address) (Quote, error) {
	t := l.Tariff
	if t.StreetFactor == 0 {
		t = DefaultTariff
	}
	if pickup == nil || address.Location == nil {
		return Quote{ID: "local_flat", FeeCents: t.FlatCents, ETAMinutes: 30}, nil
	}
	km := haversineKm(pickup.Lat, pickup.Lng, address.Location.Lat, address.Location.Lng) * t.StreetFactor
	fee := int(math.Round((float64(t.BaseCents)+float64(t.PerKmCents)*km)/10)) * 10
	fee = max(t.MinCents, min(t.MaxCents, fee))
	rounded := math.Round(km*10) / 10
	return Quote{ID: "local_km", FeeCents: fee, ETAMinutes: int(math.Round(10 + km*3)), DistanceKm: &rounded}, nil
}

func haversineKm(lat1, lng1, lat2, lng2 float64) float64 {
	rad := func(d float64) float64 { return d * math.Pi / 180 }
	dLat, dLng := rad(lat2-lat1), rad(lng2-lng1)
	h := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(rad(lat1))*math.Cos(rad(lat2))*math.Sin(dLng/2)*math.Sin(dLng/2)
	return 6371 * 2 * math.Asin(math.Sqrt(h))
}
