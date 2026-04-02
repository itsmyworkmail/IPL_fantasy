import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { TourFixture } from '@/types';

export function useFixtures() {
  const [fixtures, setFixtures] = useState<TourFixture[]>([]);
  const [activeMatch, setActiveMatch] = useState<TourFixture | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFixtures = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: supabaseError } = await supabase
        .from('fantasy_tour_fixtures')
        .select('*')
        .order('match_datetime', { ascending: true });
        
      if (supabaseError) throw new Error(supabaseError.message);
      if (data) {
         setFixtures(data as TourFixture[]);
         
         const now = new Date();
         const upcoming = data.find(f => new Date(f.match_datetime) > now);
         if (upcoming) setActiveMatch(upcoming as TourFixture);
         else if (data.length > 0) setActiveMatch(data[data.length - 1] as TourFixture); 
      }
      
    } catch (err: unknown) {
      console.error('Failed to fetch fixtures:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch fixtures');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFixtures();
  }, [fetchFixtures]);

  return { fixtures, activeMatch, loading, error, refetch: fetchFixtures };
}
