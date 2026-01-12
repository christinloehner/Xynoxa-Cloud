ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "search_auto_reindex" boolean NOT NULL DEFAULT true;
