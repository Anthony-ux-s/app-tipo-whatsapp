// Package translators define el contrato de los traductores de datos del gateway.
//
// Cada app detrás del gateway tiene un traductor (capa anticorrupción): recibe lo que manda el
// navegador, lo valida contra el contrato de esa app y entrega un payload limpio —solo los campos
// conocidos, con tipos y tamaños correctos— al backend correspondiente. Si algún día una app la
// mantiene otro equipo, su traductor puede salir a un servicio aparte sin cambiar este contrato.
package translators

import "errors"

// ErrRejected: el evento no es válido para esta app y no se reenvía.
var ErrRejected = errors.New("evento rechazado por el traductor")

// Event es un evento ya limpio, listo para el backend.
type Event struct {
	Type string
	// Data es el payload normalizado (se serializa tal cual hacia el backend).
	Data any
	// Ref, si viene, pide respuesta (ack) al navegador.
	Ref string
}

// Translator valida y normaliza los eventos entrantes de una app.
type Translator interface {
	// Name identifica la app (p. ej. "chat").
	Name() string
	// Inbound traduce un marco del navegador {"t","d","ref"} a un evento limpio.
	Inbound(raw []byte) (Event, error)
}
