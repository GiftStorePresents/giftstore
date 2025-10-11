-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "loginBlockedUntil" TIMESTAMP(3),
ADD COLUMN     "loginFailCount" INTEGER NOT NULL DEFAULT 0;
