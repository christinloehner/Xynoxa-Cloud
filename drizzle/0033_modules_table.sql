-- Create modules table for module management
CREATE TABLE IF NOT EXISTS "modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" varchar(128) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"version" varchar(32) NOT NULL,
	"author" varchar(255),
	"logo_url" text,
	"status" varchar(32) DEFAULT 'inactive' NOT NULL,
	"install_error" text,
	"installed_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "modules_module_id_unique" UNIQUE("module_id")
);
