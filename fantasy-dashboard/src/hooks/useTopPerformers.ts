import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { GamedayPlayer } from '@/types';

interface UseTopPerformersReturn {
  topPerformers: GamedayPlayer[];
  loading: boolean;
  error: string | null;
}

export function useTopPerformers(gamedayId: number | null, limit = 5): UseTopPerformersReturn {
  const [topPerformers, setTopPerformers] = useState<GamedayPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTopPerformers = useCallback(async () => {
    if (!gamedayId) {
      setTopPerformers([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: supabaseError } = await supabase
        .from('fantasy_gameday_players')
        .select('*')
        .eq('gameday_id', gamedayId)
        .order('gameday_points', { ascending: false })
        .limit(limit);

      if (supabaseError) throw new Error(supabaseError.message);
      setTopPerformers((data as GamedayPlayer[]) || []);
    } catch (err: unknown) {
      console.error('Failed to fetch top performers:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch top performers');
    } finally {
      setLoading(false);
    }
  }, [gamedayId, limit]);

  useEffect(() => {
    fetchTopPerformers();
  }, [fetchTopPerformers]);

  return { topPerformers, loading, error };
}
