ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "is_vault" boolean DEFAULT false;
ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "envelope_cipher" text;
ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "envelope_iv" text;
