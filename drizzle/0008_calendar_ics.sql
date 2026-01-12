ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "ical_uid" varchar(255);
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "source" varchar(64) DEFAULT 'app';

CREATE UNIQUE INDEX IF NOT EXISTS "calendar_events_owner_uid_idx"
  ON "calendar_events" ("owner_id", "ical_uid")
  WHERE "ical_uid" IS NOT NULL;

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "ical_uid" varchar(255);
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "source" varchar(64) DEFAULT 'app';

CREATE UNIQUE INDEX IF NOT EXISTS "tasks_owner_uid_idx"
  ON "tasks" ("owner_id", "ical_uid")
  WHERE "ical_uid" IS NOT NULL;
