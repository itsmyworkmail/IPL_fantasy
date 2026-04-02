'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useTeam } from '@/hooks/useTeam';
import { useFantasyData } from '@/hooks/useFantasyData';
import { useFixtures } from '@/hooks/useFixtures';
import { DesktopLayout } from '@/components/DesktopLayout';
import { GamedayPlayer } from '@/types';

export default function MyTeamPage() {
  const { user, loading: authLoading, signInWithGoogle } = useAuth();

  const { teams, activeTeamId, setActiveTeamId, createTeam, renameTeam, mySquad, loading: teamLoading, togglePlayer, error } = useTeam(user?.id);
  const { players, loading: playersLoading } = useFantasyData();
  const { activeMatch, fixtures } = useFixtures();

  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      signInWithGoogle();
    }
  }, [user, authLoading, signInWithGoogle]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (authLoading || teamLoading || playersLoading || !user) {
    return (
      <DesktopLayout>
        <div className="flex h-[50vh] items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      </DesktopLayout>
    );
  }

  const totalPoints = mySquad.reduce((sum, p) => sum + p.overall_points, 0);

  // Distribution Chart Math
  const teamCounts: Record<string, number> = {};
  mySquad.forEach((p: GamedayPlayer) => {
    teamCounts[p.team_short_name] = (teamCounts[p.team_short_name] || 0) + 1;
  });

  const totalDrafted = mySquad.length;
  const sortedTeams = Object.entries(teamCounts).sort((a, b) => b[1] - a[1]);
  const distributionColors = ['bg-indigo-500', 'bg-indigo-400', 'bg-indigo-300', 'bg-tertiary', 'bg-slate-600'];

  const handleToggle = async (player: GamedayPlayer) => {
    try {
      await togglePlayer(player.player_id);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const upcomingMatch = fixtures.find(f => f.status === 'scheduled') || activeMatch;

  return (
    <DesktopLayout>
      <section className="space-y-8 pb-16">
        {/* Error alerting */}
        {error && (
          <div className="bg-error-container text-on-error-container p-4 rounded-xl text-sm font-bold flex items-center justify-between">
            {error}
            <span className="material-symbols-outlined cursor-pointer hover:opacity-75" onClick={() => window.location.reload()}>close</span>
          </div>
        )}

        {/* Hero Header: Points & Status */}
        <div className="grid grid-cols-12 gap-6 items-end">
          <div className="col-span-12 md:col-span-8">
            <span className="text-indigo-400 font-bold uppercase tracking-widest text-xs">Season Progress</span>
            <h1 className="text-5xl md:text-7xl font-headline font-extrabold text-on-surface tracking-tighter mt-2">
              {totalPoints.toLocaleString()} <span className="text-2xl text-slate-500 font-normal tracking-normal">PTS</span>
            </h1>
            <div className="flex items-center gap-4 mt-4">
              <div className="flex items-center gap-2 px-3 py-1 bg-tertiary/10 rounded-full border border-tertiary/20">
                <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse"></span>
                <span className="text-tertiary text-xs font-bold uppercase">Live: {activeMatch ? `Match ${activeMatch.match_number}` : 'Awaiting Match'}</span>
              </div>
            </div>
          </div>
          <div className="col-span-12 md:col-span-4 flex justify-start md:justify-end">
            <div className="bg-surface-container-low p-6 rounded-2xl w-full max-w-xs border-l-4 border-indigo-500 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 blur-xl rounded-full"></div>
              <p className="text-xs text-slate-500 uppercase font-bold tracking-widest mb-1 relative z-10">Upcoming Match</p>
              <h3 className="text-lg font-headline font-bold text-on-surface relative z-10">{upcomingMatch ? `${upcomingMatch.home_team_short_name} vs ${upcomingMatch.away_team_short_name}` : 'TBA'}</h3>
              <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest relative z-10">{upcomingMatch ? `Match ${upcomingMatch.match_number}` : 'League Starts Soon'}</p>
              {upcomingMatch && (
                <div className="mt-4 flex -space-x-2 relative z-10">
                  <div className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-[10px] font-bold text-indigo-300">{upcomingMatch.home_team_short_name}</div>
                  <div className="w-8 h-8 rounded-full bg-slate-700 border border-outline-variant/30 flex items-center justify-center text-[10px] font-bold">{upcomingMatch.away_team_short_name}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bento Grid Content */}
        <div className="grid grid-cols-12 gap-6 relative">

          {/* Squad List */}
          <div className="col-span-12 lg:col-span-7 bg-surface-container-low rounded-3xl overflow-hidden flex flex-col">

            {/* Team Tabs & Add Player Header */}
            <div className="bg-surface-container-high px-8 pt-6 pb-0">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-headline font-bold">Active Squad <span className="text-slate-500 text-sm ml-2">({mySquad.length}/11)</span></h2>
                <div className="flex gap-2 items-center">
                  <div className="flex items-center gap-2 ml-4 relative" ref={searchRef}>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-sm">search</span>
                      <input
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setIsDropdownOpen(e.target.value.length > 0);
                        }}
                        onFocus={() => { if (searchQuery.length > 0) setIsDropdownOpen(true); }}
                        className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg py-1.5 pl-8 pr-3 text-xs text-on-surface focus:outline-none focus:border-primary/50 w-64 transition-all"
                        placeholder="Search players..." type="text" />
                    </div>

                    {/* Search Dropdown */}
                    {isDropdownOpen && (
                      <div className="absolute top-10 right-0 w-80 bg-surface-container-high border border-outline-variant/20 rounded-xl shadow-2xl z-50 max-h-64 overflow-y-auto mt-2 py-2">
                        {players.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 15).map(player => {
                          const isDrafted = mySquad.some((s: GamedayPlayer) => s.player_id === player.player_id);
                          return (
                            <div key={player.player_id} className={`flex items-center justify-between p-3 border-b border-outline-variant/10 hover:bg-white/5 transition-colors cursor-pointer ${isDrafted ? 'opacity-50' : ''}`} onClick={() => { if (!isDrafted) handleToggle(player); setIsDropdownOpen(false); setSearchQuery(''); }}>
                              <div>
                                <h4 className="font-bold text-sm text-on-surface line-clamp-1">{player.name}</h4>
                                <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-widest">{player.skill_name?.substring(0, 3)} • {player.team_short_name}</p>
                              </div>
                              {!isDrafted ? (
                                <button className="flex items-center justify-center w-6 h-6 rounded bg-indigo-500 text-white hover:bg-indigo-400 shadow-md">
                                  <span className="material-symbols-outlined text-sm">add</span>
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest px-2">Added</span>
                              )}
                            </div>
                          )
                        })}
                        {players.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                          <div className="p-4 text-center text-slate-500 text-xs">No players found</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-end gap-6 overflow-x-auto no-scrollbar">
                <div className="flex items-end gap-6 h-full pt-2">
                  {teams.length === 0 && (
                    <span className="pb-3 text-slate-500 text-xs font-bold uppercase tracking-wider">No Teams Created</span>
                  )}
                  {teams.map(teamObj => (
                    <button
                      key={teamObj.id}
                      onClick={() => setActiveTeamId(teamObj.id)}
                      onDoubleClick={() => {
                        const newName = prompt("Rename team:", teamObj.name);
                        if (newName && newName.trim()) renameTeam(teamObj.id, newName.trim());
                      }}
                      title="Double click to rename"
                      className={`pb-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-colors border-b-2 mt-2 ${activeTeamId === teamObj.id ? 'text-indigo-300 border-indigo-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}
                    >
                      {teamObj.name}
                    </button>
                  ))}

                  <button
                    onClick={() => {
                      const newName = prompt("Enter new team name:", `Team ${teams.length + 1}`);
                      if (newName && newName.trim()) createTeam(newName.trim());
                    }}
                    className="pb-3 pt-2 text-slate-500 border-b-2 border-transparent hover:text-indigo-300 text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-colors flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-sm">add</span>
                    New Team
                  </button>
                </div>

                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="mb-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-300 text-xs font-bold border border-indigo-500/30 hover:bg-indigo-500/20 transition-all whitespace-nowrap"
                >
                  <span className="material-symbols-outlined text-sm">edit</span>
                  {isEditing ? 'Done' : 'Edit'}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left min-w-[400px]">
                <thead>
                  <tr className="text-slate-500 text-[10px] uppercase tracking-widest border-b border-outline-variant/10">
                    <th className="px-6 py-4 font-bold">Player</th>
                    <th className="px-6 py-4 font-bold">Role</th>
                    <th className="px-6 py-4 font-bold">Franchise</th>
                    <th className="px-6 py-4 font-bold text-right">Points</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {mySquad.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                        {teams.length === 0 ? (
                          <>
                            <span className="material-symbols-outlined text-4xl opacity-50 block mb-2">error</span>
                            Create a new team using the tabs above to begin drafting.
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-4xl opacity-50 block mb-2">person_search</span>
                            Use the search bar above to instantly add players to your squad.
                          </>
                        )}
                      </td>
                    </tr>
                  ) : mySquad.map((player) => (
                    <tr key={player.player_id} className="hover:bg-white/5 transition-colors group">
                      <td className="px-6 py-4 font-semibold text-on-surface">
                        {player.name}
                        {isEditing && (
                          <span
                            onClick={() => handleToggle(player)}
                            className="material-symbols-outlined text-error text-xs ml-3 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity translate-y-0.5 inline-block"
                            title="Remove Player"
                          >remove_circle</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-400">
                        {player.skill_name?.toUpperCase() === 'BATSMAN' ? 'Bat' : player.skill_name?.toUpperCase() === 'BOWLER' ? 'Bow' : player.skill_name?.toUpperCase().includes('WICKET') ? 'WK' : 'AR'}
                      </td>
                      <td className="px-6 py-4 text-slate-400 uppercase">{player.team_short_name}</td>
                      <td className="px-6 py-4 text-right font-headline font-bold text-indigo-300">{player.overall_points.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Distribution Chart */}
          <div className="col-span-12 lg:col-span-5 flex flex-col gap-6">
            <div className="bg-surface-container-high p-8 rounded-3xl flex-1 relative overflow-hidden group border border-outline-variant/5">
              <div className="relative z-10">
                <h2 className="text-xl font-headline font-bold mb-6">Franchise Distribution</h2>
                <div className="space-y-6">
                  {totalDrafted === 0 ? (
                    <p className="text-slate-500 text-sm">Draft players to see matrix distribution.</p>
                  ) : sortedTeams.slice(0, 5).map(([teamName, count], idx) => {
                    const pct = Math.round((count / totalDrafted) * 100);
                    const colorClass = distributionColors[idx % distributionColors.length];
                    const nameParts = teamName.split(' ');
                    const shortName = nameParts.length > 1 ? nameParts.map(n => n[0]).join('').toUpperCase() : teamName.substring(0, 3).toUpperCase();

                    return (
                      <div key={teamName}>
                        <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                          <span>{teamName} ({shortName})</span>
                          <span className="text-indigo-300">{count} - {pct}%</span>
                        </div>
                        <div className="h-2 w-full bg-surface-container-lowest rounded-full overflow-hidden">
                          <div className={`h-full ${colorClass}`} style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Abstract graphic */}
              <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/20 transition-all duration-500"></div>
            </div>
          </div>

        </div>
      </section>
    </DesktopLayout>
  );
}
