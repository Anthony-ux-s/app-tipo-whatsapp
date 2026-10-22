-- DropIndex
DROP INDEX "Business_service_key";

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "apiAdminKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "apiBaseUrl" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "apiFormat" TEXT NOT NULL DEFAULT 'parla',
ADD COLUMN     "apiKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "apiPrefix" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "reviewNote" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'native',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- DropTable
DROP TABLE "ServiceIntegration";

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '',
    "priceCents" INTEGER NOT NULL,
    "listPriceCents" INTEGER,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReservation" (
    "businessId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "lines" TEXT NOT NULL,
    "released" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("businessId","reference")
);

-- CreateIndex
CREATE INDEX "Product_businessId_category_idx" ON "Product"("businessId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Product_businessId_sku_key" ON "Product"("businessId", "sku");

-- CreateIndex
CREATE INDEX "Business_service_status_idx" ON "Business"("service", "status");

-- CreateIndex
CREATE INDEX "Business_status_createdAt_idx" ON "Business"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

