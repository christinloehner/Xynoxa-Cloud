-- Add chunked versioning tables
CREATE TABLE IF NOT EXISTS "chunks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "hash" varchar(128) NOT NULL UNIQUE,
  "size" integer NOT NULL,
  "compressed_size" integer NOT NULL,
  "storage_path" text NOT NULL,
  "ref_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "file_version_chunks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "version_id" uuid NOT NULL REFERENCES "file_versions"("id") ON DELETE CASCADE,
  "chunk_id" uuid NOT NULL REFERENCES "chunks"("id") ON DELETE CASCADE,
  "idx" integer NOT NULL
);
CREATE INDEX IF NOT EXISTS "fvc_version_idx" ON "file_version_chunks" ("version_id", "idx");

CREATE TABLE IF NOT EXISTS "file_deltas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "version_id" uuid NOT NULL UNIQUE REFERENCES "file_versions"("id") ON DELETE CASCADE,
  "base_version_id" uuid NOT NULL REFERENCES "file_versions"("id") ON DELETE CASCADE,
  "strategy" varchar(32) NOT NULL,
  "patch" text NOT NULL,
  "patch_size" integer,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- Extend file_versions
ALTER TABLE "file_versions"
  ADD COLUMN IF NOT EXISTS "is_snapshot" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "base_version_id" uuid REFERENCES "file_versions"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "delta_strategy" varchar(32),
  ADD COLUMN IF NOT EXISTS "delta_size" integer,
  ADD COLUMN IF NOT EXISTS "chunk_count" integer DEFAULT 0;
