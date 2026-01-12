ALTER TABLE folders ADD COLUMN IF NOT EXISTS envelope_salt varchar(64);
