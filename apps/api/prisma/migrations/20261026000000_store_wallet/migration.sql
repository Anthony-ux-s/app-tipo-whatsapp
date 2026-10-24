-- Billetera de las tiendas: ventas entregadas, comisión de Parla y depósitos a su PagaYa.
ALTER TABLE "Business" ADD COLUMN "payoutPhone" TEXT NOT NULL DEFAULT '';

CREATE TABLE "StoreLedgerEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "orderId" TEXT,
    "kind" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "transferId" TEXT,
    "failureReason" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "StoreLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StoreLedgerEntry_businessId_createdAt_idx" ON "StoreLedgerEntry"("businessId", "createdAt");
CREATE UNIQUE INDEX "StoreLedgerEntry_orderId_kind_key" ON "StoreLedgerEntry"("orderId", "kind");

ALTER TABLE "StoreLedgerEntry" ADD CONSTRAINT "StoreLedgerEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
