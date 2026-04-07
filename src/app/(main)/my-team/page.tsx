'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useTeam } from '@/hooks/useTeam';
import { useFantasyData } from '@/hooks/useFantasyData';
import { usePlayerMatchHistory, getRelativeMatchPoints } from '@/hooks/usePlayerMatchHistory';
import { GamedayPlayer, Team } from '@/types';
import { Search, Plus, Trash2, Edit2, Check, AlertCircle, UserSearch, MinusCircle, Eye } from 'lucide-react';
import { formatSkillName } from '@/utils/formatters';

// Official IPL team colors
const TEAM_CONFIG: Record<string, { color: string; bg: string }> = {
  'CSK': { color: '#FFD700', bg: 'rgba(255,215,0,0.10)' },
  'MI':  { color: '#4A90D9', bg: 'rgba(74,144,217,0.12)' },
  'RCB': { color: '#E8384F', bg: 'rgba(232,56,79,0.10)'  },
  'KKR': { color: '#9B7FD4', bg: 'rgba(155,127,212,0.12)' },
  'SRH': { color: '#F7812A', bg: 'rgba(247,129,42,0.10)' },
  'DC':  { color: '#3DA4E8', bg: 'rgba(61,164,232,0.10)' },
  'PBKS':{ color: '#F43F5E', bg: 'rgba(244,63,94,0.10)' },
  'RR':  { color: '#6B8FD9', bg: 'rgba(107,143,217,0.10)' },
  'GT':  { color: '#5B85C8', bg: 'rgba(91,133,200,0.10)' },
  'LSG': { color: '#B5D95A', bg: 'rgba(181,217,90,0.10)' },
};

const ALL_TEAMS = ['CSK', 'MI', 'RCB', 'KKR', 'SRH', 'DC', 'PBKS', 'RR', 'GT', 'LSG'];

