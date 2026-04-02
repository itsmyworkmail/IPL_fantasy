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

export function useFantasyData(gamedayId: number = 1, refreshIntervalMs: number = 60000): UseFantasyDataReturn {
  const [players, setPlayers] = useState<GamedayPlayer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchPlayers = useCallback(async (isBackground: boolean = false) => {
    if (!isBackground) setLoading(true);
    setError(null);
    
    try {
      const { data, error: supabaseError } = await supabase
        .from('players')
        .select('*');
        
      if (supabaseError) {
        throw new Error(supabaseError.message);
      }
      
      if (data) {
        const uniquePlayers = new Map<string, GamedayPlayer>();
        data.forEach(p => uniquePlayers.set(String(p.player_id), p as GamedayPlayer));
        setPlayers(Array.from(uniquePlayers.values()));
        setLastUpdated(new Date());
      }
    } catch (err: unknown) {
      console.error('Failed to fetch players:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch player data');
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [gamedayId]);

  useEffect(() => {
    fetchPlayers();

    if (refreshIntervalMs > 0) {
      const intervalId = setInterval(() => {
        fetchPlayers(true);
      }, refreshIntervalMs);

      return () => clearInterval(intervalId);
    }
  }, [fetchPlayers, refreshIntervalMs]);

  return { players, loading, error, lastUpdated, refetch: fetchPlayers };
}
