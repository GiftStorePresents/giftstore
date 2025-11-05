-- AlterTable
ALTER TABLE "public"."categories" ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "showInHeader" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showInTiles" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "categories_showInHeader_idx" ON "public"."categories"("showInHeader");

-- CreateIndex
CREATE INDEX "categories_showInTiles_idx" ON "public"."categories"("showInTiles");
