-- AlterTable
ALTER TABLE "public"."categories" ADD COLUMN     "showInHero" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "categories_showInHero_idx" ON "public"."categories"("showInHero");
