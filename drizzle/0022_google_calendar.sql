-- Google Calendar integration: accounts + external ids on events/tasks

CREATE TABLE IF NOT EXISTS calendar_provider_accounts (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    provider varchar(32) NOT NULL DEFAULT 'google',
    calendar_id varchar(255) NOT NULL DEFAULT 'primary',
    access_token text,
    refresh_token text NOT NULL,
    token_expires_at timestamptz,
    sync_token text,
    channel_id text,
    resource_id text,
    channel_expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE calendar_events
    ADD COLUMN IF NOT EXISTS external_id varchar(255),
    ADD COLUMN IF NOT EXISTS external_source varchar(32),
    ADD COLUMN IF NOT EXISTS external_updated_at timestamptz,
    ADD COLUMN IF NOT EXISTS external_etag varchar(255);

ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS external_id varchar(255),
    ADD COLUMN IF NOT EXISTS external_source varchar(32),
    ADD COLUMN IF NOT EXISTS external_updated_at timestamptz,
    ADD COLUMN IF NOT EXISTS external_etag varchar(255);
