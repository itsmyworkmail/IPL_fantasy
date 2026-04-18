import { useState, useEffect, useCallback, useRef } from 'react';
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

  // Prevents simultaneous fetches — avoids the "abort previous" pattern that
  // causes `AbortError: signal is aborted without reason` in the console.
  const isFetchingRef = useRef(false);

  const fetchFixtures = useCallback(async (isBackground: boolean = false) => {
    if (isBackground && Date.now() - cacheTimestamp < CACHE_TTL_MS) return;
    // Skip if a fetch is already in-flight
    if (isFetchingRef.current) return;

    if (!isBackground && cachedFixtures.length === 0) setLoading(true);
    setError(null);
    isFetchingRef.current = true;

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
      // AbortError is benign — can still occur from browser navigation; silence it
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('Fixtures fetch aborted — will retry on next focus.');
        return;
      }
      console.error('Failed to fetch fixtures:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch fixtures');
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (Date.now() - cacheTimestamp < CACHE_TTL_MS && cachedFixtures.length > 0) return;
    fetchFixtures();

    // Poll every 5 minutes for live match status updates
    const interval = setInterval(() => fetchFixtures(true), CACHE_TTL_MS);
    return () => clearInterval(interval);
  }, [fetchFixtures]);

  // Silently refresh fixture data when the user returns to the tab.
  // If the cache is still fresh or a fetch is in progress this is a no-op.
  useEffect(() => {
    const handleFocus = () => fetchFixtures(true);
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchFixtures]);

  // When multiple fixtures share status=1 (e.g. afternoon match just ended but
  // DB hasn't been updated yet, while evening match just started), treat the one
  // with the latest match_datetime as the genuinely live/ongoing match.
  const liveMatches = fixtures.filter(f => f.match_status === '1');
  const liveMatch = liveMatches.length > 0
    ? liveMatches[liveMatches.length - 1]   // last in ascending match_datetime order = latest
    : null;

  const pastMatches = fixtures.filter(f => f.match_status === '2' || f.match_status === '5');
  const lastMatch = pastMatches.length > 0 ? pastMatches[pastMatches.length - 1] : null;

  const now = new Date();
  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

  // "Effectively live": match_status is still '0' but match_datetime passed within 6 hours.
  // This happens when the sync worker ran late or match_status wasn't updated in the DB yet.
  const effectiveLiveMatch = !liveMatch
    ? fixtures.find(f => {
        if (f.match_status !== '0' && f.match_status !== '' && f.match_status != null) return false;
        const startedMs = now.getTime() - new Date(f.match_datetime + (f.match_datetime.endsWith('Z') ? '' : 'Z')).getTime();
        return startedMs >= 0 && startedMs < SIX_HOURS_MS;
      }) ?? null
    : null;

  // Matches not yet started (status '0' and match_datetime still in the future)
  const upcomingMatch = fixtures.find(f => {
    if (f.match_status !== '0' && f.match_status !== '' && f.match_status != null) return false;
    return new Date(f.match_datetime + (f.match_datetime.endsWith('Z') ? '' : 'Z')) > now;
  }) || null;

  const resolvedLive = liveMatch ?? effectiveLiveMatch;
  const isMatchLive = resolvedLive !== null;
  const displayMatch = resolvedLive || upcomingMatch || lastMatch;
  const performerMatch = resolvedLive || lastMatch;
  const activeGamedayId = (resolvedLive || lastMatch)?.tour_gameday_id || null;

  return {
    fixtures, liveMatch, lastMatch, upcomingMatch,
    displayMatch, performerMatch, activeGamedayId,
    isMatchLive, loading, error,
    refetch: fetchFixtures,
  };
}
