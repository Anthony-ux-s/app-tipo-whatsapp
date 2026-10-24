-- Pedidos grandes: umbrales propios de cada tienda y WhatsApp de su administrador.
ALTER TABLE "Business" ADD COLUMN "bigOrderCents" INTEGER,
ADD COLUMN "bigOrderUnits" INTEGER,
ADD COLUMN "adminWhatsapp" TEXT NOT NULL DEFAULT '';
