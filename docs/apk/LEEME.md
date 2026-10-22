# App de Android (APK)

Parla es una **PWA**: se instala desde el navegador (botón «Instalar la app» del menú ☰). El **APK** es esa
misma PWA empaquetada como app de Android con *Trusted Web Activity* (TWA): se abre a pantalla completa,
sin barra del navegador, y **se actualiza sola** cada vez que despliegas la web (no hay que subir un APK
nuevo por cada cambio).

> **Estado:** el APK ya está generado: **[`parla.apk`](parla.apk)** (en esta carpeta). Es la PWA de
> `https://www.kronito.com` empaquetada con PWABuilder (id `com.kronito.parla`), firmada con una clave propia.

## Instalarlo en el celular (Android)
1. Pasa `parla.apk` al teléfono (WhatsApp, Drive, USB o descargándolo desde GitHub: *docs/apk/parla.apk → Download*).
2. Ábrelo y acepta «instalar apps de origen desconocido» cuando Android lo pida.
3. Abre **Parla** e inicia sesión como siempre.

La app carga lo que hay en `www.kronito.com`: cuando despliegues cambios en la web, **la app se actualiza sola**
(no hace falta generar otro APK). Se abre a pantalla completa porque `www.kronito.com/.well-known/assetlinks.json`
(en `apps/web/public/.well-known/`) lleva la huella de la firma.

## Archivos importantes (¡guárdalos!)
En `mobile/signing/` (fuera de git, **respáldalo**): `signing.keystore` y `signing-key-info.txt` (claves de la firma)
y `parla.aab` (el paquete para subir a Google Play). Sin la clave de firma no podrás publicar actualizaciones en
Play Store. Las contraseñas también están en tu `.env` (`APK_KEYSTORE_PASSWORD`, `APK_KEY_PASSWORD`).

## Cómo se generó (por si hay que repetirlo)
Con la API de PWABuilder (`pwabuilder-cloudapk.azurewebsites.net/generateAppPackage`), con host
`https://www.kronito.com`, id `com.kronito.parla`, colores `#009d71` y `#f0f2f5`. Si cambias el dominio, hay que
generar otro APK y actualizar `assetlinks.json` con su nueva huella.

## Antes de empezar

1. La web publicada con **HTTPS** en tu dominio (`PUBLIC_URL` del `.env`), funcionando.
2. En el `.env` ya definidos `APK_HOST`, `APK_PACKAGE_ID` y `APK_APP_NAME` (el identificador, p. ej.
   `com.tudominio.parla`, **no se puede cambiar** después de publicar en Google Play).

## Opción A — PWABuilder (la más fácil, sin instalar nada)

1. Entra a <https://www.pwabuilder.com>, escribe tu `PUBLIC_URL` y pulsa **Start**.
   (Debe mostrar el manifiesto y el service worker en verde: Parla ya los trae.)
2. **Package for stores → Android → Generate package**. Completa:
   - *Package ID*: el `APK_PACKAGE_ID` del `.env`.
   - *App name*: `Parla`.
   - *Signing key*: **New** (que lo genere PWABuilder).
3. Descarga el `.zip`. Dentro vienen:
   - `*.apk` (para instalar directo en un celular) y `*.aab` (para subir a Google Play),
   - `signing.keystore` y `signing-key-info.txt` → **guárdalos en un lugar seguro**: sin ellos no podrás
     publicar actualizaciones de la app. **No los subas al repositorio.**
   - `assetlinks.json` o la huella **SHA-256** de la firma.
4. Copia la huella SHA-256 (formato `AA:BB:CC:…`) al `.env`:

   ```
   APK_SHA256_CERT_FINGERPRINTS=AA:BB:CC:...
   ```

   y vuelve a desplegar. La propia API publica entonces
   `https://tu-dominio/.well-known/assetlinks.json` con esa huella (no hace falta editar archivos).
   Compruébalo abriendo esa dirección en el navegador: debe mostrar tu `APK_PACKAGE_ID` y la huella.
5. Copia el `.apk` a `docs/apk/parla.apk`.

Si saltas el paso 4, la app abre bien pero **con una barra de navegador arriba** (modo «pestaña
personalizada») en vez de pantalla completa.

## Opción B — Bubblewrap (línea de comandos)

Requiere **JDK 17** y el **Android SDK** (Bubblewrap los descarga y configura la primera vez).

```bash
npm i -g @bubblewrap/cli
mkdir mobile && cd mobile
cp ../docs/apk/twa-manifest.template.json twa-manifest.json
# edita twa-manifest.json: host, packageId, name… (los mismos valores del .env)
bubblewrap build        # genera app-release-signed.apk y app-release-bundle.aab
```

Bubblewrap crea la clave de firma la primera vez (`android.keystore`; ruta y alias en `APK_KEYSTORE_*`).
Para ver la huella SHA-256: `bubblewrap fingerprint list`. Luego sigue desde el paso 4 de la Opción A.

## Instalar el APK en un celular (sin Google Play)

Pasa `parla.apk` al teléfono, ábrelo y permite «instalar apps de origen desconocido» cuando lo pida.

## Publicar en Google Play

Sube el archivo `.aab` en la consola de Google Play (<https://play.google.com/console>, cuenta de
desarrollador, pago único). Necesitarás: una política de privacidad (URL pública), capturas de pantalla y la descripción.

## Si algo no sale

- **La barra del navegador no desaparece** → falta `APK_SHA256_CERT_FINGERPRINTS` o no coincide con la
  clave con la que se firmó el APK (si Google Play re-firma, usa la huella que muestra Play Console →
  *Integridad de la app*).
- **PWABuilder dice que falta el service worker** → abre la web una vez en el navegador para que se
  registre, y vuelve a analizarla.
- **El registro por SMS no llega en la app** → las variables `ONESIGNAL_*` del `.env` (la app usa los
  mismos servicios que la web).
