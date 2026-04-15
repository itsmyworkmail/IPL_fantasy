-- Step 1: Add is_announced column to fantasy_gameday_players
ALTER TABLE fantasy_gameday_players
  ADD COLUMN IF NOT EXISTS is_announced text NOT NULL DEFAULT 'NP';

-- Step 2: Create an index for fast last-match XI lookups
CREATE INDEX IF NOT EXISTS idx_fgp_gameday_announced
  ON fantasy_gameday_players (gameday_id, is_announced);
