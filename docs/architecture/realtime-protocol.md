# Protocolo de tiempo real (navegador ↔ gateway Go ↔ realtime Elixir ↔ core)

Fuente única del contrato entre los tres lenguajes del sistema. Los nombres de eventos y la forma
de cada payload son los de `packages/types/src/contracts/realtime.types.ts`.

```
Navegador ──/ws (JWT)──► Gateway Go ══ 1 WebSocket multiplexado (/link) ══► Realtime Elixir
                            │  traductor del chat: valida, limpia,             │  conexiones, presencia,
                            │  añade el usuario autenticado                    │  "escribiendo", llamadas
                            └──/api (HTTP)──► Core NestJS ◄──/api/internal──────┘
                                              (dominio)     ──/internal/publish──►
```

## 1. Navegador ↔ gateway (`GET /ws?token=<JWT>`)

Marcos JSON de texto, máximo 64 KB.

| Dirección | Forma | Uso |
| --- | --- | --- |
| cliente → gateway | `{"t": "<evento>", "d": {…}, "ref": "r12"}` | `ref` opcional: pide respuesta |
| gateway → cliente | `{"t": "<evento>", "d": {…}}` | eventos del servidor |
| gateway → cliente | `{"t": "ack", "ref": "r12", "d": {…}}` | respuesta a un `ref` |

Eventos que acepta el traductor del chat (todo lo demás se descarta):

| `t` | `d` | Respuesta |
| --- | --- | --- |
| `typing` | `{conversationId, isTyping}` | — |
| `call:start` | `{conversationId, kind: "audio"\|"video"}` | `CallAck` |
| `call:join` | `{callId}` | `CallAck` |
| `call:decline` / `call:leave` | `{callId}` | — |
| `call:signal` | `{callId, to, data: SignalData}` | — |

El gateway rechaza el upgrade con 401 si el JWT no es válido y cierra con código 4401 si caduca.

## 2. Gateway ↔ realtime (`GET /link`, cabecera `x-internal-token`)

Una sola conexión por instancia del gateway; cada navegador es una conexión virtual (`conn`).

| Dirección | Marco |
| --- | --- |
| gateway → realtime | `{"op":"open","conn":"c1","user":"u1"}` |
| gateway → realtime | `{"op":"close","conn":"c1"}` |
| gateway → realtime | `{"op":"event","conn":"c1","user":"u1","t":"typing","d":{…},"ref":"r1"}` |
| realtime → gateway | `{"op":"deliver","conns":["c1","c2"],"t":"message:new","d":{…}}` |
| realtime → gateway | `{"op":"ack","conn":"c1","ref":"r1","d":{…}}` |

Si el enlace se cae, el gateway cierra las conexiones de sus navegadores (que se reconectan solos)
y el realtime da por cerradas todas las conexiones de ese enlace.

## 3. Core → realtime (`POST /internal/publish`, cabecera `x-internal-token`)

```json
{ "users": ["u1", "u2"], "event": "message:new", "data": { … } }
```

Entrega el evento a todas las conexiones de esas personas. Responde `202`.

## 4. Realtime → core (`/api/internal/*`, cabecera `x-internal-token`)

| Método y ruta | Cuerpo / respuesta | Para qué |
| --- | --- | --- |
| `POST /api/internal/presence` | `{userId, presence, at}` | En línea / desconectado (el core avisa a los contactos y marca lo pendiente como entregado) |
| `GET /api/internal/conversations/:id/context?userId=` | `{conversationId, kind, title, participants:[{id,name}], maxCallParticipants}` o 404 | Autorizar "escribiendo" y llamadas |
| `POST /api/internal/calls/log` | `{conversationId, actorId, text, audience}` | Aviso en el chat al terminar una llamada |
| `POST /api/internal/calls/notify` | `{conversationId, callerId, callId, kind, recipients}` | Push de llamada entrante a quien está desconectado |

Las rutas `/api/internal/*` no son accesibles desde fuera: el gateway responde 404.
