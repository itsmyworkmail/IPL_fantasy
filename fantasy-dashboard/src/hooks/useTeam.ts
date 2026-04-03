import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Team, GamedayPlayer } from '@/types';
import { useAuth } from '@/components/AuthProvider';

export function useTeam(profileId?: string) {
  const { user } = useAuth();
  const targetId = profileId || user?.id; // Allow fetching other's teams or logged in user's
  
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  
  const [mySquad, setMySquad] = useState<GamedayPlayer[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const activeTeam = teams.find(t => t.id === activeTeamId) || null;
  const activePlayersKey = activeTeam?.selected_players?.join(',') || '';

  const fetchTeams = useCallback(async (isBackground = false) => {
    if (!targetId) return;
    if (!isBackground) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .eq('profile_id', targetId)
        .order('created_at', { ascending: true });
        
      if (error && error.code !== 'PGRST116') throw error;
      
      if (data && data.length > 0) {
         setTeams(data as Team[]);
         // Preserve active team context safely without tripping react strict dependencies
         setActiveTeamId(prev => (!prev || !data.find((d: Team) => d.id === prev)) ? data[0].id : prev);
      } else {
         setTeams([]);
         setActiveTeamId(null);
         setMySquad([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [targetId]); 

  // Initial Fetch & Fallback Sync (Tab re-focus)
  useEffect(() => {
     fetchTeams(); // initial mount
     const handleFocus = () => fetchTeams(true); // background resync
     window.addEventListener('focus', handleFocus);
     return () => window.removeEventListener('focus', handleFocus);
  }, [fetchTeams]);

  // Derive mySquad from activeTeam dynamically without full fetchTeams
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
  }, [activePlayersKey, activeTeam]);

  const togglePlayer = async (playerId: number) => {
    if (!user) throw new Error("Must be logged in to save a team");
    if (!activeTeam) throw new Error("No active team selected. Create one first.");
    
    const currentPlayers = activeTeam.selected_players || [];
    let newPlayers;
    
    if (currentPlayers.includes(playerId)) {
       newPlayers = currentPlayers.filter((id: number) => id !== playerId);
    } else {
       if (currentPlayers.length >= 11) throw new Error("A squad can have at most 11 players");
       newPlayers = Array.from(new Set([...currentPlayers, playerId]));
    }
    
    // Optimistic UI state masking
    const previousTeams = [...teams];
    setTeams(prev => prev.map(t => t.id === activeTeam.id ? { ...t, selected_players: newPlayers } as Team : t));
    
    try {
      const { data, error } = await supabase
        .from('teams')
        .update({ selected_players: newPlayers, updated_at: new Date().toISOString() })
        .eq('id', activeTeam.id)
        .select()
        .single();
        
      if (error) throw error;
      
      // Sync fresh timestamp back to state
      setTeams(prev => prev.map(t => t.id === activeTeam.id ? (data as Team) : t));
      return data as Team;
    } catch (err: unknown) {
      setTeams(previousTeams);
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  };
  
  const createTeam = async (name: string) => {
    if (!user) throw new Error("Must be logged in");
    setLoading(true);
    try {
       const { data, error } = await supabase
         .from('teams')
         .insert({
            profile_id: user.id,
            name: name,
            selected_players: []
         })
         .select()
         .single();
         
       if (error) throw error;
       const newTeam = data as Team;
       setTeams(prev => {
           const uniqueMap = new Map<string, Team>();
           prev.forEach(t => uniqueMap.set(String(t.id), t));
           uniqueMap.set(String(newTeam.id), newTeam);
           return Array.from(uniqueMap.values());
       });
       setActiveTeamId(newTeam.id);
       return newTeam;
    } catch(err: unknown) {
       setError(err instanceof Error ? err.message : String(err));
       throw err;
    } finally {
       setLoading(false);
    }
  };

  const renameTeam = async (id: string, newName: string) => {
    if (!user) return;
    const previousTeams = [...teams];
    setTeams(prev => prev.map(t => t.id === id ? { ...t, name: newName } as Team : t));
    try {
       const { data, error } = await supabase
         .from('teams')
         .update({ name: newName, updated_at: new Date().toISOString() })
         .eq('id', id)
         .select()
         .single();
         
       if (error) throw error;
       setTeams(prev => prev.map(t => t.id === id ? (data as Team) : t));
    } catch(err: unknown) {
       setTeams(previousTeams);
       setError(err instanceof Error ? err.message : String(err));
       throw err;
    }
  };

  const deleteTeam = async (id: string) => {
    if (!user) return;
    setLoading(true);
    try {
       const { error } = await supabase
         .from('teams')
         .delete()
         .eq('id', id);
         
       if (error) throw error;
       setTeams(prev => prev.filter(t => t.id !== id));
       if (activeTeamId === id) {
          setActiveTeamId(null);
       }
    } catch(err: unknown) {
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
       const { data, error } = await supabase
         .from('teams')
         .update({ show_in_lobby: status })
         .eq('id', id)
         .select()
         .single();
         
       if (error) throw error;
       
       setTeams(prev => prev.map(t => {
           if (t.id === id) return { ...t, show_in_lobby: status } as Team;
           if (status) return { ...t, show_in_lobby: false } as Team;
           return t;
       }));
    } catch(err: unknown) {
       setError(err instanceof Error ? err.message : String(err));
       throw err;
    }
  };

  const saveTeam = async () => {
    return activeTeam;
  };

  return { team: activeTeam, teams, activeTeamId, setActiveTeamId, mySquad, loading, error, fetchTeam: fetchTeams, fetchTeams, saveTeam, togglePlayer, createTeam, renameTeam, deleteTeam, setLobbyTeamStatus };
}
