/*
 * Copyright (C) 2025 Christin Löhner
 */

/**
 * Instrumentation
 * 
 * Next.js Lifecycle Hook - wird beim Server-Start aufgerufen
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[Instrumentation] Starting server initialization...");

    try {
      const { registerGlobalErrorHandlers, logInfo } = await import("@/server/services/logger");
      registerGlobalErrorHandlers();
      logInfo("[Instrumentation] Global error handlers registered");
    } catch (error) {
      console.error("[Instrumentation] Failed to register global error handlers:", error);
    }
    
    // Ensure modules table exists
    try {
      const { db } = await import("@/server/db");
      const { sql } = await import("drizzle-orm");
      
      // Create modules table if it doesn't exist
      await db.execute(sql`
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
      `);
      
      // Rename old bookmarks table to mod_bookmarks if needed
      await db.execute(sql`
        DO $$
        BEGIN
          IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'bookmarks') THEN
            ALTER TABLE "bookmarks" RENAME TO "mod_bookmarks";
            RAISE NOTICE 'Renamed bookmarks → mod_bookmarks';
          END IF;
        END $$;
      `);
      
      console.log("[Instrumentation] Database migrations applied");
    } catch (error) {
      console.error("[Instrumentation] Database setup failed:", error);
    }
    
    // Module Discovery beim Server-Start
    try {
      const { ModuleService } = await import("@/server/services/module-service");
      await ModuleService.discoverAndRegisterModules();
      console.log("[Instrumentation] Module discovery completed");
    } catch (error) {
      console.error("[Instrumentation] Module discovery failed:", error);
    }
  }
}
