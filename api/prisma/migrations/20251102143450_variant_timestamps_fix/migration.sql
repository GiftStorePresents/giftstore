-- 1) createdAt z defaultem (idempotentnie)
ALTER TABLE "variants"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW();

-- 2) updatedAt tymczasowo NULL-owalne
ALTER TABLE "variants"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

-- 3) backfill istniejących rekordów
UPDATE "variants"
SET "updatedAt" = NOW()
WHERE "updatedAt" IS NULL;

-- 4) dla ręcznych INSERT-ów w DB (nie przeszkadza Prisma)
ALTER TABLE "variants"
  ALTER COLUMN "updatedAt" SET DEFAULT NOW();

-- 5) dopiero teraz NOT NULL (po backfillu)
ALTER TABLE "variants"
  ALTER COLUMN "updatedAt" SET NOT NULL;
