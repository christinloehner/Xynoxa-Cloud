-- Mehrere Google Kalender pro Nutzer + Farben + Auswahl

CREATE TABLE IF NOT EXISTS calendar_google_calendars (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    calendar_id varchar(255) NOT NULL,
    summary varchar(255),
    timezone varchar(128),
    is_primary boolean NOT NULL DEFAULT false,
    is_selected boolean NOT NULL DEFAULT false,
    is_default boolean NOT NULL DEFAULT false,
    color varchar(32),
    sync_token text,
    channel_id text,
    resource_id text,
    channel_expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT calendar_google_cal_uniq UNIQUE (user_id, calendar_id)
);

ALTER TABLE calendar_events
    ADD COLUMN IF NOT EXISTS external_calendar_id varchar(255);

-- Optional: Standard-Kalender auf Account-Ebene speichern (Fallback für Pusher)
ALTER TABLE calendar_provider_accounts
    ADD COLUMN IF NOT EXISTS default_calendar_id varchar(255);
