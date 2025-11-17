-- AlterTable
ALTER TABLE "public"."variants" ADD COLUMN     "discountActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "salePriceCents" INTEGER,
ADD COLUMN     "showDiscountPercent" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "variants_discountActive_idx" ON "public"."variants"("discountActive");
