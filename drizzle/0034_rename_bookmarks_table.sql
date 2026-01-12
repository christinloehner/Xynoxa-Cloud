-- Rename bookmarks table to mod_bookmarks (for module system)
-- This migration handles existing installations

DO $$
BEGIN
    -- Check if old bookmarks table exists
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'bookmarks') THEN
        -- Rename to mod_bookmarks
        ALTER TABLE "bookmarks" RENAME TO "mod_bookmarks";
        RAISE NOTICE 'Renamed bookmarks → mod_bookmarks';
    END IF;
END $$;