export default function MyTeamPage() {
  const { user, loading: authLoading, signInWithGoogle } = useAuth();
  const { teams, team: activeTeam, activeTeamId, setActiveTeamId, createTeam, renameTeam, deleteTeam, setLobbyTeamStatus, mySquad, loading: teamLoading, togglePlayer, error } = useTeam(user?.id);
  const { players, loading: playersLoading } = useFantasyData();

  const [isEditingSquad, setIsEditingSquad] = useState(false);
  const [editingTeamNameId, setEditingTeamNameId] = useState<string | null>(null);
  const [editableName, setEditableName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [squadError, setSquadError] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading && !user) signInWithGoogle();
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

  const squadPlayerIds = mySquad.map(p => p.player_id);
  const squadTeamNames = [...new Set(mySquad.map(p => p.team_short_name))];

  const { playerHistory, playedTeamSchedule, maxMatchCount, loading: historyLoading } = usePlayerMatchHistory(
    squadPlayerIds,
    squadTeamNames
  );

  // Redirect to login only when auth has fully resolved and there's no user
  if (!authLoading && !user) {
    signInWithGoogle();
    return null;
  }

  // isLoading = true on cold first-load only (no cached data yet)
  const isShellLoading = (teamLoading && teams.length === 0) || (playersLoading && players.length === 0);

  const totalPoints = mySquad.reduce((sum, p) => sum + p.overall_points, 0);
  const sortedSquad = [...mySquad].sort((a, b) => b.overall_points - a.overall_points);

  // Franchise distribution
  const teamCounts: Record<string, number> = {};
  sortedSquad.forEach((p: GamedayPlayer) => {
    teamCounts[p.team_short_name] = (teamCounts[p.team_short_name] || 0) + 1;
  });

  const handleToggle = async (player: GamedayPlayer) => {
    try {
      setSquadError(null);
      await togglePlayer(player.player_id);
    } catch (err: unknown) {
      setSquadError(err instanceof Error ? err.message : String(err));
    }
  };

  const submitRename = async (teamId: string) => {
    if (editableName.trim() && activeTeam && editableName.trim() !== activeTeam.name) {
      await renameTeam(teamId, editableName.trim());
    }
    setEditingTeamNameId(null);
  };

  // Match column headers: M1, M2, ... up to maxMatchCount
  const matchCols = Array.from({ length: maxMatchCount }, (_, i) => i + 1);

  return (
    <div className="max-w-[1400px] mx-auto w-full">

      {/* ════════════════════════════════════════════════
          DESKTOP CONTENT (hidden on mobile)
          ════════════════════════════════════════════════ */}
      <div className="hidden md:block space-y-8">

        {error && (
          <div className="bg-red-500/10 text-red-500 border border-red-500/20 p-4 rounded-xl text-sm font-bold flex items-center justify-between">
            <div className="flex items-center gap-2"><AlertCircle className="w-5 h-5" /> {error}</div>
            <button className="hover:opacity-75" onClick={() => window.location.reload()}><Check className="w-5 h-5" /></button>
          </div>
        )}

        {/* ─── Hero Header Row ─── */}
        <div className="grid grid-cols-12 gap-6 items-start">
          {/* Left: Season Progress */}
          <div className="col-span-12 md:col-span-7">
            <span className="text-indigo-400 font-bold uppercase tracking-widest text-xs">Season Progress</span>
            {isShellLoading ? (
              <div className="mt-2 space-y-2">
                <div className="h-16 w-48 bg-surface-container-high rounded-xl animate-pulse" />
                <div className="h-4 w-32 bg-surface-container-high rounded animate-pulse" />
              </div>
            ) : (
              <>
                <h1 className="text-5xl md:text-7xl font-headline font-extrabold text-on-surface tracking-tighter mt-2">
                  {totalPoints.toLocaleString()} <span className="text-2xl text-tertiary font-normal tracking-normal">PTS</span>
                </h1>
                <p className="text-slate-500 text-sm mt-2">{sortedSquad.length} players drafted</p>
              </>
            )}
          </div>

          {/* Right: Franchise Distribution — 5-column horizontal layout */}
          <div className="col-span-12 md:col-span-5">
            <h3 className="text-[10px] font-black tracking-widest uppercase text-slate-500 mb-3">Franchise Distribution</h3>
            <div className="grid grid-cols-5 gap-1.5">
              {ALL_TEAMS.map(teamCode => {
                const count = teamCounts[teamCode] || 0;
                const cfg = TEAM_CONFIG[teamCode] || { color: '#6366f1', bg: 'rgba(99,102,241,0.10)' };
                const isActive = count > 0;
                return (
                  <div
                    key={teamCode}
                    className="flex flex-row items-center gap-1.5 rounded-lg px-2.5 py-2 border transition-all"
                    style={{
                      background: isActive ? cfg.bg : 'rgba(255,255,255,0.02)',
                      borderColor: isActive ? cfg.color + '50' : 'rgba(255,255,255,0.05)',
                      boxShadow: isActive ? `0 0 12px ${cfg.color}18` : 'none',
                    }}
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: isActive ? cfg.color : '#334155', boxShadow: isActive ? `0 0 6px ${cfg.color}` : 'none' }}
                    />
                    <span
                      className="text-[9px] font-black tracking-widest leading-none"
                      style={{ color: isActive ? cfg.color : '#475569' }}
                    >
                      {teamCode}
                    </span>
                    <span
                      className="text-[11px] font-black ml-auto leading-none"
                      style={{ color: isActive ? cfg.color : '#334155' }}
                    >
                      {isActive ? count : '–'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ─── Active Squad Section ─── */}
        <section className="bg-surface-container-low rounded-2xl border border-white/5 shadow-xl">

          {/* ── Header Block (3 Rows) ── */}
          <div className="bg-surface-container-high rounded-t-2xl border-b border-white/5">

            {/* Row 1: Title + Count */}
            <div className="px-6 md:px-8 pt-5 pb-3 flex items-center justify-between">
              <h2 className="text-xl font-headline font-bold">Active Squad</h2>
              <span className="text-slate-400 text-sm bg-[#222a3d] px-2.5 py-0.5 rounded-md font-black tracking-widest tabular-nums">
                {sortedSquad.length}/11
              </span>
            </div>

            {/* Row 2: Team Tabs */}
            <div className="px-6 md:px-8 flex items-end gap-5 overflow-x-auto no-scrollbar">
              {teams.length === 0 && (
                <span className="pb-3 text-slate-500 text-xs font-bold uppercase tracking-wider">No Teams</span>
              )}
              {teams.map((teamObj: Team) => (
                <div key={teamObj.id} className="relative flex-shrink-0">
                  {editingTeamNameId === teamObj.id ? (
                    <input
                      autoFocus value={editableName}
                      onChange={(e) => setEditableName(e.target.value)}
                      onBlur={() => submitRename(teamObj.id)}
                      onKeyDown={(e) => e.key === 'Enter' && submitRename(teamObj.id)}
                      className="bg-[#222a3d] border border-indigo-500 text-indigo-300 text-xs font-bold uppercase tracking-wider px-2 py-0.5 mb-2 rounded outline-none w-24"
                    />
                  ) : (
                    <button
                      onClick={() => setActiveTeamId(teamObj.id)}
                      onDoubleClick={() => { setEditableName(teamObj.name); setEditingTeamNameId(teamObj.id); }}
                      title="Double click to rename"
                      className={`pb-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-colors border-b-2 ${activeTeamId === teamObj.id ? 'text-indigo-300 border-indigo-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}
                    >
                      {teamObj.name}
                    </button>
                  )}
                </div>
              ))}
              {teams.length < 5 && (
                <button
                  onClick={() => createTeam(`Team ${teams.length + 1}`)}
                  className="pb-3 flex-shrink-0 text-slate-500 border-b-2 border-transparent hover:text-indigo-300 text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> New
                </button>
              )}
            </div>

            {/* Row 3: Controls + Search */}
            {activeTeam && (
              <div className="px-6 md:px-8 py-3 border-t border-white/5 flex items-center justify-between gap-4 flex-wrap">
                {/* Left: Show in Lobby + Edit Squad + Delete */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Show in Lobby toggle */}
                  <div className="flex items-center gap-2 bg-[#0b1326] px-3 py-1.5 rounded-lg border border-white/5">
                    <Eye className="w-3 h-3 text-slate-400" />
                    <span className="text-xs text-slate-300 font-medium">Show in Lobby</span>
                    <button
                      onClick={() => setLobbyTeamStatus(activeTeam.id, !activeTeam.show_in_lobby)}
                      className={`w-8 h-4 rounded-full relative transition-colors ml-1 ${activeTeam.show_in_lobby ? 'bg-indigo-500' : 'bg-slate-700'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${activeTeam.show_in_lobby ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  {/* Edit Squad */}
                  <button
                    onClick={() => setIsEditingSquad(!isEditingSquad)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${isEditingSquad ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-[#222a3d] text-slate-300 border-white/10 hover:bg-white/10'}`}
                  >
                    {isEditingSquad ? <Check className="w-3.5 h-3.5" /> : <Edit2 className="w-3.5 h-3.5" />}
                    {isEditingSquad ? 'Done' : 'Edit Squad'}
                  </button>

                  {/* Delete Team */}
                  <button
                    onClick={() => { if (confirm(`Delete ${activeTeam.name}?`)) deleteTeam(activeTeam.id); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-white/10 bg-[#222a3d] text-slate-400 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-all"
                    title="Delete Team"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>

                {/* Right: Search & Add */}
                <div className="relative flex-shrink-0 z-50" ref={searchRef}>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      value={searchQuery}
                      onChange={(e) => { setSearchQuery(e.target.value); setIsDropdownOpen(e.target.value.length > 0); }}
                      onFocus={() => { if (searchQuery.length > 0) setIsDropdownOpen(true); }}
                      className="bg-[#1a2336] border border-outline-variant/20 rounded-lg py-1.5 pl-8 pr-3 text-xs text-on-surface focus:outline-none focus:border-indigo-500 w-52 transition-all"
                      placeholder="Search & add players..." type="text"
                    />
                  </div>
                  {isDropdownOpen && (
                    <div className="absolute top-full mt-1 right-0 w-80 bg-surface-container-high border border-outline-variant/20 rounded-xl shadow-2xl z-50 max-h-64 overflow-y-auto py-2">
                      {players.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 15).map(player => {
                        const isDrafted = sortedSquad.some((s: GamedayPlayer) => s.player_id === player.player_id);
                        return (
                          <div
                            key={player.player_id}
                            className={`flex items-center justify-between p-3 border-b border-outline-variant/10 hover:bg-white/5 transition-colors cursor-pointer ${isDrafted ? 'opacity-40' : ''}`}
                            onClick={() => { if (!isDrafted) handleToggle(player); setIsDropdownOpen(false); setSearchQuery(''); }}
                          >
                            <div>
                              <h4 className="font-bold text-sm text-on-surface">{player.name}</h4>
                              <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-widest">{formatSkillName(player.skill_name)} • {player.team_short_name}</p>
                            </div>
                            {!isDrafted
                              ? <button className="flex items-center justify-center w-6 h-6 rounded bg-indigo-500 text-white hover:bg-indigo-400"><Plus className="w-3.5 h-3.5" /></button>
                              : <span className="text-[10px] text-slate-500 font-bold px-2">Added</span>}
                          </div>
                        );
                      })}
                      {players.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                        <div className="p-4 text-center text-slate-500 text-xs">No players found</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {squadError && (
            <div className="mx-6 my-3 bg-red-500/10 text-red-400 border border-red-500/20 p-3 rounded-lg text-xs font-bold flex items-center justify-between">
              <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {squadError}</div>
              <button onClick={() => setSquadError(null)}><Check className="w-4 h-4" /></button>
            </div>
          )}

          {/* ─── Dynamic Match Table ─── */}
          <div className="overflow-x-auto">
            <table
              className="w-full text-left"
              style={{ minWidth: `${Math.max(500, 240 + matchCols.length * 64)}px` }}
            >
              <thead>
                <tr className="text-slate-500 text-[10px] uppercase tracking-widest border-b border-white/5 bg-surface-container-low">
                  <th className="px-6 py-4 font-bold sticky left-0 bg-surface-container-low z-10 min-w-[200px]">Player</th>
                  {historyLoading && matchCols.length === 0 ? (
                    <th className="px-6 py-4 font-bold text-center text-slate-500">Loading...</th>
                  ) : (
                    matchCols.map(n => (
                      <th key={n} className="px-3 py-4 font-bold text-center whitespace-nowrap">M{n}</th>
                    ))
                  )}
                  <th className="px-6 py-4 font-bold text-center text-indigo-400">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isShellLoading ? (
                  [...Array(6)].map((_, i) => (
                    <tr key={i}>
                      <td className="px-6 py-4 sticky left-0 bg-[#0f1829]">
                        <div className="h-4 w-32 bg-surface-container-high rounded animate-pulse" />
                        <div className="h-3 w-20 bg-surface-container-high rounded animate-pulse mt-2" />
                      </td>
                      {[...Array(3)].map((_, j) => (
                        <td key={j} className="px-3 py-4 text-center">
                          <div className="h-4 w-8 bg-surface-container-high rounded animate-pulse mx-auto" />
                        </td>
                      ))}
                      <td className="px-6 py-4 text-center">
                        <div className="h-4 w-10 bg-surface-container-high rounded animate-pulse mx-auto" />
                      </td>
                    </tr>
                  ))
                ) : sortedSquad.length === 0 ? (
                  <tr>
                    <td colSpan={matchCols.length + 2} className="px-6 py-16 text-center text-slate-500">
                      {teams.length === 0
                        ? <div className="flex flex-col items-center"><AlertCircle className="w-10 h-10 opacity-30 mb-3" />Create a new team to begin drafting.</div>
                        : <div className="flex flex-col items-center"><UserSearch className="w-10 h-10 opacity-30 mb-3" />Use the search bar above to add players.</div>}
                    </td>
                  </tr>
                ) : sortedSquad.map((player: GamedayPlayer) => {
                  const teamCfg = TEAM_CONFIG[player.team_short_name];
                  const relPts = getRelativeMatchPoints(player, playedTeamSchedule, playerHistory);

                  return (
                    <tr key={player.player_id} className="hover:bg-white/5 transition-colors group">
                      {/* Sticky player column */}
                      <td className="px-6 py-4 sticky left-0 bg-[#0f1829] group-hover:bg-[#151f35] transition-colors z-10">
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-on-surface text-sm">{player.name}</span>
                              {isEditingSquad && (
                                <span
                                  onClick={() => handleToggle(player)}
                                  className="text-red-400 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <MinusCircle className="w-4 h-4" />
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5" style={{ color: teamCfg?.color || '#64748b' }}>
                              {player.team_short_name} • {formatSkillName(player.skill_name)}
                            </p>
                          </div>
                        </div>
                      </td>
                      {/* Relative match columns */}
                      {matchCols.map((n) => {
                        const pts = relPts[n - 1];
                        const hasPlayed = pts !== undefined;
                        return (
                          <td key={n} className="px-3 py-4 text-center font-headline font-bold text-xs">
                            {hasPlayed
                              ? <span className={pts === 0 ? 'text-slate-500' : 'text-on-surface'}>{pts}</span>
                              : <span className="text-slate-700">–</span>
                            }
                          </td>
                        );
                      })}
                      {/* Total */}
                      <td className="px-6 py-4 text-center font-headline font-black text-tertiary">{player.overall_points.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* ════════════════════════════════════════════════
          MOBILE CONTENT (hidden on desktop, < md)
          ════════════════════════════════════════════════ */}
      <div className="md:hidden px-4 space-y-4 pb-4">

        {error && (
          <div className="bg-red-500/10 text-red-500 border border-red-500/20 p-3 rounded-xl text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        {/* ── Stats Row: Season Pts + Franchise Distribution ── */}
        {isShellLoading ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="h-32 rounded-2xl bg-surface-container-high animate-pulse" />
            <div className="h-32 rounded-2xl bg-surface-container-high animate-pulse" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">

            {/* Season Progress — fixed height, no bar or % */}
            <div
              className="rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden"
              style={{ height: '128px', background: 'linear-gradient(145deg, rgba(99,102,241,0.10) 0%, rgba(11,14,20,0.95) 100%)', border: '1px solid rgba(99,102,241,0.15)' }}
            >
              <div className="absolute top-0 right-0 w-20 h-20 rounded-full bg-indigo-500/10 blur-2xl pointer-events-none" />
              <div>
                <p className="text-[8px] font-black uppercase tracking-[0.15em] text-indigo-400/70 mb-1.5">Season Pts</p>
                <p className="text-4xl font-black font-headline text-white leading-none">{totalPoints}</p>
              </div>
              <p className="text-[9px] font-bold text-slate-500">{sortedSquad.length} players</p>
            </div>

            {/* Franchise Distribution — fixed height, always shows all 10 in 2×5 grid */}
            <div
              className="rounded-2xl p-3 flex flex-col"
              style={{ height: '128px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <p className="text-[8px] font-black uppercase tracking-[0.15em] text-slate-500 mb-2">Franchises</p>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 flex-1">
                {ALL_TEAMS.map(teamCode => {
                  const count = teamCounts[teamCode] || 0;
                  const cfg = TEAM_CONFIG[teamCode] || { color: '#6366f1', bg: 'rgba(99,102,241,0.10)' };
                  const isActive = count > 0;
                  return (
                    <div key={teamCode} className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <div
                          className="w-1 h-1 rounded-full flex-shrink-0 transition-colors"
                          style={{ background: isActive ? cfg.color : '#334155' }}
                        />
                        <span
                          className="text-[8px] font-bold leading-none transition-colors"
                          style={{ color: isActive ? cfg.color : '#475569' }}
                        >{teamCode}</span>
                      </div>
                      {isActive && (
                        <span className="text-[7px] font-black" style={{ color: cfg.color }}>{count}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}


        {/* ── Team Tabs — grid-based so all tabs fit the screen without scrolling ── */}
        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${Math.min(teams.length + (teams.length < 5 ? 1 : 0), 5)}, 1fr)` }}
        >
          {teams.map((teamObj: Team) => (
            <button
              key={teamObj.id}
              onClick={() => setActiveTeamId(teamObj.id)}
              className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 truncate px-1 ${
                activeTeamId === teamObj.id
                  ? 'bg-primary text-[#1000a9]'
                  : 'text-slate-400 border border-white/10'
              }`}
              style={activeTeamId !== teamObj.id ? { background: 'rgba(255,255,255,0.04)' } : {}}
            >
              {teamObj.name}
            </button>
          ))}
          {teams.length < 5 && (
            <button
              onClick={() => createTeam(`Team ${teams.length + 1}`)}
              className="py-2 rounded-xl bg-primary/20 text-primary flex items-center justify-center active:scale-95 transition-transform"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ── Controls Bar ── */}
        {activeTeam && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {/* Show in Lobby toggle */}
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Show in Lobby</span>
              <button
                onClick={() => setLobbyTeamStatus(activeTeam.id, !activeTeam.show_in_lobby)}
                className={`w-9 h-5 rounded-full relative transition-colors ${activeTeam.show_in_lobby ? 'bg-indigo-500' : 'bg-slate-700'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${activeTeam.show_in_lobby ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsEditingSquad(!isEditingSquad)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all active:scale-95 ${isEditingSquad ? 'bg-indigo-500 text-white border-indigo-500' : 'text-slate-400 border-white/10'}`}
                style={!isEditingSquad ? { background: 'rgba(255,255,255,0.04)' } : {}}
              >
                {isEditingSquad ? <Check className="w-3 h-3" /> : <Edit2 className="w-3 h-3" />}
                {isEditingSquad ? 'Done' : 'Edit'}
              </button>
              <button
                onClick={() => { if (confirm(`Delete ${activeTeam.name}?`)) deleteTeam(activeTeam.id); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border border-white/10 text-slate-400 active:scale-95 transition-transform"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* ── Search & Add ── */}
        <div className="relative z-50" ref={searchRef}>
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2.5 border border-white/10"
            style={{ background: 'rgba(255,255,255,0.04)' }}
          >
            <Search className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
            <input
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setIsDropdownOpen(e.target.value.length > 0); }}
              onFocus={() => { if (searchQuery.length > 0) setIsDropdownOpen(true); }}
              className="flex-1 bg-transparent text-xs text-on-surface placeholder-slate-600 outline-none"
              placeholder="Search & add players..."
            />
          </div>
          {/* Mobile search dropdown — rendered outside the input wrapper, positioned relative to parent */}
          {isDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-xl shadow-2xl z-50 max-h-52 overflow-y-auto py-2"
              style={{ background: '#131d30', border: '1px solid rgba(255,255,255,0.10)' }}
            >
              {players.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 12).map(player => {
                const isDrafted = sortedSquad.some((s: GamedayPlayer) => s.player_id === player.player_id);
                return (
                  <div
                    key={player.player_id}
                    className={`flex items-center justify-between px-4 py-2.5 active:bg-white/5 transition-colors cursor-pointer ${isDrafted ? 'opacity-40' : ''}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-on-surface">{player.name}</p>
                      <p className="text-[8px] text-slate-500 uppercase tracking-widest">{formatSkillName(player.skill_name)} · {player.team_short_name}</p>
                    </div>
                    {!isDrafted ? (
                      <button
                        onPointerDown={(e) => {
                          e.preventDefault(); // Prevent input blur before click registers
                          handleToggle(player);
                          setIsDropdownOpen(false);
                          setSearchQuery('');
                        }}
                        className="w-7 h-7 rounded-lg bg-primary/20 text-primary flex items-center justify-center flex-shrink-0 ml-3 active:bg-primary/40 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span className="text-[9px] text-slate-500 font-bold ml-3">Added</span>
                    )}
                  </div>
                );
              })}
              {players.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                <p className="text-slate-500 text-xs p-4 text-center">No players found</p>
              )}
            </div>
          )}
        </div>

        {squadError && (
          <div className="bg-red-500/10 text-red-400 border border-red-500/20 p-3 rounded-xl text-xs font-bold">
            <AlertCircle className="w-4 h-4 inline mr-1" />{squadError}
          </div>
        )}

        {/* ── Player Match History Table (horizontally scrollable, up to M14) ── */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.03)' }}
        >
          {/* Table header */}
          <div className="flex items-center px-3 py-2.5 border-b border-white/5 gap-1">
            <div className="w-[140px] flex-shrink-0 text-[8px] font-black uppercase tracking-widest text-slate-500">Player</div>
            <div className="flex-1 overflow-x-auto hide-scrollbar">
              <div className="flex gap-1 min-w-max">
                {historyLoading && matchCols.length === 0 ? (
                  <div className="text-[8px] font-black uppercase tracking-widest text-slate-600 px-2">Loading...</div>
                ) : matchCols.map(n => (
                  <div key={n} className="w-8 text-center text-[8px] font-black uppercase tracking-widest text-slate-500 flex-shrink-0">M{n}</div>
                ))}
              </div>
            </div>
            <div className="w-12 text-right text-[8px] font-black uppercase tracking-widest text-primary flex-shrink-0">Total</div>
          </div>

          {/* Table rows */}
          {isShellLoading ? (
            [...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-3 border-b border-white/5">
                <div className="w-[140px] space-y-1">
                  <div className="h-3 bg-surface-container-high rounded animate-pulse w-24" />
                  <div className="h-2.5 bg-surface-container-high rounded animate-pulse w-16" />
                </div>
                <div className="flex-1 flex gap-1">
                  {[...Array(4)].map((_, j) => <div key={j} className="w-8 h-3 bg-surface-container-high rounded animate-pulse flex-shrink-0" />)}
                </div>
                <div className="w-12 h-3 bg-surface-container-high rounded animate-pulse" />
              </div>
            ))
          ) : sortedSquad.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <p className="text-xs">
                {teams.length === 0 ? 'Create a team to start drafting.' : 'Search above to add players.'}
              </p>
            </div>
          ) : sortedSquad.map((player: GamedayPlayer, rowIdx) => {
            const teamCfg = TEAM_CONFIG[player.team_short_name];
            const relPts = getRelativeMatchPoints(player, playedTeamSchedule, playerHistory);
            return (
              <div
                key={player.player_id}
                className="flex items-center gap-1 px-3 py-3"
                style={{ background: rowIdx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}
              >
                {/* Sticky-ish player name */}
                <div className="w-[140px] flex-shrink-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-headline font-bold text-on-surface truncate">{player.name}</p>
                    {isEditingSquad && (
                      <button onClick={() => handleToggle(player)} className="text-red-400 flex-shrink-0">
                        <MinusCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="text-[8px] font-bold uppercase tracking-widest mt-0.5 truncate"
                    style={{ color: teamCfg?.color || '#64748b' }}>
                    {player.team_short_name} · {formatSkillName(player.skill_name)}
                  </p>
                </div>

                {/* Match points — scrollable */}
                <div className="flex-1 overflow-x-auto hide-scrollbar">
                  <div className="flex gap-1 min-w-max">
                    {matchCols.map((n) => {
                      const pts = relPts[n - 1];
                      const hasPlayed = pts !== undefined;
                      return (
                        <div key={n} className="w-8 text-center text-[10px] font-headline font-bold flex-shrink-0">
                          {hasPlayed
                            ? <span className={pts === 0 ? 'text-slate-600' : 'text-on-surface'}>{pts}</span>
                            : <span className="text-slate-700">–</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Total */}
                <div className="w-12 text-right font-headline font-black text-tertiary text-sm flex-shrink-0">
                  {player.overall_points}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

