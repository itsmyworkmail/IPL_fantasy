'use client';

import { useEffect, useState, use, useCallback, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useRooms } from '@/hooks/useRooms';
import { useTeam } from '@/hooks/useTeam';
import { useFantasyData } from '@/hooks/useFantasyData';
import { usePlayerMatchHistory, getRelativeMatchPoints } from '@/hooks/usePlayerMatchHistory';
import { supabase } from '@/lib/supabaseClient';
import toast from 'react-hot-toast';
import { formatSkillName } from '@/utils/formatters';
import { UserMinus, Trash2, Eye, BadgeInfo, Crown, LogOut, Copy, Check, ChevronDown, Lock, MoreVertical, ShieldCheck, Pen, ArrowLeft, ChevronDown as ChevronDownIcon } from 'lucide-react';
import { RoomParticipant } from '@/types';
import { DailyContestRoom } from '@/components/DailyContestRoom';

// Official IPL team colors (same as My Team page)
const TEAM_COLOR: Record<string, string> = {
  'CSK': '#FFD700', 'MI': '#004BA0', 'RCB': '#D4001C', 'KKR': '#3A225D',
  'SRH': '#F7812A', 'DC': '#0078BC', 'PBKS': '#ED1B24', 'RR': '#dd55adff',
  'GT': '#1B4087', 'LSG': '#A7CC44',
};

const IPL_FRANCHISES = [
  { id: 'csk', name: 'Chennai Super Kings' },
  { id: 'dc', name: 'Delhi Capitals' },
  { id: 'gt', name: 'Gujarat Titans' },
  { id: 'kkr', name: 'Kolkata Knight Riders' },
  { id: 'lsg', name: 'Lucknow Super Giants' },
  { id: 'mi', name: 'Mumbai Indians' },
  { id: 'pbks', name: 'Punjab Kings' },
  { id: 'rr', name: 'Rajasthan Royals' },
  { id: 'rcb', name: 'Royal Challengers Bengaluru' },
  { id: 'srh', name: 'Sunrisers Hyderabad' }
];

