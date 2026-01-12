ALTER TABLE "upload_sessions" ADD COLUMN IF NOT EXISTS "is_vault" boolean DEFAULT false;
ALTER TABLE "upload_sessions" ADD COLUMN IF NOT EXISTS "iv" text;
ALTER TABLE "upload_sessions" ADD COLUMN IF NOT EXISTS "original_name" text;
