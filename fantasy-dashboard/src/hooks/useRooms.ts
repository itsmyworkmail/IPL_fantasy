import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Room } from '@/types';
import { useAuth } from '@/components/AuthProvider';

export function useRooms() {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMyRooms = useCallback(async (isBackground = false) => {
    if (!user?.id) return;
    if (!isBackground) setLoading(true);
    try {
      const { data: participantsData, error: partsError } = await supabase
        .from('room_participants')
        .select('room_id')
        .eq('profile_id', user.id);
        
      if (partsError) throw partsError;
      
      const roomIds = participantsData?.map(t => t.room_id) || [];
      
      const { data: createdRoomsData, error: createdRoomsError } = await supabase
        .from('rooms')
        .select('*')
        .eq('creator_id', user.id);
        
      if (createdRoomsError) throw createdRoomsError;
      
      const createdIds = createdRoomsData?.map(r => r.id) || [];
      const allRoomIds = Array.from(new Set([...roomIds, ...createdIds]));
      
      if (allRoomIds.length > 0) {
        const { data: roomsData, error: roomsError } = await supabase
          .from('rooms')
          .select('*')
          .in('id', allRoomIds);
          
        if (roomsError) throw roomsError;
        
        // Ensure settings fallback
        const filledRooms = (roomsData as Room[]).map(r => ({
           ...r,
           settings: r.settings || { lock_room: false, modify_teams: true, allow_duplicates: true }
        }));
        
        setRooms(filledRooms);
      } else {
        setRooms([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [user?.id]); 

  // Safely Patch Active Room dynamically honoring chronological order
  const patchActiveRoom = useCallback((payloadNew: Partial<Room>) => {
    setActiveRoom(prev => {
        if (!prev) return null;
        if (payloadNew.updated_at && prev.updated_at) {
            if (new Date(payloadNew.updated_at) <= new Date(prev.updated_at)) {
                return prev; 
            }
        }
        return { ...prev, ...payloadNew };
    });
  }, []);

  const fetchRoom = useCallback(async (roomId: string, isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single();
        
      if (error) throw error;
      
      const room = data as Room;
      // Guarantee Settings fallback format
      room.settings = room.settings || { lock_room: false, modify_teams: true, allow_duplicates: true };
      
      setActiveRoom(room);
      return room;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, []);

  const createRoom = async (name: string, description?: string) => {
    if (!user) throw new Error("Must be logged in to create a room");
    setLoading(true);
    const invite_code = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    try {
      const { data, error } = await supabase
        .from('rooms')
        .insert([{ 
          name, 
          description, 
          creator_id: user.id,
          invite_code,
          settings: { lock_room: false, modify_teams: true, allow_duplicates: true }
        }])
        .select()
        .single();
        
      if (error) throw error;
      
      const newRoom = data as Room;
      
      // Auto register the creator into room_participants
      await supabase
        .from('room_participants')
        .insert([{ room_id: newRoom.id, profile_id: user.id }]);
        
      setRooms(prev => [...prev, newRoom]);
      return newRoom;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async (inviteCode: string) => {
    if (!user) throw new Error("Must be logged in to join a room");
    setLoading(true);
    try {
      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .select('*')
        .eq('invite_code', inviteCode.toUpperCase())
        .single();
        
      if (roomError) throw new Error("Invalid invite code");
      
      const room = roomData as Room;
      
      if (room.settings?.lock_room) {
         throw new Error("Registration for this contest is currently locked by the Host.");
      }
      
      const { data: participantData } = await supabase
        .from('room_participants')
        .select('id')
        .eq('room_id', room.id)
        .eq('profile_id', user.id)
        .single();
        
      if (participantData) {
        throw new Error("You are already in this room");
      }
      
      const { error: insertError } = await supabase
        .from('room_participants')
        .insert([{
          room_id: room.id,
          profile_id: user.id
        }]);
        
      if (insertError) throw insertError;
      
      await fetchMyRooms(true); // Don't wipe UI during re-evaluation
      return room;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const leaveRoom = async (roomId: string) => {
    if (!user) throw new Error("Must be logged in");
    setLoading(true);
    try {
      const { error } = await supabase
        .from('room_participants')
        .delete()
        .eq('room_id', roomId)
        .eq('profile_id', user.id);
      if (error) throw error;
      setRooms(prev => prev.filter(r => r.id !== roomId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateRoom = async (roomId: string, updates: Partial<Room>) => {
    if (!user) throw new Error("Must be logged in");
    try {
      const previousRoom = activeRoom;
      if (activeRoom && activeRoom.id === roomId) {
        // Optimistic UI updates timestamp automatically
        setActiveRoom({ ...activeRoom, ...updates, updated_at: new Date().toISOString() });
      }
      
      const { error } = await supabase
        .from('rooms')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', roomId)
        .eq('creator_id', user.id);
        
      if (error) {
        setActiveRoom(previousRoom);
        throw error;
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  const updateRoomTeam = async (roomId: string, globalTeamId: string, iplTeam: string) => {
    if (!user) throw new Error("Must be logged in");
    try {
       const { error: updateErr } = await supabase
         .from('room_participants')
         .update({
            team_id: globalTeamId,
            ipl_team: iplTeam,
            updated_at: new Date().toISOString()
         })
         .eq('room_id', roomId)
         .eq('profile_id', user.id);
       if (updateErr) throw updateErr;

    } catch (err: unknown) {
       setError(err instanceof Error ? err.message : String(err));
       throw err;
    }
  };

  const removeParticipant = async (roomId: string, participantProfileId: string) => {
    if (!user) throw new Error("Must be logged in");
    try {
       const { error } = await supabase
          .from('room_participants')
          .delete()
          .eq('room_id', roomId)
          .eq('profile_id', participantProfileId);
       if (error) throw error;
    } catch (err: unknown) {
       setError(err instanceof Error ? err.message : String(err));
       throw err;
    }
  };

  return { 
    rooms, activeRoom, loading, error, patchActiveRoom,
    fetchMyRooms, fetchRoom, createRoom, joinRoom, 
    leaveRoom, updateRoom, updateRoomTeam, removeParticipant 
  };
}
