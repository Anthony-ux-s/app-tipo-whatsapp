# Códigos por correo con Brevo

El registro y la recuperación mandan un código de 6 dígitos por correo. Brevo (plan gratis, ≈300 correos/día) los envía.

1. Crea la cuenta en https://app.brevo.com.
2. **SMTP y API → Claves API → Generar**. Copia la clave a `BREVO_API_KEY` en tu `.env` (no en `.env.example`, no en el chat).
3. **Remitentes y dominios → Remitentes → Agregar**: registra el correo desde el que enviar y confírmalo con el enlace que te llega. Ese correo va en `BREVO_SENDER_EMAIL`.
4. (Recomendado) **Dominios → Autenticar `kronito.com`**: agrega en tu DNS los registros SPF/DKIM/DMARC que Brevo indica. Sin esto, muchos correos caen en spam.
5. En la web pon `VITE_SIGNUP_METHOD=email` (Vercel → Environment Variables) y vuelve a desplegar.

Sin `BREVO_API_KEY` la API arranca en modo de prueba y muestra el código en pantalla.

Plantillas: `apps/api/src/kernel/email-templates.ts` (registro, confirmar correo, restablecer contraseña y bienvenida). Vistas previas: `docs/email/preview-*.html`.
