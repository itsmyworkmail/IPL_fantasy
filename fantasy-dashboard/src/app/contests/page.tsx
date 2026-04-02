'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useRooms } from '@/hooks/useRooms';
import { DesktopLayout } from '@/components/DesktopLayout';

export default function ContestsLobby() {
  const { user, loading: authLoading, signInWithGoogle } = useAuth();
  const router = useRouter();
  const { rooms, loading: roomsLoading, fetchMyRooms, joinRoom, createRoom } = useRooms();
  
  const [filterType, setFilterType] = useState<'All' | 'Created' | 'Joined'>('All');

  useEffect(() => {
    if (!authLoading && !user) {
      signInWithGoogle();
    }
  }, [user, authLoading, signInWithGoogle]);

  useEffect(() => {
    if (user?.id) {
      fetchMyRooms();
    }
  }, [user?.id, fetchMyRooms]);

  if (authLoading || roomsLoading) {
    return (
      <DesktopLayout>
        <div className="flex h-[50vh] items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      </DesktopLayout>
    );
  }

  if (!user) return null;

  const handleJoin = async () => {
    const code = window.prompt("Enter the 6-character access code:");
    if (code?.trim()) {
      try {
        const room = await joinRoom(code.trim());
        router.push(`/contests/${room.id}`);
      } catch (err: unknown) {
        window.alert(err instanceof Error ? err.message : String(err));
      }
    }
  };

  const handleCreate = async () => {
    const name = window.prompt("Enter a name for your private contest:");
    if (name?.trim()) {
       try {
         const room = await createRoom(name.trim());
         router.push(`/contests/${room.id}`);
       } catch (err: unknown) {
         window.alert(err instanceof Error ? err.message : String(err));
       }
    }
  };

  const filteredRooms = rooms.filter(room => {
    if (filterType === 'Created') return room.creator_id === user.id;
    if (filterType === 'Joined') return room.creator_id !== user.id;
    return true;
  });

  return (
    <DesktopLayout>
      <div className="p-10 max-w-7xl mx-auto w-full space-y-12">
        {/* Hero Actions */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Create Section */}
          <div onClick={handleCreate} className="bg-surface-container-low p-8 rounded-full relative overflow-hidden flex items-center justify-between group cursor-pointer active:scale-[0.98] transition-all">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent"></div>
            <div className="relative z-10">
              <h2 className="font-headline text-3xl font-extrabold text-indigo-300">Create Contest</h2>
              <p className="text-slate-400 mt-2 max-w-xs">Host your own private tournament with custom rules.</p>
            </div>
            <div className="relative z-10 bg-primary-container p-4 rounded-full shadow-lg group-hover:scale-110 transition-transform flex items-center justify-center">
              <span className="material-symbols-outlined text-on-primary text-3xl">add</span>
            </div>
          </div>
          
          {/* Join Section */}
          <div onClick={handleJoin} className="bg-surface-container-low p-8 rounded-full relative overflow-hidden flex items-center justify-between group cursor-pointer active:scale-[0.98] transition-all">
            <div className="absolute inset-0 bg-gradient-to-br from-tertiary/5 to-transparent"></div>
            <div className="relative z-10">
              <h2 className="font-headline text-3xl font-extrabold text-tertiary">Join Private</h2>
              <p className="text-slate-400 mt-2 max-w-xs">Enter an invite code to join a colleague&apos;s or influencer&apos;s private room.</p>
            </div>
            <div className="relative z-10 bg-surface-container-highest p-4 rounded-full shadow-lg group-hover:scale-110 transition-transform flex items-center justify-center">
              <span className="material-symbols-outlined text-tertiary text-3xl">key</span>
            </div>
          </div>
        </section>

        {/* Active Contests Grid */}
        <section className="space-y-8">
          <div className="flex justify-between items-end">
            <div className="space-y-1">
              <h3 className="font-headline text-display-md text-4xl font-bold tracking-tight">Active Contests</h3>
              <p className="text-slate-500 text-sm">Real-time competitive pools across major leagues</p>
            </div>
            <div className="flex gap-2">
              {['All', 'Created', 'Joined'].map(tab => (
                 <span 
                   key={tab}
                   onClick={() => setFilterType(tab as 'All' | 'Created' | 'Joined')}
                   className={`px-4 py-1.5 rounded-full text-xs font-bold cursor-pointer transition-all ${filterType === tab ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-surface-container-highest text-slate-300'}`}
                 >
                   {tab}
                 </span>
              ))}
            </div>
          </div>
          
          {/* Bento Style Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {filteredRooms.length === 0 ? (
               <div className="lg:col-span-3 py-16 text-center text-slate-500 font-headline bg-surface-container-low rounded-xl">
                 You are not part of any {filterType === 'All' ? '' : filterType.toLowerCase() + ' '}contests yet. Create or Join one above!
               </div>
            ) : filteredRooms.map((room, idx) => (
              <div 
                key={room.id}
                onClick={() => router.push(`/contests/${room.id}`)}
                className={`bg-surface-container-high rounded-xl p-8 relative overflow-hidden group hover:bg-surface-container-highest transition-all cursor-pointer ${idx === 0 ? 'lg:col-span-2' : 'flex flex-col justify-between p-6'}`}
              >
                {idx === 0 ? (
                  <>
                    <div className="absolute -top-12 -right-12 w-48 h-48 bg-primary/10 rounded-full blur-3xl group-hover:bg-primary/20 transition-all"></div>
                    <div className="flex justify-between items-start mb-12 relative z-10">
                      <div className="bg-tertiary/10 text-tertiary px-3 py-1 rounded-full flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse"></span>
                        <span className="text-[10px] font-black uppercase tracking-widest">{room.creator_id === user.id ? 'Your League' : 'Joined League'}</span>
                      </div>
                      <span className="text-slate-500 font-headline text-2xl font-black">#{String(idx+1).padStart(3, '0')}</span>
                    </div>
                    <div className="space-y-6 relative z-10">
                      <h4 className="text-4xl font-black font-headline tracking-tighter leading-none">{room.name}</h4>
                      <p className="text-slate-400 min-h-[40px]">{room.description || "Private tournament"}</p>
                    </div>
                    <button className="mt-10 w-full py-4 bg-primary text-on-primary font-black rounded-xl active:scale-95 transition-transform flex items-center justify-center gap-2 group relative z-10">
                      ENTER CONTEST
                      <span className="material-symbols-outlined text-xl group-hover:translate-x-1 transition-transform">arrow_forward</span>
                    </button>
                  </>
                ) : (
                  <>
                    <div>
                      <div className="flex justify-between items-center mb-6">
                        <span className="px-2 py-0.5 bg-surface-container-highest text-slate-400 text-[10px] font-bold rounded uppercase">{room.creator_id === user.id ? 'Host' : 'Member'}</span>
                        <span className="material-symbols-outlined text-slate-500">more_horiz</span>
                      </div>
                      <h4 className="text-xl font-bold font-headline mb-4">{room.name}</h4>
                      <p className="text-xs text-slate-400 line-clamp-2">{room.description || "Private tournament"}</p>
                    </div>
                    <button className="mt-6 w-full py-3 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 font-bold rounded-xl active:scale-95 transition-all text-sm">
                      ENTER
                    </button>
                  </>
                )}
              </div>
            ))}

          </div>
        </section>
      </div>
    </DesktopLayout>
  );
}
