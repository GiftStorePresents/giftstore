-- AlterTable
ALTER TABLE "public"."order_items" ADD COLUMN     "category" TEXT;

-- AlterTable
ALTER TABLE "public"."orders" ADD COLUMN     "couponCode" TEXT;
