import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { DailyContestTeam } from '@/types';
import { useAuth } from '@/components/AuthProvider';

interface UseDailyContestTeamsReturn {
  /** All visible teams for this room (RLS filters opponent pre-lock teams) */
  teams: DailyContestTeam[];
  /** Only the current user's teams */
  myTeams: DailyContestTeam[];
  /** Upsert (create or update) the user's team for a specific match */
  saveTeam: (matchId: number, playerIds: number[], captainId?: number | null, vcId?: number | null) => Promise<void>;
  isSaving: boolean;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useDailyContestTeams(roomId: string): UseDailyContestTeamsReturn {
  const { user } = useAuth();
  const [teams, setTeams] = useState<DailyContestTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchTeams = useCallback(async () => {
    if (!roomId) return;
    try {
      const { data, error: err } = await supabase
        .from('daily_contest_teams')
        .select(`
          id, room_id, profile_id, match_id,
          selected_players, captain_id, vice_captain_id,
          created_at, updated_at,
          profiles (display_name, avatar_url)
        `)
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });

      if (err) throw err;
      setTeams((data ?? []) as unknown as DailyContestTeam[]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Suppress RLS-invisible-row errors (expected for pre-lock opponent teams)
      if (!msg.includes('not found')) setError(msg);
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  // Initial fetch
  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  // Realtime subscription for INSERT / UPDATE / DELETE on this room
  useEffect(() => {
    if (!roomId) return;

    // Purge any stale channels for this room before subscribing
    supabase
      .getChannels()
      .filter(ch => ch.topic.includes(`dct_${roomId}`))
      .forEach(ch => supabase.removeChannel(ch));

    const channel = supabase
      .channel(`dct_${roomId}_${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'daily_contest_teams', filter: `room_id=eq.${roomId}` },
        async (payload) => {
          // Fetch profile for the new team
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, avatar_url')
            .eq('id', payload.new.profile_id)
            .single();

          setTeams(prev => {
            const map = new Map(prev.map(t => [`${t.profile_id}_${t.match_id}`, t]));
            const key = `${payload.new.profile_id}_${payload.new.match_id}`;
            if (!map.has(key)) {
              map.set(key, { ...(payload.new as unknown as DailyContestTeam), profiles: profile ?? undefined });
            }
            return Array.from(map.values());
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'daily_contest_teams', filter: `room_id=eq.${roomId}` },
        (payload) => {
          setTeams(prev =>
            prev.map(t =>
              t.id === payload.new.id
                ? { ...t, ...(payload.new as unknown as DailyContestTeam) }
                : t,
            ),
          );
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'daily_contest_teams', filter: `room_id=eq.${roomId}` },
        (payload) => {
          setTeams(prev => prev.filter(t => t.id !== payload.old.id));
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [roomId]);

  const saveTeam = useCallback(
    async (matchId: number, playerIds: number[], captainId: number | null = null, vcId: number | null = null) => {
      if (!user?.id) throw new Error('Must be logged in');
      setIsSaving(true);
      setError(null);
      try {
        const { error: err } = await supabase
          .from('daily_contest_teams')
          .upsert(
            {
              room_id: roomId,
              profile_id: user.id,
              match_id: matchId,
              selected_players: playerIds,
              captain_id: captainId,
              vice_captain_id: vcId,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'room_id,profile_id,match_id' },
          );

        if (err) throw err;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [roomId, user?.id],
  );

  const myTeams = user?.id ? teams.filter(t => t.profile_id === user.id) : [];

  return { teams, myTeams, saveTeam, isSaving, loading, error, refetch: fetchTeams };
}
