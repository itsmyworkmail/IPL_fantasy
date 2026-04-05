import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Room, RoomParticipant } from '@/types';
import { useAuth } from '@/components/AuthProvider';

// Module-level cache so rooms list survives page navigation
let cachedRooms: Room[] = [];
let cachedUserId: string | null = null;

export function useRooms() {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<Room[]>(
    cachedUserId === user?.id ? cachedRooms : []
  );
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  // loading = true only when we have NO data yet (first fetch for user).
  // Subsequent re-fetches happen silently in the background.
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const isFetchingRef = useRef(false);

  const fetchMyRooms = useCallback(async (isBackground = false) => {
    if (!user?.id) return;
    if (isFetchingRef.current) return; // Prevent double fire

    const hasCache = cachedUserId === user.id && cachedRooms.length > 0;

    if (!hasCache && !isBackground) setLoading(true);
    isFetchingRef.current = true;

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

        const { data: countData } = await supabase
          .from('room_participants')
          .select('room_id')
          .in('room_id', allRoomIds);

        const countMap: Record<string, number> = {};
        (countData || []).forEach((row: { room_id: string }) => {
          countMap[row.room_id] = (countMap[row.room_id] || 0) + 1;
        });

        const filledRooms = (roomsData as Room[]).map(r => ({
          ...r,
          participant_count: countMap[r.id] || 0,
          settings: r.settings || { lock_room: false, modify_teams: true, allow_duplicates: true },
        }));

        cachedRooms = filledRooms;
        cachedUserId = user.id;
        setRooms(filledRooms);
      } else {
        cachedRooms = [];
        cachedUserId = user.id;
        setRooms([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [user?.id]);

  const patchActiveRoom = useCallback((payloadNew: Partial<Room>) => {
    setActiveRoom(prev => {
      if (!prev) return null;
      if (payloadNew.updated_at && prev.updated_at) {
        if (new Date(payloadNew.updated_at) <= new Date(prev.updated_at)) return prev;
      }
      return { ...prev, ...payloadNew };
    });
  }, []);

  const fetchRoom = useCallback(async (roomId: string, isBackground = false) => {
    if (!isBackground && !activeRoom) setLoading(true);

    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single();

      if (error) throw error;

      const room = data as Room;
      room.settings = room.settings || { lock_room: false, modify_teams: true, allow_duplicates: true };
      setActiveRoom(room);
      return room;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createRoom = async (name: string, description?: string) => {
    if (!user) throw new Error('Must be logged in to create a room');
    const invite_code = Math.random().toString(36).substring(2, 8).toUpperCase();

    try {
      const { data, error } = await supabase
        .from('rooms')
        .insert([{
          name, description, creator_id: user.id, invite_code,
          settings: { lock_room: false, modify_teams: true, allow_duplicates: true },
        }])
        .select()
        .single();

      if (error) throw error;

      const newRoom = data as Room;
      await supabase.from('room_participants').insert([{ room_id: newRoom.id, profile_id: user.id }]);

      setRooms(prev => {
        const next = [...prev, newRoom];
        if (cachedUserId === user.id) cachedRooms = next;
        return next;
      });
      return newRoom;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  const joinRoom = async (inviteCode: string) => {
    if (!user) throw new Error('Must be logged in to join a room');
    try {
      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .select('*')
        .eq('invite_code', inviteCode.toUpperCase())
        .single();

      if (roomError) throw new Error('Invalid invite code');

      const room = roomData as Room;

      if (room.settings?.lock_room) {
        throw new Error('Registration for this contest is currently locked by the Host.');
      }

      const { data: participantData } = await supabase
        .from('room_participants')
        .select('id')
        .eq('room_id', room.id)
        .eq('profile_id', user.id)
        .single();

      if (participantData) throw new Error('You are already in this room');

      const { error: insertError } = await supabase
        .from('room_participants')
        .insert([{ room_id: room.id, profile_id: user.id }]);

      if (insertError) throw insertError;

      await fetchMyRooms(true);
      return room;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  const leaveRoom = async (roomId: string) => {
    if (!user) throw new Error('Must be logged in');
    try {
      const { error } = await supabase
        .from('room_participants')
        .delete()
        .eq('room_id', roomId)
        .eq('profile_id', user.id);
      if (error) throw error;
      setRooms(prev => {
        const next = prev.filter(r => r.id !== roomId);
        if (cachedUserId === user.id) cachedRooms = next;
        return next;
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  const updateRoom = async (roomId: string, updates: Partial<Room>) => {
    if (!user) throw new Error('Must be logged in');
    try {
      const previousRoom = activeRoom;
      if (activeRoom && activeRoom.id === roomId) {
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
    if (!user) throw new Error('Must be logged in');
    try {
      const { error: updateErr } = await supabase
        .from('room_participants')
        .update({ team_id: globalTeamId, ipl_team: iplTeam, updated_at: new Date().toISOString() })
        .eq('room_id', roomId)
        .eq('profile_id', user.id);
      if (updateErr) throw updateErr;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  const removeParticipant = async (roomId: string, participantProfileId: string) => {
    if (!user) throw new Error('Must be logged in');
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

  const deleteRoom = async (roomId: string) => {
    if (!user) throw new Error('Must be logged in');
    try {
      const { error } = await supabase
        .from('rooms')
        .delete()
        .eq('id', roomId)
        .eq('creator_id', user.id);
      if (error) throw error;
      setRooms(prev => {
        const next = prev.filter(r => r.id !== roomId);
        if (cachedUserId === user.id) cachedRooms = next;
        return next;
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  const lockRoomSquads = async (roomId: string, participants: RoomParticipant[]) => {
    if (!user) throw new Error('Must be logged in');
    try {
      const updates = participants.map(p => ({
        id: p.id,
        room_id: p.room_id,
        profile_id: p.profile_id,
        locked_squad: p.selected_players || [],
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from('room_participants')
        .upsert(updates, { onConflict: 'id' });
      if (error) throw error;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  return {
    rooms, activeRoom, loading, error, patchActiveRoom,
    fetchMyRooms, fetchRoom, createRoom, joinRoom,
    leaveRoom, deleteRoom, updateRoom, updateRoomTeam, removeParticipant, lockRoomSquads,
  };
}
