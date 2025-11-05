/*
  Warnings:

  - A unique constraint covering the columns `[productId,sku]` on the table `variants` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."variants_sku_key";

-- AlterTable
ALTER TABLE "public"."variants" ALTER COLUMN "sku" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "variants_productId_sku_key" ON "public"."variants"("productId", "sku");
