ALTER TABLE "notes"
  ADD COLUMN IF NOT EXISTS "ciphertext" text,
  ADD COLUMN IF NOT EXISTS "iv" text;
