'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useRooms } from '@/hooks/useRooms';
import { Plus, KeyRound, ArrowRight, AlertCircle, Check, Users, Crown, Trophy } from 'lucide-react';

export default function ContestsLobby() {
  const { user, loading: authLoading, signInWithGoogle } = useAuth();
  const router = useRouter();
  const { rooms, loading: roomsLoading, fetchMyRooms, joinRoom, createRoom } = useRooms();

  const [filterType, setFilterType] = useState<'All' | 'Created' | 'Joined'>('All');
  const [createName, setCreateName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');

  const isMountedRef = useRef(false);

  useEffect(() => {
    if (user?.id) {
      // Only do a foreground fetch on first mount for this user
      fetchMyRooms(isMountedRef.current); // background=true if already mounted
      isMountedRef.current = true;
    }
  }, [user?.id, fetchMyRooms]);

  // Register a separate focus listener for silent background refresh
  useEffect(() => {
    const handleFocus = () => {
      if (user?.id) fetchMyRooms(true);
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user?.id, fetchMyRooms]);

  // Only redirect once auth is confirmed and there's no user
  if (!authLoading && !user) return null;

  // Skeleton flag: show pulsing cards while rooms are loading for the first time
  const isRoomsLoading = authLoading || (roomsLoading && rooms.length === 0);


  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) return;
    setIsSubmitting(true);
    setErrorText('');
    try {
      const room = await createRoom(createName.trim());
      router.push(`/contests/${room.id}`);
    } catch (err: unknown) {
      setErrorText(err instanceof Error ? err.message : String(err));
      setIsSubmitting(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.trim().length < 4) return;
    setIsSubmitting(true);
    setErrorText('');
    try {
      const room = await joinRoom(joinCode.trim());
      router.push(`/contests/${room.id}`);
    } catch (err: unknown) {
      setErrorText(err instanceof Error ? err.message : String(err));
      setIsSubmitting(false);
    }
  };

  const filteredRooms = rooms.filter(room => {
    if (!user) return true;
    if (filterType === 'Created') return room.creator_id === user.id;
    if (filterType === 'Joined') return room.creator_id !== user.id;
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto w-full space-y-12">

      {/* Error alert */}
      {errorText && (
        <div className="bg-red-500/10 text-red-400 border border-red-500/20 p-4 rounded-xl text-sm font-bold flex items-center justify-between">
          <div className="flex items-center gap-2"><AlertCircle className="w-5 h-5" /> {errorText}</div>
          <button className="hover:opacity-75 transition-opacity" onClick={() => setErrorText('')}>
            <Check className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* ── Create + Join Cards ── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Create Contest */}
        <div className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-surface-container-low p-6 group hover:border-indigo-500/40 transition-all duration-300"
          style={{ boxShadow: '0 0 40px rgba(99,102,241,0.06)' }}>
          {/* Corner glow */}
          <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-start justify-between mb-5">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                    <Plus className="w-4 h-4 text-indigo-400" />
                  </div>
                  <span className="text-[10px] font-black tracking-[0.2em] uppercase text-indigo-400">New Contest</span>
                </div>
                <h2 className="font-headline text-2xl font-black text-white">Create Contest</h2>
                <p className="text-slate-500 mt-1 text-sm">Host your own private tournament with custom rules.</p>
              </div>
            </div>
            <form onSubmit={handleCreate} className="flex gap-3">
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Contest name..."
                className="flex-1 bg-[#1a2336] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 border border-white/5 text-on-surface placeholder:text-slate-600"
                disabled={isSubmitting}
              />
              <button
                disabled={isSubmitting || !createName.trim()}
                type="submit"
                className="bg-indigo-500 text-white rounded-xl px-5 py-2.5 font-bold hover:bg-indigo-400 disabled:opacity-50 transition-all text-sm whitespace-nowrap flex items-center gap-2"
              >
                {isSubmitting ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Create'}
              </button>
            </form>
          </div>
        </div>

        {/* Join Private */}
        <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-surface-container-low p-6 group hover:border-amber-500/40 transition-all duration-300"
          style={{ boxShadow: '0 0 40px rgba(245,158,11,0.06)' }}>
          <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-start justify-between mb-5">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                    <KeyRound className="w-4 h-4 text-amber-400" />
                  </div>
                  <span className="text-[10px] font-black tracking-[0.2em] uppercase text-amber-400">Join Room</span>
                </div>
                <h2 className="font-headline text-2xl font-black text-white">Join Private</h2>
                <p className="text-slate-500 mt-1 text-sm">Enter an invite code to join an existing room.</p>
              </div>
            </div>
            <form onSubmit={handleJoin} className="flex gap-3">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Enter code..."
                className="flex-1 bg-[#1a2336] rounded-xl px-4 py-2.5 text-sm font-mono tracking-widest focus:outline-none focus:ring-1 focus:ring-amber-500 border border-white/5 text-on-surface placeholder:text-slate-600"
                maxLength={6}
                disabled={isSubmitting}
              />
              <button
                disabled={isSubmitting || joinCode.trim().length < 4}
                type="submit"
                className="bg-amber-500 text-[#0f1829] rounded-xl px-5 py-2.5 font-bold hover:bg-amber-400 disabled:opacity-50 transition-all text-sm whitespace-nowrap flex items-center gap-2"
              >
                {isSubmitting ? <span className="w-4 h-4 border-2 border-[#0f1829] border-t-transparent rounded-full animate-spin" /> : 'Join'}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* ── Active Contests ── */}
      <section className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h3 className="font-headline text-3xl font-black tracking-tight text-on-surface">Active Contests</h3>
            <p className="text-slate-500 text-sm mt-1">{filteredRooms.length} room{filteredRooms.length !== 1 ? 's' : ''} found</p>
          </div>
          <div className="flex items-center gap-1.5 bg-surface-container-high border border-white/5 p-1 rounded-xl">
            {(['All', 'Created', 'Joined'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setFilterType(tab)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filterType === tab
                    ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Contest Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isRoomsLoading ? (
            // Shimmering Skeletons
            [...Array(3)].map((_, i) => (
              <div key={i} className="rounded-2xl bg-surface-container-low border border-white/5 p-5 space-y-4 animate-pulse">
                <div className="flex justify-between items-start">
                  <div className="h-5 w-16 bg-white/5 rounded-md" />
                  <div className="h-7 w-7 bg-white/5 rounded-lg" />
                </div>
                <div className="h-6 w-3/4 bg-white/5 rounded mt-2" />
                <div className="pt-4 border-t border-white/5 flex justify-between items-center">
                  <div className="h-4 w-24 bg-white/5 rounded" />
                  <div className="h-4 w-12 bg-white/5 rounded" />
                </div>
              </div>
            ))
          ) : filteredRooms.length === 0 ? (
            <div className="lg:col-span-3 py-20 text-center bg-surface-container-low rounded-2xl border border-white/5">
              <Trophy className="w-10 h-10 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-500 font-bold text-sm">No contests found</p>
              <p className="text-slate-600 text-xs mt-1">Create or join one above to get started!</p>
            </div>
          ) : filteredRooms.map((room) => {
            const isHost = user && room.creator_id === user.id;
            return (
              <div
                key={room.id}
                onClick={() => router.push(`/contests/${room.id}`)}
                className="relative group cursor-pointer rounded-2xl overflow-hidden border bg-surface-container-low transition-all duration-200 hover:scale-[1.015] hover:shadow-xl"
                style={{
                  borderColor: isHost ? 'rgba(99,102,241,0.15)' : 'rgba(245,158,11,0.12)',
                  boxShadow: 'none',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = isHost
                    ? '0 8px 32px rgba(99,102,241,0.12)'
                    : '0 8px 32px rgba(245,158,11,0.10)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                }}
              >
                {/* Top left accent bar */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-0.5"
                  style={{ background: isHost ? '#6366f1' : '#f59e0b' }}
                />

                {/* Corner ambient */}
                <div
                  className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{ background: isHost ? 'rgba(99,102,241,0.12)' : 'rgba(245,158,11,0.10)' }}
                />

                <div className="relative p-5 flex flex-col gap-4">
                  {/* Top row: badge + enter arrow */}
                  <div className="flex items-center justify-between">
                    <span
                      className="flex items-center gap-1.5 text-[9px] font-black tracking-[0.2em] uppercase px-2 py-1 rounded-md"
                      style={{
                        color: isHost ? '#818cf8' : '#fbbf24',
                        background: isHost ? 'rgba(99,102,241,0.12)' : 'rgba(245,158,11,0.12)',
                      }}
                    >
                      {isHost ? <Crown className="w-3 h-3" /> : <Users className="w-3 h-3" />}
                      {isHost ? 'Host' : 'Member'}
                    </span>
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all -translate-x-1 group-hover:translate-x-0 duration-200"
                      style={{ background: isHost ? 'rgba(99,102,241,0.15)' : 'rgba(245,158,11,0.15)' }}
                    >
                      <ArrowRight
                        className="w-3.5 h-3.5"
                        style={{ color: isHost ? '#818cf8' : '#fbbf24' }}
                      />
                    </div>
                  </div>

                  {/* Contest name */}
                  <div>
                    <h4 className="text-lg font-black font-headline text-white leading-tight line-clamp-2">
                      {room.name}
                    </h4>
                  </div>

                  {/* Bottom: participants + code */}
                  <div className="flex items-center justify-between pt-1 border-t border-white/5">
                    <div className="flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-slate-500" />
                      <span className="text-sm font-bold text-slate-300">
                        {room.participant_count || 0}
                        <span className="text-slate-600 font-normal text-xs ml-1">participants</span>
                      </span>
                    </div>
                    {room.invite_code && (
                      <span className="text-[10px] font-mono font-bold text-slate-600 bg-[#1a2336] px-2 py-0.5 rounded">
                        {room.invite_code}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
