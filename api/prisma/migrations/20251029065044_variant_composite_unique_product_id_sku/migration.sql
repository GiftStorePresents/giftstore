/*
  Warnings:

  - A unique constraint covering the columns `[sku]` on the table `variants` will be added. If there are existing duplicate values, this will fail.
  - Made the column `sku` on table `variants` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "public"."variants_productId_sku_key";

-- AlterTable
ALTER TABLE "public"."variants" ALTER COLUMN "sku" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "variants_sku_key" ON "public"."variants"("sku");
