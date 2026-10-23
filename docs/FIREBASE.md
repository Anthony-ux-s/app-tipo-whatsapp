# Verificación del teléfono por SMS con Firebase

Es la forma más simple de que **llegue el SMS con el código**: **Google manda el mensaje** (no hay que comprar un
número, ni crear cuenta en Twilio). Se usa **Firebase Authentication**. No es Firestore: Firestore es una base de
datos y no hace falta. Las **notificaciones push** siguen funcionando como hasta ahora (Web Push con las claves VAPID).

```
Celular ──pide SMS──► Firebase (Google) ──SMS──► Celular
Celular ──escribe el código──► Firebase ──"número verificado" (ID token)──► Parla
Parla (backend) comprueba el token con las claves públicas de Google → deja crear la cuenta
```

Si `FIREBASE_PROJECT_ID` está vacío, el registro sigue usando OneSignal; no se rompe nada.

## Pasos en Firebase (≈ 10 minutos)

1. Entra a <https://console.firebase.google.com> con tu cuenta de Google → **Agregar proyecto** → nombre `parla`
   (puedes desactivar Google Analytics).
2. **Compilación → Authentication → Comenzar → Método de acceso → Teléfono → Habilitar → Guardar.**
3. **Authentication → Configuración → Dominios autorizados → Agregar dominio**, uno por uno:
   `www.kronito.com`, `kronito.com`, `parla-xi.vercel.app`.
4. **Authentication → Configuración → Política de regiones de SMS**: permite **Perú** (y los países donde tendrás clientes).
5. **Engranaje ⚙ → Configuración del proyecto → General → Tus apps → icono web `</>`** → registra la app «Parla web»
   (sin Hosting). Te muestra un bloque `firebaseConfig`: copia **apiKey, authDomain, projectId y appId**.
   Son datos **públicos** (van en el navegador), no son secretos.
6. **Costo:** Firebase da un cupo gratis de SMS al mes y después cobra por mensaje (el precio cambia según el país;
   revisa <https://firebase.google.com/pricing>). Para enviar SMS reales puede pedirte pasar al plan **Blaze** (pago por
   uso, con tarjeta): no cobra nada mientras no pases del cupo gratuito.

### Para probar gratis, sin gastar SMS
En **Authentication → Método de acceso → Teléfono → «Números de teléfono para pruebas»** agrega tu número con un código
fijo (por ejemplo `123456`). Ese número no recibe SMS: Firebase acepta ese código directamente.

## Dónde se pone cada dato

| Dato | Dónde | Variable |
| --- | --- | --- |
| Id del proyecto | `.env` del backend | `FIREBASE_PROJECT_ID=parla-xxxxx` |
| apiKey, projectId, appId, authDomain | **Vercel** → Settings → Environment Variables (y redeploy) | `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_AUTH_DOMAIN` |

Después reinicia el backend y vuelve a desplegar la web. La app usará Firebase cuando existan `VITE_FIREBASE_API_KEY`
y `VITE_FIREBASE_PROJECT_ID`.

## Cómo está hecho
- Web: `apps/web/src/shared/utils/firebase-phone.ts` (se carga solo al registrarse; reCAPTCHA invisible) y
  `use-register.hook.ts`.
- Backend: `POST /api/auth/phone/firebase` valida el ID token (firma RS256 de Google, proyecto, vencimiento, ingreso por
  teléfono y reciente) en `apps/api/src/infra/auth/firebase-token.verifier.ts` y entrega el mismo comprobante de un solo uso
  que el registro por OneSignal. No hace falta el Admin SDK ni claves secretas.
