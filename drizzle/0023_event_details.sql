-- Add description and location to calendar_events
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS location VARCHAR(255);
