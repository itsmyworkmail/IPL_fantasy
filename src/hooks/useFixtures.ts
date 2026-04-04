import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { TourFixture } from '@/types';

interface UseFixturesReturn {
  fixtures: TourFixture[];
  liveMatch: TourFixture | null;
  lastMatch: TourFixture | null;
  upcomingMatch: TourFixture | null;
  displayMatch: TourFixture | null;
  performerMatch: TourFixture | null;
  activeGamedayId: number | null;
  isMatchLive: boolean;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// Module-level cache — survives page navigation
let cachedFixtures: TourFixture[] = [];
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5 * 60_000; // 5 minutes

export function useFixtures(): UseFixturesReturn {
  const hasCached = cachedFixtures.length > 0;
  const [fixtures, setFixtures] = useState<TourFixture[]>(cachedFixtures);
  const [loading, setLoading] = useState<boolean>(!hasCached);
  const [error, setError] = useState<string | null>(null);

  const fetchFixtures = useCallback(async (isBackground: boolean = false) => {
    if (isBackground && Date.now() - cacheTimestamp < CACHE_TTL_MS) return;

    if (!isBackground) setLoading(true);
    setError(null);

    try {
      const { data, error: supabaseError } = await supabase
        .from('fantasy_tour_fixtures')
        .select('*')
        .order('match_datetime', { ascending: true });

      if (supabaseError) throw new Error(supabaseError.message);
      if (data) {
        cachedFixtures = data as TourFixture[];
        cacheTimestamp = Date.now();
        setFixtures(cachedFixtures);
      }
    } catch (err: unknown) {
      console.error('Failed to fetch fixtures:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch fixtures');
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (Date.now() - cacheTimestamp < CACHE_TTL_MS && cachedFixtures.length > 0) return;
    fetchFixtures();

    // Poll every 5 minutes for live match status updates
    const interval = setInterval(() => fetchFixtures(true), CACHE_TTL_MS);
    return () => clearInterval(interval);
  }, [fetchFixtures]);

  // ── Derived state ──
  const now = new Date();

  const liveMatch = fixtures.find(f => f.match_status === '1') || null;

  const pastMatches = fixtures.filter(f => f.match_status === '2');
  
  const lastMatch = pastMatches.length > 0 ? pastMatches[pastMatches.length - 1] : null;
  
  const upcomingMatch = fixtures.find(f => f.match_status === '0' || !f.match_status) || null;

  const isMatchLive = liveMatch !== null;
  const displayMatch = liveMatch || upcomingMatch || lastMatch;
  const performerMatch = liveMatch || lastMatch;
  const activeGamedayId = (liveMatch || lastMatch)?.tour_gameday_id || null;

  return {
    fixtures, liveMatch, lastMatch, upcomingMatch,
    displayMatch, performerMatch, activeGamedayId,
    isMatchLive, loading, error,
    refetch: fetchFixtures,
  };
}
