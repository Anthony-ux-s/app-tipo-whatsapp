# Seguridad de Parla — chats, arquitectura de servicios y Servicios (pedidos y pagos)

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
| Verificación por SMS/correo | Códigos de 6 cifras con azar criptográfico, guardados solo como HMAC; 10 min, 5 intentos, 1 envío/min y 5/h por destino + límite por IP; comprobante de un solo uso para registrarse o restablecer; «olvidé mi contraseña» responde igual exista o no el correo | `kernel/verification-rules.ts`, `identity/verification` | Pruebas unitarias + E2E |
| Fotos de perfil | Solo JPEG verificado por su contenido, ≤ 300 KB, nombre impredecible, `nosniff`; el navegador quita EXIF/GPS | `avatar.use-case.ts`, `shared/utils/image.ts` | Pruebas unitarias + E2E |
| Contactos | Los números se cruzan y se descartan (no se guardan); máximo 2000 por consulta y 10 consultas/min | `match-contacts.use-case.ts` | Pruebas unitarias + E2E |
| Contraseñas | bcrypt; mismo mensaje y mismo tiempo para cuenta inexistente o contraseña errónea | `identity/auth` | Pruebas unitarias |
| Sesiones | JWT; en producción el secreto debe ser propio y de 32+ caracteres o la API no arranca | `config/env.validation.ts` | Arranque manual con el secreto de desarrollo |
| Fuerza bruta | 10 intentos/min por IP **y** cuenta en inicio de sesión y registro; 600/min por IP en el resto | `http/account-throttler.guard.ts` | E2E (se observó el bloqueo al repetir la suite) |
| Autorización | Participación en el chat en cada caso de uso; 404 en vez de 403 para no revelar recursos ajenos; en grupos, solo quien lo creó agrega personas; cada persona ve solo sus pedidos | casos de uso | Pruebas unitarias y E2E de permisos |
| Validación | DTOs con class-validator (`whitelist`), límites de tamaño (archivos 25 MB, tramas WebSocket 64 KB, SDP 100 KB) | `dto/`, gateway, tiempo real | Pruebas unitarias |
| Precios de los pedidos | El navegador solo manda productos y cantidades; el gateway recotiza con la tienda al cotizar y al crear, y el core verifica que líneas, subtotal y total cuadren | `internal/orders`, `kernel/order-rules.ts` | Pruebas de Go y del core + E2E que manda precios manipulados |
| Avisos de pago y delivery | Webhooks con firma HMAC-SHA256 por proveedor (comparación en tiempo constante), límite de tamaño; firma inválida → 401 | `internal/webhook`, traductores | Pruebas de Go con firmas falsificadas |
| Idempotencia de pedidos | Comparar y cambiar atómico (`expectStatus`) y estados que nunca retroceden: un pago repetido no despacha dos deliveries | `orders.use-cases.ts`, orquestador | Pruebas del core y de Go |
| Cabeceras | helmet: CSP estricta (sin scripts en línea), HSTS, `nosniff`, `frame-ancestors 'none'`, `Permissions-Policy` | `http/web-hosting.ts` | `curl` contra el modo producción + E2E completo con la CSP activa |
| Datos personales | Términos versionados (incluyen qué se comparte con la tienda, el delivery y la billetera), exportación, eliminación con anonimización y borrado del historial de pedidos | `identity/auth` | Pruebas unitarias + E2E |
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
   responsables y fechas de tareas, duración de llamadas, y los pedidos (productos, montos, dirección). Necesarios para el servicio; declarados en la
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
9. **Directorio abierto**: como en WhatsApp, cualquier cuenta puede buscar a otra por nombre, usuario o
   teléfono y escribirle. Pendiente: bloquear y reportar contactos, y limitar búsquedas por teléfono.
10. **Proveedores simulados**: la billetera y el delivery son simuladores locales. Al conectar
    proveedores reales hay que usar sus secretos de firma, consultar el estado del pago en su API antes
    de despachar y revisar sus términos de datos personales.
11. **Pedido a medias**: si guardar el pedido falla después de reservar en la tienda y crear el cobro,
    no se deshace automáticamente (en producción: saga con compensaciones o cola con reintentos).
12. **Recuperación por correo**: quien controle el correo de alguien puede restablecer su contraseña.
    Mitigación: el historial no vuelve solo; cada contacto ve «restableció su cuenta» y decide si le
    comparte el chat. Pendiente: avisar por SMS al número verificado cuando se restablece.
13. **SMS pumping**: alguien podría pedir códigos para muchos números y generar costos. Mitigación:
    límites por número y por IP. Pendiente para producción: CAPTCHA y lista de países permitidos.
14. **Directorio por teléfono**: saber si un número usa Parla es inherente al registro por teléfono
    (igual que en WhatsApp). Pendiente: limitar el cruce de contactos por cuenta y por día.
