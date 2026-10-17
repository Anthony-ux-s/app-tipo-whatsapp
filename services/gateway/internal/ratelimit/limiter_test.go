package ratelimit

import (
	"testing"
	"time"
)

func TestLimiterPermiteRafagaYRecuperaConElTiempo(t *testing.T) {
	now := time.Unix(0, 0)
	l := New(3)
	l.now = func() time.Time { return now }

	for i := 0; i < 3; i++ {
		if !l.Allow("1.1.1.1") {
			t.Fatalf("la petición %d debía pasar", i+1)
		}
	}
	if l.Allow("1.1.1.1") {
		t.Fatal("la cuarta petición en el mismo instante debía bloquearse")
	}
	if !l.Allow("2.2.2.2") {
		t.Fatal("otra IP tiene su propio límite")
	}
	now = now.Add(20 * time.Second) // 3 por minuto = una ficha cada 20 s
	if !l.Allow("1.1.1.1") {
		t.Fatal("tras 20 s debía haber una ficha nueva")
	}
}

func TestSweepBorraClavesInactivas(t *testing.T) {
	now := time.Unix(0, 0)
	l := New(10)
	l.now = func() time.Time { return now }
	l.Allow("a")
	now = now.Add(time.Hour)
	l.Sweep(10 * time.Minute)
	if len(l.buckets) != 0 {
		t.Fatalf("esperaba 0 claves, hay %d", len(l.buckets))
	}
}
