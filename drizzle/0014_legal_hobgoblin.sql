CREATE EXTENSION IF NOT EXISTS "vector";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_resets_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(32) DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "upload_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"mime" varchar(128),
	"size" integer,
	"total_chunks" integer NOT NULL,
	"is_vault" boolean DEFAULT false,
	"iv" text,
	"original_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "embeddings" ALTER COLUMN "vector" SET DATA TYPE vector(1536) USING ("vector"::vector(1536));--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "ical_uid" varchar(255);--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "source" varchar(64) DEFAULT 'app';--> statement-breakpoint
ALTER TABLE "embeddings" ADD COLUMN IF NOT EXISTS "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "embeddings" ADD COLUMN IF NOT EXISTS "event_id" uuid;--> statement-breakpoint
ALTER TABLE "embeddings" ADD COLUMN IF NOT EXISTS "task_id" uuid;--> statement-breakpoint
ALTER TABLE "file_versions" ADD COLUMN IF NOT EXISTS "storage_path" text;--> statement-breakpoint
ALTER TABLE "file_versions" ADD COLUMN IF NOT EXISTS "iv" text;--> statement-breakpoint
ALTER TABLE "file_versions" ADD COLUMN IF NOT EXISTS "original_name" text;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "storage_path" text;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "iv" text;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "original_name" text;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "is_vault" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "envelope_cipher" text;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "envelope_iv" text;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "ciphertext" text;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "iv" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "description" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "ical_uid" varchar(255);--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "source" varchar(64) DEFAULT 'app';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "session_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'password_resets_user_id_users_id_fk') THEN
    ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_members_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "tenant_members" ADD CONSTRAINT "tenant_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_members_user_id_users_id_fk') THEN
    ALTER TABLE "tenant_members" ADD CONSTRAINT "tenant_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'upload_sessions_user_id_users_id_fk') THEN
    ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'embeddings_owner_id_users_id_fk') THEN
    ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'embeddings_event_id_calendar_events_id_fk') THEN
    ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'embeddings_task_id_tasks_id_fk') THEN
    ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
