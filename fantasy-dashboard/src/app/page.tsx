'use client';

import { useFantasyData } from '@/hooks/useFantasyData';
import { useFixtures } from '@/hooks/useFixtures';
import { useTeam } from '@/hooks/useTeam';
import Link from 'next/link';
import { useState } from 'react';
import { DesktopLayout } from '@/components/DesktopLayout';
import { useAuth } from '@/components/AuthProvider';

import { useRouter } from 'next/navigation';

export default function Lobby() {
  const { players, loading: playersLoading } = useFantasyData();
  const { activeMatch, loading: fixturesLoading } = useFixtures();
  const { user, signInWithGoogle } = useAuth();
  const router = useRouter();
  const { mySquad, loading: teamLoading } = useTeam(user?.id);

  const [filterType, setFilterType] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Top performers logic
  const topPerformers = [...players]
    .sort((a, b) => b.overall_points - a.overall_points)
    .slice(0, 5);

  // Table filtering
  const filteredPlayers = players.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'All' || p.skill_name === filterType;
    return matchesSearch && matchesType;
  });

  if (playersLoading || fixturesLoading) {
    return (
      <DesktopLayout>
        <div className="flex justify-center items-center h-[50vh]">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      </DesktopLayout>
    );
  }

  return (
    <DesktopLayout>
      {/* Live Impact Section */}
      <section>
        <div className="flex items-end justify-between mb-6">
          <div>
            {activeMatch && (
               <span className="bg-tertiary-container/20 text-tertiary-fixed-dim px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase border border-tertiary-fixed-dim/20 mb-2 inline-block">
                 Live
               </span>
            )}
            <h2 className="text-3xl font-headline font-black tracking-tight text-on-surface">Match Command Center</h2>
          </div>
          <button onClick={() => !user ? signInWithGoogle() : router.push('/my-team')} className="bg-surface-container-high text-primary font-headline font-bold py-3 px-6 rounded-xl text-[10px] tracking-widest uppercase cursor-pointer hover:bg-surface-container-highest transition-all duration-200">
            Create your team
          </button>
        </div>
        
        <div className="bg-surface-container-low rounded-xl p-8 relative overflow-hidden">
          {/* Subtle background visual */}
          <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 70% 20%, #6366F1 0%, transparent 50%)' }}></div>
          
          {activeMatch ? (
            <div className="relative grid grid-cols-12 gap-8 items-center">
              {/* Scorecard */}
              <div className="col-span-12 lg:col-span-5 flex flex-col gap-2">
                <div className="flex items-center gap-4">
                  <span className="text-xs font-bold text-slate-500 tracking-widest uppercase">{activeMatch.home_team_short_name} vs {activeMatch.away_team_short_name}</span>
                  <div className="h-[1px] flex-grow bg-outline-variant/20"></div>
                </div>
                <div className="flex items-baseline gap-4 mt-2">
                  <span className="text-4xl lg:text-5xl border border-ghost-border font-headline font-black tracking-tighter text-on-surface">Match Details</span>
                  <span className="text-xl font-headline font-medium text-slate-400">Venue: {activeMatch.venue}</span>
                </div>
                <div className="flex items-center gap-3 mt-4">
                  <span className="text-[10px] font-bold tracking-widest uppercase text-tertiary px-2 py-0.5 rounded-full bg-tertiary/10 border border-tertiary/20">Live</span>
                  <span className="text-[10px] font-bold tracking-widest uppercase text-slate-500">Toss: To be decided</span>
                </div>
              </div>
              
              {/* Key Player Stats Placeholder */}
              <div className="col-span-12 lg:col-span-7 grid grid-cols-2 gap-4">
                <div className="bg-surface-container-high/50 p-4 rounded-xl backdrop-blur-sm border border-outline-variant/10">
                  <span className="text-[9px] font-black tracking-widest uppercase text-primary block mb-3">Today&apos;s Highlight</span>
                  <div className="flex justify-between items-end">
                    <div>
                      <h3 className="text-lg font-headline font-bold text-on-surface leading-tight">Match {activeMatch.match_number}</h3>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="relative text-center py-10 opacity-70">
              <span className="material-symbols-outlined text-4xl mb-4 opacity-50 block">calendar_month</span>
              <h3 className="text-xl font-headline font-bold tracking-tight text-on-surface">No Live Match Found</h3>
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-12 gap-8">
        {/* Left: Performers and Tracking */}
        <div className="col-span-12 lg:col-span-9 space-y-8">
          
          {/* Top Performers Grid */}
          <section>
            <h3 className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-6 flex items-center gap-3">
              Top Performers - Last Match
              <div className="h-[1px] w-12 bg-outline-variant/30"></div>
            </h3>
            
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
              {topPerformers.map(player => (
                <div key={player.player_id} className="min-w-[160px] flex-1 bg-surface-container-high p-4 rounded-xl border border-outline-variant/10 hover:border-primary/30 transition-all cursor-pointer group">
                  <div className="text-[8px] font-black tracking-widest uppercase text-slate-500 mb-2">{player.team_short_name} • {player.skill_name?.substring(0,3)}</div>
                  <h4 className="text-sm font-headline font-bold text-on-surface group-hover:text-primary transition-colors">{player.name}</h4>
                  <div className="mt-4 flex flex-col">
                    <span className="text-xl font-headline font-black text-on-surface">{player.overall_points}</span>
                    <span className="text-[9px] font-bold tracking-widest uppercase text-slate-500">Points</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Impact Tracking Section with Filters */}
          <section>
            <div className="bg-surface-container-low rounded-xl overflow-hidden">
              <div className="px-6 py-6 border-b border-outline-variant/10 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold tracking-widest uppercase text-slate-400">Impact Tracking</h3>
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] font-bold text-primary tracking-widest uppercase cursor-pointer">Live Updates</span>
                    <span className="material-symbols-outlined text-sm text-primary">sync</span>
                  </div>
                </div>
                
                {/* Filters Row */}
                <div className="flex flex-wrap items-center gap-4 justify-between">
                  <div className="flex bg-surface-container-highest p-1 rounded-lg">
                    {['All', 'Batsman', 'Bowler', 'All Rounder', 'Wicket Keeper'].map(role => {
                       const shortCode = role === 'All' ? 'All' : role === 'Batsman' ? 'Bat' : role === 'Bowler' ? 'Bow' : role === 'All Rounder' ? 'AR' : 'WK';
                       const isActive = filterType === role;
                       return (
                         <button 
                           key={role}
                           onClick={() => setFilterType(role)}
                           className={`px-4 py-1.5 rounded-md text-[10px] font-bold tracking-widest uppercase transition-colors ${isActive ? 'bg-primary text-on-primary-fixed' : 'text-slate-400 hover:text-on-surface'}`}
                         >
                           {shortCode}
                         </button>
                       );
                    })}
                  </div>
                  <div className="relative max-w-xs flex-grow">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">search</span>
                    <input 
                      className="w-full bg-surface-container-highest border-none rounded-lg py-1.5 pl-9 pr-4 text-[10px] font-headline text-on-surface focus:ring-1 focus:ring-primary/40 focus:outline-none transition-all" 
                      placeholder="Search players..." 
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="text-left border-b border-outline-variant/5">
                      <th className="px-6 py-4 text-[9px] font-black tracking-widest uppercase text-slate-500">Rank</th>
                      <th className="px-6 py-4 text-[9px] font-black tracking-widest uppercase text-slate-500">Player</th>
                      <th className="px-6 py-4 text-[9px] font-black tracking-widest uppercase text-slate-500">Team</th>
                      <th className="px-6 py-4 text-[9px] font-black tracking-widest uppercase text-slate-500 text-right">Total Points</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/5">
                    {filteredPlayers.slice(0, 15).map((player, idx) => (
                      <tr key={player.player_id} className="hover:bg-surface-container-highest transition-colors">
                        <td className="px-6 py-5 text-sm font-headline font-bold text-primary">#{String(idx + 1).padStart(2, '0')}</td>
                        <td className="px-6 py-5 text-sm font-headline font-bold text-on-surface">{player.name}</td>
                        <td className="px-6 py-5 text-xs font-bold text-slate-500 uppercase tracking-widest">{player.team_short_name}</td>
                        <td className="px-6 py-5 text-right font-headline font-black text-on-surface">{player.overall_points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>

        {/* Right: My Team Sidebar */}
        <aside className="col-span-12 lg:col-span-3 space-y-6">
          <h3 className="text-xs font-bold tracking-widest uppercase text-slate-400 flex items-center gap-3">
            My Team
            <div className="h-[1px] flex-grow bg-outline-variant/30"></div>
          </h3>
          
          <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 overflow-hidden">
            <div className="p-4 border-b border-outline-variant/10 bg-surface-container-high/30 flex justify-between items-center">
              <span className="text-[10px] font-black tracking-widest uppercase text-primary">Active XI</span>
            </div>
            
            <div className="divide-y divide-outline-variant/5">
              {!user ? (
                <div className="p-8 text-center bg-surface-container/20">
                  <span className="material-symbols-outlined block text-outline text-3xl mb-3 opacity-50">lock</span>
                  <p className="text-xs font-body text-slate-500">Log in to draft your team</p>
                  <button onClick={() => signInWithGoogle()} className="mt-4 inline-block btn-gradient px-4 py-1.5 text-xs rounded">Sign In</button>
                </div>
              ) : teamLoading ? (
                 <div className="p-8 text-center"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div></div>
              ) : mySquad.length === 0 ? (
                <div className="p-8 text-center">
                   <p className="text-xs text-slate-500 mb-4">You have not drafted anybody yet.</p>
                   <Link href="/my-team" className="btn-ghost text-xs px-4 py-1.5 rounded">Draft Now</Link>
                </div>
              ) : (
                mySquad.map(player => (
                  <div key={player.player_id} className="p-4 hover:bg-surface-container-highest transition-colors cursor-pointer flex justify-between items-center">
                    <div>
                      <h4 className="text-xs font-headline font-bold text-on-surface">{player.name}</h4>
                      <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{player.team_short_name} • {player.skill_name?.substring(0,3)}</p>
                    </div>
                    <span className="text-sm font-headline font-black text-on-surface">{player.overall_points}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </DesktopLayout>
  );
}
