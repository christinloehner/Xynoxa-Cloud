ALTER TABLE "user_profiles"
  ADD COLUMN "avatar_storage_path" text,
  ADD COLUMN "avatar_mime" varchar(64),
  ADD COLUMN "first_name" varchar(128),
  ADD COLUMN "last_name" varchar(128),
  ADD COLUMN "pronouns" varchar(64),
  ADD COLUMN "phone" varchar(64),
  ADD COLUMN "street" varchar(255),
  ADD COLUMN "house_number" varchar(32),
  ADD COLUMN "postal_code" varchar(32),
  ADD COLUMN "city" varchar(255),
  ADD COLUMN "birth_date" timestamp,
  ADD COLUMN "birth_place" varchar(255),
  ADD COLUMN "occupation" varchar(255),
  ADD COLUMN "websites" text[],
  ADD COLUMN "x_url" varchar(255),
  ADD COLUMN "fediverse_url" varchar(255),
  ADD COLUMN "instagram_url" varchar(255),
  ADD COLUMN "youtube_url" varchar(255),
  ADD COLUMN "twitch_url" varchar(255);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'user_profiles_profile_url_unique'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX user_profiles_profile_url_unique ON user_profiles (profile_url)';
  END IF;
END $$;
