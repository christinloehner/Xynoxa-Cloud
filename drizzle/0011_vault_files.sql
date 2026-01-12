ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "iv" text;
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "original_name" text;

ALTER TABLE "file_versions" ADD COLUMN IF NOT EXISTS "iv" text;
ALTER TABLE "file_versions" ADD COLUMN IF NOT EXISTS "original_name" text;
