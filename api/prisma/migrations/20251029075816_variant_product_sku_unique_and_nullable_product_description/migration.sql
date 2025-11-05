/*
  Warnings:

  - Made the column `sku` on table `variants` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."products" ALTER COLUMN "description" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."variants" ALTER COLUMN "sku" SET NOT NULL;

-- RenameIndex
ALTER INDEX "public"."variants_productId_sku_key" RENAME TO "variant_productId_sku_unique";