export default function ContestDetailsPage({ params }: { params: Promise<{ roomId: string }> }) {
  const unwrappedParams = use(params);
  const roomId = unwrappedParams.roomId;

  const { user, loading: authLoading, signInWithGoogle } = useAuth();
  const router = useRouter();

  // Core Hooks
  const { fetchRoom, activeRoom, patchActiveRoom, loading: roomLoading, updateRoom, updateRoomTeam, leaveRoom, deleteRoom, removeParticipant, lockRoomSquads } = useRooms();
  const { players } = useFantasyData();
  const { teams: myGlobalTeams } = useTeam(user?.id);

  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  // Form states
  const [selectedGlobalTeamId, setSelectedGlobalTeamId] = useState('');
  const [selectedIplTeam, setSelectedIplTeam] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [editTitleBuffer, setEditTitleBuffer] = useState('');
  const [editDescBuffer, setEditDescBuffer] = useState('');

  // Team Viewer state
  const [viewingParticipant, setViewingParticipant] = useState<RoomParticipant | null>(null);

  // Mobile tabbed management panel
  const [mobileMainTab, setMobileMainTab] = useState<'leaderboard' | 'settings'>('leaderboard');
  // Mobile leaderboard per-row dropdown
  const [mobileMenuOpenId, setMobileMenuOpenId] = useState<string | null>(null);

  // Guard against simultaneous fetchParticipants calls (focus + realtime can
  // both fire at the same time, causing the empty-error-object console spam)
  const isFetchingParticipantsRef = useRef(false);

  // Auth Guard
  useEffect(() => {
    if (!authLoading && !user?.id) {
      signInWithGoogle();
    }
  }, [user?.id, authLoading, signInWithGoogle]);

  const fetchParticipants = useCallback(async (isBackground = false) => {
    // Skip if already fetching — prevents simultaneous calls from focus + realtime
    if (isFetchingParticipantsRef.current) return;
    if (!isBackground) setLoadingMembers(true);
    isFetchingParticipantsRef.current = true;
    try {
      const { data, error } = await supabase
        .from('room_participants')
        .select(`
          id, profile_id, team_id, ipl_team, locked_squad,
          profiles (display_name, avatar_url),
          teams (name, selected_players)
        `)
        .eq('room_id', roomId);

      if (error) throw error;

      const flattenedData = data?.map((p: Record<string, unknown>) => {
        const teams = p.teams as { name?: string, selected_players?: number[] } | undefined;
        return {
          id: String(p.id),
          room_id: String(p.room_id || roomId),
          profile_id: String(p.profile_id),
          team_id: String(p.team_id),
          name: teams?.name || 'Unassigned Squad',
          selected_players: teams?.selected_players || [],
          locked_squad: (p.locked_squad as number[]) || [],
          ipl_team: String(p.ipl_team || ''),
          created_at: String(p.created_at || new Date().toISOString()),
          profiles: p.profiles as { display_name: string | null; avatar_url: string | null }
        } as RoomParticipant;
      }) || [];

      setParticipants(flattenedData);

      // Seed my current selections if I exist
      const myParticipantData = flattenedData.find((p: RoomParticipant) => p.profile_id === user?.id);
      if (myParticipantData && !isBackground) {
        if (myParticipantData.ipl_team) setSelectedIplTeam(myParticipantData.ipl_team);
        if (myParticipantData.team_id) setSelectedGlobalTeamId(myParticipantData.team_id);
      }
    } catch (err: unknown) {
      // AbortError is a Supabase WebSocket lock-steal artifact — swallow silently.
      // Supabase sometimes throws a plain object (not an Error instance), so we
      // check both instanceof and the message/name string.
      const isAbort = (err instanceof Error && err.name === 'AbortError') ||
        (typeof err === 'object' && err !== null && (err as Record<string, unknown>).name === 'AbortError') ||
        (typeof err === 'string' && err.includes('AbortError'));
      if (isAbort) return;
      const msg = err instanceof Error
        ? err.message
        : (err as { message?: string })?.message || JSON.stringify(err);
      if (msg?.includes('AbortError')) return; // extra safety net
      console.error('Failed to fetch participants:', msg, err);

    } finally {
      isFetchingParticipantsRef.current = false;
      if (!isBackground) setLoadingMembers(false);
    }
  }, [roomId, user?.id]);
  //
  // Root cause of "cannot add postgres_changes after subscribe()":
  //   supabase.channel(NAME) returns the SAME object if called with the same
  //   name while it's still in SUBSCRIBED state. supabase.removeChannel() is
  //   async, so React Strict Mode's cleanup → remount cycle ends up calling
  //   .on() on the already-subscribed channel object.
  //
  // Fix:
  //   1. Call channel.unsubscribe() synchronously in cleanup so Supabase
  //      immediately marks the channel as closed.
  //   2. Use a unique name per mount (via a counter ref) so even if Supabase's
  //      internal registry hasn't fully cleared, the new mount gets a fresh
  //      channel object rather than the stale subscribed one.
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const mountCountRef = useRef(0);
  const fetchRoomRef = useRef(fetchRoom);
  const fetchParticipantsRef = useRef(fetchParticipants);
  const patchActiveRoomRef = useRef(patchActiveRoom);

  useEffect(() => { fetchRoomRef.current = fetchRoom; }, [fetchRoom]);
  useEffect(() => { fetchParticipantsRef.current = fetchParticipants; }, [fetchParticipants]);
  useEffect(() => { patchActiveRoomRef.current = patchActiveRoom; }, [patchActiveRoom]);

  useEffect(() => {
    if (!user?.id || !roomId) return;

    // ─── Bulletproof stale-channel purge ────────────────────────────────────
    // Problem: supabase is a module-level singleton — it survives HMR resets,
    // React Strict Mode double-invokes, and App Router reconnectPassiveEffects.
    // useRef values do NOT survive all of these. So we cannot rely on a ref to
    // know whether a channel already exists — we must ask Supabase directly.
    //
    // Before creating any new channel, destroy every stale channel for this
    // room that Supabase still knows about. This handles:
    //   • Strict Mode: cleanup ran → channel removed → nothing to purge
    //   • reconnectPassiveEffects: cleanup did NOT run → stale found & killed
    //   • HMR: mountCountRef reset, old _sync_N channel still in registry
    supabase
      .getChannels()
      .filter(ch => ch.topic.includes(roomId))
      .forEach(ch => supabase.removeChannel(ch));
    // ────────────────────────────────────────────────────────────────────────

    // Initial data load
    fetchRoomRef.current(roomId);
    fetchParticipantsRef.current();

    // Date.now() guarantees uniqueness even if mountCountRef is reset by HMR
    const channelName = `room_${roomId}_sync_${Date.now()}`;

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'room_participants', filter: `room_id=eq.${roomId}` }, (payload) => {
        setParticipants(prev => {
          const uniqueMap = new Map<string, RoomParticipant>();
          prev.forEach(p => uniqueMap.set(String(p.id), p));
          const pid = String(payload.new.id);
          if (uniqueMap.has(pid)) {
            const existing = uniqueMap.get(pid)!;
            if (payload.new.updated_at && existing.updated_at) {
              if (new Date(String(payload.new.updated_at)) <= new Date(existing.updated_at)) return prev;
            }
            uniqueMap.set(pid, { ...existing, ...payload.new, id: pid } as unknown as RoomParticipant);
          }
          return Array.from(uniqueMap.values());
        });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_participants', filter: `room_id=eq.${roomId}` }, async (payload) => {
        const { data } = await supabase.from('profiles').select('display_name, avatar_url').eq('id', payload.new.profile_id).single();
        setParticipants(prev => {
          const uniqueMap = new Map<string, RoomParticipant>();
          prev.forEach(p => uniqueMap.set(String(p.id), p));
          const pid = String(payload.new.id);
          if (!uniqueMap.has(pid)) {
            uniqueMap.set(pid, { ...(payload.new as Record<string, unknown>), profiles: data, name: 'Unassigned Squad', locked_squad: (payload.new.locked_squad as number[]) || [], selected_players: [], id: pid } as unknown as RoomParticipant);
          }
          return Array.from(uniqueMap.values());
        });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'room_participants', filter: `room_id=eq.${roomId}` }, (payload) => {
        setParticipants(prev => {
          const uniqueMap = new Map<string, RoomParticipant>();
          prev.forEach(p => uniqueMap.set(String(p.id), p));
          uniqueMap.delete(String(payload.old.id));
          return Array.from(uniqueMap.values());
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'teams' }, (payload) => {
        setParticipants(prev => {
          const uniqueMap = new Map<string, RoomParticipant>();
          prev.forEach(p => uniqueMap.set(String(p.id), p));
          const targetId = String(payload.new.id);
          uniqueMap.forEach((p, key) => {
            if (String(p.team_id) === targetId) {
              uniqueMap.set(key, { ...p, name: payload.new.name, selected_players: payload.new.selected_players });
            }
          });
          return Array.from(uniqueMap.values());
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
        patchActiveRoomRef.current(payload.new);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      // removeChannel() internally calls unsubscribe() — one call, clean teardown.
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, roomId]);



  // Tab focus fallback resync (Safety check against drift)
  useEffect(() => {
    const handleFocus = () => {
      if (user?.id && roomId) {
        fetchRoom(roomId, true);
        fetchParticipants(true);
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user?.id, roomId, fetchRoom, fetchParticipants]);

  // Initialize Edit Buffers when activeRoom loads
  useEffect(() => {
    if (activeRoom) {
      setEditTitleBuffer(activeRoom.name);
      setEditDescBuffer(activeRoom.description || '');
    }
  }, [activeRoom]);



  // Only redirect once auth has fully resolved and there's no user
  if (!authLoading && !user) {
    signInWithGoogle();
    return null;
  }

  // isLoading = true on cold first-load only (no room data yet)
  const isShellLoading = authLoading || (roomLoading && !activeRoom);

  if (!isShellLoading && !activeRoom) return null;

  const isHost = activeRoom?.creator_id === user?.id;
  const settings = activeRoom?.settings || { lock_room: false, modify_teams: true, allow_duplicates: true };
  const isLockRoom = settings.lock_room === true;
  const isModifyTeamsRaw = settings.modify_teams !== false;
  // isModifyTeams is ONLY driven by the modify_teams setting.
  // Lock Room is intentionally independent — it blocks new joins (see useRooms.ts)
  // but must NOT override the host's explicit "Modify Teams" setting.
  const isModifyTeams = isModifyTeamsRaw;
  const allowDuplicates = settings.allow_duplicates !== false;

  // ── Daily Contest: hand off to dedicated component  ──────────────────────
  if ((settings.contest_type as string) === 'daily' && activeRoom && user) {
    return (
      <DailyContestRoom
        roomId={roomId}
        activeRoom={activeRoom}
        participants={participants}
        currentUserId={user.id}
        isHost={isHost}
        updateRoom={updateRoom}
        onLeave={async () => {
          await leaveRoom(roomId);
          router.push('/contests');
        }}
        onDelete={async () => {
          await deleteRoom(roomId);
          router.push('/contests');
        }}
        onKick={(profileId) => {
          setParticipants(prev => prev.filter(p => p.profile_id !== profileId));
          removeParticipant(roomId, profileId)
            .then(() => toast.success('Participant removed.'))
            .catch(() => { fetchParticipants(true); toast.error('Failed to remove.'); });
        }}
      />
    );
  }
  // ── End Daily Contest guard ──────────────────────────────────────────────


  // Calculate scores for participants using correct reference points based on lock status
  const participantsWithScores = participants.map(p => {
    let score = 0;
    const playersToScore = isLockRoom ? (p.locked_squad && p.locked_squad.length > 0 ? p.locked_squad : p.selected_players) : p.selected_players;

    if (playersToScore && playersToScore.length > 0 && players.length > 0) {
      playersToScore.forEach((playerId: number) => {
        const player = players.find(player => player.player_id === playerId);
        if (player) {
          score += player.overall_points;
        }
      });
    }
    return { ...p, score };
  }).sort((a, b) => b.score - a.score);

  // Duplicate Check logic
  const otherParticipantsDraftedIds = new Set<number>();
  participants.forEach(p => {
    if (p.profile_id !== user?.id && Array.isArray(p.selected_players)) {
      p.selected_players.forEach((id: number) => otherParticipantsDraftedIds.add(id));
    }
  });

  const containsDuplicates = (globalTeamSelectedPlayers: number[]) => {
    if (!Array.isArray(globalTeamSelectedPlayers)) return false;
    return globalTeamSelectedPlayers.some(id => otherParticipantsDraftedIds.has(id));
  };

  // Handlers
  const handleLeave = async () => {
    if (window.confirm("Are you sure you want to leave this contest?")) {
      await leaveRoom(roomId);
      router.push('/contests');
    }
  };

  const handleDeleteContest = async () => {
    if (window.confirm("Are you absolutely sure you want to completely delete this contest for everyone?")) {
      await deleteRoom(roomId);
      router.push('/contests');
    }
  };

  const handleKick = async (participantId: string) => {
    // Optimistic remove — no window.confirm() because that call is silently
    // blocked in PWA standalone mode on iOS, causing the kick to silently fail.
    // Two intentional taps (⋮ → Remove) already serve as confirmation.
    setParticipants(prev => prev.filter(p => p.profile_id !== participantId));
    try {
      await removeParticipant(roomId, participantId);
      toast.success('Participant removed.');
    } catch {
      fetchParticipants(true); // Revert optimistic update on error
      toast.error('Failed to remove participant.');
    }
  };

  const handleTitleSubmit = async () => {
    if (activeRoom && editTitleBuffer.trim() !== activeRoom.name) {
      activeRoom.name = editTitleBuffer.trim(); // optimistic
      await updateRoom(roomId, { name: editTitleBuffer.trim() });
    }
    setIsEditingTitle(false);
  };

  const handleDescSubmit = async () => {
    if (activeRoom && editDescBuffer.trim() !== activeRoom.description) {
      activeRoom.description = editDescBuffer.trim(); // optimistic
      await updateRoom(roomId, { description: editDescBuffer.trim() });
    }
    setIsEditingDesc(false);
  };

  const handleTeamMappingUpdate = async (globalTeamId: string, iplTeam: string) => {
    // Never sync team changes into the room when modifications are locked
    if (dropdownsFrozen) return;
    if (!globalTeamId || !iplTeam) return;
    try {
      await updateRoomTeam(roomId, globalTeamId, iplTeam);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleManualUpdate = async () => {
    // Blocked for everyone (including admin) when modify_teams is off
    if (dropdownsFrozen) {
      toast.error('Team modifications are locked by the admin.');
      return;
    }
    if (!selectedGlobalTeamId || !selectedIplTeam) {
      toast.error('Please select both a team and an IPL franchise.');
      return;
    }
    try {
      await updateRoomTeam(roomId, selectedGlobalTeamId, selectedIplTeam);
      await fetchParticipants(true);
      toast.success('Team updated successfully!');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  // Admin Switch Handlers
  const toggleLockRoom = async () => {
    const nextState = !isLockRoom;
    try {
      await updateRoom(roomId, { settings: { ...settings, lock_room: nextState } });
      if (nextState === true) {
        await lockRoomSquads(roomId);
        await fetchParticipants(true); // Refresh so UI reflects the new locked_squad
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to lock room');
    }
  };

  const toggleModifyTeams = async () => {
    const nextState = !isModifyTeamsRaw;
    try {
      if (!nextState) {
        // Turning modify OFF: lock the room and snapshot all squads atomically
        await updateRoom(roomId, { settings: { ...settings, modify_teams: false, lock_room: true } });
        await lockRoomSquads(roomId);
        await fetchParticipants(true); // Refresh so UI reflects the new locked_squad
      } else {
        await updateRoom(roomId, { settings: { ...settings, modify_teams: true } });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to toggle team modification');
    }
  };


  const toggleAllowDuplicates = async () => {
    await updateRoom(roomId, { settings: { ...settings, allow_duplicates: !allowDuplicates } });
  };

  // Manage Team dropdowns are frozen only when the host has disabled team modifications.
  // Lock Room is intentionally excluded here — it only prevents NEW joins (see useRooms.ts).
  const dropdownsFrozen = !isModifyTeams;

  return (
    <>
      {/* ─────────────────────────── MOBILE LAYOUT ─────────────────────────── */}
      <div className="md:hidden space-y-4 px-4">

        {viewingParticipant ? (
          /* Mobile Team Detail View */
          <div className="bg-surface-container-low rounded-2xl border border-white/5">
            {/* Compact mobile header */}
            <div className="px-4 py-4 border-b border-white/5 flex items-center gap-3"
              style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.10) 0%,transparent 100%)' }}>
              <button onClick={() => setViewingParticipant(null)}
                className="p-2 rounded-full bg-white/5 text-indigo-400 active:scale-95 transition-transform flex-shrink-0">
                <ArrowLeft size={16} strokeWidth={2.5} />
              </button>
              <div className="flex-1 min-w-0">
                <p className="font-black text-white text-sm font-headline truncate">
                  {viewingParticipant.profiles?.display_name || 'Manager'}
                </p>
                <p className="text-[9px] text-slate-500 truncate">{viewingParticipant.name || 'Unassigned Squad'}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-2xl font-black font-headline" style={{ color: '#c084fc' }}>
                  {(viewingParticipant as RoomParticipant & { score?: number }).score ?? 0}
                </p>
                <p className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">PTS</p>
              </div>
            </div>
            {/* Switch team dropdown */}
            <div className="px-4 py-2 border-b border-white/5 overflow-x-auto hide-scrollbar">
              <div className="flex gap-2">
                {participantsWithScores.map(p => (
                  <button key={p.id} onClick={() => setViewingParticipant(p)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[9px] font-bold transition-all active:scale-95 ${p.id === viewingParticipant.id ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-white/5 text-slate-400 border border-white/5'}`}>
                    {p.profiles?.display_name || 'Manager'}
                  </button>
                ))}
              </div>
            </div>
            {/* Squad table — compact mobile format (no duplicate header) */}
            <TeamDetailView
              participant={viewingParticipant}
              allParticipants={participantsWithScores}
              players={players}
              isModifyTeams={isModifyTeams}
              onBack={() => setViewingParticipant(null)}
              onSwitch={(p) => setViewingParticipant(p)}
              mobileView
            />
          </div>
        ) : (
          <>
            {/* ── Contest Header Card (A1: editable title + subtitle for host) ── */}
            <div className="relative overflow-hidden rounded-2xl bg-surface-container-high p-4 border border-white/5">
              <div className="flex justify-between items-center mb-3">
                {isShellLoading ? (
                  <div className="h-5 w-20 bg-white/5 rounded-full animate-pulse" />
                ) : (
                  <span className="text-[10px] font-black text-tertiary bg-tertiary/10 px-2.5 py-1 rounded-full uppercase tracking-wider">
                    {participantsWithScores.length} Teams
                  </span>
                )}
                {isShellLoading ? (
                  <div className="h-7 w-28 bg-white/5 rounded-lg animate-pulse" />
                ) : (
                  <button
                    onClick={() => navigator.clipboard.writeText(activeRoom?.invite_code || '').then(() => toast.success('Code copied!'))}
                    className="flex items-center gap-2 bg-surface-container-highest/60 rounded-lg py-1.5 px-2.5 border border-white/10 active:scale-95 transition-transform">
                    <span className="text-[8px] font-bold text-outline uppercase tracking-wider">CODE</span>
                    <span className="text-primary font-headline font-bold text-[11px] tracking-widest">{activeRoom?.invite_code}</span>
                    <Copy size={13} className="text-primary opacity-70" />
                  </button>
                )}
              </div>
              {isShellLoading ? (
                <div className="space-y-2">
                  <div className="h-6 w-48 bg-white/5 rounded animate-pulse" />
                  <div className="h-3 w-36 bg-white/5 rounded animate-pulse" />
                </div>
              ) : (
                <div className="space-y-1.5">
                  {/* Editable Title */}
                  {isEditingTitle && isHost ? (
                    <input
                      autoFocus
                      value={editTitleBuffer}
                      onChange={e => setEditTitleBuffer(e.target.value)}
                      onBlur={handleTitleSubmit}
                      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      className="w-full bg-transparent text-xl font-extrabold font-headline text-on-background border-b border-primary/70 outline-none pb-0.5 leading-tight"
                    />
                  ) : (
                    <div className="flex items-start gap-2">
                      <h2 className="font-headline text-xl font-extrabold text-on-background leading-tight flex-1">{activeRoom?.name}</h2>
                      {isHost && (
                        <button
                          onPointerDown={e => { e.preventDefault(); setIsEditingTitle(true); }}
                          className="flex-shrink-0 mt-1 p-1 rounded-md bg-white/5 active:bg-white/10 transition-colors">
                          <Pen size={11} className="text-slate-500" />
                        </button>
                      )}
                    </div>
                  )}
                  {/* Editable Description */}
                  {isEditingDesc && isHost ? (
                    <input
                      autoFocus
                      value={editDescBuffer}
                      onChange={e => setEditDescBuffer(e.target.value)}
                      onBlur={handleDescSubmit}
                      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      className="w-full bg-transparent text-xs text-on-surface-variant border-b border-primary/40 outline-none pb-0.5"
                      placeholder="Add a subtitle..."
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="text-on-surface-variant text-xs flex-1">
                        {activeRoom?.description || (isHost ? 'Add description...' : '')}
                      </p>
                      {isHost && (
                        <button
                          onPointerDown={e => { e.preventDefault(); setIsEditingDesc(true); }}
                          className="flex-shrink-0 p-0.5 rounded bg-white/5 active:bg-white/10 transition-colors">
                          <Pen size={9} className="text-slate-600" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── A3: Top-Level Tabs: Leaderboard | Settings ── */}
            <div className="flex bg-surface-container-highest/30 p-1 rounded-xl border border-white/5">
              <button
                onClick={() => setMobileMainTab('leaderboard')}
                className={`flex-1 py-2 text-[11px] font-headline transition-all rounded-lg ${mobileMainTab === 'leaderboard' ? 'bg-primary text-on-primary font-bold shadow-lg shadow-primary/20' : 'text-outline-variant font-medium'}`}>
                📊 Leaderboard
              </button>
              <button
                onClick={() => setMobileMainTab('settings')}
                className={`flex-1 py-2 text-[11px] font-headline transition-all rounded-lg ${mobileMainTab === 'settings' ? 'bg-primary text-on-primary font-bold shadow-lg shadow-primary/20' : 'text-outline-variant font-medium'}`}>
                ⚙️ Settings
              </button>
            </div>

            {/* ── Leaderboard Tab ── */}
            {mobileMainTab === 'leaderboard' && (
              <section>
                <div className="space-y-1.5 overflow-y-auto hide-scrollbar" style={{ maxHeight: '420px' }}>
                  {loadingMembers ? (
                    [...Array(5)].map((_, i) => (
                      <div key={i} className="bg-surface-container-high p-2.5 rounded-xl flex items-center gap-3 border border-white/5 animate-pulse">
                        <div className="w-6 h-4 bg-white/5 rounded" />
                        <div className="w-10 h-10 rounded-lg bg-white/5 flex-shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3 w-28 bg-white/5 rounded" />
                          <div className="h-2 w-16 bg-white/5 rounded" />
                        </div>
                        <div className="h-4 w-12 bg-white/5 rounded" />
                      </div>
                    ))
                  ) : participantsWithScores.length === 0 ? (
                    <p className="text-center text-slate-500 py-8 text-sm">No teams have joined yet.</p>
                  ) : (
                    participantsWithScores.map((p, idx) => {
                      const isMe = user && p.profile_id === user.id;
                      const avatarColors = ['bg-primary/20 text-primary','bg-orange-500/10 text-orange-400','bg-emerald-500/10 text-emerald-400','bg-rose-500/10 text-rose-400'];
                      const aClass = avatarColors[idx % 4];
                      const menuOpen = mobileMenuOpenId === p.id;
                      // A2: flip dropdown upward for the last 2 items to prevent overflow
                      const opensUpward = idx >= participantsWithScores.length - 2;
                      return (
                        <div key={p.id} className={`relative bg-surface-container-high p-2.5 rounded-xl flex items-center gap-3 border transition-colors active:bg-white/10 ${isMe ? 'border-indigo-500/30 bg-indigo-500/5' : 'border-white/5'}`}
                          onClick={() => { setViewingParticipant(participantsWithScores.find(ps => ps.id === p.id) || null); }}>
                          {/* Rank */}
                          <div className="w-6 text-center font-headline font-bold text-xs flex-shrink-0" style={{ color: idx === 0 && p.score > 0 ? '#fd9000' : '#73757d' }}>
                            {idx === 0 && p.score > 0 ? '👑' : idx + 1}
                          </div>
                          {/* Avatar */}
                          {p.ipl_team ? (
                            <div className="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center overflow-hidden border border-white/10 p-1 flex-shrink-0">
                              <img src={`/logos/${p.ipl_team.toLowerCase()}.png`} alt={p.ipl_team} width={32} height={32}
                                className="object-contain w-full h-full"
                                onError={(e) => { e.currentTarget.style.display='none'; const f = e.currentTarget.nextElementSibling as HTMLElement|null; if(f) f.style.display='flex'; }} />
                              <div style={{display:'none'}} className={`w-full h-full flex justify-center items-center font-bold text-[9px] uppercase ${aClass}`}>{p.ipl_team.substring(0,3)}</div>
                            </div>
                          ) : (
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-[9px] uppercase flex-shrink-0 ${aClass}`}>
                              {(p.name||'?').split(' ').map((n:string)=>n[0]).join('').substring(0,2)}
                            </div>
                          )}
                          {/* Name */}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-headline font-bold text-on-surface text-xs truncate flex items-center gap-1">
                              {p.profiles?.display_name || 'Manager'}
                              {isMe && <span className="text-[7px] px-1 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-bold uppercase">You</span>}
                            </h4>
                            <p className="text-[9px] text-outline uppercase truncate">{IPL_FRANCHISES.find(f=>f.id===p.ipl_team)?.name || 'Unassigned'}</p>
                          </div>
                          {/* Score */}
                          <div className="text-right flex-shrink-0" onClick={e => e.stopPropagation()}>
                            <p className="font-headline font-extrabold text-sm text-tertiary">{p.score}</p>
                            <p className="text-[8px] text-outline uppercase">Pts</p>
                          </div>
                          {/* More options */}
                          {isHost && (
                            <button className="p-1 text-outline flex-shrink-0" onClick={e => { e.stopPropagation(); setMobileMenuOpenId(menuOpen ? null : p.id); }}>
                              <MoreVertical size={16} />
                            </button>
                          )}
                          {/* A2: dropdown flips upward for last 2 rows */}
                          {menuOpen && isHost && (
                            <div
                              className={`absolute right-0 z-50 bg-surface-container-high border border-white/10 rounded-xl shadow-2xl py-1 min-w-[120px] ${opensUpward ? 'bottom-full mb-1' : 'top-full mt-1'}`}
                              onClick={e => e.stopPropagation()}>
                              <button onClick={() => { setViewingParticipant(participantsWithScores.find(ps=>ps.id===p.id)||null); setMobileMenuOpenId(null); }}
                                className="w-full text-left px-3 py-2 text-[10px] font-bold hover:bg-white/5 text-on-surface flex items-center gap-2">
                                <Eye size={12} /> View Team
                              </button>
                              {!isMe && (
                                <button onClick={() => {handleKick(p.profile_id); setMobileMenuOpenId(null); }}
                                  className="w-full text-left px-3 py-2 text-[10px] font-bold hover:bg-error/10 text-error flex items-center gap-2 border-t border-white/5">
                                  <UserMinus size={12} /> Remove
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            )}

            {/* ── Settings Tab ── */}
            {mobileMainTab === 'settings' && (
              <div className="space-y-4">
                {/* Admin Controls — host only */}
                {isHost && (
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2 px-1">Admin Controls</p>
                    <div className="bg-surface-container rounded-xl divide-y divide-white/5 overflow-hidden border border-white/5">
                      {[
                        { icon: <Lock size={18} className="text-primary" />, label: 'Lock Room', sub: 'Prevent new entries', active: isLockRoom, toggle: toggleLockRoom },
                        { icon: <Pen size={18} className="text-secondary" />, label: 'Modify Teams', sub: 'Allow roster changes', active: isModifyTeamsRaw, toggle: toggleModifyTeams },
                        { icon: <Copy size={18} className="text-tertiary" />, label: 'Allow Duplicates', sub: 'Identical rosters', active: allowDuplicates, toggle: toggleAllowDuplicates },
                      ].map(({ icon, label, sub, active, toggle }) => (
                        <div key={label} className="px-4 py-3.5 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {icon}
                            <div>
                              <p className="font-headline font-bold text-xs">{label}</p>
                              <p className="text-[10px] text-outline">{sub}</p>
                            </div>
                          </div>
                          <button onClick={toggle}
                            className={`w-10 h-5 rounded-full relative transition-all flex-shrink-0 ${active ? 'bg-primary' : 'bg-surface-container-highest'}`}>
                            <div className={`absolute top-[3px] w-3.5 h-3.5 rounded-full bg-white transition-all ${active ? 'right-[3px]' : 'left-[3px]'}`} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* My Team */}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2 px-1">My Team</p>
                  <div className={`bg-surface-container rounded-xl p-4 border border-white/5 space-y-4 ${dropdownsFrozen ? 'opacity-75' : ''}`}>
                    {dropdownsFrozen && (
                      <div className="flex items-center gap-2 text-[10px] font-bold text-outline uppercase tracking-widest">
                        <Lock size={10} strokeWidth={3} /> Locked by admin
                      </div>
                    )}
                    <div className="space-y-3">
                      <div className="relative">
                        <label className="text-[9px] font-bold text-outline uppercase mb-1.5 block ml-1 tracking-wider">User Team</label>
                        <select disabled={dropdownsFrozen} value={selectedGlobalTeamId}
                          onChange={e => { setSelectedGlobalTeamId(e.target.value); if (selectedIplTeam && e.target.value) handleTeamMappingUpdate(e.target.value, selectedIplTeam); }}
                          className="w-full bg-surface-container-highest/50 border border-white/10 rounded-lg py-3 px-3 text-xs text-on-surface appearance-none focus:ring-1 focus:ring-primary focus:outline-none font-headline font-bold disabled:cursor-not-allowed">
                          <option value="">Select your team</option>
                          {myGlobalTeams.map(t => {
                            const hasDupes = !allowDuplicates && containsDuplicates(t.selected_players);
                            return <option key={t.id} value={t.id} disabled={hasDupes}>{t.name}{hasDupes ? ' (Dupes)' : ''}</option>;
                          })}
                        </select>
                        <div className="absolute right-3 top-[calc(50%+10px)] -translate-y-1/2 pointer-events-none text-outline">
                          <ChevronDown size={14} />
                        </div>
                      </div>
                      <div className="relative">
                        <label className="text-[9px] font-bold text-outline uppercase mb-1.5 block ml-1 tracking-wider">IPL Franchise</label>
                        <select disabled={dropdownsFrozen} value={selectedIplTeam}
                          onChange={e => { setSelectedIplTeam(e.target.value); if (selectedGlobalTeamId && e.target.value) handleTeamMappingUpdate(selectedGlobalTeamId, e.target.value); }}
                          className="w-full bg-surface-container-highest/50 border border-white/10 rounded-lg py-3 px-3 text-xs text-on-surface appearance-none focus:ring-1 focus:ring-primary focus:outline-none font-headline font-bold disabled:cursor-not-allowed">
                          <option value="">Choose an IPL team</option>
                          {IPL_FRANCHISES.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                        <div className="absolute right-3 top-[calc(50%+10px)] -translate-y-1/2 pointer-events-none text-outline">
                          <ChevronDown size={14} />
                        </div>
                      </div>
                    </div>
                    <button onClick={handleManualUpdate} disabled={dropdownsFrozen}
                      className="w-full bg-primary text-on-primary py-3.5 rounded-lg font-headline font-extrabold text-[11px] uppercase tracking-widest active:scale-95 transition-transform shadow-lg shadow-primary/20 disabled:opacity-40 disabled:cursor-not-allowed">
                      Update Team Selection
                    </button>
                  </div>
                </div>

                {/* Danger Zone */}
                <button
                  onClick={isHost ? handleDeleteContest : handleLeave}
                  className="w-full py-4 rounded-xl border border-error/30 text-error font-headline font-extrabold text-[11px] uppercase tracking-[0.2em] active:bg-error/10 transition-colors flex items-center justify-center gap-2">
                  <Trash2 size={14} />
                  {isHost ? 'Dissolve Contest Room' : 'Leave Contest'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ─────────────────────────── DESKTOP LAYOUT ─────────────────────────── */}
      <div className="hidden md:block max-w-7xl mx-auto w-full">

        {/* Desktop Header */}
        <div className="mb-12">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <nav className="flex gap-2 text-xs font-bold text-indigo-400/60 tracking-widest uppercase items-center">
              <span>Contests</span><span>/</span>
              <span className="text-indigo-400">{isShellLoading ? '...' : activeRoom?.name}</span>
            </nav>
            {isShellLoading ? (
              <div className="h-4 w-32 bg-white/5 rounded animate-pulse" />
            ) : !isHost ? (
              <button onClick={handleLeave} className="text-[10px] font-bold text-error/80 hover:text-error uppercase tracking-[0.2em] flex items-center gap-1.5 px-3 py-1 bg-error/5 rounded-md border border-error/20 transition-all">
                <LogOut size={14} strokeWidth={2.5} /> Leave Contest
              </button>
            ) : (
              <button onClick={handleDeleteContest} className="text-[10px] font-bold text-error/80 hover:text-error uppercase tracking-[0.2em] flex items-center gap-1.5 px-3 py-1 bg-error/5 rounded-md border border-error/20 transition-all">
                <Trash2 size={14} strokeWidth={2.5} /> Delete Contest
              </button>
            )}
          </div>

          <div className="flex justify-between items-start gap-12">
            <div className="flex-grow group">
              <div className="flex items-center gap-3">
                {isShellLoading ? (
                  <div className="h-12 w-64 bg-white/5 rounded-xl animate-pulse mt-1" />
                ) : isEditingTitle && isHost ? (
                  <input autoFocus
                    className="bg-surface-container-low text-5xl font-black font-headline text-on-surface leading-tight w-full outline-none border-b-2 border-primary border-dashed"
                    value={editTitleBuffer} onChange={e => setEditTitleBuffer(e.target.value)}
                    onBlur={handleTitleSubmit} onKeyDown={e => e.key === 'Enter' && handleTitleSubmit()} />
                ) : (
                  <h2 onDoubleClick={() => isHost && setIsEditingTitle(true)}
                    className={`text-5xl font-black font-headline text-on-surface leading-tight ${isHost ? 'cursor-text hover:text-indigo-300 transition-colors' : ''}`}>
                    {activeRoom?.name}
                  </h2>
                )}
                {isHost && (
                  <button onClick={() => { if (isEditingTitle) handleTitleSubmit(); else setIsEditingTitle(true); }}
                    className={`p-2 rounded-full transition-all flex items-center gap-2 text-xs font-bold uppercase tracking-widest ${isEditingTitle ? 'bg-primary text-on-primary' : 'text-primary bg-primary/10 hover:bg-primary/20 opacity-0 group-hover:opacity-100'}`}>
                    {isEditingTitle ? <Check size={16} strokeWidth={2.5} /> : <Pen size={14} strokeWidth={2.5} />}
                  </button>
                )}
              </div>
              <p className="text-on-surface-variant mt-2 max-w-lg text-sm">{activeRoom?.description || ''}</p>
            </div>

            <div className="shrink-0 pt-2">
              {isShellLoading ? (
                <div className="h-12 w-32 bg-white/5 rounded-lg animate-pulse" />
              ) : (
                <div className="bg-surface-container-high/50 border border-white/5 px-3 py-1 rounded-lg flex items-center gap-5 backdrop-blur-sm hover:border-indigo-500/30 transition-all">
                  <div className="flex flex-col">
                    <span className="text-[8px] font-bold text-indigo-400/60 uppercase tracking-widest leading-none mb-1">Invite Code</span>
                    <span className="font-mono text-sm font-bold text-on-surface">{activeRoom?.invite_code}</span>
                  </div>
                  <button onClick={() => navigator.clipboard.writeText(activeRoom?.invite_code || '').then(() => toast.success('Copied!'))}
                    className="p-1.5 hover:bg-indigo-500/10 rounded-md text-indigo-400 transition-colors">
                    <Copy size={16} strokeWidth={2.5} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Desktop Body */}
        {viewingParticipant ? (
          <TeamDetailView
            participant={viewingParticipant}
            allParticipants={participantsWithScores}
            players={players}
            isModifyTeams={isModifyTeams}
            onBack={() => setViewingParticipant(null)}
            onSwitch={(p) => setViewingParticipant(p)}
          />
        ) : (
          <div className="grid grid-cols-12 gap-6">
            {/* Leaderboard */}
            <div className="col-span-12 lg:col-span-8 order-2 lg:order-1">
              <div className="bg-surface-container-low rounded-2xl min-h-[500px] flex flex-col border border-white/5">
                <div className="p-6 border-b border-white/5 flex justify-between items-center">
                  <div>
                    <h3 className="text-2xl mb-2 font-bold font-headline text-on-surface">Leaderboard</h3>
                    <p className="text-sm text-on-surface-variant">Total Teams: {participantsWithScores.length}</p>
                  </div>
                </div>
                <div className="w-full overflow-x-auto">
                  <table className="w-full text-left border-collapse" style={{ minWidth: '400px' }}>
                    <thead className="bg-surface-container-lowest/50">
                      <tr>
                        <th className="px-8 py-4 text-[10px] font-bold text-outline uppercase tracking-widest">#</th>
                        <th className="px-8 py-4 text-[10px] font-bold text-outline uppercase tracking-widest">Team</th>
                        <th className="px-8 py-4 text-[10px] font-bold text-outline uppercase tracking-widest">Pts</th>
                        <th className="px-8 py-4"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 relative">
                      {loadingMembers ? (
                        [...Array(5)].map((_, i) => (
                          <tr key={i} className="animate-pulse">
                            <td className="px-8 py-6"><div className="h-4 w-4 bg-white/5 rounded" /></td>
                            <td className="px-8 py-6">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-lg bg-white/5" />
                                <div className="space-y-2">
                                  <div className="h-4 w-32 bg-white/5 rounded" />
                                  <div className="h-3 w-24 bg-white/5 rounded" />
                                </div>
                              </div>
                            </td>
                            <td className="px-8 py-6"><div className="h-4 w-12 bg-white/5 rounded" /></td>
                            <td className="px-8 py-6"><div className="h-4 w-8 bg-white/5 rounded ml-auto" /></td>
                          </tr>
                        ))
                      ) : participantsWithScores.length === 0 ? (
                        <tr><td colSpan={4} className="p-8 text-center text-slate-500">No teams have joined yet.</td></tr>
                      ) : (
                        participantsWithScores.map((p, idx) => {
                          const isMe = user && p.profile_id === user.id;
                          const avatarColors = ['bg-primary/20 text-primary','bg-orange-500/10 text-orange-400','bg-emerald-500/10 text-emerald-400','bg-rose-500/10 text-rose-400'];
                          const aClass = avatarColors[idx % 4];
                          return (
                            <tr key={p.id}
                              className={`transition-colors cursor-pointer ${isMe ? 'bg-indigo-500/[0.08] ring-1 ring-inset ring-indigo-500/20 hover:bg-indigo-500/[0.12]' : 'hover:bg-white/5'}`}
                              onClick={() => setViewingParticipant(participantsWithScores.find(ps => ps.id === p.id) || null)}>
                              <td className="px-8 py-6">
                                <div className="flex items-center gap-1">
                                  {idx === 0 && p.score > 0 && <Crown size={14} className="text-tertiary mr-1 fill-tertiary/20" strokeWidth={2.5} />}
                                  <span className="text-on-surface font-semibold">{idx + 1}</span>
                                </div>
                              </td>
                              <td className="px-8 py-6">
                                <div className="flex items-center gap-4">
                                  {p.ipl_team ? (
                                    <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden bg-white/5 border border-white/10 p-1">
                                      <img src={`/logos/${p.ipl_team.toLowerCase()}.png`} alt={p.ipl_team} width={40} height={40}
                                        className="object-contain w-full h-full drop-shadow"
                                        onError={e => { e.currentTarget.style.display='none'; const f=e.currentTarget.nextElementSibling as HTMLElement|null; if(f) f.style.display='flex'; }} />
                                      <div style={{display:'none'}} className={`w-full h-full flex justify-center items-center font-bold text-xs uppercase tracking-tighter ${aClass}`}>{p.ipl_team.substring(0,3)}</div>
                                    </div>
                                  ) : (
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs uppercase tracking-tighter ${aClass}`}>
                                      {(p.name||'?').split(' ').map((n:string)=>n[0]).join('').substring(0,2)}
                                    </div>
                                  )}
                                  <div>
                                    <p className="font-bold text-on-surface flex items-center gap-2">
                                      {p.profiles?.display_name || 'Manager'}
                                      {activeRoom && p.profile_id === activeRoom.creator_id && <span className="text-[9px] px-1.5 py-0.5 rounded bg-tertiary/20 text-tertiary font-bold uppercase tracking-widest">Host</span>}
                                      {isMe && <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-bold uppercase tracking-widest">You</span>}
                                    </p>
                                    <p className="text-xs text-on-surface-variant line-clamp-1">{p.ipl_team ? IPL_FRANCHISES.find(f=>f.id===p.ipl_team)?.name : 'Unassigned'}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-8 py-6 text-tertiary font-bold">{p.score}</td>
                              <td className="px-8 py-6 text-right relative">
                                <div className="group/menu relative inline-block text-left">
                                  <button className="opacity-0 group-hover:opacity-100 p-2 hover:bg-surface-container-highest rounded-lg transition-all text-outline" onClick={e=>e.stopPropagation()}>
                                    <MoreVertical size={20} />
                                  </button>
                                  <div className="hidden group-hover/menu:block absolute right-0 top-full w-48 rounded-md shadow-lg bg-surface-container-high ring-1 ring-black ring-opacity-5 z-50">
                                    <div className="py-1">
                                      <button onClick={e=>{e.stopPropagation(); setViewingParticipant(participantsWithScores.find(ps=>ps.id===p.id)||null);}}
                                        className="text-sm font-medium text-on-surface hover:bg-white/5 block w-full text-left px-4 py-2 flex items-center gap-2">
                                        <Eye size={16} strokeWidth={2.5} /> View team
                                      </button>
                                      {isHost && !isMe && (
                                        <button onClick={e=>{e.stopPropagation(); handleKick(p.profile_id);}}
                                          className="text-sm font-bold text-error hover:bg-error/10 block w-full text-left px-4 py-2 flex items-center gap-2">
                                          <UserMinus size={16} strokeWidth={2.5} /> Remove
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="col-span-12 lg:col-span-4 space-y-6 order-1 lg:order-2">
              {/* Manage Team */}
              <div className={`bg-surface-container-low p-6 rounded-2xl border border-white/5 transition-all ${dropdownsFrozen ? 'opacity-75' : ''}`}>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-sm font-bold text-on-surface uppercase tracking-widest flex items-center gap-2">
                    Manage Team {dropdownsFrozen && <Lock size={12} className="text-outline" strokeWidth={3} />}
                  </h3>
                  <button onClick={handleManualUpdate} disabled={dropdownsFrozen}
                    className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest bg-primary text-on-primary px-3 py-1.5 rounded-md hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    Update
                  </button>
                </div>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest">Choose Team</label>
                    <div className="relative">
                      <select disabled={dropdownsFrozen} value={selectedGlobalTeamId}
                        onChange={e => { setSelectedGlobalTeamId(e.target.value); if (selectedIplTeam && e.target.value) handleTeamMappingUpdate(e.target.value, selectedIplTeam); }}
                        className="w-full bg-surface-container-lowest border border-white/10 rounded-lg py-3 px-4 text-sm font-medium text-on-surface appearance-none focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all cursor-pointer disabled:cursor-not-allowed">
                        <option value="">Select your team</option>
                        {myGlobalTeams.map(t => {
                          const hasDupes = !allowDuplicates && containsDuplicates(t.selected_players);
                          return <option key={t.id} value={t.id} disabled={hasDupes}>{t.name}{hasDupes ? ' (Includes Dupes)' : ''}</option>;
                        })}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-outline"><ChevronDown size={16} strokeWidth={2.5} /></div>
                    </div>
                    {!allowDuplicates && <p className="text-[10px] text-error/80 uppercase font-bold tracking-widest">No Duplicates Mode ENFORCED</p>}
                    {dropdownsFrozen && <p className="text-[10px] text-outline uppercase font-bold tracking-widest mt-1">LOCKED BY ADMIN</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest">Select IPL Team</label>
                    <div className="relative">
                      <select disabled={dropdownsFrozen} value={selectedIplTeam}
                        onChange={e => { setSelectedIplTeam(e.target.value); if (selectedGlobalTeamId && e.target.value) handleTeamMappingUpdate(selectedGlobalTeamId, e.target.value); }}
                        className="w-full bg-surface-container-lowest border border-white/10 rounded-lg py-3 px-4 text-sm font-medium text-on-surface appearance-none focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all cursor-pointer disabled:cursor-not-allowed">
                        <option value="">Choose an IPL team</option>
                        {IPL_FRANCHISES.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-outline"><ChevronDown size={16} strokeWidth={2.5} /></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Admin Settings */}
              {isHost && (
                <div className="bg-surface-container-low p-6 rounded-2xl border border-white/5">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-sm font-bold text-on-surface uppercase tracking-widest">Admin Settings</h3>
                    <ShieldCheck size={20} className="text-tertiary" />
                  </div>
                  <div className="space-y-6">
                    {[
                      { label: 'Lock Room', sub: 'People cannot join', active: isLockRoom, toggle: toggleLockRoom },
                      { label: 'Modify teams', sub: 'Allow people to change their team', active: isModifyTeamsRaw, toggle: toggleModifyTeams },
                      { label: 'Allow Duplicates', sub: 'Players in teams', active: allowDuplicates, toggle: toggleAllowDuplicates },
                    ].map(({ label, sub, active, toggle }) => (
                      <div key={label} className="flex items-center justify-between p-4 bg-surface-container-lowest rounded-lg">
                        <div>
                          <p className="font-semibold text-on-surface">{label}</p>
                          <p className="text-xs text-on-surface-variant">{sub}</p>
                        </div>
                        <button onClick={toggle} className={`w-12 h-6 ${active ? 'bg-tertiary' : 'bg-surface-container-highest'} rounded-full relative transition-all`}>
                          <div className={`absolute top-1 w-4 h-4 rounded-full transition-all ${active ? 'bg-on-tertiary right-1' : 'bg-outline left-1'}`} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────
// TeamDetailView Component
// ─────────────────────────────────────────────────────────

interface TeamDetailViewProps {
  participant: (RoomParticipant & { score?: number }) | null;
  allParticipants: (RoomParticipant & { score?: number })[];
  players: { player_id: number; name: string; team_short_name: string; skill_name: string; overall_points: number }[];
  /** When false (Modify Teams is off), display the locked_squad snapshot instead of the live global team */
  isModifyTeams: boolean;
  onBack: () => void;
  onSwitch: (p: RoomParticipant & { score?: number }) => void;
  /** When true: skip the hero header (parent renders its own) and use compact mobile row table */
  mobileView?: boolean;
}

function TeamDetailView({ participant, allParticipants, players, isModifyTeams, onBack, onSwitch, mobileView }: TeamDetailViewProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // When Modify Teams is OFF, show the locked snapshot (what was frozen at lock time).
  // When ON, show the current live global team.
  const rawPlayerIds: number[] = !isModifyTeams && (participant?.locked_squad?.length ?? 0) > 0
    ? (participant?.locked_squad ?? []).map(Number)
    : (participant?.selected_players ?? []).map(Number);

  // Resolve to full player objects, then sort descending by overall_points
  const squadPlayers = rawPlayerIds
    .map(id => players.find(p => p.player_id === id))
    .filter(Boolean)
    .sort((a, b) => (b!.overall_points ?? 0) - (a!.overall_points ?? 0)) as typeof players;

  const squadPlayerIds = squadPlayers.map(p => p.player_id);
  const squadTeamNames = [...new Set(squadPlayers.map(p => p.team_short_name))];

  const { playerHistory, playedTeamSchedule, maxMatchCount, loading } = usePlayerMatchHistory(
    squadPlayerIds,
    squadTeamNames
  );

  const matchCols = Array.from({ length: maxMatchCount }, (_, i) => i + 1);

  if (!participant) return null;

  const totalScore = (participant as RoomParticipant & { score?: number }).score ?? 0;
  const initials = (participant.profiles?.display_name || 'Manager').split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();

  // ── Mobile compact view ─────────────────────────────────────────────────────
  if (mobileView) {
    return (
      <div className="rounded-b-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <div className="overflow-x-auto">
          <table
            className="w-full text-left border-collapse"
            style={{ minWidth: `${120 + matchCols.length * 36 + 52}px` }}
          >
            <thead>
              <tr className="border-b border-white/5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <th className="px-3 py-2.5 text-[8px] font-black uppercase tracking-widest text-slate-500 sticky left-0 z-20 min-w-[120px]"
                  style={{ background: 'rgb(13,18,30)' }}>
                  Player
                </th>
                {loading ? (
                  <th className="px-3 py-2.5 text-[8px] font-black uppercase tracking-widest text-slate-600">Loading…</th>
                ) : matchCols.map(n => (
                  <th key={n} className="w-9 py-2.5 text-center text-[8px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap"
                  style={{ background: 'rgb(13,18,30)' }}
                  >M{n}</th>
                ))}
                <th className="px-3 py-2.5 text-[8px] font-black uppercase tracking-widest text-primary text-right sticky right-0 z-20 min-w-[44px]"
                  style={{ background: 'rgb(13,18,30)' }}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-3 py-3 sticky left-0 z-10" style={{ background: 'rgb(13,18,30)' }}>
                      <div className="h-3 bg-surface-container-high rounded w-20 mb-1" />
                      <div className="h-2.5 bg-surface-container-high rounded w-14" />
                    </td>
                    {[...Array(4)].map((_, j) => (
                      <td key={j} className="py-3 text-center">
                        <div className="h-3 bg-surface-container-high rounded w-6 mx-auto" />
                      </td>
                    ))}
                    <td className="px-3 py-3 sticky right-0 z-10" style={{ background: 'rgb(13,18,30)' }}>
                      <div className="h-3 bg-surface-container-high rounded w-8 ml-auto" />
                    </td>
                  </tr>
                ))
              ) : squadPlayers.length === 0 ? (
                <tr>
                  <td colSpan={matchCols.length + 2} className="p-8 text-center text-slate-500 text-xs">
                    This participant hasn&apos;t drafted any players yet.
                  </td>
                </tr>
              ) : squadPlayers.map((player, rowIdx) => {
                const teamColor = TEAM_COLOR[player.team_short_name];
                const totalPts = players.find(p => p.player_id === player.player_id)?.overall_points || 0;
                const relPts = getRelativeMatchPoints(player, playedTeamSchedule, playerHistory);
                const rowBg = rowIdx % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent';
                const stickyBg = rowIdx % 2 === 0 ? 'rgb(15,20,32)' : 'rgb(13,18,30)';
                return (
                  <tr key={player.player_id} className="hover:bg-white/5 transition-colors">
                    {/* Sticky player column */}
                    <td className="px-3 py-3 sticky left-0 z-10" style={{ background: '#0f1829' }}>
                      <p className="text-xs font-headline font-bold text-on-surface truncate max-w-[160px]">{player.name}</p>
                      <p className="text-[8px] font-bold uppercase tracking-widest mt-0.5 truncate"
                        style={{ color: teamColor || '#64748b' }}>
                        {player.team_short_name} · {formatSkillName(player.skill_name)}
                      </p>
                    </td>
                    {/* Scrollable match-point columns */}
                    {matchCols.map(n => {
                      const pts = relPts[n - 1];
                      const hasPlayed = pts !== undefined;
                      return (
                        <td key={n} className="w-9 py-3 text-center text-[10px] font-headline font-bold"
                          style={{ background: rowBg }}>
                          {hasPlayed
                            ? <span className={pts === 0 ? 'text-slate-600' : 'text-on-surface'}>{pts}</span>
                            : <span className="text-slate-700">–</span>}
                        </td>
                      );
                    })}
                    {/* Sticky total column */}
                    <td className="px-3 py-3 text-right font-headline font-black text-tertiary text-xs sticky right-0 z-10"
                      style={{ background: '#0f1829' }}>
                      {totalPts}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ── Desktop full view (with hero header) ────────────────────────────────
  return (
    <div className="bg-surface-container-low rounded-2xl border border-white/5">
      {/* Hero Header — overflow-visible so the Switch Team dropdown is never clipped */}
      <div className="relative px-8 py-7 border-b border-white/5 rounded-t-2xl overflow-visible"
        style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.06) 50%, transparent 100%)' }}>
        {/* Ambient glow */}
        <div className="absolute top-0 right-0 w-64 h-full bg-indigo-500/5 blur-3xl pointer-events-none rounded-t-2xl" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent" />

        <div className="relative flex items-start justify-between flex-wrap gap-6">
          {/* Left: Back + Identity */}
          <div className="flex items-start gap-5">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 hover:text-indigo-300 transition-colors mt-1 flex-shrink-0"
            >
              <ArrowLeft size={14} strokeWidth={2.5} />
              Back
            </button>
            <div className="w-px h-12 bg-white/10 flex-shrink-0" />
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/25">
                <span className="text-white font-black text-sm font-headline">{initials}</span>
              </div>
              <div>
                <h3 className="text-2xl font-black font-headline text-white leading-tight">
                  {participant.profiles?.display_name || 'Manager'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">
                  {participant.name || 'Unassigned Squad'}
                </p>
              </div>
            </div>
          </div>

          {/* Right: Total Score + Dropdown */}
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 mb-0">Total Score</p>
              <p className="text-5xl font-headline font-black leading-none" style={{ color: '#c084fc' }}>
                {totalScore.toLocaleString()}
              </p>
              <p className="text-[10px] font-bold text-slate-600 mt-0.5">PTS</p>
            </div>

            {/* Switch Team dropdown — z-[9999] ensures it renders above everything */}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setDropdownOpen(o => !o)}
                className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-2 rounded-xl text-xs font-bold text-slate-300 hover:border-indigo-500/30 hover:bg-indigo-500/10 transition-all"
              >
                Switch Team <ChevronDownIcon size={13} strokeWidth={2.5} />
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-60 bg-[#131d30] border border-indigo-500/20 rounded-xl shadow-2xl shadow-black/60 z-[9999] py-1 overflow-y-auto max-h-64">
                  {allParticipants.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { onSwitch(p); setDropdownOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between hover:bg-white/5 transition-colors ${p.id === participant.id ? 'text-indigo-400 font-bold bg-indigo-500/10' : 'text-on-surface font-medium'}`}
                    >
                      <span>{p.profiles?.display_name || 'Manager'}</span>
                      <span className="text-xs font-bold" style={{ color: '#c084fc' }}>{(p as RoomParticipant & { score?: number }).score ?? 0}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Squad Table */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <table className="w-full text-left" style={{ minWidth: `${Math.max(500, 240 + matchCols.length * 64)}px` }}>
            <thead>
              <tr className="text-slate-500 text-[10px] uppercase tracking-widest border-b border-white/5 bg-surface-container-lowest/50">
                <th className="px-6 py-4 font-bold sticky left-0 bg-surface-container-lowest/50 min-w-[200px]">Player</th>
                {matchCols.map(n => (
                  <th key={n} className="px-3 py-4 font-bold text-center whitespace-nowrap">M{n}</th>
                ))}
                <th className="px-6 py-4 font-bold text-center text-indigo-400 sticky right-0 bg-surface-container-lowest/50 z-10">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {squadPlayers.length === 0 ? (
                <tr>
                  <td colSpan={matchCols.length + 2} className="px-6 py-12 text-center text-slate-500 text-sm">
                    This participant hasn&apos;t drafted any players yet.
                  </td>
                </tr>
              ) : squadPlayers.map(player => {
                const teamColor = TEAM_COLOR[player.team_short_name];
                const totalPts = players.find(p => p.player_id === player.player_id)?.overall_points || 0;
                const relPts = getRelativeMatchPoints(player, playedTeamSchedule, playerHistory);
                return (
                  <tr key={player.player_id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 sticky left-0 bg-[#0f1829] hover:bg-[#151f35] transition-colors z-10">
                      <span className="font-semibold text-sm text-on-surface block">{player.name}</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest mt-0.5 block" style={{ color: teamColor || '#64748b' }}>
                        {player.team_short_name} • {formatSkillName(player.skill_name)}
                      </span>
                    </td>
                    {matchCols.map((n) => {
                      const pts = relPts[n - 1];
                      const hasPlayed = pts !== undefined;
                      return (
                        <td key={n} className="px-3 py-4 text-center text-xs font-bold">
                          {hasPlayed
                            ? <span className={pts === 0 ? 'text-slate-500' : 'text-on-surface'}>{pts}</span>
                            : <span className="text-slate-700">–</span>}
                        </td>
                      );
                    })}
                    <td className="px-6 py-4 text-center font-headline font-black text-tertiary text-sm sticky right-0 bg-[#0f1829] z-10">{totalPts}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
