# Investigación: una app tipo whatsapp

## Resumen
Conviene construir una plataforma de mensajería y colaboración interna enfocada en equipos de trabajo y nichos desatendidos, evitando competir de manera directa en el chat personal masivo dominado por WhatsApp. El sistema está dirigido a pequeñas y medianas empresas o grupos de proyecto que necesitan coordinar tareas y conversaciones en un mismo espacio digital. Se diferencia de las alternativas existentes al integrar de forma nativa la gestión operativa junto al chat en tiempo real, superando las limitaciones de historial y costo de plataformas tradicionales como Slack o Rock.

## Sistemas de referencia
*   **WhatsApp:** 
    *   *Qué hace bien:* Dominio absoluto del mercado con más de 3 mil millones de usuarios y facilidad de uso masivo.
    *   *Qué critican los usuarios:* Mezcla la vida personal con la laboral y carece de herramientas nativas robustas de productividad o gestión de tareas.
    *   *Qué tomar:* Su velocidad de entrega de mensajes y la sencillez de su interfaz móvil.
*   **Telegram:** 
    *   *Qué hace bien:* Pionero en funciones innovadoras, chats de voz y comunidades masivas de hasta 200,000 miembros.
    *   *Qué critican los usuarios:* Su privacidad por defecto es débil, ya que los chats normales y grupos solo cifran la conexión entre el usuario y el servidor, exponiendo datos.
    *   *Qué tomar:* La capacidad de almacenamiento en la nube multidispositivo.
*   **Signal:** 
    *   *Qué hace bien:* Enfoque estricto en la privacidad, sin guardar metadatos, con cifrado de extremo a extremo por defecto y uso de nombres de usuario para proteger el número telefónico.
    *   *Qué critican los usuarios:* Carece de elementos lúdicos como stickers o GIFs predeterminados y opciones avanzadas de denuncia.
    *   *Qué tomar:* Su arquitectura de cifrado de extremo a extremo.
*   **Rock:** 
    *   *Qué hace bien:* Diseñada para equipos de trabajo, integrando chat y gestión de tareas en un solo lugar.
    *   *Costo:* Plan gratuito limitado (3 espacios grupales, 5 miembros) y planes planos desde $89/mes.
    *   *Qué tomar:* El modelo de unificar chat con asignación de tareas.
*   **Slack:** 
    *   *Qué hace bien:* Integraciones avanzadas y uso de hilos para ordenar conversaciones.
    *   *Qué critican los usuarios:* Limita su plan gratuito a los últimos 90 días de historial.
    *   *Qué tomar:* La organización por hilos y canales estructurados.

## Modelo de negocio
Los competidores del mercado operan mediante diversos esquemas de monetización:
*   **Suscripciones planas:** Rock cobra desde $89/mes y Discord (Nitro) opera a $9.99/mes.
*   **Suscripciones por usuario (SaaS):** Slack cobra desde $7.25 por usuario/mes, Google Chat desde $7, Microsoft Teams desde $4, y Telegram ofrece su versión Premium por $4.99/mes.
*   **Modelo de ingresos para este proyecto:** Se adoptará un modelo freemium con un plan gratuito robusto para equipos pequeños (similar al enfoque de entrada de Chanty o Pumble) y una suscripción plana por espacio de trabajo o planes por usuario/mes para organizaciones que requieran historial ilimitado, controles administrativos avanzados y funciones de productividad integradas.

## Usuarios y recorridos
*   **Colaborador / Miembro del equipo:**
    *   *Recorrido:* Registro mediante número de teléfono o nombre de usuario único, acceso a los espacios grupales asignados, envío de mensajes de texto, fotos, vídeos o notas de voz, y consulta de tareas pendientes asociadas al chat.
*   **Administrador del espacio de trabajo:**
    *   *Recorrido:* Creación del espacio de trabajo, invitación de miembros mediante enlaces o correos, asignación de roles y permisos, y gestión de la configuración de seguridad y canales de comunicación.

## Módulos
### Primera versión
*   - Autenticación y Perfil — Registro e inicio de sesión basado en número de teléfono o nombre de usuario — Datos de contacto y credenciales de acceso.
*   - Chat Individual y Grupal — Envío y recepción en tiempo real de mensajes de texto, fotos, notas de voz y vídeos — Contenido multimedia y metadatos de mensajes.
*   - Cifrado y Seguridad — Protección de la comunicación mediante cifrado de extremo a extremo — Claves de cifrado y estado de entrega.
*   - Interfaz Multiplataforma — Visualización adaptada para dispositivos móviles Android e iOS y entornos web — Estados de conexión y preferencias de usuario.

### Después
*   Módulo de gestión y asignación de tareas integradas al chat.
*   Modos de privacidad avanzada y mensajes autodestructivos con temporizador.
*   Bandejas de entrada compartidas para atención comercial multiusuario.
*   Historial de búsqueda ilimitado y analíticas de productividad para administradores.

