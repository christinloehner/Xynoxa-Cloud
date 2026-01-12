ALTER TABLE "embeddings" ADD COLUMN IF NOT EXISTS "owner_id" uuid REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "embeddings" ADD COLUMN IF NOT EXISTS "event_id" uuid REFERENCES "calendar_events"("id") ON DELETE CASCADE;
ALTER TABLE "embeddings" ADD COLUMN IF NOT EXISTS "task_id" uuid REFERENCES "tasks"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "embeddings_owner_idx" ON "embeddings" ("owner_id");
CREATE INDEX IF NOT EXISTS "embeddings_owner_note_idx" ON "embeddings" ("owner_id", "note_id");
CREATE INDEX IF NOT EXISTS "embeddings_owner_bookmark_idx" ON "embeddings" ("owner_id", "bookmark_id");
CREATE INDEX IF NOT EXISTS "embeddings_owner_file_idx" ON "embeddings" ("owner_id", "file_id");
CREATE INDEX IF NOT EXISTS "embeddings_owner_event_idx" ON "embeddings" ("owner_id", "event_id");
CREATE INDEX IF NOT EXISTS "embeddings_owner_task_idx" ON "embeddings" ("owner_id", "task_id");
