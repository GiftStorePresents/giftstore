-- CreateTable
CREATE TABLE "public"."inspirations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspirations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."_InspirationProducts" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_InspirationProducts_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "inspirations_slug_key" ON "public"."inspirations"("slug");

-- CreateIndex
CREATE INDEX "inspirations_slug_idx" ON "public"."inspirations"("slug");

-- CreateIndex
CREATE INDEX "_InspirationProducts_B_index" ON "public"."_InspirationProducts"("B");

-- AddForeignKey
ALTER TABLE "public"."_InspirationProducts" ADD CONSTRAINT "_InspirationProducts_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."inspirations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_InspirationProducts" ADD CONSTRAINT "_InspirationProducts_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
