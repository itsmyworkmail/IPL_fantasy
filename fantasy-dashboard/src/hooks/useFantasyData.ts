import { useState, useEffect, useCallback } from 'react';
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

  const fetchPlayers = useCallback(async (isBackground: boolean = false) => {
    // Skip if cache is fresh and it is a background refresh check
    if (isBackground && Date.now() - cacheTimestamp < CACHE_TTL_MS) return;

    if (!isBackground) setLoading(true);
    setError(null);

    try {
      const { data, error: supabaseError } = await supabase
        .from('players')
        .select('*');

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
      console.error('Failed to fetch players:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch player data');
    } finally {
      if (!isBackground) setLoading(false);
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

  return { players, loading, error, lastUpdated, refetch: fetchPlayers };
}
