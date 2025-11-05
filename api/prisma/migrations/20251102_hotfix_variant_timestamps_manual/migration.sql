-- 1) createdAt z defaultem
ALTER TABLE "variants"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW();

-- 2) updatedAt najpierw NULL-owalne
ALTER TABLE "variants"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

-- 3) backfill istniejących rekordów
UPDATE "variants"
SET "updatedAt" = NOW()
WHERE "updatedAt" IS NULL;

-- 4) ustaw default na przyszłość
ALTER TABLE "variants"
  ALTER COLUMN "updatedAt" SET DEFAULT NOW();

-- 5) dopiero teraz NOT NULL
ALTER TABLE "variants"
  ALTER COLUMN "updatedAt" SET NOT NULL;
