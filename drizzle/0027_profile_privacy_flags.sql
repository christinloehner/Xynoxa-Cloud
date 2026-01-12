ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "show_email" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "show_birth_date" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "show_birth_place" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "show_phone" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "show_address" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "show_occupation" boolean NOT NULL DEFAULT false;
