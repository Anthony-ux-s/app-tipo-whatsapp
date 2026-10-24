-- Conexión de una tienda con FerroHub (código de enlace o alta directa).
ALTER TABLE "Business" ADD COLUMN "connector" TEXT NOT NULL DEFAULT '',
ADD COLUMN "connectorOrigin" TEXT NOT NULL DEFAULT '',
ADD COLUMN "connectorTenant" TEXT NOT NULL DEFAULT '',
ADD COLUMN "connectorSecret" TEXT NOT NULL DEFAULT '',
ADD COLUMN "connectedAt" TIMESTAMP(3),
ADD COLUMN "verifiedAt" TIMESTAMP(3);
