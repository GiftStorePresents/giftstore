-- CreateTable
CREATE TABLE "public"."review_invites" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" VARCHAR(128) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "review_invites_orderId_key" ON "public"."review_invites"("orderId");

-- CreateIndex
CREATE INDEX "review_invites_email_idx" ON "public"."review_invites"("email");

-- AddForeignKey
ALTER TABLE "public"."review_invites" ADD CONSTRAINT "review_invites_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
