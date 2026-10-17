// Package ratelimit implementa un límite de peticiones por clave (IP) con cubetas de fichas.
package ratelimit

import (
	"sync"
	"time"
)

type bucket struct {
	tokens float64
	last   time.Time
}

// Limiter permite `perMinute` peticiones por clave, con ráfagas de hasta ese mismo número.
type Limiter struct {
	mu        sync.Mutex
	perMinute float64
	buckets   map[string]*bucket
	now       func() time.Time
}

func New(perMinute int) *Limiter {
	return &Limiter{perMinute: float64(perMinute), buckets: map[string]*bucket{}, now: time.Now}
}

// Allow descuenta una ficha y dice si la petición puede pasar.
func (l *Limiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	b, ok := l.buckets[key]
	if !ok {
		b = &bucket{tokens: l.perMinute, last: now}
		l.buckets[key] = b
	}
	b.tokens = min(l.perMinute, b.tokens+now.Sub(b.last).Minutes()*l.perMinute)
	b.last = now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

// Sweep borra las claves inactivas (llamarlo periódicamente para no crecer sin límite).
func (l *Limiter) Sweep(idle time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	cutoff := l.now().Add(-idle)
	for key, b := range l.buckets {
		if b.last.Before(cutoff) {
			delete(l.buckets, key)
		}
	}
}
