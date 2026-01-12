-- Mehr-Kalender-Sync Google: Kalenderliste + Default + Farben

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'calendar_google_calendars' AND table_schema = 'public'
    ) THEN
        CREATE TABLE "calendar_google_calendars" (
            "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
            "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
            "calendar_id" varchar(255) NOT NULL,
            "summary" varchar(255),
            "timezone" varchar(128),
            "is_primary" boolean DEFAULT false NOT NULL,
            "is_selected" boolean DEFAULT false NOT NULL,
            "is_default" boolean DEFAULT false NOT NULL,
            "color" varchar(32),
            "sync_token" text,
            "channel_id" text,
            "resource_id" text,
            "channel_expires_at" timestamptz,
            "created_at" timestamptz DEFAULT now() NOT NULL,
            "updated_at" timestamptz DEFAULT now() NOT NULL,
            CONSTRAINT calendar_google_cal_uniq UNIQUE (user_id, calendar_id)
        );
    END IF;
END $$;

-- Neue Spalte: Default-Kalender-ID am Account
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'calendar_provider_accounts' AND column_name = 'default_calendar_id'
    ) THEN
        ALTER TABLE "calendar_provider_accounts" ADD COLUMN "default_calendar_id" varchar(255);
    END IF;
END $$;

-- Neue Spalte: externe Kalender-ID an Events
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'calendar_events' AND column_name = 'external_calendar_id'
    ) THEN
        ALTER TABLE "calendar_events" ADD COLUMN "external_calendar_id" varchar(255);
    END IF;
END $$;
