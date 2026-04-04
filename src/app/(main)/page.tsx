'use client';

import { useFixtures } from '@/hooks/useFixtures';
import { useTopPerformers } from '@/hooks/useTopPerformers';
import { useTeam } from '@/hooks/useTeam';
import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Search } from 'lucide-react';
import { formatSkillName } from '@/utils/formatters';
import { useFantasyData } from '@/hooks/useFantasyData';
import { useRouter } from 'next/navigation';

export default function Lobby() {
  const { displayMatch, performerMatch, activeGamedayId, isMatchLive, loading: fixturesLoading } = useFixtures();
  const { topPerformers, loading: topPerformersLoading } = useTopPerformers(activeGamedayId);
  const { players, loading: playersLoading } = useFantasyData();
  const { user, signInWithGoogle } = useAuth();
  const router = useRouter();
  const { teams, loading: teamLoading } = useTeam(user?.id);

  const lobbyTeam = teams?.find(t => t.show_in_lobby) || teams?.[0];
  const lobbySquad = lobbyTeam ? players.filter(p => lobbyTeam.selected_players?.includes(p.player_id)) : [];
  lobbySquad.sort((a, b) => (b.overall_points || 0) - (a.overall_points || 0));
  const lobbyTotalPoints = lobbySquad.reduce((sum, p) => sum + (p.overall_points || 0), 0);

  const [filterType, setFilterType] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPlayers = players.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'All' || formatSkillName(p.skill_name) === filterType;
    return matchesSearch && matchesType;
  }).sort((a, b) => (b.overall_points || 0) - (a.overall_points || 0));

  // Only block render on true first load (no cached data)
  if ((playersLoading && players.length === 0) || (fixturesLoading && !displayMatch)) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const matchName = displayMatch?.match_name || 'Match Command Center';
  const topPerformersMatchName = performerMatch
    ? (isMatchLive ? `Live · ${performerMatch.match_name}` : `Last Match · ${performerMatch.match_name}`)
    : 'Latest Match';

  return (
    <div className="max-w-7xl mx-auto w-full space-y-8">

      {/* Live Impact Section */}
      <section>
        <div className="flex items-end justify-between mb-6">
          <div>
            <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase border mb-2 inline-block ${
              displayMatch?.match_status === '1'
                ? 'bg-red-500/10 text-red-400 border-red-500/20'
                : displayMatch?.match_status === '2'
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-tertiary-container/20 text-tertiary-fixed-dim border-tertiary-fixed-dim/20'
            }`}>
              {displayMatch?.match_status === '1' ? 'Live' : displayMatch?.match_status === '2' ? 'Finished' : 'Upcoming'}
            </span>
            <h2 className="text-3xl font-headline font-black tracking-tight text-on-surface">{matchName}</h2>
          </div>
          <button
            onClick={() => !user ? signInWithGoogle() : router.push('/my-team')}
            className="bg-surface-container-high text-primary font-headline font-bold py-3 px-6 rounded-xl text-[10px] tracking-widest uppercase cursor-pointer hover:bg-surface-container-highest transition-all duration-200"
          >
            Create your team
          </button>
        </div>
      </section>

      <div className="grid grid-cols-12 gap-8">
        {/* Left: Performers and Tracking */}
        <div className="col-span-12 lg:col-span-9 space-y-8">

          {/* Top Performers Grid */}
          <section>
            <h3 className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-6 flex items-center gap-3">
              Top Performers
              <span className="text-slate-600 normal-case tracking-normal font-normal text-xs">— {topPerformersMatchName}</span>
              <div className="h-[1px] w-12 bg-white/10"></div>
            </h3>

            <div className="flex gap-4 overflow-x-auto pb-4 pt-3 scrollbar-hide">
              {topPerformersLoading ? (
                <div className="flex gap-4 w-full">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="min-w-[150px] flex-1 bg-surface-container-high p-4 rounded-xl border border-white/5 animate-pulse h-28" />
                  ))}
                </div>
              ) : topPerformers.length === 0 ? (
                <div className="text-slate-500 text-sm py-4">No performer data available for this match yet.</div>
              ) : (
                topPerformers.map((player, idx) => (
                  <div key={player.player_id} className="min-w-[150px] flex-1 bg-surface-container-high p-4 rounded-xl border border-white/5 hover:border-primary/30 transition-all cursor-pointer group relative">
                    {idx === 0 && (
                      <div className="absolute -top-1.5 -right-1.5 bg-amber-400 text-[9px] font-black text-black px-1.5 py-0.5 rounded-full tracking-widest">MVP</div>
                    )}
                    <div className="text-[8px] font-black tracking-widest uppercase text-slate-500 mb-2">{player.team_short_name} • {formatSkillName(player.skill_name)}</div>
                    <h4 className="text-sm font-headline font-bold text-on-surface group-hover:text-primary transition-colors">{player.name}</h4>
                    <div className="mt-4 flex flex-col">
                      <span className="text-xl font-headline font-black text-on-surface text-left">{player.gameday_points}</span>
                      <span className="text-[9px] font-bold tracking-widest uppercase text-slate-500 text-left">Match Pts</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Impact Tracking */}
          <section>
            <div className="bg-surface-container-low rounded-2xl overflow-hidden border border-white/5">
              <div className="px-6 py-5 border-b border-white/5 flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-4 w-full">
                  <h3 className="text-xs font-bold tracking-widest uppercase text-slate-400 whitespace-nowrap">Impact Tracking</h3>

                  <div className="flex flex-wrap items-center gap-3 justify-end flex-grow">
                    <div className="flex items-center bg-surface-container-high p-1 rounded-lg border border-white/5 gap-0.5">
                      {['All', 'BAT', 'BWL', 'AR', 'WK'].map(role => {
                        const isActive = filterType === role;
                        return (
                          <button
                            key={role}
                            onClick={() => setFilterType(role)}
                            className={`px-4 py-1.5 rounded-md text-[10px] font-bold tracking-widest uppercase transition-all ${isActive ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-400 hover:text-on-surface'}`}
                          >
                            {role}
                          </button>
                        );
                      })}
                    </div>
                    <div className="relative max-w-xs flex-grow flex items-center bg-surface-container-high rounded-lg border border-white/5 px-3 overflow-hidden group">
                      <div className="text-slate-500 group-focus-within:text-primary mr-2">
                        <Search className="w-4 h-4" />
                      </div>
                      <input
                        className="w-full bg-transparent border-none py-2 text-[10px] font-headline text-on-surface focus:outline-none"
                        placeholder="Search players..."
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="overflow-y-auto max-h-[30rem]">
                <table className="w-full min-w-[600px] relative">
                  <thead className="sticky top-0 bg-surface-container-low z-10 border-b border-white/5">
                    <tr className="text-left">
                      <th className="px-6 py-4 text-[9px] font-black tracking-widest uppercase text-slate-500">Rank</th>
                      <th className="px-6 py-4 text-[9px] font-black tracking-widest uppercase text-slate-500">Player</th>
                      <th className="px-6 py-4 text-[9px] font-black tracking-widest uppercase text-slate-500">Team</th>
                      <th className="px-6 py-4 text-[9px] font-black tracking-widest uppercase text-slate-500 text-center">Total Points</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {playersLoading && players.length === 0 ? (
                      [...Array(8)].map((_, i) => (
                        <tr key={i}><td colSpan={4} className="px-6 py-5">
                          <div className="h-4 bg-surface-container-high rounded animate-pulse w-3/4" />
                        </td></tr>
                      ))
                    ) : filteredPlayers.map((player, idx) => (
                      <tr key={player.player_id} className="hover:bg-surface-container-high transition-colors">
                        <td className="px-6 py-5 text-sm font-headline font-bold text-primary">{String(idx + 1).padStart(2, '0')}</td>
                        <td className="px-6 py-5 text-sm font-headline font-bold text-on-surface">{player.name}</td>
                        <td className="px-6 py-5 text-xs font-bold text-slate-500 uppercase tracking-widest">{player.team_short_name}</td>
                        <td className="px-6 py-5 text-center font-headline font-black text-white">{player.overall_points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>

        {/* Right: My Team Sidebar */}
        <aside className="col-span-12 lg:col-span-3 space-y-4">
          <h3 className="text-xs font-bold tracking-widest uppercase text-slate-400 flex items-center gap-3">
            My Team
            <div className="h-[1px] flex-grow bg-white/10"></div>
          </h3>

          <div className="bg-surface-container-low rounded-2xl border border-white/5 overflow-hidden">
            <div className="p-4 border-b border-white/5 bg-surface-container-high flex justify-between items-center">
              <span className="text-sm font-black tracking-widest uppercase text-primary">{lobbyTeam?.name || ''}</span>
              <span className="text-sm font-black text-tertiary">{lobbyTotalPoints}</span>
            </div>

            <div className="divide-y divide-white/5">
              {!user ? (
                <div className="p-8 text-center">
                  <span className="material-symbols-outlined block text-slate-600 text-3xl mb-3">lock</span>
                  <p className="text-xs text-slate-500">Log in to draft your team</p>
                  <button onClick={() => signInWithGoogle()} className="mt-4 inline-block bg-indigo-500 text-white px-4 py-1.5 text-xs rounded-lg font-bold hover:bg-indigo-400 transition-colors">Sign In</button>
                </div>
              ) : teamLoading ? (
                <div className="p-6 space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-8 bg-surface-container-high rounded animate-pulse" />
                  ))}
                </div>
              ) : lobbySquad.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-xs text-slate-500 mb-4">You have not drafted anybody yet.</p>
                  <Link href="/my-team" className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors">Draft Now →</Link>
                </div>
              ) : (
                lobbySquad.map((player) => (
                  <div key={player.player_id} className="p-4 hover:bg-surface-container-high transition-colors cursor-pointer flex justify-between items-center">
                    <div>
                      <h4 className="text-xs font-headline font-bold text-on-surface">{player.name}</h4>
                      <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{player.team_short_name} • {formatSkillName(player.skill_name)}</p>
                    </div>
                    <span className="text-sm font-headline font-black text-tertiary">{player.overall_points}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
