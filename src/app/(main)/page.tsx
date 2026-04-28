'use client';

import { useFixtures } from '@/hooks/useFixtures';
import { useTopPerformers } from '@/hooks/useTopPerformers';
import { useTeam } from '@/hooks/useTeam';
import Link from 'next/link';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Search, ChevronDown, ChevronUp } from 'lucide-react';
import { formatSkillName } from '@/utils/formatters';
import { useFantasyData } from '@/hooks/useFantasyData';
import { useRouter } from 'next/navigation';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { User } from '@supabase/supabase-js';
import type { GamedayPlayer } from '@/types';

/* ─────────────────────────────────────────────────────────
   useLiveScore
   ─────────────────────────────────────────────────────────
   - When isMatchLive=true : polls /api/live-score every 15s for live IPL match
   - When isRecentlyFinished=true : polls every 60s for completed IPL match
     (shows last score for up to 4 hours after match ends)
   - Polls are stopped and state cleared when neither condition is met
   ───────────────────────────────────────────────────────── */
interface LiveMatch {
  t_one: string; t_one_s: string;
  t_two: string; t_two_s: string;
  m_status: string; status: string; spec: string;
}
function useLiveScore(isMatchLive: boolean, isRecentlyFinished: boolean) {
  const [match, setMatch] = useState<LiveMatch | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const active = isMatchLive || isRecentlyFinished;

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch('/api/live-score');
      if (!res.ok) return;
      const json = await res.json() as { live: LiveMatch[]; completed: LiveMatch[] };
      // Prefer a genuinely live match; fall back to most recent completed one
      const found = json.live?.[0] ?? json.completed?.[0] ?? null;
      setMatch(found);
    } catch { /* network blip — keep last value */ }
  }, []);

  useEffect(() => {
    if (!active) { setMatch(null); return; }
    fetch_();
    // Poll faster when live (15s), slower when just finished (60s)
    const interval = isMatchLive ? 15_000 : 60_000;
    timerRef.current = setInterval(fetch_, interval);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [active, isMatchLive, fetch_]);

  return match;
}

/* ─────────────────────────────────────────────────────────
   Score string helpers
   "159/6(20.0)" or "159-6 (20.0)" → { runs: "159", wkts: "6", overs: "20.0" }
   ───────────────────────────────────────────────────────── */
function parseScore(raw: string | undefined): { runs: string; wkts: string; overs: string } | null {
  if (!raw) return null;
  // e.g. "159/6(20.0)" or "0/0(0)"
  const m = raw.match(/^(\d+)[/\-](\d+)\(?([\d.]+)\)?/);
  if (!m) return null;
  if (m[1] === '0' && m[2] === '0') return null; // no data yet
  return { runs: m[1], wkts: m[2], overs: m[3] };
}

/* ─────────────────────────────────────────────────────────
   MatchHeader — self-contained premium scoreboard card
   Handles all states: Live • Recently Finished • Upcoming
   Integrates status pill, scores, result text, and CTA button.
   ───────────────────────────────────────────────────────── */
interface MatchHeaderProps {
  isMatchLive: boolean;
  isRecentlyFinished: boolean;
  liveScore: LiveMatch | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  matchFixture: any; // lastMatch when recently finished, displayMatch otherwise
  user: User | null;
  signInWithGoogle: () => void;
  router: AppRouterInstance;
}

/* ── Crictimes API abbreviation aliases ───────────────────────────────────────
   Some teams are abbreviated differently in the Crictimes API vs our fixture DB.
   Add new entries here if more mismatches appear in the future.
   Keys are lowercase Crictimes abbreviations → values are our short-name (lowercase).
   ──────────────────────────────────────────────────────────────────────────── */
const CRICTIMES_ALIASES: Record<string, string> = {
  raj:  'rr',   // Rajasthan Royals
  kxip: 'pbks', // Punjab Kings
};
function normalizeAbbrev(raw: string): string {
  const lower = raw.toLowerCase();
  return CRICTIMES_ALIASES[lower] ?? lower;
}

