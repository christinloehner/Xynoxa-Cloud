ALTER TABLE sync_journal
  ADD COLUMN IF NOT EXISTS version_id uuid,
  ADD COLUMN IF NOT EXISTS base_version_id uuid;
