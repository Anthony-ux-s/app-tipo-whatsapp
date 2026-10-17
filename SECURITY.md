# Seguridad de Parla — revisión de la Fase 4 y de la arquitectura de servicios

Resumen de los controles que tiene la aplicación, cómo se verificaron y los riesgos conocidos.
No reemplaza una auditoría externa ni la revisión legal de un abogado.

## Controles

| Área | Control | Dónde | Verificado con |
| --- | --- | --- | --- |
| Cifrado de mensajes | E2E con WebCrypto: ECDH P-256 + HKDF + AES-GCM 256 por conversación | `packages/crypto` | Pruebas unitarias + E2E que comprueba que la API nunca devuelve texto en claro |
| Archivos y tareas | Fotos, audio, video y títulos de tareas cifrados en el navegador | web `chat.store` | E2E de fotos/notas de voz y tareas |
| Llamadas | WebRTC P2P con DTLS-SRTP; el servidor solo reenvía la señalización entre personas que están en la llamada | `services/realtime` (un proceso por llamada) | Pruebas de Elixir + E2E de videollamada |
| Puerta única | El gateway (Go) es lo único expuesto: valida el JWT (solo HS256, con vencimiento; cierra el WebSocket con 4401 al vencer), limita peticiones por IP y responde 404 a `/api/internal/*` | `services/gateway` | Pruebas de Go + `curl` contra el entorno arrancado |
| Traductores | Lista blanca de eventos, IDs y tamaños validados, campos desconocidos descartados; el usuario sale del token y nunca del mensaje | `services/gateway/internal/translators` | Pruebas de Go |
| Entre servicios | `INTERNAL_TOKEN` en el enlace gateway↔Elixir y en las rutas internas del core y de Elixir; en producción ningún servicio arranca con el token de desarrollo | `http/internal-token.guard.ts`, `router.ex`, `config.go` | Pruebas + `curl` sin token (401) |
| Contraseñas | bcrypt; mismo mensaje y mismo tiempo para cuenta inexistente o contraseña errónea | `identity/auth` | Pruebas unitarias |
| Sesiones | JWT; en producción el secreto debe ser propio y de 32+ caracteres o la API no arranca | `config/env.validation.ts` | Arranque manual con el secreto de desarrollo |
| Fuerza bruta | 10 intentos/min por IP **y** cuenta en inicio de sesión y registro; 600/min por IP en el resto | `http/account-throttler.guard.ts` | E2E (se observó el bloqueo al repetir la suite) |
| Autorización | Pertenencia al espacio/chat en cada caso de uso; 404 en vez de 403 para no revelar recursos ajenos; solo administradores pagan y gestionan | casos de uso | Pruebas unitarias y E2E de permisos |
| Validación | DTOs con class-validator (`whitelist`), límites de tamaño (archivos 25 MB, tramas WebSocket 64 KB, SDP 100 KB) | `dto/`, gateway, tiempo real | Pruebas unitarias |
| Pagos | Nunca se confía en el webhook: se verifica la firma y se consulta el pago en MercadoPago; idempotente; el importe debe coincidir | `platform/billing`, `infra/payments` | Pruebas con red simulada |
| Cabeceras | helmet: CSP estricta (sin scripts en línea), HSTS, `nosniff`, `frame-ancestors 'none'`, `Permissions-Policy` | `http/web-hosting.ts` | `curl` contra el modo producción + E2E completo con la CSP activa |
| Datos personales | Términos versionados, exportación, eliminación con anonimización | `identity/auth` | Pruebas unitarias + E2E |
| Notificaciones push | VAPID; los avisos no llevan contenido (solo «Laura te mencionó») | `infra/push` | Pruebas unitarias |

## Riesgos conocidos y mitigación prevista

1. **Confianza en el servidor para las claves públicas**: un servidor comprometido podría entregar una
   clave pública falsa (ataque de intermediario). Mitigación actual: huella de seguridad visible en la
   info del contacto. Pendiente: avisos cuando cambia la clave de alguien.
2. **Clave privada en `localStorage`**: un XSS podría leerla. Mitigación: CSP estricta sin scripts en
   línea. Pendiente: guardarla como `CryptoKey` no extraíble en IndexedDB.
3. **Sin rotación de clave de grupo** al sacar a alguien: puede seguir leyendo mensajes nuevos si
   obtiene el texto cifrado. Pendiente: rotar y re-envolver la clave al salir un miembro.
4. **Metadatos visibles para el servidor**: quién habla con quién, cuándo, a quién se menciona,
   responsables y fechas de tareas, duración de llamadas. Necesarios para el servicio; declarados en la
   política de privacidad.
5. **Llamadas sin TURN**: en redes restrictivas pueden no conectar; si se agrega TURN, el relé ve
   tráfico cifrado (no el contenido).
6. **Estado en memoria** (presencia en el core, límite de intentos en core y gateway): con varias
   instancias habría que moverlo a Redis; las llamadas y conexiones de Elixir se reparten con un clúster OTP.
7. **Dependencias**: `npm audit` reporta avisos en dependencias de terceros (sobre todo de
   desarrollo); revisar antes de publicar.
8. **Token entre servicios único**: si se filtra, permite hablar con las rutas internas desde dentro de
   la red. Mitigación: esas rutas no se publican (solo el gateway tiene puerto); pendiente: mTLS o
   tokens por servicio con rotación.