function MatchHeader({ isMatchLive, isRecentlyFinished, liveScore, matchFixture, user, signInWithGoogle, router }: MatchHeaderProps) {
  // ── Score display order: t_one batted first (LEFT), t_two batted second (RIGHT) ──
  const s1 = parseScore(liveScore?.t_one_s); // left  (batted 1st)
  const s2 = parseScore(liveScore?.t_two_s); // right (batted 2nd)

  // ── Display names: prefer fixture names (correct short codes) ──────────────
  // Crictimes API may use old/different abbreviations (RAJ vs RR, KXIP vs PBKS).
  // We normalise API abbreviations through CRICTIMES_ALIASES before matching.
  const homeTeam = matchFixture?.home_team_short_name ?? '';
  const awayTeam = matchFixture?.away_team_short_name ?? '';
  let t1 = liveScore?.t_one ?? homeTeam; // left display name
  let t2 = liveScore?.t_two ?? awayTeam; // right display name

  if (liveScore && (homeTeam || awayTeam)) {
    // Normalise through alias table so "raj"→"rr", "kxip"→"pbks" etc.
    const apiT1 = normalizeAbbrev(liveScore.t_one);
    const apiT2 = normalizeAbbrev(liveScore.t_two);
    const homeLower = homeTeam.toLowerCase();
    const awayLower = awayTeam.toLowerCase();

    // Direct (possibly aliased) match: t_one
    let t1Resolved = false;
    if (apiT1 === homeLower)      { t1 = homeTeam; t1Resolved = true; }
    else if (apiT1 === awayLower) { t1 = awayTeam; t1Resolved = true; }

    // Direct (possibly aliased) match: t_two
    let t2Resolved = false;
    if (apiT2 === awayLower)      { t2 = awayTeam; t2Resolved = true; }
    else if (apiT2 === homeLower) { t2 = homeTeam; t2Resolved = true; }

    // Cross-deduction: if one side matched, the other is the remaining fixture team.
    if (!t1Resolved && t2Resolved) t1 = (t2 === awayTeam) ? homeTeam : awayTeam;
    if (!t2Resolved && t1Resolved) t2 = (t1 === homeTeam) ? awayTeam : homeTeam;
  }


  const hasScore = s1 !== null || s2 !== null;
  const resultText = liveScore?.m_status ?? null;
  const spec = liveScore?.spec ?? matchFixture?.match_name ?? '';

  const isFinished = isRecentlyFinished
    || matchFixture?.match_status === '2'
    || matchFixture?.match_status === '5';
  const statusLabel = isMatchLive ? 'Live' : isFinished ? 'Finished' : 'Upcoming';
  const statusColor = isMatchLive
    ? 'bg-red-500/10 text-red-400 border-red-500/20'
    : isFinished
    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    : 'bg-tertiary/10 text-tertiary border-tertiary/20';

  return (
    <div
      className="w-full rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(99,102,241,0.14) 0%, rgba(126,81,255,0.07) 55%, rgba(15,24,41,0.85) 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 1px 3px rgba(0,0,0,0.4)',
        border: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* ─ Top bar: status + match label + CTA ──────────────────────── */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black tracking-[0.15em] uppercase border flex-shrink-0 ${statusColor}`}>
            {isMatchLive && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />}
            {statusLabel}
          </span>
          {spec && (
            <span className="text-[10px] text-slate-500 font-medium truncate hidden xs:block">{spec}</span>
          )}
        </div>
        <button
          onClick={() => !user ? signInWithGoogle() : router.push('/my-team')}
          className="flex-shrink-0 ml-3 text-[9px] md:text-[10px] font-black tracking-[0.12em] uppercase px-3 md:px-5 py-1.5 md:py-2 rounded-xl bg-primary/20 text-primary hover:bg-primary/30 active:scale-95 transition-all cursor-pointer"
        >
          {user ? 'My Team →' : 'Create Team'}
        </button>
      </div>

      {/* ─ Score section ─────────────────────────────────────────────── */}
      {/* Inner wrapper constrains max-width on desktop so teams don't sit at far edges */}
      <div className="px-4 md:px-8 py-5 md:pt-7 md:pb-5">
        <div className="flex items-center justify-between gap-2 md:gap-6 md:max-w-3xl md:mx-auto">

          {/* Team 1 — left */}
          <div className="flex items-center gap-2.5 md:gap-4 flex-1 min-w-0">
            <div className="w-11 h-11 md:w-16 md:h-16 flex-shrink-0 rounded-full bg-white/5 border border-white/10 p-1 md:p-1.5 flex items-center justify-center">
              {t1 && <img src={`/logos/${t1.toLowerCase()}.png`} alt={t1}
                className="w-full h-full object-contain drop-shadow-lg"
                onError={e => { e.currentTarget.style.display = 'none'; }} />}
            </div>
            {t1 ? (
              <div className="min-w-0">
                <p className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 mb-0.5">{t1}</p>
                {s1 ? (
                  <>
                    <p className="leading-none font-headline font-black text-on-surface">
                      <span className="text-[22px] md:text-[34px]">{s1.runs}</span>
                      <span className="text-slate-400 text-sm md:text-xl font-bold">/{s1.wkts}</span>
                    </p>
                    <p className="text-[9px] md:text-[10px] text-slate-600 font-medium mt-0.5">({s1.overs} ov)</p>
                  </>
                ) : (
                  <p className="text-xs text-slate-600 font-bold mt-1">{isMatchLive ? 'Batting...' : 'TBD'}</p>
                )}
              </div>
            ) : (
              <div className="h-8 w-20 bg-white/5 rounded-lg animate-pulse" />
            )}
          </div>

          {/* Center ─ desktop: result text (large) · mobile: VS / ⚡ */}
          <div className="flex-shrink-0 flex flex-col items-center justify-center px-2 md:px-4">
            {/* Mobile only */}
            <div className="md:hidden text-center">
              {!hasScore ? (
                <span className="text-[10px] font-black tracking-[0.2em] text-slate-700">VS</span>
              ) : isMatchLive ? (
                <span className="text-slate-600 text-xs">⚡</span>
              ) : null}
            </div>
            {/* Desktop only */}
            <div className="hidden md:block text-center max-w-[180px] lg:max-w-[220px]">
              {resultText ? (
                <p className="text-base lg:text-lg font-bold text-tertiary leading-snug">{resultText}</p>
              ) : !hasScore ? (
                <span className="text-[10px] font-black tracking-[0.2em] text-slate-700">VS</span>
              ) : isMatchLive ? (
                <span className="text-slate-600 text-base">⚡</span>
              ) : null}
            </div>
          </div>

          {/* Team 2 — right */}
          <div className="flex items-center gap-2.5 md:gap-4 flex-1 min-w-0 flex-row-reverse">
            <div className="w-11 h-11 md:w-16 md:h-16 flex-shrink-0 rounded-full bg-white/5 border border-white/10 p-1 md:p-1.5 flex items-center justify-center">
              {t2 && <img src={`/logos/${t2.toLowerCase()}.png`} alt={t2}
                className="w-full h-full object-contain drop-shadow-lg"
                onError={e => { e.currentTarget.style.display = 'none'; }} />}
            </div>
            {t2 ? (
              <div className="min-w-0 text-right">
                <p className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 mb-0.5">{t2}</p>
                {s2 ? (
                  <>
                    <p className="leading-none font-headline font-black text-on-surface">
                      <span className="text-[22px] md:text-[34px]">{s2.runs}</span>
                      <span className="text-slate-400 text-sm md:text-xl font-bold">/{s2.wkts}</span>
                    </p>
                    <p className="text-[9px] md:text-[10px] text-slate-600 font-medium mt-0.5">({s2.overs} ov)</p>
                  </>
                ) : (
                  <p className="text-xs text-slate-600 font-bold mt-1">{isMatchLive ? 'Batting...' : 'TBD'}</p>
                )}
              </div>
            ) : (
              <div className="h-8 w-20 bg-white/5 rounded-lg animate-pulse" />
            )}
          </div>

        </div>
      </div>

      {/* ─ Result strip — mobile only, tight spacing ──────────────── */}
      {resultText && (
        <div className="md:hidden px-4 pt-0 pb-3 text-center">
          <p className="text-[10px] font-bold text-tertiary tracking-wide">{resultText}</p>
        </div>
      )}
    </div>
  );
}


/* ─────────────────────────────────────────────────────────
   MobileLobby — rendered only below `md:` breakpoint
   ───────────────────────────────────────────────────────── */
interface MobileLobbyProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  displayMatch: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  matchFixture: any; // lastMatch when recently finished, else displayMatch
  performerMatch: any;
  matchName: string;
  liveScore: LiveMatch | null;
  isRecentlyFinished: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  topPerformers: any[];
  topPerformersLoading: boolean;
  topPerformersMatchName: string;
  lobbySquad: GamedayPlayer[];
  lobbyTotalPoints: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lobbyTeam: any;
  players: GamedayPlayer[];
  filteredPlayers: GamedayPlayer[];
  playersLoading: boolean;
  filterType: string;
  setFilterType: (v: string) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  user: User | null;
  signInWithGoogle: () => void;
  router: AppRouterInstance;
}

function MobileLobby({
  matchFixture, performerMatch, liveScore, isRecentlyFinished,
  topPerformers, topPerformersLoading, topPerformersMatchName,
  lobbySquad, lobbyTotalPoints, lobbyTeam, players, filteredPlayers, playersLoading,
  filterType, setFilterType, searchQuery, setSearchQuery, user, signInWithGoogle, router,
  isMatchLive,
}: MobileLobbyProps & { isMatchLive: boolean }) {
  const [squadExpanded, setSquadExpanded] = useState(false);



  return (
    <div className="md:hidden px-4 space-y-4">

      {/* ── Match Header Card ── */}
      <section>
        <MatchHeader
          isMatchLive={isMatchLive}
          isRecentlyFinished={isRecentlyFinished}
          liveScore={liveScore}
          matchFixture={matchFixture}
          user={user}
          signInWithGoogle={signInWithGoogle}
          router={router}
        />
      </section>

      {/* ── Top Performers (horizontal scroll) ── */}
      <section>
        <h3 className="text-[9px] font-black tracking-[0.15em] uppercase text-slate-500 mb-3">Top Performers -
          <span className="text-[10px] text-slate-500 mt-1 font-medium"> {topPerformersMatchName} {performerMatch?.match_status === '5' ? ' - Match Abandoned' : ''}</span>
        </h3>
        <div className="flex gap-3 overflow-x-auto pb-3 hide-scrollbar pt-2">
          {topPerformersLoading ? (
            [...Array(5)].map((_, i) => (
              <div key={i} className="w-[128px] flex-shrink-0 h-24 rounded-xl bg-surface-container-high animate-pulse" />
            ))
          ) : topPerformers.length === 0 ? (
            <p className="text-slate-500 text-xs py-4">No data yet.</p>
          ) : topPerformers.map((player, idx) => (
            <div
              key={player.player_id}
              className="w-[128px] flex-shrink-0 rounded-xl p-3 flex flex-col relative active:scale-95 transition-transform overflow-visible"
              style={{ background: 'rgba(255,255,255,0.04)' }}
            >
              {idx === 0 && (
                <div className="absolute -top-2 -right-2 bg-amber-400 text-[7px] font-black text-black px-1.5 py-0.5 rounded-full tracking-widest z-10 whitespace-nowrap">MVP</div>
              )}
              <p className="text-[7px] font-black uppercase tracking-widest text-slate-500 mb-1">
                {player.team_short_name} · {formatSkillName(player.skill_name)}
              </p>
              <p className="text-xs font-headline font-bold text-on-surface leading-tight mb-2 line-clamp-2">
                {player.name}
              </p>
              <div className="mt-auto">
                <span className="text-2xl font-headline font-black text-on-surface">{player.gameday_points}</span>
                <span className="text-[8px] font-bold text-slate-500 ml-1 uppercase tracking-widest">PTS</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── My Squad Card ── */}
      <section
        className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.03)' }}
      >
        <button
          className="w-full flex items-center justify-between px-4 py-4 active:bg-white/5 transition-colors"
          onClick={() => setSquadExpanded(v => !v)}
        >
          <div className="flex items-center gap-3">
            <span className="text-xs font-black uppercase tracking-widest text-primary">
              {lobbyTeam?.name || 'My Squad'}
            </span>
            {!user && (
              <span className="text-[8px] font-bold text-slate-500 border border-slate-700 rounded px-1.5 py-0.5">Login</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-headline font-black text-tertiary">{lobbyTotalPoints}</span>
            <span className="text-slate-500 text-[8px] font-bold uppercase mr-1">PTS</span>
            {squadExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
          </div>
        </button>

        {squadExpanded && (
          <div className="border-t border-white/5">
            {!user ? (
              <div className="p-6 text-center">
                <span className="material-symbols-outlined block text-slate-600 text-3xl mb-2">lock</span>
                <p className="text-xs text-slate-500 mb-3">Log in to see your squad</p>
                <button
                  onClick={signInWithGoogle}
                  className="bg-primary text-[#1000a9] text-xs font-black px-4 py-2 rounded-xl active:scale-95 transition-transform"
                >
                  Sign In
                </button>
              </div>
            ) : lobbySquad.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-xs text-slate-500 mb-3">You haven't drafted anyone yet.</p>
                <Link href="/my-team" className="text-xs font-bold text-primary">Draft Now →</Link>
              </div>
            ) : (() => {
              // Sort: highest points first
              const ranked = [...lobbySquad].sort((a, b) => b.overall_points - a.overall_points);
              const [topPlayer, ...rest] = ranked;
              // Split remaining 10 into two columns of 5
              const col1 = rest.slice(0, 5);
              const col2 = rest.slice(5, 10);
              const PlayerRow = ({ player }: { player: typeof ranked[0] }) => (
                <div className="flex items-center justify-between px-2 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-headline font-bold text-on-surface truncate">{player.name}</p>
                    <p className="text-[7px] font-bold text-slate-500 uppercase tracking-widest truncate">
                      {player.team_short_name} · {formatSkillName(player.skill_name)}
                    </p>
                  </div>
                  <span className="text-xs font-headline font-black text-tertiary flex-shrink-0 ml-2">
                    {player.overall_points}
                  </span>
                </div>
              );
              return (
                <div className="p-3 space-y-3">
                  {/* Top scorer — centered above both columns */}
                  {topPlayer && (
                    <div className="flex justify-center">
                      <div
                        className="w-[48%] px-3 py-2.5 rounded-xl flex items-center justify-between"
                        style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.18) 0%, rgba(139,92,246,0.10) 100%)' }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1 mb-0.5">
                            <span className="text-[7px] font-black uppercase tracking-widest text-amber-400">⟡ Top</span>
                          </div>
                          <p className="text-xs font-headline font-bold text-on-surface truncate">{topPlayer.name}</p>
                          <p className="text-[7px] font-bold text-slate-500 uppercase tracking-widest">
                            {topPlayer.team_short_name} · {formatSkillName(topPlayer.skill_name)}
                          </p>
                        </div>
                        <span className="text-base font-headline font-black text-tertiary flex-shrink-0 ml-2">
                          {topPlayer.overall_points}
                        </span>
                      </div>
                    </div>
                  )}
                  {/* 2-column grid for the remaining 10 */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="space-y-1.5">
                      {col1.map(p => <PlayerRow key={p.player_id} player={p} />)}
                    </div>
                    <div className="space-y-1.5">
                      {col2.map(p => <PlayerRow key={p.player_id} player={p} />)}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </section>

      {/* ── Impact Tracking ── */}
      <section>
        <h3 className="text-[9px] font-black tracking-[0.15em] uppercase text-slate-500 mb-3">Impact Tracking</h3>

        {/* Role Filter Chips — 5 equal columns spanning full width */}
        <div className="grid grid-cols-5 gap-1.5 mb-3">
          {['All', 'BAT', 'BWL', 'AR', 'WK'].map(role => (
            <button
              key={role}
              onClick={() => setFilterType(role)}
              className={`w-full py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 text-center ${
                filterType === role
                  ? 'bg-primary text-[#1000a9]'
                  : 'text-slate-400 border border-white/10'
              }`}
              style={filterType === role ? {} : { background: 'rgba(255,255,255,0.04)' }}
            >
              {role}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 mb-3 border border-white/10"
          style={{ background: 'rgba(255,255,255,0.04)' }}>
          <Search className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
          <input
            className="flex-1 bg-transparent text-xs text-on-surface placeholder-slate-600 outline-none"
            placeholder="Search players..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Player Rows — fixed height showing ~7 rows, scrollable inside */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.03)' }}
        >
          <div
            className="overflow-y-auto hide-scrollbar"
            style={{ maxHeight: '308px' }}
          >
            {playersLoading && players.length === 0 ? (
              [...Array(7)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
                  <div className="h-3 w-5 bg-surface-container-high rounded animate-pulse" />
                  <div className="flex-1 h-3 bg-surface-container-high rounded animate-pulse" />
                  <div className="h-3 w-10 bg-surface-container-high rounded animate-pulse" />
                </div>
              ))
            ) : filteredPlayers.length === 0 ? (
              <p className="text-slate-500 text-xs p-4 text-center">No players found</p>
            ) : filteredPlayers.map((player, idx) => (
              <div
                key={player.player_id}
                className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-b-0"
                style={{ background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}
              >
                <span className="text-[9px] font-black text-primary w-5 text-right flex-shrink-0">
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-headline font-bold text-on-surface truncate">{player.name}</p>
                  <p className="text-[8px] text-slate-500 uppercase tracking-wider">{player.team_short_name}</p>
                </div>
                <span className="text-sm font-headline font-black text-on-surface flex-shrink-0">
                  {player.overall_points}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function Lobby() {
  const { displayMatch, performerMatch, lastMatch, activeGamedayId, isMatchLive, loading: fixturesLoading } = useFixtures();
  const { topPerformers, loading: topPerformersLoading } = useTopPerformers(activeGamedayId);
  const { players, loading: playersLoading } = useFantasyData();
  const { user, signInWithGoogle } = useAuth();
  const router = useRouter();
  const { teams, loading: teamLoading } = useTeam(user?.id);

  const lobbyTeam = teams?.find(t => t.show_in_lobby) || teams?.[0];
  const lobbySquad = lobbyTeam ? players.filter(p => lobbyTeam.selected_players?.includes(p.player_id)) : [];
  lobbySquad.sort((a, b) => (b.overall_points || 0) - (a.overall_points || 0));
  const lobbyTotalPoints = lobbySquad.reduce((sum, p) => sum + (p.overall_points || 0), 0);

  // Show last match score for 8 h from match START
  // (covers ~3.5h T20 + ~4.5h post-match display window)
  const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
  const isRecentlyFinished = !isMatchLive && lastMatch !== null && (() => {
    const dt = lastMatch.match_datetime;
    const matchTime = new Date(dt.endsWith('Z') ? dt : dt + 'Z').getTime();
    return Date.now() - matchTime < EIGHT_HOURS_MS;
  })();

  // Use lastMatch fixture when recently finished (displayMatch would be the upcoming match)
  const matchFixture = isRecentlyFinished ? lastMatch : displayMatch;

  // Poll crictimes public JSON for live/recently-completed score
  const liveScore = useLiveScore(isMatchLive, isRecentlyFinished);

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
      <div className="max-w-7xl mx-auto w-full space-y-8 animate-pulse">
        {/* Match header skeleton */}
        <section>
          <div className="flex items-end justify-between mb-6">
            <div className="space-y-2">
              <div className="h-4 w-16 bg-white/5 rounded-full" />
              <div className="h-8 w-72 bg-white/5 rounded-xl" />
            </div>
            <div className="h-10 w-36 bg-white/5 rounded-xl" />
          </div>
        </section>

        <div className="grid grid-cols-12 gap-8">
          {/* Left column */}
          <div className="col-span-12 lg:col-span-9 space-y-8">
            {/* Top performers card */}
            <div className="bg-surface-container-low rounded-2xl p-6 border border-white/5 space-y-4">
              <div className="h-5 w-40 bg-white/5 rounded" />
              <div className="grid grid-cols-5 gap-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="bg-surface-container-high rounded-xl p-4 space-y-3">
                    <div className="w-10 h-10 rounded-full bg-white/5 mx-auto" />
                    <div className="h-3 w-16 bg-white/5 rounded mx-auto" />
                    <div className="h-4 w-10 bg-white/5 rounded mx-auto" />
                  </div>
                ))}
              </div>
            </div>
            {/* Player table skeleton */}
            <div className="bg-surface-container-low rounded-2xl border border-white/5">
              <div className="p-6 border-b border-white/5">
                <div className="h-5 w-32 bg-white/5 rounded" />
              </div>
              <div className="divide-y divide-white/5">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="px-6 py-4 flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-white/5 shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 w-32 bg-white/5 rounded" />
                      <div className="h-2.5 w-20 bg-white/5 rounded" />
                    </div>
                    <div className="h-4 w-10 bg-white/5 rounded" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="col-span-12 lg:col-span-3 space-y-6">
            <div className="bg-surface-container-low rounded-2xl p-6 border border-white/5 space-y-4">
              <div className="h-5 w-28 bg-white/5 rounded" />
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/5" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-24 bg-white/5 rounded" />
                    <div className="h-2 w-16 bg-white/5 rounded" />
                  </div>
                  <div className="h-4 w-8 bg-white/5 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const matchName = displayMatch?.match_name || 'Match Command Center';
  const topPerformersMatchName = performerMatch
    ? (isMatchLive ? `Live · ${performerMatch.match_name}` : `Last Match · ${performerMatch.match_name}`)
    : 'Latest Match';

  return (
    <div className="max-w-7xl mx-auto w-full space-y-8">

      {/* ════════════════════════════════════════════════
          DESKTOP CONTENT (hidden on mobile)
          ════════════════════════════════════════════════ */}
      <div className="hidden md:block space-y-8">

        {/* Match Header */}
        <section className="mb-6">
          <MatchHeader
            isMatchLive={isMatchLive}
            isRecentlyFinished={isRecentlyFinished}
            liveScore={liveScore}
            matchFixture={matchFixture}
            user={user}
            signInWithGoogle={signInWithGoogle}
            router={router}
          />
        </section>

        <div className="grid grid-cols-12 gap-8">
          {/* Left: Performers and Tracking */}
          <div className="col-span-12 lg:col-span-9 space-y-8">

            {/* Top Performers Grid */}
            <section>
              <h3 className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-6 flex items-center gap-3">
                Top Performers
                <span className="text-slate-600 normal-case tracking-normal font-normal text-xs">— {topPerformersMatchName} - {performerMatch?.match_status === '5' ? 'Match Abandoned' : ''}</span>
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
                    <div key={player.player_id} className="min-w-[150px] flex-1 bg-surface-container-high p-4 rounded-xl border border-white/5 hover:border-primary/30 transition-all cursor-pointer group relative flex flex-col">
                      {idx === 0 && (
                        <div className="absolute -top-1.5 -right-1.5 bg-amber-400 text-[9px] font-black text-black px-1.5 py-0.5 rounded-full tracking-widest">MVP</div>
                      )}
                      <div className="text-[8px] font-black tracking-widest uppercase text-slate-500 mb-2">{player.team_short_name} • {formatSkillName(player.skill_name)}</div>
                      <h4 className="text-sm font-headline font-bold text-on-surface group-hover:text-primary transition-colors">{player.name}</h4>
                      <div className="mt-auto flex flex-col">
                        <span className="text-xl font-headline font-black text-on-surface text-left mt-3">{player.gameday_points}</span>
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

      {/* ════════════════════════════════════════════════
          MOBILE CONTENT (hidden on desktop, < md)
          ════════════════════════════════════════════════ */}
      <MobileLobby
        displayMatch={displayMatch}
        matchFixture={matchFixture}
        performerMatch={performerMatch}
        matchName={matchName}
        liveScore={liveScore}
        isRecentlyFinished={isRecentlyFinished}
        topPerformers={topPerformers}
        topPerformersLoading={topPerformersLoading}
        topPerformersMatchName={topPerformersMatchName}
        lobbySquad={lobbySquad}
        lobbyTotalPoints={lobbyTotalPoints}
        lobbyTeam={lobbyTeam}
        players={players}
        filteredPlayers={filteredPlayers}
        playersLoading={playersLoading}
        filterType={filterType}
        setFilterType={setFilterType}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        user={user}
        signInWithGoogle={signInWithGoogle}
        router={router}
        isMatchLive={isMatchLive}
      />
    </div>
  );
}

