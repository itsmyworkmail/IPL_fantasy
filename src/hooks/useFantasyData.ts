import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { GamedayPlayer } from '@/types';

interface UseFantasyDataReturn {
  players: GamedayPlayer[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refetch: () => Promise<void>;
}

// Module-level cache so data persists across page navigations without re-fetching
let cachedPlayers: GamedayPlayer[] = [];
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 60_000; // 1-minute stale-while-revalidate window

export function useFantasyData(refreshIntervalMs: number = 60000): UseFantasyDataReturn {
  const hasCachedData = cachedPlayers.length > 0;
  const [players, setPlayers] = useState<GamedayPlayer[]>(cachedPlayers);
  // Only show loading spinner on true first load (no cached data)
  const [loading, setLoading] = useState<boolean>(!hasCachedData);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(cacheTimestamp ? new Date(cacheTimestamp) : null);

  // Prevents simultaneous fetches — avoids the "abort previous" pattern that
  // causes `AbortError: signal is aborted without reason` in the console.
  const isFetchingRef = useRef(false);

  const fetchPlayers = useCallback(async (isBackground: boolean = false) => {
    // Skip if cache is fresh on a background refresh check
    if (isBackground && Date.now() - cacheTimestamp < CACHE_TTL_MS) return;
    // Skip if a fetch is already in-flight (prevents duplicate simultaneous requests)
    if (isFetchingRef.current) return;

    if (!isBackground && cachedPlayers.length === 0) setLoading(true);
    setError(null);
    isFetchingRef.current = true;

    // Per-request AbortController only for the timeout scenario —
    // we do NOT abort the previous request, we simply skip new fetches while
    // one is already in-flight (guarded by isFetchingRef above).
    const controller = new AbortController();
    // 30 s timeout — generous enough to survive tab-background timer throttling
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const { data, error: supabaseError } = await supabase
        .from('players')
        .select('*')
        .abortSignal(controller.signal);

      clearTimeout(timeoutId);

      if (supabaseError) throw new Error(supabaseError.message);

      if (data) {
        const uniquePlayers = new Map<string, GamedayPlayer>();
        data.forEach(p => uniquePlayers.set(String(p.player_id), p as GamedayPlayer));
        const result = Array.from(uniquePlayers.values());
        // Update module-level cache
        cachedPlayers = result;
        cacheTimestamp = Date.now();
        setPlayers(result);
        setLastUpdated(new Date());
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      // AbortError is expected on timeout — log quietly, never surface to the UI
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('Fetch players timed out or aborted — will retry on next focus.');
        return;
      }
      console.error('Failed to fetch players:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch player data');
    } finally {
      clearTimeout(timeoutId);
      isFetchingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // If cache is fresh, don't re-fetch at all
    if (Date.now() - cacheTimestamp < CACHE_TTL_MS && cachedPlayers.length > 0) return;

    fetchPlayers();

    if (refreshIntervalMs > 0) {
      const intervalId = setInterval(() => fetchPlayers(true), refreshIntervalMs);
      return () => clearInterval(intervalId);
    }
  }, [fetchPlayers, refreshIntervalMs]);

  // Silently refresh player data when the user returns to the tab.
  // If the cache is still fresh or a fetch is in progress this is a no-op.
  useEffect(() => {
    const handleFocus = () => fetchPlayers(true);
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchPlayers]);

  return { players, loading, error, lastUpdated, refetch: fetchPlayers };
}
