-- AlterTable
ALTER TABLE "public"."orders" ADD COLUMN     "invoiceAddr1" TEXT,
ADD COLUMN     "invoiceCity" TEXT,
ADD COLUMN     "invoiceCompanyName" TEXT,
ADD COLUMN     "invoiceCountry" TEXT,
ADD COLUMN     "invoiceEmail" TEXT,
ADD COLUMN     "invoiceIssuedAt" TIMESTAMP(3),
ADD COLUMN     "invoiceNip" TEXT,
ADD COLUMN     "invoiceRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "invoiceZip" TEXT;

-- CreateIndex
CREATE INDEX "orders_invoiceRequested_idx" ON "public"."orders"("invoiceRequested");

-- CreateIndex
CREATE INDEX "orders_invoiceIssuedAt_idx" ON "public"."orders"("invoiceIssuedAt");
