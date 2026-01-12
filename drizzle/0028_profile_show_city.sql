ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "show_city" boolean NOT NULL DEFAULT false;
