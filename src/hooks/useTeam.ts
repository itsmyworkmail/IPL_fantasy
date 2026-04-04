import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Team, GamedayPlayer } from '@/types';
import { useAuth } from '@/components/AuthProvider';

export function useTeam(profileId?: string) {
  const { user } = useAuth();
  const targetId = profileId || user?.id;

  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [mySquad, setMySquad] = useState<GamedayPlayer[]>([]);
  // loading = true only on the very first fetch for this user (no data yet)
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Per-user in-memory cache so navigating between pages reuses the same data
  // without showing a spinner.
  const cacheRef = useRef<{ userId: string; teams: Team[] } | null>(null);
  // Prevents multiple simultaneous fetches
  const isFetchingRef = useRef(false);

  const activeTeam = teams.find(t => t.id === activeTeamId) || null;
  const activePlayersKey = activeTeam?.selected_players?.join(',') || '';

  const fetchTeams = useCallback(async (isBackground = false) => {
    if (!targetId) return;
    // Prevent simultaneous fetches
    if (isFetchingRef.current) return;

    const hasCache = cacheRef.current?.userId === targetId && cacheRef.current.teams.length > 0;

    // Background fetch: never show loading spinner. If we have cached data, just silently
    // refresh in the background and update state when done.
    if (isBackground) {
      // Still always fetch to keep data fresh — just don't set loading state
    } else {
      // Foreground fetch: only show spinner if we have no data at all
      if (!hasCache) setLoading(true);
    }

    isFetchingRef.current = true;
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .eq('profile_id', targetId)
        .order('created_at', { ascending: true });

      if (error && error.code !== 'PGRST116') throw error;

      const result = (data as Team[]) || [];
      // Update cache
      cacheRef.current = { userId: targetId, teams: result };

      if (result.length > 0) {
        setTeams(result);
        setActiveTeamId(prev => (!prev || !result.find((d: Team) => d.id === prev)) ? result[0].id : prev);
      } else {
        setTeams([]);
        setActiveTeamId(null);
        setMySquad([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      isFetchingRef.current = false;
      if (!isBackground) setLoading(false);
    }
  }, [targetId]);

  // Effect 1: Handle data hydration when targetId changes (e.g. user logs in)
  useEffect(() => {
    if (!targetId) return;

    // If we already have a cache for this user, restore it immediately (no spinner)
    if (cacheRef.current?.userId === targetId && cacheRef.current.teams.length > 0) {
      setTeams(cacheRef.current.teams);
      setActiveTeamId(prev => {
        if (!prev || !cacheRef.current!.teams.find(t => t.id === prev)) {
          return cacheRef.current!.teams[0]?.id || null;
        }
        return prev;
      });
      // Still do a background re-fetch to catch any external changes
      fetchTeams(true);
      return;
    }

    fetchTeams();
  }, [fetchTeams, targetId]);

  // Effect 2: Separately register the focus listener so it's ALWAYS active,
  // regardless of whether we hit the cache or not on mount. This fixes the bug
  // where the listener was only registered on the non-cache branch.
  useEffect(() => {
    if (!targetId) return;
    const handleFocus = () => fetchTeams(true);
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchTeams, targetId]);

  // Derive mySquad from activeTeam without a full fetchTeams round-trip.
  useEffect(() => {
    const fetchActiveSquadPlayers = async () => {
      if (activeTeam && activeTeam.selected_players && activeTeam.selected_players.length > 0) {
        const { data: playersData } = await supabase
          .from('players')
          .select('*')
          .in('player_id', activeTeam.selected_players);

        if (playersData) {
          const uniqueMap = new Map<string, GamedayPlayer>();
          playersData.forEach(p => uniqueMap.set(String(p.player_id), p as GamedayPlayer));
          setMySquad(Array.from(uniqueMap.values()));
        }
      } else {
        setMySquad([]);
      }
    };
    fetchActiveSquadPlayers();
  }, [activePlayersKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mutators (all do optimistic updates then sync to DB) ──

  const togglePlayer = async (playerId: number) => {
    if (!user) throw new Error('Must be logged in to save a team');
    if (!activeTeam) throw new Error('No active team selected. Create one first.');

    const currentPlayers = activeTeam.selected_players || [];
    let newPlayers: number[];

    if (currentPlayers.includes(playerId)) {
      newPlayers = currentPlayers.filter((id: number) => id !== playerId);
    } else {
      if (currentPlayers.length >= 11) throw new Error('A squad can have at most 11 players');
      newPlayers = Array.from(new Set([...currentPlayers, playerId]));
    }

    const previousTeams = [...teams];
    const updatedTeams = teams.map(t => t.id === activeTeam.id ? { ...t, selected_players: newPlayers } as Team : t);
    setTeams(updatedTeams);
    if (cacheRef.current && cacheRef.current.userId === targetId) {
      cacheRef.current.teams = updatedTeams;
    }

    try {
      const { data, error } = await supabase
        .from('teams')
        .update({ selected_players: newPlayers, updated_at: new Date().toISOString() })
        .eq('id', activeTeam.id)
        .select()
        .single();

      if (error) throw error;
      const synced = teams.map(t => t.id === activeTeam.id ? (data as Team) : t);
      setTeams(synced);
      if (cacheRef.current && cacheRef.current.userId === targetId) {
        cacheRef.current.teams = synced;
      }
      return data as Team;
    } catch (err: unknown) {
      setTeams(previousTeams);
      if (cacheRef.current && cacheRef.current.userId === targetId) {
        cacheRef.current.teams = previousTeams;
      }
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  const createTeam = async (name: string) => {
    if (!user) throw new Error('Must be logged in');
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('teams')
        .insert({ profile_id: user.id, name, selected_players: [] })
        .select()
        .single();

      if (error) throw error;
      const newTeam = data as Team;
      setTeams(prev => {
        const next = [...prev, newTeam];
        if (cacheRef.current && cacheRef.current.userId === targetId) {
          cacheRef.current.teams = next;
        }
        return next;
      });
      setActiveTeamId(newTeam.id);
      return newTeam;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const renameTeam = async (id: string, newName: string) => {
    if (!user) return;
    const previousTeams = [...teams];
    const updated = teams.map(t => t.id === id ? { ...t, name: newName } as Team : t);
    setTeams(updated);
    if (cacheRef.current && cacheRef.current.userId === targetId) {
      cacheRef.current.teams = updated;
    }
 
    try {
      const { data, error } = await supabase
        .from('teams')
        .update({ name: newName, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
 
      if (error) throw error;
      const synced = teams.map(t => t.id === id ? (data as Team) : t);
      setTeams(synced);
      if (cacheRef.current && cacheRef.current.userId === targetId) {
        cacheRef.current.teams = synced;
      }
    } catch (err: unknown) {
      setTeams(previousTeams);
      if (cacheRef.current && cacheRef.current.userId === targetId) {
        cacheRef.current.teams = previousTeams;
      }
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  const deleteTeam = async (id: string) => {
    if (!user) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('teams').delete().eq('id', id);
      if (error) throw error;
      setTeams(prev => {
        const next = prev.filter(t => t.id !== id);
        if (cacheRef.current && cacheRef.current.userId === targetId) {
          cacheRef.current.teams = next;
        }
        return next;
      });
      if (activeTeamId === id) setActiveTeamId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const setLobbyTeamStatus = async (id: string, status: boolean) => {
    if (!user) return;
    try {
      if (status) {
        await supabase.from('teams').update({ show_in_lobby: false }).eq('profile_id', user.id);
      }
      const { error } = await supabase
        .from('teams')
        .update({ show_in_lobby: status })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      setTeams(prev => {
        const next = prev.map(t => {
          if (t.id === id) return { ...t, show_in_lobby: status } as Team;
          if (status) return { ...t, show_in_lobby: false } as Team;
          return t;
        });
        if (cacheRef.current && cacheRef.current.userId === targetId) {
          cacheRef.current.teams = next;
        }
        return next;
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  const saveTeam = async () => activeTeam;

  return {
    team: activeTeam, teams, activeTeamId, setActiveTeamId,
    mySquad, loading, error,
    fetchTeam: fetchTeams, fetchTeams, saveTeam,
    togglePlayer, createTeam, renameTeam, deleteTeam, setLobbyTeamStatus,
  };
}