## Datos
Las entidades principales del sistema son:
*   **Usuario:** `id` (Clave primaria), `telefono` o `nombre_usuario`, `nombre`, `avatar`, `estado_conexion`, `fecha_creacion`.
*   **EspacioDeTrabajo:** `id` (Clave primaria), `nombre`, `creador_id` (Relación con Usuario), `fecha_creacion`.
*   **MiembroEspacio:** `id` (Clave primaria), `usuario_id` (Relación con Usuario), `espacio_id` (Relación con EspacioDeTrabajo), `rol` (Administrador o Colaborador).
*   **Conversacion / Canal:** `id` (Clave primaria), `espacio_id` (Relación con EspacioDeTrabajo), `tipo` (Individual o Grupal), `titulo`.
*   **Mensaje:** `id` (Clave primaria), `conversacion_id` (Relación con Conversacion), `remitente_id` (Relación con Usuario), `tipo_contenido` (Texto, Imagen, Audio, Video), `contenido_url_o_texto`, `fecha_envio`, `estado_entrega`.

**Estados de un Mensaje y sus transiciones:**
1.  *Enviado:* El cliente genera el mensaje y los datos se transmiten al servidor.
2.  *Entregado:* El servidor confirma la recepción en el dispositivo del destinatario.
3.  *Leído:* El usuario receptor abre la conversación y visualiza el contenido (transición final).

## Diseño
### Colores
*   **Primario:** `#008069` (Verde principal inspirado en estándares de mensajería moderna para transmitir confianza y frescura).
*   **Secundario:** `#128C7E` (Verde oscuro para barras de navegación y elementos de acento corporativo).
*   **Acento:** `#25D366` (Verde brillante interactivo para botones de llamada a la acción y notificaciones).
*   **Fondo:** `#F0F2F5` (Gris claro neutro para el fondo general del panel de chat).
*   **Texto:** `#111B21` (Gris oscuro casi negro para garantizar alta legibilidad en la lectura de mensajes).

### Tipografía
*   **Títulos:** *Plus Jakarta Sans* (Google Fonts), por su aspecto geométrico, moderno y excelente legibilidad en pantallas de alta densidad.
*   **Texto:** *Inter* (Google Fonts), optimizada para interfaces de usuario y lectura prolongada en chats y menús densos.

### Logo
*   **Forma:** Un bocadillo de diálogo estilizado que en su interior integra sutilmente un engranaje o marca de verificación minimalista.
*   **Símbolo:** Dos burbujas entrelazadas con líneas limpias.
*   **Estilo:** Minimalista, plano (*flat design*), con esquinas redondeadas y el color primario sobre fondo blanco o neutro.

### Pantallas
*   **Barra lateral (Sidebar):** Ubicada a la izquierda en escritorio; contiene en orden superior el perfil del usuario, el botón de nuevo chat/espacio, la lista de conversaciones recientes con indicador de no leídos, y los ajustes del sistema en la parte inferior.
*   **Panel principal:** Ocupa el centro y la derecha; muestra el encabezado de la conversación activa (con foto y nombre del grupo o contacto), el área central de desplazamiento con las burbujas de mensajes ordenadas cronológicamente, y la barra inferior fija de escritura con accesos directos para adjuntar archivos y enviar notas de voz.
*   **Vista en el celular:** La barra lateral actúa como pantalla principal de chats; al pulsar sobre una conversación, esta se expande ocupando el 100% de la pantalla, ocultando el menú lateral y mostrando un botón superior izquierdo para regresar a la lista general.

### Estilo
*   **Espaciados:** Basados en una retícula estricta de múltiplos de 4px (`p-2`, `p-4`, `p-6`) para mantener orden visual.
*   **Bordes:** Redondeados suaves con radios de `8px` para tarjetas y `16px` para burbujas de mensajes.
*   **Sombras:** Sutiles y difuminadas (`box-shadow: 0 1px 3px rgba(0,0,0,0.1)`) para dar sensación de profundidad flotante en menús flotantes y cabeceras.
*   **Íconos:** Iconografía de línea fina (estilo Lucide o Phosphor Icons) con trazos de 2px.
*   **Ilustraciones:** Estilo vectorial plano y minimalista para pantallas de bienvenida.
*   **Animaciones:** Transiciones rápidas de 200ms con curva *ease-in-out* para la apertura de menús y aparición de mensajes.
*   **Estados vacíos:** Ilustraciones vectoriales acompañadas de un texto claro y un botón de acción principal (ej. "¿No tienes chats aún? Inicia una nueva conversación").

## Tecnología
### Opciones comparadas

