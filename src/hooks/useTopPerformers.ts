import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { GamedayPlayer } from '@/types';

interface UseTopPerformersReturn {
  topPerformers: GamedayPlayer[];
  loading: boolean;
  error: string | null;
}

// Module-level cache keyed by `${gamedayId}:${limit}` so results survive
// page navigation and tab-switch re-renders without flashing a skeleton.
const cache = new Map<string, { data: GamedayPlayer[]; timestamp: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute stale-while-revalidate

export function useTopPerformers(gamedayId: number | null, limit = 5): UseTopPerformersReturn {
  const cacheKey = `${gamedayId}:${limit}`;
  const cached = gamedayId ? cache.get(cacheKey) : undefined;
  const hasCached = !!cached && cached.data.length > 0;

  const [topPerformers, setTopPerformers] = useState<GamedayPlayer[]>(cached?.data ?? []);
  // Only show spinner on true first load (no cached data for this gamedayId yet)
  const [loading, setLoading] = useState(!hasCached && gamedayId !== null);
  const [error, setError] = useState<string | null>(null);

  // Track in-flight requests so stale results are never applied after cancellation
  const abortRef = useRef<AbortController | null>(null);

  const fetchTopPerformers = useCallback(async (isBackground = false) => {
    if (!gamedayId) {
      setTopPerformers([]);
      setLoading(false);
      return;
    }

    const entry = cache.get(cacheKey);
    const isFresh = entry && Date.now() - entry.timestamp < CACHE_TTL_MS;

    // Background fetch: skip entirely if cache is still fresh
    if (isBackground && isFresh) return;

    // Cancel any previous in-flight fetch (prevents stale state updates)
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Only show spinner if we have no data at all to display
    if (!isBackground && !entry?.data.length) setLoading(true);
    setError(null);

    try {
      const { data, error: supabaseError } = await supabase
        .from('fantasy_gameday_players')
        .select('*')
        .eq('gameday_id', gamedayId)
        .order('gameday_points', { ascending: false })
        .limit(limit);

      // If this request was aborted (superseded by a newer one), discard result
      if (controller.signal.aborted) return;

      if (supabaseError) throw new Error(supabaseError.message);

      const result = (data as GamedayPlayer[]) || [];
      cache.set(cacheKey, { data: result, timestamp: Date.now() });
      setTopPerformers(result);
    } catch (err: unknown) {
      // AbortError is expected when Supabase's Web Locks API cancels an older
      // request in favour of a newer one ('steal' option). Silently ignore it —
      // a superseding request is already in flight and will update state.
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('Failed to fetch top performers:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch top performers');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [gamedayId, limit, cacheKey]);

  useEffect(() => {
    const entry = cache.get(cacheKey);
    const isFresh = entry && Date.now() - entry.timestamp < CACHE_TTL_MS;

    if (isFresh && entry.data.length > 0) {
      // Restore from cache instantly, then silently revalidate in background
      setTopPerformers(entry.data);
      setLoading(false);
      fetchTopPerformers(true);
      return;
    }

    fetchTopPerformers();

    // Abort any in-flight request when gamedayId changes or component unmounts
    return () => { abortRef.current?.abort(); };
  }, [fetchTopPerformers, cacheKey]);

  // Silently refresh when user returns to the tab
  useEffect(() => {
    if (!gamedayId) return;
    const handleFocus = () => fetchTopPerformers(true);
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchTopPerformers, gamedayId]);

  return { topPerformers, loading, error };
}
