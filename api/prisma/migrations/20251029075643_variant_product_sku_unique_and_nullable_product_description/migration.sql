/*
  Warnings:

  - Made the column `description` on table `products` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."products" ALTER COLUMN "description" SET NOT NULL;

-- AlterTable
ALTER TABLE "public"."variants" ALTER COLUMN "sku" DROP NOT NULL;

-- RenameIndex
ALTER INDEX "public"."variant_productId_sku_unique" RENAME TO "variants_productId_sku_key";