| Stack | Frontend | Backend | Base de Datos | Tiempo Real | Alojamiento | Ventajas | Desventajas |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Stack 1 (Modem Serverless)** | React / Next.js | Node.js (Express) | PostgreSQL | WebSockets (Socket.io) | Render / Supabase | Infraestructura económica al inicio, control total de la lógica de negocio. | Requiere mantenimiento manual de conexiones de sockets a escala. |
| **Stack 2 (BaaS Integrado)** | React / Vite | Supabase (Serverless) | PostgreSQL | Supabase Realtime | Vercel / Supabase | Desarrollo ultra rápido, base de datos y tiempo real nativos integrados. | Menor flexibilidad en la lógica de backend compleja a largo plazo. |

### Recomendación
Se elige el **Stack 2 (Supabase + React)** por pieza:
*   **Frontend:** React con Vite y Tailwind CSS, desplegado en Vercel, por su velocidad de renderizado y ecosistema de componentes.
*   **Backend y Base de Datos:** PostgreSQL gestionado a través de Supabase, aprovechando sus capacidades nativas de autenticación y gestión de bases de datos relacionales.
*   **Tiempo Real:** Supabase Realtime (basado en WebSockets de Postgres), ideal para la entrega instantánea de mensajes de chat sin configurar servidores de sockets externos complejos.
*   **Alojamiento:** Vercel (Frontend) y Supabase Cloud (Base de datos y Backend), ambos con generosos capas gratuitas para la fase inicial.

## Pagos y aspectos legales
*   **Pasarelas y comisiones:** Para los cobros por suscripción de los planes avanzados, se utilizará **Stripe** o **MercadoPago** (con comisiones estándar aproximadas de mercado entre 2.9% + $0.30 por transacción en tarjetas internacionales, variando según el país de Latinoamérica).
*   **Aspectos legales:** 
    *   *Protección de datos:* Cumplimiento de las normativas locales de protección de datos en Latinoamérica (como la Ley 1581 en Colombia, LGPD en Brasil o equivalentes) exigiendo consentimiento explícito para el tratamiento de datos personales.
    *   *Términos y condiciones:* Documentación legal clara sobre el uso del servicio, limitación de responsabilidad y políticas de cancelación de suscripciones.
    *   *Avisos de privacidad:* Transparencia absoluta sobre el almacenamiento y cifrado de los mensajes transmitidos en la plataforma.

## Despliegue y costos
*   **Al empezar (Gratis):** 
    *   Frontend alojado en **Vercel** (Capa gratuita: 100 GB de ancho de banda mensual).
    *   Base de datos y servicios en tiempo real en **Supabase** (Capa gratuita: hasta 500 MB de base de datos y 50,000 usuarios activos mensuales).
    *   *Costo inicial:* **$0 / mes**.
*   **Al crecer:** 
    *   Planes de pago en Supabase (desde $25/mes para bases de datos escaladas).
    *   Ampliación de recursos en Vercel (Plan Pro a $20/usuario/mes).
    *   *Costo estimado al crecer:* Entre **$45 y $100+ / mes** según el volumen de tráfico concurrente y almacenamiento multimedia.

## Riesgos
*   **Técnicos:** Saturación de conexiones simultáneas por WebSockets en momentos de alto tráfico. *Mitigación:* Utilizar los canales optimizados de Supabase Realtime y escalado horizontal de servicios backend.
*   **De seguridad:** Intercepción de mensajes o accesos no autorizados a conversaciones grupales. *Mitigación:* Implementar estrictas políticas de seguridad a nivel de filas (*Row Level Security* - RLS) en PostgreSQL y validar los tokens de autenticación en cada conexión.
*   **De negocio:** Baja adopción inicial frente a competidores consolidados. *Mitigación:* Enfocar el producto exclusivamente en nichos de productividad y gestión de equipos pequeños donde WhatsApp resulta insuficiente.

## Plan de construcción
1.  **Fase 1 (MVP Funcional):** Configuración del repositorio, autenticación de usuarios por teléfono/usuario, diseño de la base de datos en Supabase y desarrollo de la interfaz de chat en tiempo real individual y grupal.
2.  **Fase 2 (Multimedia y Pulido Visual):** Integración de envío de imágenes, notas de voz, aplicación de la paleta de colores corporativa, tipografías y estados vacíos.
3.  **Fase 3 (Gestión y Espacios de Trabajo):** Creación del módulo de espacios de trabajo colaborativos, roles de administrador y organización por canales.
4.  **Fase 4 (Monetización y Despliegue Final):** Integración de pasarelas de pago (Stripe/MercadoPago) para planes de suscripción, auditoría de seguridad legal (términos y condiciones) y despliegue definitivo en producción.

## Preguntas para el usuario
1.  ¿Prefieres que el registro inicial de usuarios sea estrictamente mediante número de teléfono (como WhatsApp) o mediante correo electrónico y nombre de usuario (como Telegram/Signal)?
2.  ¿El sistema estará orientado exclusivamente a uso interno de equipos de trabajo o planeas incluir funciones de atención a clientes externos?
3.  ¿Qué pasarela de pago prefieres priorizar para el lanzamiento de los planes de suscripción (ej. Stripe para pagos internacionales o MercadoPago para enfoque en Latinoamérica)?
