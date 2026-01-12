-- generalize tags mapping
ALTER TABLE entity_tags ADD COLUMN IF NOT EXISTS entity_id uuid;
ALTER TABLE entity_tags ADD COLUMN IF NOT EXISTS entity_type varchar(32);
ALTER TABLE entity_tags ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES folders(id) ON DELETE CASCADE;
ALTER TABLE entity_tags ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now() NOT NULL;

UPDATE entity_tags SET entity_id = file_id, entity_type = 'file' WHERE entity_id IS NULL AND file_id IS NOT NULL;
UPDATE entity_tags SET entity_id = note_id, entity_type = 'note' WHERE entity_id IS NULL AND note_id IS NOT NULL;
UPDATE entity_tags SET entity_id = bookmark_id, entity_type = 'bookmark' WHERE entity_id IS NULL AND bookmark_id IS NOT NULL;

ALTER TABLE entity_tags ALTER COLUMN entity_id SET NOT NULL;
ALTER TABLE entity_tags ALTER COLUMN entity_type SET NOT NULL;
