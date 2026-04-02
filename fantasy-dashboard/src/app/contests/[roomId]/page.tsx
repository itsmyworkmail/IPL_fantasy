'use client';

import { useEffect, useState, use, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useRooms } from '@/hooks/useRooms';
import { useTeam } from '@/hooks/useTeam';
import { useFantasyData } from '@/hooks/useFantasyData';
import { DesktopLayout } from '@/components/DesktopLayout';
import { supabase } from '@/lib/supabaseClient';
import { RoomParticipant } from '@/types';

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
  const { fetchRoom, activeRoom, patchActiveRoom, loading: roomLoading, updateRoom, updateRoomTeam, leaveRoom, removeParticipant } = useRooms();
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

  // Auth Guard
  useEffect(() => {
    if (!authLoading && !user?.id) {
      signInWithGoogle();
    }
  }, [user?.id, authLoading, signInWithGoogle]);

  const fetchParticipants = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoadingMembers(true);
    try {
      // NEW FIX: Fetching directly from room_participants with full foreign key traversal!
      const { data, error } = await supabase
        .from('room_participants')
        .select(`
          id, profile_id, team_id, ipl_team,
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
    } catch (err) {
      console.error("Failed to fetch participants", err);
    } finally {
      if (!isBackground) setLoadingMembers(false);
    }
  }, [roomId, user?.id]);

  // Initial Fetch & Real-time Subscriptions - FIX: Direct Payload Map No-Fetches
  useEffect(() => {
    if (user?.id && roomId) {
      fetchRoom(roomId);
      fetchParticipants();
      
      const channel = supabase
        .channel(`room_${roomId}_sync`)
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
           // ONLY fetch what is absolutely missing: the new friend's profile
           const { data } = await supabase.from('profiles').select('display_name, avatar_url').eq('id', payload.new.profile_id).single();
           setParticipants(prev => {
               const uniqueMap = new Map<string, RoomParticipant>();
               prev.forEach(p => uniqueMap.set(String(p.id), p));
               
               const pid = String(payload.new.id);
               if (!uniqueMap.has(pid)) {
                   uniqueMap.set(pid, { ...(payload.new as Record<string, unknown>), profiles: data, name: 'Unassigned Squad', selected_players: [], id: pid } as unknown as RoomParticipant);
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
           // Direct mapping from user's global edits into the Room context mapping!
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
           patchActiveRoom(payload.new);
        })
        .subscribe();
        
      return () => { supabase.removeChannel(channel); };
    }
  }, [user?.id, roomId, fetchRoom, fetchParticipants, patchActiveRoom]);

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

  // Calculate scores for participants
  const participantsWithScores = participants.map(p => {
    let score = 0;
    if (p.selected_players && players.length > 0) {
      p.selected_players.forEach((playerId: number) => {
        const player = players.find(player => player.player_id === playerId);
        if (player) {
          score += player.overall_points;
        }
      });
    }
    return { ...p, score };
  }).sort((a, b) => b.score - a.score);

  if (authLoading || (roomLoading && !activeRoom)) {
    return (
      <DesktopLayout>
        <div className="flex h-[50vh] items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      </DesktopLayout>
    );
  }

  if (!activeRoom) return null;

  const isHost = activeRoom.creator_id === user?.id;
  const settings = activeRoom.settings || { lock_room: false, modify_teams: true, allow_duplicates: true };
  const isLockRoom = settings.lock_room === true;
  const isModifyTeamsRaw = settings.modify_teams !== false; 
  const isModifyTeams = isLockRoom ? false : isModifyTeamsRaw; 
  const allowDuplicates = settings.allow_duplicates !== false; 

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

  const handleKick = async (participantId: string) => {
    if (window.confirm("Remove this participant?")) {
       // Optimistic kill
       setParticipants(prev => prev.filter(p => p.profile_id !== participantId));
       try {
          await removeParticipant(roomId, participantId);
       } catch {
          fetchParticipants(true); // Re-fetch on error
       }
    }
  };

  const handleTitleSubmit = async () => {
    if (editTitleBuffer.trim() !== activeRoom.name) {
      activeRoom.name = editTitleBuffer.trim(); // optimistic
      await updateRoom(roomId, { name: editTitleBuffer.trim() });
    }
    setIsEditingTitle(false);
  };

  const handleDescSubmit = async () => {
    if (editDescBuffer.trim() !== activeRoom.description) {
      activeRoom.description = editDescBuffer.trim(); // optimistic
      await updateRoom(roomId, { description: editDescBuffer.trim() });
    }
    setIsEditingDesc(false);
  };

  const handleTeamMappingUpdate = async (globalTeamId: string, iplTeam: string) => {
    if (!globalTeamId || !iplTeam) return;
    try {
      // Background Sync Updates
      await updateRoomTeam(roomId, globalTeamId, iplTeam);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  // Admin Switch Handlers - Optimistic Update implemented!
  const toggleLockRoom = async () => {
    await updateRoom(roomId, { settings: { ...settings, lock_room: !isLockRoom } });
  };
  
  const toggleModifyTeams = async () => {
    const nextState = !isModifyTeamsRaw;
    if (!nextState) {
       await updateRoom(roomId, { settings: { ...settings, modify_teams: nextState, lock_room: true } });
    } else {
       await updateRoom(roomId, { settings: { ...settings, modify_teams: nextState } });
    }
  };

  const toggleAllowDuplicates = async () => {
    await updateRoom(roomId, { settings: { ...settings, allow_duplicates: !allowDuplicates } });
  };

  const dropdownsFrozen = !isModifyTeams || (!isHost && isLockRoom);

  return (
    <DesktopLayout>
      <div className="p-12 max-w-7xl mx-auto">
        
        {/* Header Section */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-3">
            <nav className="flex gap-2 text-xs font-bold text-indigo-400/60 tracking-widest uppercase items-center">
              <span>Contests</span>
              <span>/</span>
              <span className="text-indigo-400">{activeRoom.name}</span>
            </nav>
            {!isHost && (
              <button onClick={handleLeave} className="text-[10px] font-bold text-error/80 hover:text-error uppercase tracking-[0.2em] flex items-center gap-1.5 px-3 py-1 bg-error/5 rounded-full border border-error/20 transition-all">
                <span className="material-symbols-outlined !text-sm">logout</span> Leave Contest 
              </button>
            )}
          </div>
          
          <div className="flex justify-between items-start gap-12">
            <div className="flex-grow group">
              {isEditingTitle && isHost ? (
                <input 
                  autoFocus
                  className="bg-surface-container-low text-5xl font-black font-headline text-on-surface leading-tight w-full outline-none border-b-2 border-primary border-dashed"
                  value={editTitleBuffer}
                  onChange={e => setEditTitleBuffer(e.target.value)}
                  onBlur={handleTitleSubmit}
                  onKeyDown={e => e.key === 'Enter' && handleTitleSubmit()}
                />
              ) : (
                <h2 
                  onDoubleClick={() => isHost && setIsEditingTitle(true)}
                  className={`text-5xl font-black font-headline text-on-surface leading-tight ${isHost ? 'cursor-text hover:text-indigo-300 transition-colors' : ''}`}
                  title={isHost ? "Double click to rename" : ""}
                >
                  {activeRoom.name}
                </h2>
              )}
              
              {isEditingDesc && isHost ? (
                <input 
                  autoFocus
                  className="bg-surface-container-low text-on-surface-variant mt-2 w-full max-w-lg outline-none border-b border-primary/50 border-dashed"
                  value={editDescBuffer}
                  onChange={e => setEditDescBuffer(e.target.value)}
                  onBlur={handleDescSubmit}
                  onKeyDown={e => e.key === 'Enter' && handleDescSubmit()}
                />
              ) : (
                <p 
                  onDoubleClick={() => isHost && setIsEditingDesc(true)}
                  className={`text-on-surface-variant mt-2 max-w-lg ${isHost ? 'cursor-text hover:text-indigo-300 transition-colors' : ''}`}
                  title={isHost ? "Double click to rename" : ""}
                >
                  {activeRoom.description || 'A single line description about anything'}
                </p>
              )}
            </div>
            
            <div className="shrink-0 pt-2">
              <div className="bg-surface-container-high/50 border border-white/5 p-2 rounded-lg flex items-center gap-3 backdrop-blur-sm group hover:border-indigo-500/30 transition-all">
                <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-indigo-400/60 uppercase tracking-widest leading-none mb-1">Invite Code</span>
                  <span className="font-mono text-sm font-bold text-on-surface">{activeRoom.invite_code}</span>
                </div>
                <button onClick={() => navigator.clipboard.writeText(activeRoom.invite_code || '')} className="p-1.5 hover:bg-indigo-500/10 rounded-md text-indigo-400 transition-colors" title="Copy Code">
                  <span className="material-symbols-outlined !text-sm">content_copy</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Bento Layout */}
        <div className="grid grid-cols-12 gap-6">
          
          {/* Left Column: Member List & Teams */}
          <div className="col-span-12 lg:col-span-8 order-2 lg:order-1">
            <div className="bg-surface-container-low rounded-xl overflow-hidden min-h-[500px] flex flex-col">
              <div className="p-8 border-b border-white/5 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold font-headline text-on-surface">Registered Participants</h3>
                  <p className="text-sm text-on-surface-variant">Total: {participantsWithScores.length} teams</p>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-surface-container-lowest/50">
                    <tr>
                      <th className="px-8 py-4 text-[10px] font-bold text-outline uppercase tracking-widest">pos</th>
                      <th className="px-8 py-4 text-[10px] font-bold text-outline uppercase tracking-widest">teams</th>
                      <th className="px-8 py-4 text-[10px] font-bold text-outline uppercase tracking-widest">Points</th>
                      <th className="px-8 py-4"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 relative">
                    {loadingMembers ? (
                       <tr><td colSpan={4} className="p-8"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div></td></tr>
                    ) : participantsWithScores.length === 0 ? (
                       <tr><td colSpan={4} className="p-8 text-center text-slate-500">No teams have joined yet.</td></tr>
                    ) : (
                      participantsWithScores.map((p, idx) => {
                        const isMe = user && p.profile_id === user.id;
                        
                        const avatarColors = [
                          'bg-primary/20 text-primary',
                          'bg-orange-500/10 text-orange-400',
                          'bg-emerald-500/10 text-emerald-400',
                          'bg-rose-500/10 text-rose-400'
                        ];
                        const aClass = avatarColors[idx % 4];

                        return (
                          <tr key={p.id} className={`hover:bg-white/5 transition-colors group ${isMe ? 'border-l-2 border-primary-container bg-primary/5' : ''}`}>
                            <td className="px-8 py-6">
                              <div className="flex items-center gap-1">
                                {idx === 0 && p.score > 0 && <span className="material-symbols-outlined text-tertiary text-xs mr-1" style={{fontVariationSettings: '"FILL" 1'}}>star</span>}
                                <span className="text-on-surface font-semibold">{idx + 1}</span>
                              </div>
                            </td>
                            <td className="px-8 py-6">
                              <div className="flex items-center gap-4">
                                {p.ipl_team ? (
                                   <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden bg-white/5 border border-white/10 p-1">
                                      <Image src={`/logos/${p.ipl_team.toLowerCase()}.png`} width={40} height={40} alt={p.ipl_team} className="object-contain w-full h-full drop-shadow" 
                                           onError={(e) => { e.currentTarget.style.display='none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />
                                      <div className={`hidden w-full h-full flex justify-center items-center font-bold text-xs uppercase tracking-tighter ${aClass}`}>{p.ipl_team.substring(0,3)}</div>
                                   </div>
                                ) : (
                                   <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs uppercase tracking-tighter ${aClass}`}>
                                     {(p.name || 'Unassigned').split(' ').map((n: string) => n[0]).join('').substring(0,2)}
                                   </div>
                                )}
                                <div>
                                  <p className="font-bold text-on-surface flex items-center gap-2">
                                     {p.profiles?.display_name || 'Manager'}
                                     {p.profile_id === activeRoom.creator_id && <span className="text-[9px] px-1.5 py-0.5 rounded bg-tertiary/20 text-tertiary font-bold uppercase tracking-widest">Host</span>}
                                  </p>
                                  <p className="text-xs text-on-surface-variant line-clamp-1">{p.ipl_team ? IPL_FRANCHISES.find(f => f.id === p.ipl_team)?.name : 'Unassigned Franchise'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-8 py-6 text-on-surface-variant font-medium">{p.score}</td>
                            <td className="px-8 py-6 text-right relative">
                              {/* Admin dropdown mapping */}
                              <div className="group/menu relative inline-block text-left">
                                <button className="opacity-0 group-hover:opacity-100 p-2 hover:bg-surface-container-highest rounded-lg transition-all text-outline">
                                  <span className="material-symbols-outlined">more_vert</span>
                                </button>
                                <div className="hidden group-hover/menu:block absolute right-0 top-full w-48 rounded-md shadow-lg bg-surface-container-high ring-1 ring-black ring-opacity-5 z-50">
                                  <div className="py-1" role="menu">
                                    <button className="text-sm font-medium text-on-surface hover:bg-white/5 block w-full text-left px-4 py-2 flex items-center gap-2">
                                      <span className="material-symbols-outlined text-sm">visibility</span> View team
                                    </button>
                                    {isHost && !isMe && (
                                       <button onClick={() => handleKick(p.profile_id)} className="text-sm font-bold text-error hover:bg-error/10 block w-full text-left px-4 py-2 flex items-center gap-2">
                                         <span className="material-symbols-outlined text-sm">person_remove</span> Remove
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
          
          {/* Right Column: Management & Settings */}
          <div className="col-span-12 lg:col-span-4 space-y-6 order-1 lg:order-2">
            
            {/* Manage Team Section */}
            <div className={`bg-surface-container-low p-8 rounded-xl border-l-4 transition-all ${dropdownsFrozen ? 'border-outline opacity-75' : 'border-primary'}`}>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-bold text-on-surface uppercase tracking-widest">Manage Team</h3>
                <span className="material-symbols-outlined text-primary">badge</span>
              </div>
              
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest">Choose Team</label>
                  <div className="relative group">
                    <select 
                      disabled={dropdownsFrozen}
                      value={selectedGlobalTeamId}
                      onChange={(e) => {
                         setSelectedGlobalTeamId(e.target.value);
                         if (selectedIplTeam && e.target.value) {
                            handleTeamMappingUpdate(e.target.value, selectedIplTeam);
                         }
                      }}
                      className="w-full bg-surface-container-lowest border border-white/10 rounded-lg py-3 px-4 text-sm font-medium text-on-surface appearance-none focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all cursor-pointer disabled:cursor-not-allowed">
                      <option value="">Select an active team</option>
                      {myGlobalTeams.map(t => {
                         const hasDupes = !allowDuplicates && containsDuplicates(t.selected_players);
                         return (
                            <option key={t.id} value={t.id} disabled={hasDupes}>
                               {t.name} {hasDupes ? '(Includes Dupes)' : ''}
                            </option>
                         )
                      })}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-outline">
                      <span className="material-symbols-outlined text-sm">expand_more</span>
                    </div>
                  </div>
                  {!allowDuplicates && <p className="text-[10px] w-full text-error/80 uppercase font-bold tracking-widest transition-all">No Duplicates Mode ENFORCED</p>}
                  {dropdownsFrozen && <p className="text-[10px] w-full text-outline uppercase font-bold tracking-widest mt-1">LOCKED BY ADMIN</p>}
                </div>
                
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest">Select IPL Team</label>
                  <div className="relative group">
                    <select 
                      disabled={dropdownsFrozen}
                      value={selectedIplTeam}
                      onChange={(e) => {
                         setSelectedIplTeam(e.target.value);
                         if (selectedGlobalTeamId && e.target.value) {
                            handleTeamMappingUpdate(selectedGlobalTeamId, e.target.value);
                         }
                      }}
                      className="w-full bg-surface-container-lowest border border-white/10 rounded-lg py-3 px-4 text-sm font-medium text-on-surface appearance-none focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all cursor-pointer disabled:cursor-not-allowed">
                      <option value="">Choose IPL franchise</option>
                      {IPL_FRANCHISES.map(f => (
                         <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-outline">
                      <span className="material-symbols-outlined text-sm">expand_more</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Creator Controls */}
            {isHost && (
              <div className="bg-surface-container-low p-8 rounded-xl border-l-4 border-tertiary">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-sm font-bold text-on-surface uppercase tracking-widest">Admin Settings</h3>
                  <span className="material-symbols-outlined text-tertiary">admin_panel_settings</span>
                </div>
                <div className="space-y-6">
                  {/* Toggle: Contest Lock */}
                  <div className="flex items-center justify-between p-4 bg-surface-container-lowest rounded-lg">
                    <div>
                      <p className="font-semibold text-on-surface">Lock Room</p>
                      <p className="text-xs text-on-surface-variant">People cannot join</p>
                    </div>
                    <button onClick={toggleLockRoom} className={`w-12 h-6 ${isLockRoom ? 'bg-tertiary' : 'bg-surface-container-highest'} rounded-full relative transition-all`}>
                      <div className={`absolute top-1 w-4 h-4 rounded-full transition-all ${isLockRoom ? 'bg-on-tertiary right-1' : 'bg-outline left-1'}`}></div>
                    </button>
                  </div>
                  
                  {/* Toggle: Modify Teams */}
                  <div className="flex items-center justify-between p-4 bg-surface-container-lowest rounded-lg">
                    <div>
                      <p className="font-semibold text-on-surface">Modify teams</p>
                      <p className="text-xs text-on-surface-variant">Allow people to change their team</p>
                    </div>
                    <button onClick={toggleModifyTeams} className={`w-12 h-6 ${isModifyTeamsRaw ? 'bg-tertiary' : 'bg-surface-container-highest'} rounded-full relative transition-all`}>
                      <div className={`absolute top-1 w-4 h-4 rounded-full transition-all ${isModifyTeamsRaw ? 'bg-on-tertiary right-1' : 'bg-outline left-1'}`}></div>
                    </button>
                  </div>
                  
                  {/* Toggle: Allow Duplicates */}
                  <div className="flex items-center justify-between p-4 bg-surface-container-lowest rounded-lg">
                    <div>
                      <p className="font-semibold text-on-surface">Allow Duplicates</p>
                      <p className="text-xs text-on-surface-variant">Players in teams</p>
                    </div>
                    <button onClick={toggleAllowDuplicates} className={`w-12 h-6 ${allowDuplicates ? 'bg-tertiary' : 'bg-surface-container-highest'} rounded-full relative transition-all`}>
                      <div className={`absolute top-1 w-4 h-4 rounded-full transition-all ${allowDuplicates ? 'bg-on-tertiary right-1' : 'bg-outline left-1'}`}></div>
                    </button>
                  </div>
                </div>
              </div>
            )}
            
          </div>
          
        </div>
      </div>
    </DesktopLayout>
  );
}
