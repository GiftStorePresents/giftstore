-- AlterTable
ALTER TABLE "public"."variants" ADD COLUMN     "discountUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "variants_discountUntil_idx" ON "public"."variants"("discountUntil");
