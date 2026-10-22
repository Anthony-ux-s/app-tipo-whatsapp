#!/bin/sh
# Los volúmenes de Railway se montan como root: se le da permiso a la carpeta de archivos y se baja de
# privilegios antes de arrancar nada.
set -e
mkdir -p "${STORAGE_DIR:-/data/storage}"
chown -R parla "$(dirname "${STORAGE_DIR:-/data/storage}")" 2>/dev/null || true
exec env HOME=/home/parla setpriv --reuid=10001 --regid=10001 --init-groups /usr/local/bin/railway-run.sh
