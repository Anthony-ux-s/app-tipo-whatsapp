#!/bin/sh
# Punto de entrada del contenedor (Render, Railway, Fly, VPS…). Los discos montados suelen ser de root: se le da
# permiso a la carpeta de archivos y se baja de privilegios antes de arrancar nada. Si la plataforma ya arranca
# el contenedor sin ser root, se salta ese paso.
set -e
STORAGE="${STORAGE_DIR:-/data/storage}"
mkdir -p "$STORAGE" 2>/dev/null || true
if [ "$(id -u)" = "0" ]; then
  chown -R parla "$(dirname "$STORAGE")" 2>/dev/null || true
  exec env HOME=/home/parla setpriv --reuid=10001 --regid=10001 --init-groups /usr/local/bin/run.sh
fi
exec /usr/local/bin/run.sh
