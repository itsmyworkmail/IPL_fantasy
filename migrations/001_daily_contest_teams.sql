-- ============================================================
-- Migration: create_daily_contest_teams
-- Run this in the Supabase Dashboard → SQL Editor
-- Project: IPL fantasy (bximuboykndvqoljvvtr)
-- ============================================================

-- 1. Table
CREATE TABLE IF NOT EXISTS public.daily_contest_teams (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id          uuid        NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  profile_id       uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_id         int         NOT NULL,
  selected_players int[]       NOT NULL DEFAULT '{}',
  captain_id       int         DEFAULT NULL,
  vice_captain_id  int         DEFAULT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, profile_id, match_id)
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_dct_room_match ON public.daily_contest_teams (room_id, match_id);
CREATE INDEX IF NOT EXISTS idx_dct_profile    ON public.daily_contest_teams (profile_id);

-- 3. RLS
ALTER TABLE public.daily_contest_teams ENABLE ROW LEVEL SECURITY;

-- SELECT: own rows always visible; others only after match has started
CREATE POLICY "dct_select"
ON public.daily_contest_teams FOR SELECT USING (
  auth.uid() = profile_id
  OR (
    SELECT ftf.match_datetime <= now()
    FROM public.fantasy_tour_fixtures ftf
    WHERE ftf.match_id = daily_contest_teams.match_id
  )
);

-- INSERT: only owner, only before match starts
CREATE POLICY "dct_insert"
ON public.daily_contest_teams FOR INSERT WITH CHECK (
  auth.uid() = profile_id
  AND (
    SELECT ftf.match_datetime > now()
    FROM public.fantasy_tour_fixtures ftf
    WHERE ftf.match_id = daily_contest_teams.match_id
  )
);

-- UPDATE: only owner, only before match starts
CREATE POLICY "dct_update"
ON public.daily_contest_teams FOR UPDATE
USING (
  auth.uid() = profile_id
  AND (
    SELECT ftf.match_datetime > now()
    FROM public.fantasy_tour_fixtures ftf
    WHERE ftf.match_id = daily_contest_teams.match_id
  )
);

-- DELETE: only owner, only before match starts
CREATE POLICY "dct_delete"
ON public.daily_contest_teams FOR DELETE USING (
  auth.uid() = profile_id
  AND (
    SELECT ftf.match_datetime > now()
    FROM public.fantasy_tour_fixtures ftf
    WHERE ftf.match_id = daily_contest_teams.match_id
  )
);
