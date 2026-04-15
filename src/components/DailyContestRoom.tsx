'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useFixtures } from '@/hooks/useFixtures';
import { useFantasyData } from '@/hooks/useFantasyData';
import { useDailyContestTeams } from '@/hooks/useDailyContestTeams';
import { useDailyPlayerPool } from '@/hooks/useDailyPlayerPool';
import { validateDailyTeam } from '@/utils/validateDailyTeam';
import { supabase } from '@/lib/supabaseClient';
import toast from 'react-hot-toast';
import {
  Trophy, Settings, Lock, Star, Check, Copy, Info, Clock,
  ArrowLeft, Trash2, LogOut, ShieldCheck, Crown, Pen, X, Eye,
  ChevronDown, ChevronUp, MoreVertical,
} from 'lucide-react';
import {
  TourFixture, GamedayPlayer, DailyContestTeam,
  ContestConstraints, Room, RoomParticipant,
} from '@/types';

// ─── Props ──────────────────────────────────────────────────────────────────

interface DailyContestRoomProps {
  roomId: string;
  activeRoom: Room;
  participants: RoomParticipant[];
  currentUserId: string;
  isHost: boolean;
  /** Passed from page.tsx so we use the SAME useRooms() instance — fixes admin toggle bug */
  updateRoom: (roomId: string, data: Partial<Room>) => Promise<unknown>;
  onLeave: () => void;
  onDelete: () => void;
  onKick: (profileId: string) => void;
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

/** Append 'Z' if the datetime string has no timezone suffix (DB stores UTC without 'Z'). */
function ensureUTC(dt: string): string {
  return /Z|[+-]\d{2}:?\d{2}$/.test(dt) ? dt : dt + 'Z';
}

function fmtCountdown(dt: string): string {
  const ms = new Date(ensureUTC(dt)).getTime() - Date.now();
  if (ms <= 0) return 'Started';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtDate(dt: string): string {
  return new Date(ensureUTC(dt)).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

const SKILL_COLOR: Record<string, string> = {
  BAT: '#f59e0b', Bat: '#f59e0b', Batsman: '#f59e0b', Batting: '#f59e0b',
  BWL: '#6366f1', Bowl: '#6366f1', Bowler: '#6366f1', Bowling: '#6366f1',
  AR: '#10b981', 'All-Rounder': '#10b981', 'All Rounder': '#10b981', 'Allrounder': '#10b981',
  WK: '#ec4899', Wkt: '#ec4899', 'Wicket-Keeper': '#ec4899', 'Wicket Keeper': '#ec4899', 'WicketKeeper': '#ec4899',
};

function skillLabel(s: string): string {
  if (/bat|BAT/i.test(s)) return 'BAT';
  if (/bowl|BWL/i.test(s)) return 'BWL';
  if (/roun|AR/i.test(s)) return 'AR';
  if (/wick|WK|wkt/i.test(s)) return 'WK';
  return s.slice(0, 3).toUpperCase();
}

function computeScore(
  profileId: string,
  dailyTeams: DailyContestTeam[],
  gamedayPlayers: GamedayPlayer[],
  fixtures: TourFixture[],
  captainVc: boolean,
): number {
  return Math.round(
    dailyTeams
      .filter(t => t.profile_id === profileId)
      .reduce((sum, team) => {
        const fix = fixtures.find(f => f.match_id === team.match_id);
        if (!fix || new Date(ensureUTC(fix.match_datetime)) > new Date()) return sum;
        const gdPlayers = gamedayPlayers.filter(gp => gp.gameday_id === fix.tour_gameday_id);
        return sum + team.selected_players.reduce((s, pid) => {
          const gp = gdPlayers.find(g => g.player_id === pid);
          if (!gp) return s;
          let pts = gp.gameday_points;
          if (captainVc) {
            if (pid === team.captain_id) pts *= 2;
            else if (pid === team.vice_captain_id) pts *= 1.5;
          }
          return s + pts;
        }, 0);
      }, 0),
  );
}

/** Returns the IST calendar date string (YYYY-MM-DD) from a UTC datetime string. */
function toISTDateStr(utcDt: string): string {
  return new Date(ensureUTC(utcDt)).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/**
 * Returns the fixtures the user can currently build a team for.
 *
 * Rule (simplified per user): a match is open for team-building as long as
 * its match_datetime (UTC) hasn't passed yet AND the user hasn't submitted a
 * team for it.  No "previous day's last match must start first" gate — the
 * match's own kick-off time is the ONLY lock.
 *
 * We show one IST calendar day at a time (today's open matches). Once all
 * of today's matches have started or been submitted we immediately surface
 * the next IST day's open matches.
 */
function getActivePool(
  fixtures: TourFixture[],
  myTeams: DailyContestTeam[],
  allTeams: DailyContestTeam[],
  numMatches: number | null,
): TourFixture[] {
  const sorted = [...fixtures].sort(
    (a, b) => new Date(ensureUTC(a.match_datetime)).getTime() - new Date(ensureUTC(b.match_datetime)).getTime(),
  );
  const now = new Date();
  const submittedIds = new Set(myTeams.map(t => t.match_id));

  // Enforce contest match-count limit
  const startedIds = new Set(sorted.filter(f => new Date(ensureUTC(f.match_datetime)) <= now).map(f => f.match_id));
  const doneCount = [...new Set(allTeams.map(t => t.match_id))].filter(id => startedIds.has(id)).length;
  if (numMatches !== null && doneCount >= numMatches) return [];

  // All upcoming (not-yet-started) matches — user can draft OR edit until kickoff
  const upcomingMatches = sorted.filter(f => new Date(ensureUTC(f.match_datetime)) > now);
  if (upcomingMatches.length === 0) return [];

  // Show only today's IST day matches; if none today, surface next IST day
  const todayIST = toISTDateStr(now.toISOString());
  const todayMatches = upcomingMatches.filter(f => toISTDateStr(f.match_datetime) === todayIST);
  if (todayMatches.length > 0) return todayMatches;

  // Today's matches are all done — show next IST day's
  const nextDayStr = toISTDateStr(upcomingMatches[0].match_datetime);
  return upcomingMatches.filter(f => toISTDateStr(f.match_datetime) === nextDayStr);
}


// ─── Stepper widget ──────────────────────────────────────────────────────────

function Stepper({
  label, value, min = 1, max = 5, onChange,
}: { label: string; value: number; min?: number; max?: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
      <span className="text-sm text-on-surface-variant">{label}</span>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 flex items-center justify-center text-lg font-bold transition-colors disabled:opacity-30">−</button>
        <span className="w-5 text-center font-bold text-white tabular-nums">{value}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 flex items-center justify-center text-lg font-bold transition-colors disabled:opacity-30">+</button>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function DailyContestRoom({
  roomId, activeRoom, participants, currentUserId, isHost,
  updateRoom, onLeave, onDelete, onKick,
}: DailyContestRoomProps) {
  // NOTE: No useRooms() call here — updateRoom is passed as a prop from page.tsx
  // (which has the authoritative useRooms instance). This was the root cause of
  // admin settings not updating.

  const { fixtures } = useFixtures();
  const { players: seasonPlayers } = useFantasyData();
  const { teams: allDailyTeams, myTeams, saveTeam, isSaving, loading: teamsLoading } = useDailyContestTeams(roomId);

  const [gamedayPlayers, setGamedayPlayers] = useState<GamedayPlayer[]>([]);
  useEffect(() => {
    supabase.from('fantasy_gameday_players').select('*').then(({ data }) => {
      if (data) setGamedayPlayers(data as GamedayPlayer[]);
    });
  }, []);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [mobileTab, setMobileTab] = useState<'leaderboard' | 'team' | 'settings'>('leaderboard');
  const [makeMatchId, setMakeMatchId] = useState<number | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [captainId, setCaptainId] = useState<number | null>(null);
  const [vcId, setVcId] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle');
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [titleBuf, setTitleBuf] = useState('');
  const [descBuf, setDescBuf] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [makeTeamCollapsed, setMakeTeamCollapsed] = useState(false);
  const [mobileMenuOpenId, setMobileMenuOpenId] = useState<string | null>(null);
  const [desktopMenuOpenId, setDesktopMenuOpenId] = useState<string | null>(null);

  // ── Settings ───────────────────────────────────────────────────────────────
  const settings = activeRoom.settings || {};
  const numMatches: number | null = (settings.num_matches as number | null) ?? null;
  const constraints: ContestConstraints = {
    captain_vc: false, min_batsmen: 1, min_bowlers: 2,
    min_all_rounders: 1, min_wicket_keepers: 1, min_per_team: 1,
    ...((settings.constraints as ContestConstraints) || {}),
  };
  const captainVcEnabled = constraints.captain_vc === true;
  const isLockRoom = settings.lock_room === true;

  useEffect(() => { setTitleBuf(activeRoom.name); }, [activeRoom.name]);
  useEffect(() => { setDescBuf(activeRoom.description || ''); }, [activeRoom.description]);

  // ── Active match pool ──────────────────────────────────────────────────────
  const activeMatches = useMemo(
    () => getActivePool(fixtures, myTeams, allDailyTeams, numMatches),
    [fixtures, myTeams, allDailyTeams, numMatches],
  );

  useEffect(() => {
    setMakeMatchId(prev => {
      if (activeMatches.length === 0) return null;
      if (prev !== null && activeMatches.some(m => m.match_id === prev)) return prev;
      return activeMatches[0].match_id;
    });
  }, [activeMatches]);

  // Track which makeMatchId's selection has been initialised from DB to avoid
  // overwriting in-progress edits on every myTeams realtime update.
  const selInitializedForRef = useRef<number | null>(null);

  // When the user switches match, clear the initialised flag so the DB data
  // will be loaded once when myTeams arrives.
  useEffect(() => {
    selInitializedForRef.current = null;
    if (!makeMatchId) { setSel(new Set()); setCaptainId(null); setVcId(null); }
    setSaveState('idle');
  }, [makeMatchId]);

  // Whenever myTeams updates (initial fetch OR realtime INSERT/UPDATE) and we
  // haven't yet initialised sel for the current match, populate from DB.
  // This fixes the "selections lost on reload" bug where the makeMatchId effect
  // ran before fetchTeams() completed.
  useEffect(() => {
    if (!makeMatchId || selInitializedForRef.current === makeMatchId) return;
    const existing = myTeams.find(t => t.match_id === makeMatchId);
    if (existing) {
      setSel(new Set(existing.selected_players));
      setCaptainId(existing.captain_id);
      setVcId(existing.vice_captain_id);
      selInitializedForRef.current = makeMatchId;
    }
    // Don't clear sel when existing===undefined — user may be building new team
  }, [makeMatchId, myTeams]);

  const selFixture = fixtures.find(f => f.match_id === makeMatchId) ?? null;
  const playerPool = useDailyPlayerPool(selFixture, fixtures, seasonPlayers, gamedayPlayers);
  const validation = validateDailyTeam(sel, playerPool.home, playerPool.away, constraints);

  // ── Leaderboard ────────────────────────────────────────────────────────────
  const leaderboard = useMemo(() =>
    [...participants]
      .map(p => ({
        ...p,
        score: computeScore(p.profile_id, allDailyTeams, gamedayPlayers, fixtures, captainVcEnabled),
      }))
      .sort((a, b) => b.score - a.score),
    [participants, allDailyTeams, gamedayPlayers, fixtures, captainVcEnabled]);

  const matchesDone = useMemo(() => {
    const now = new Date();
    const startedIds = new Set(fixtures.filter(f => new Date(f.match_datetime) <= now).map(f => f.match_id));
    return [...new Set(allDailyTeams.map(t => t.match_id))].filter(id => startedIds.has(id)).length;
  }, [fixtures, allDailyTeams]);

  // ── Event handlers ─────────────────────────────────────────────────────────
  const togglePlayer = (pid: number) => {
    setSel(prev => {
      const next = new Set(prev);
      if (next.has(pid)) {
        next.delete(pid);
        if (captainId === pid) setCaptainId(null);
        if (vcId === pid) setVcId(null);
      } else if (next.size < 11) {
        next.add(pid);
      }
      return next;
    });
    setSaveState('idle');
  };

  const tapCaptain = (pid: number) => {
    if (!sel.has(pid)) return;
    if (captainId === pid) { setCaptainId(null); return; }
    if (vcId === pid) setVcId(null);
    setCaptainId(pid);
  };

  const tapVc = (pid: number) => {
    if (!sel.has(pid)) return;
    if (vcId === pid) { setVcId(null); return; }
    if (captainId === pid) setCaptainId(null);
    setVcId(pid);
  };

  const handleSave = async () => {
    if (!makeMatchId || !validation.isValid) return;
    if (captainVcEnabled && (!captainId || !vcId)) {
      toast.error('Assign Captain (C) and Vice-Captain (VC) before saving.'); return;
    }
    try {
      await saveTeam(makeMatchId, [...sel], captainId, vcId);
      setSaveState('saved');
      toast.success('Team saved! ✓');
    } catch { toast.error("Couldn't save — match may have started."); }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(activeRoom.invite_code || '');
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  const patchConstraint = (key: keyof ContestConstraints, val: number | boolean) =>
    updateRoom(roomId, { settings: { ...settings, constraints: { ...constraints, [key]: val } } });

  const patchNumMatches = (val: number | null) =>
    updateRoom(roomId, { settings: { ...settings, num_matches: val } });

  // ── View Team data ─────────────────────────────────────────────────────────
  const viewingParticipant = participants.find(p => p.profile_id === viewingProfileId) ?? null;
  const viewingTeams = useMemo(() => {
    if (!viewingProfileId) return [];
    const isOwn = viewingProfileId === currentUserId;
    return allDailyTeams
      .filter(t => {
        if (t.profile_id !== viewingProfileId) return false;
        if (isOwn) return true;
        const fix = fixtures.find(f => f.match_id === t.match_id);
        return fix && new Date(fix.match_datetime) <= new Date();
      })
      .map(t => ({
        ...t,
        fixture: fixtures.find(f => f.match_id === t.match_id),
        score: computeScore(viewingProfileId, [t], gamedayPlayers, fixtures, captainVcEnabled),
      }))
      .sort((a, b) =>
        (new Date(a.fixture?.match_datetime ?? 0).getTime()) -
        (new Date(b.fixture?.match_datetime ?? 0).getTime()));
  }, [viewingProfileId, allDailyTeams, fixtures, gamedayPlayers, captainVcEnabled, currentUserId]);

  // ── Shared make-team props ─────────────────────────────────────────────────
  const makeTeamProps: MakeTeamProps = {
    activeMatches, makeMatchId, setMakeMatchId: id => setMakeMatchId(id),
    selFixture, playerPool, sel, captainId, vcId, captainVcEnabled,
    validation, isSaving, saveState, fixtures, myTeams, constraints,
    onToggle: togglePlayer, onCaptain: tapCaptain, onVc: tapVc, onSave: handleSave,
  };

  const adminProps = {
    show: isHost, roomId, settings, isLockRoom, captainVcEnabled,
    numMatches, matchesDone, constraints, updateRoom, patchConstraint, patchNumMatches,
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════

  // Daily-contest skeleton — shown while team data first loads
  if (teamsLoading) {
    return (
      <div className="min-h-screen animate-pulse">
        {/* Mobile skeleton */}
        <div className="md:hidden space-y-4 px-4">
          <div className="rounded-2xl bg-surface-container-high border border-white/5 p-4 space-y-3">
            <div className="flex justify-between">
              <div className="h-5 w-28 bg-white/5 rounded-full" />
              <div className="h-5 w-20 bg-white/5 rounded-full" />
            </div>
            <div className="h-7 w-48 bg-white/5 rounded" />
            <div className="h-3 w-36 bg-white/5 rounded" />
          </div>
          <div className="h-10 bg-white/5 rounded-xl" />
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-surface-container-high p-3 rounded-xl flex items-center gap-3 border border-white/5">
                <div className="w-6 h-4 bg-white/5 rounded" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-28 bg-white/5 rounded" />
                </div>
                <div className="h-4 w-10 bg-white/5 rounded" />
              </div>
            ))}
          </div>
        </div>
        {/* Desktop skeleton */}
        <div className="hidden md:block max-w-7xl mx-auto w-full space-y-8">
          <div className="space-y-2">
            <div className="h-12 w-64 bg-white/5 rounded" />
            <div className="h-4 w-40 bg-white/5 rounded" />
          </div>
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-8 space-y-5">
              <div className="h-48 bg-surface-container-low rounded-2xl border border-white/5" />
              <div className="h-72 bg-surface-container-low rounded-2xl border border-white/5" />
            </div>
            <div className="col-span-4">
              <div className="h-48 bg-surface-container-low rounded-2xl border border-white/5" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ───────────────── MOBILE (< md) ───────────────── */}
      <div className="md:hidden space-y-4 px-4">

        {/* Mobile Header Card */}
        <div className="relative overflow-hidden rounded-2xl bg-surface-container-high p-4 border border-white/5">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[10px] font-black text-violet-400 bg-violet-500/10 px-2.5 py-1 rounded-full uppercase tracking-wider border border-violet-500/20">
              📅 Daily Contest
            </span>
            <button onClick={handleCopy}
              className="flex items-center gap-2 bg-surface-container-highest/60 rounded-lg py-1.5 px-2.5 border border-white/10 active:scale-95 transition-transform">
              <span className="text-[8px] font-bold text-outline uppercase tracking-wider">CODE</span>
              <span className="text-primary font-headline font-bold text-[11px] tracking-widest">{activeRoom.invite_code}</span>
              {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} className="text-primary opacity-70" />}
            </button>
          </div>
          <div className="space-y-1.5">
            {isEditingTitle ? (
              <input autoFocus value={titleBuf} onChange={e => setTitleBuf(e.target.value)}
                onBlur={async () => { if (titleBuf.trim() !== activeRoom.name) await updateRoom(roomId, { name: titleBuf.trim() }); setIsEditingTitle(false); }}
                onKeyDown={async e => { if (e.key === 'Enter') { if (titleBuf.trim() !== activeRoom.name) await updateRoom(roomId, { name: titleBuf.trim() }); setIsEditingTitle(false); } }}
                className="w-full bg-transparent text-xl font-extrabold font-headline text-white border-b border-primary/70 outline-none pb-0.5" />
            ) : (
              <div className="flex items-start gap-2">
                <h2 className="font-headline text-xl font-extrabold text-white leading-tight flex-1">{activeRoom.name}</h2>
                {isHost && (
                  <button onPointerDown={e => { e.preventDefault(); setIsEditingTitle(true); }}
                    className="flex-shrink-0 mt-1 p-1 rounded-md bg-white/5 active:bg-white/10 transition-colors">
                    <Pen size={11} className="text-slate-500" />
                  </button>
                )}
              </div>
            )}
            {isEditingDesc ? (
              <input autoFocus value={descBuf} onChange={e => setDescBuf(e.target.value)}
                onBlur={async () => { if (descBuf.trim() !== (activeRoom.description || '')) await updateRoom(roomId, { description: descBuf.trim() }); setIsEditingDesc(false); }}
                onKeyDown={async e => { if (e.key === 'Enter') { if (descBuf.trim() !== (activeRoom.description || '')) await updateRoom(roomId, { description: descBuf.trim() }); setIsEditingDesc(false); } }}
                className="w-full bg-transparent text-xs text-on-surface-variant border-b border-primary/40 outline-none pb-0.5"
                placeholder="Add a subtitle..." />
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-on-surface-variant text-xs flex-1">
                  {activeRoom.description || (isHost ? 'Add description...' : '')}
                </p>
                {isHost && (
                  <button onPointerDown={e => { e.preventDefault(); setIsEditingDesc(true); }}
                    className="flex-shrink-0 p-0.5 rounded bg-white/5 active:bg-white/10 transition-colors">
                    <Pen size={9} className="text-slate-600" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Mobile Tab Bar */}
        <div className="flex bg-surface-container-highest/30 p-1 rounded-xl border border-white/5 gap-1">
          <button onClick={() => setMobileTab('leaderboard')}
            className={`flex-1 py-2 text-[11px] font-headline transition-all rounded-lg ${mobileTab === 'leaderboard' ? 'bg-primary text-on-primary font-bold shadow-lg shadow-primary/20' : 'text-outline-variant font-medium'}`}>
            📊 Standings
          </button>
          <button onClick={() => setMobileTab('team')}
            className={`flex-1 py-2 text-[11px] font-headline transition-all rounded-lg ${mobileTab === 'team' ? 'bg-primary text-on-primary font-bold shadow-lg shadow-primary/20' : 'text-outline-variant font-medium'}`}>
            🏏 Team
          </button>
          <button onClick={() => setMobileTab('settings')}
            className={`w-10 py-2 text-[13px] flex items-center justify-center transition-all rounded-lg shrink-0 ${mobileTab === 'settings' ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-outline-variant'}`}>
            <Settings size={15} strokeWidth={2} />
          </button>
        </div>

        {/* Mobile Team Tab */}
        {mobileTab === 'team' && (
          <div className="bg-surface-container-low rounded-2xl border border-violet-500/20 overflow-hidden">
            {activeMatches.length > 1 && (
              <div className="px-4 pt-3 pb-0 flex gap-1.5 flex-wrap">
                {activeMatches.map((m, i) => (
                  <button key={m.match_id} onClick={() => setMakeMatchId(m.match_id)}
                    className={`px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all ${makeMatchId === m.match_id ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'bg-white/5 text-slate-500 border border-white/10'}`}>
                    {m.home_team_short_name} v {m.away_team_short_name}
                  </button>
                ))}
              </div>
            )}
            <MakeTeamSection {...makeTeamProps} />
          </div>
        )}

        {/* Mobile Leaderboard Tab */}
        {mobileTab === 'leaderboard' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              {leaderboard.map((p, i) => {
                const isMe = p.profile_id === currentUserId;
                const menuOpen = mobileMenuOpenId === p.profile_id;
                const opensUpward = i >= leaderboard.length - 2;
                return (
                  <div key={p.profile_id}
                    className={`relative bg-surface-container-high p-2.5 rounded-xl flex items-center gap-3 border transition-colors cursor-pointer ${isMe ? 'border-indigo-500/30 bg-indigo-500/5' : 'border-white/5'}`}
                    onClick={() => { setViewingProfileId(p.profile_id); setMobileMenuOpenId(null); }}>
                    <div className="w-6 text-center font-headline font-bold text-xs flex-shrink-0" style={{ color: i === 0 && p.score > 0 ? '#fd9000' : '#73757d' }}>
                      {i === 0 && p.score > 0 ? '👑' : i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-headline font-bold text-white text-xs truncate flex items-center gap-1">
                        {p.profiles?.display_name || 'Player'}
                        {isMe && <span className="text-[7px] px-1 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-bold uppercase">You</span>}
                        {p.profile_id === activeRoom.creator_id && <Crown size={9} className="text-amber-400" />}
                      </h4>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-headline font-extrabold text-sm text-tertiary">{p.score}</p>
                      <p className="text-[8px] text-outline uppercase">Pts</p>
                    </div>
                    {/* Options button */}
                    <button className="p-1 text-slate-500 flex-shrink-0 hover:text-white transition-colors"
                      onClick={e => { e.stopPropagation(); setMobileMenuOpenId(menuOpen ? null : p.profile_id); }}>
                      <MoreVertical size={15} />
                    </button>
                    {/* Dropdown */}
                    {menuOpen && (
                      <div className={`absolute right-0 z-50 bg-surface-container-high border border-white/10 rounded-xl shadow-2xl py-1 min-w-[130px] ${opensUpward ? 'bottom-full mb-1' : 'top-full mt-1'}`}
                        onClick={e => e.stopPropagation()}>
                        <button onClick={() => { setViewingProfileId(p.profile_id); setMobileMenuOpenId(null); }}
                          className="w-full text-left px-3 py-2 text-[10px] font-bold hover:bg-white/5 text-on-surface flex items-center gap-2">
                          <Eye size={12} /> View Team
                        </button>
                        {isHost && !isMe && (
                          <button onClick={() => { onKick(p.profile_id); setMobileMenuOpenId(null); }}
                            className="w-full text-left px-3 py-2 text-[10px] font-bold hover:bg-error/10 text-error flex items-center gap-2 border-t border-white/5">
                            <Trash2 size={12} /> Remove
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Mobile Settings Tab */}
        {mobileTab === 'settings' && (
          <div className="space-y-4">
            <AdminControlsCard {...adminProps} />
            <DangerZone isHost={isHost} onLeave={onLeave} onDelete={onDelete} />
          </div>
        )}
      </div>

      {/* ───────────────── DESKTOP (>= md) ───────────────── */}
      <div className="hidden md:block max-w-7xl mx-auto w-full">

        {/* Desktop Header */}
        <div className="mb-10">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <nav className="flex gap-2 text-xs font-bold text-indigo-400/60 tracking-widest uppercase items-center">
              <span>Contests</span><span>/</span>
              <span className="text-indigo-400">{activeRoom.name}</span>
            </nav>
            {isHost ? (
              <button onClick={() => setConfirmDelete(true)}
                className="text-[10px] font-bold text-error/80 hover:text-error uppercase tracking-[0.2em] flex items-center gap-1.5 px-3 py-1 bg-error/5 rounded-md border border-error/20 transition-all">
                <Trash2 size={14} strokeWidth={2.5} /> Delete Contest
              </button>
            ) : (
              <button onClick={onLeave}
                className="text-[10px] font-bold text-error/80 hover:text-error uppercase tracking-[0.2em] flex items-center gap-1.5 px-3 py-1 bg-error/5 rounded-md border border-error/20 transition-all">
                <LogOut size={14} strokeWidth={2.5} /> Leave Contest
              </button>
            )}
          </div>

          <div className="flex justify-between items-start gap-12">
            <div className="flex-grow group">
              {/* Editable Title */}
              <div className="flex items-center gap-3">
                {isEditingTitle && isHost ? (
                  <input autoFocus
                    className="bg-surface-container-low text-5xl font-black font-headline text-white leading-tight w-full outline-none border-b-2 border-primary border-dashed"
                    value={titleBuf} onChange={e => setTitleBuf(e.target.value)}
                    onBlur={async () => { if (titleBuf.trim() !== activeRoom.name) await updateRoom(roomId, { name: titleBuf.trim() }); setIsEditingTitle(false); }}
                    onKeyDown={async e => { if (e.key === 'Enter') { if (titleBuf.trim() !== activeRoom.name) await updateRoom(roomId, { name: titleBuf.trim() }); setIsEditingTitle(false); } }} />
                ) : (
                  <h2 onDoubleClick={() => isHost && setIsEditingTitle(true)}
                    className={`text-5xl font-black font-headline text-white leading-tight ${isHost ? 'cursor-text hover:text-indigo-300 transition-colors' : ''}`}>
                    {activeRoom.name}
                  </h2>
                )}
                {isHost && (
                  <button onClick={() => { if (isEditingTitle) setIsEditingTitle(false); else setIsEditingTitle(true); }}
                    className={`p-2 rounded-full transition-all flex items-center gap-2 text-xs font-bold uppercase tracking-widest ${isEditingTitle ? 'bg-primary text-on-primary' : 'text-primary bg-primary/10 hover:bg-primary/20 opacity-0 group-hover:opacity-100'}`}>
                    {isEditingTitle ? <Check size={16} strokeWidth={2.5} /> : <Pen size={14} strokeWidth={2.5} />}
                  </button>
                )}
              </div>
              {/* Editable Description (desktop) */}
              {isEditingDesc && isHost ? (
                <input autoFocus value={descBuf}
                  onChange={e => setDescBuf(e.target.value)}
                  onBlur={async () => { if (descBuf.trim() !== (activeRoom.description || '')) await updateRoom(roomId, { description: descBuf.trim() }); setIsEditingDesc(false); }}
                  onKeyDown={async e => { if (e.key === 'Enter') { if (descBuf.trim() !== (activeRoom.description || '')) await updateRoom(roomId, { description: descBuf.trim() }); setIsEditingDesc(false); } }}
                  className="mt-2 w-full max-w-lg bg-transparent text-on-surface-variant text-sm border-b border-primary/40 outline-none pb-0.5"
                  placeholder="Add a subtitle…" />
              ) : (
                <div className="flex items-center gap-2 mt-2 group/desc">
                  <p className="text-on-surface-variant text-sm flex-1">
                    {activeRoom.description || (isHost ? <span className="text-slate-600 italic">Add a subtitle…</span> : '')}
                  </p>
                  {isHost && (
                    <button onPointerDown={e => { e.preventDefault(); setIsEditingDesc(true); }}
                      className="opacity-0 group-hover/desc:opacity-100 flex-shrink-0 p-1 rounded bg-white/5 hover:bg-white/10 transition-all">
                      <Pen size={10} className="text-slate-500" />
                    </button>
                  )}
                </div>
              )}
              <div className="flex items-center gap-3 mt-3">
                <span className="text-[10px] font-black text-violet-400 bg-violet-500/10 px-2.5 py-1 rounded-full uppercase tracking-wider border border-violet-500/20">
                  📅 Daily Contest
                </span>
                <span className="text-[10px] text-outline">{participants.length} participants · {matchesDone} matches done</span>
              </div>
            </div>

            <div className="shrink-0 pt-2">
              <div className="bg-surface-container-high/50 border border-white/5 px-3 py-2 rounded-lg flex items-center gap-5 backdrop-blur-sm hover:border-indigo-500/30 transition-all">
                <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-indigo-400/60 uppercase tracking-widest leading-none mb-1">Invite Code</span>
                  <span className="font-mono text-sm font-bold text-white">{activeRoom.invite_code}</span>
                </div>
                <button onClick={handleCopy}
                  className="p-1.5 hover:bg-indigo-500/10 rounded-md text-indigo-400 transition-colors">
                  {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} strokeWidth={2.5} />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop Body */}
        {viewingProfileId && viewingParticipant ? (
          /* Full-width View Team panel */
          <ViewTeamDetail
            participant={viewingParticipant}
            viewingTeams={viewingTeams}
            allParticipants={leaderboard}
            allFixtures={fixtures}
            activeMatches={activeMatches}
            isOwn={viewingProfileId === currentUserId}
            isHost={isHost}
            currentUserId={currentUserId}
            seasonPlayers={seasonPlayers}
            gamedayPlayers={gamedayPlayers}
            captainVcEnabled={captainVcEnabled}
            onClose={() => setViewingProfileId(null)}
            onKick={() => { onKick(viewingProfileId!); setViewingProfileId(null); }}
            onSwitch={(pid) => setViewingProfileId(pid)}
          />
        ) : (
          <div className="grid grid-cols-12 gap-6">
            {/* Left column: Make Team + Leaderboard */}
            <div className="col-span-12 lg:col-span-8 order-2 lg:order-1 space-y-6">

              {/* Make Team Card */}
              {activeMatches.length > 0 && (
                <div className="bg-surface-container-low rounded-2xl border border-violet-500/20 overflow-hidden transition-all">
                  {/* Card header — always visible, contains collapse toggle */}
                  <div className="p-5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Team logos */}
                      {selFixture && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <img src={`/logos/${selFixture.home_team_short_name.toLowerCase()}.png`}
                            alt={selFixture.home_team_short_name}
                            className="w-8 h-8 object-contain rounded"
                            onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                          <span className="text-slate-600 font-bold text-xs">vs</span>
                          <img src={`/logos/${selFixture.away_team_short_name.toLowerCase()}.png`}
                            alt={selFixture.away_team_short_name}
                            className="w-8 h-8 object-contain rounded"
                            onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="text-base font-bold font-headline text-white leading-none">Draft Your Squad</h3>
                        {selFixture && (
                          <p className="text-[11px] text-on-surface-variant mt-0.5 truncate">
                            {selFixture.home_team_short_name} vs {selFixture.away_team_short_name} ·{' '}
                            <span className="text-amber-400 font-semibold">Locks in {fmtCountdown(selFixture.match_datetime)}</span>
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Match selector tabs (when multiple matches) */}
                      {activeMatches.length > 1 && !makeTeamCollapsed && (
                        <div className="flex gap-1">
                          {activeMatches.map((m) => (
                            <button key={m.match_id} onClick={() => setMakeMatchId(m.match_id)}
                              className={`px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all ${makeMatchId === m.match_id ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'bg-white/5 text-slate-500 border border-white/10 hover:bg-white/10'}`}>
                              {m.home_team_short_name} v {m.away_team_short_name}
                            </button>
                          ))}
                        </div>
                      )}
                      {/* Collapse / Expand toggle */}
                      <button
                        onClick={() => setMakeTeamCollapsed(c => !c)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-slate-400 bg-white/5 hover:bg-white/10 border border-white/8 transition-all active:scale-95"
                        title={makeTeamCollapsed ? 'Expand team builder' : 'Collapse team builder'}>
                        {makeTeamCollapsed
                          ? <><ChevronDown size={13} strokeWidth={2.5} /> Draft</>
                          : <><ChevronUp size={13} strokeWidth={2.5} /> Collapse</>}
                      </button>
                    </div>
                  </div>
                  {/* Collapsible body */}
                  {!makeTeamCollapsed && (
                    <div className="border-t border-white/[0.06]">
                      <MakeTeamSection {...makeTeamProps} />
                    </div>
                  )}
                </div>
              )}

              {/* No active matches — context-aware info card */}
              {activeMatches.length === 0 && (() => {
                const now = new Date();
                const upcoming = [...fixtures]
                  .filter(f => new Date(f.match_datetime) > now)
                  .sort((a, b) => new Date(a.match_datetime).getTime() - new Date(b.match_datetime).getTime());

                if (!upcoming.length) {
                  return (
                    <div className="bg-surface-container-low rounded-2xl border border-white/5 p-6 flex items-start gap-4">
                      <span className="text-2xl">🏁</span>
                      <div>
                        <p className="font-headline font-bold text-white">Season complete</p>
                        <p className="text-sm text-on-surface-variant mt-1">All scheduled matches have been played.</p>
                      </div>
                    </div>
                  );
                }

                // activeMatches is empty → today's matches have all started; next match is tomorrow
                return (
                  <div className="bg-surface-container-low rounded-2xl border border-violet-500/15 p-6 flex items-start gap-4">
                    <span className="text-2xl">⏰</span>
                    <div>
                      <p className="font-headline font-bold text-white">Next match coming up</p>
                      <p className="text-sm text-on-surface-variant mt-1">
                        <span className="text-white font-semibold">
                          {upcoming[0].home_team_short_name} vs {upcoming[0].away_team_short_name}
                        </span>
                        <span className="ml-2 text-amber-400 font-semibold">· {fmtCountdown(upcoming[0].match_datetime)}</span>
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* Leaderboard Table */}
              <div className="bg-surface-container-low rounded-2xl min-h-[400px] flex flex-col border border-white/5">
                <div className="p-6 border-b border-white/5">
                  <h3 className="text-2xl mb-1 font-bold font-headline text-white">Standings</h3>
                  <p className="text-sm text-on-surface-variant">{leaderboard.length} participants · Live scores</p>
                </div>
                <div className="w-full overflow-x-auto">
                  <table className="w-full text-left border-collapse" style={{ minWidth: '400px' }}>
                    <thead className="bg-surface-container-lowest/50">
                      <tr>
                        <th className="px-8 py-4 text-[10px] font-bold text-outline uppercase tracking-widest">#</th>
                        <th className="px-8 py-4 text-[10px] font-bold text-outline uppercase tracking-widest">Player</th>
                        <th className="px-8 py-4 text-[10px] font-bold text-outline uppercase tracking-widest">Pts</th>
                        <th className="px-8 py-4" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {leaderboard.length === 0 ? (
                        <tr><td colSpan={4} className="p-8 text-center text-slate-500">No participants yet.</td></tr>
                      ) : leaderboard.map((p, idx) => {
                        const isMe = p.profile_id === currentUserId;
                        return (
                          <tr key={p.profile_id}
                            className={`transition-colors cursor-pointer ${isMe ? 'bg-indigo-500/[0.08] ring-1 ring-inset ring-indigo-500/20 hover:bg-indigo-500/[0.12]' : 'hover:bg-white/5'}`}
                            onClick={() => setViewingProfileId(p.profile_id)}>
                            <td className="px-8 py-5">
                              <div className="flex items-center gap-1">
                                {idx === 0 && p.score > 0 && <Crown size={14} className="text-tertiary fill-tertiary/20" strokeWidth={2.5} />}
                                <span className="text-white font-semibold">{idx + 1}</span>
                              </div>
                            </td>
                            <td className="px-8 py-5">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary uppercase">
                                  {(p.profiles?.display_name || '?').slice(0, 2)}
                                </div>
                                <div>
                                  <p className="font-bold text-white flex items-center gap-2">
                                    {p.profiles?.display_name || 'Player'}
                                    {p.profile_id === activeRoom.creator_id && <span className="text-[9px] px-1.5 py-0.5 rounded bg-tertiary/20 text-tertiary font-bold uppercase tracking-widest">Host</span>}
                                    {isMe && <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-bold uppercase tracking-widest">You</span>}
                                  </p>
                                  <p className="text-xs text-on-surface-variant">{myTeams.filter(t => t.profile_id === p.profile_id).length} teams submitted</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-8 py-5 text-tertiary font-bold text-lg">{p.score}</td>
                            <td className="px-4 py-5 text-right relative" onClick={e => e.stopPropagation()}>
                              <button
                                className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/8 transition-colors"
                                onClick={() => setDesktopMenuOpenId(desktopMenuOpenId === p.profile_id ? null : p.profile_id)}>
                                <MoreVertical size={16} />
                              </button>
                              {desktopMenuOpenId === p.profile_id && (
                                <div className="absolute right-4 top-full mt-1 z-50 bg-surface-container-high border border-white/10 rounded-xl shadow-2xl py-1 min-w-[140px]"
                                  onClick={e => e.stopPropagation()}>
                                  <button onClick={() => { setViewingProfileId(p.profile_id); setDesktopMenuOpenId(null); }}
                                    className="w-full text-left px-3 py-2.5 text-[11px] font-bold hover:bg-white/5 text-on-surface flex items-center gap-2 transition-colors">
                                    <Eye size={13} /> View Team
                                  </button>
                                  {isHost && !isMe && (
                                    <button onClick={() => { onKick(p.profile_id); setDesktopMenuOpenId(null); }}
                                      className="w-full text-left px-3 py-2.5 text-[11px] font-bold hover:bg-error/10 text-error flex items-center gap-2 border-t border-white/5 transition-colors">
                                      <Trash2 size={13} /> Remove
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right column: Admin only — no danger zone here (delete/leave is in the header) */}
            <div className="col-span-12 lg:col-span-4 space-y-6 order-1 lg:order-2">
              <AdminControlsCard {...adminProps} />
            </div>
          </div>
        )}
      </div>

      {/* ── Mobile View Team Bottom Sheet ─────────────────── */}
      {viewingProfileId && viewingParticipant && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col"
          style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setViewingProfileId(null); }}>
          <div className="mt-auto w-full bg-surface rounded-t-2xl border-t border-white/10 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/8">
              <div>
                <p className="font-bold text-white text-sm">
                  {viewingParticipant.profiles?.display_name ?? 'Player'}
                  {viewingProfileId === currentUserId && <span className="ml-1 text-[9px] text-indigo-400 font-black">YOU</span>}
                </p>
                <p className="text-[10px] text-slate-500">Match history</p>
              </div>
              <button onClick={() => setViewingProfileId(null)} className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center">
                <X size={14} className="text-slate-400" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              {/* Switch participant picker — mobile */}
              {leaderboard.length > 1 && (
                <div className="pb-2 overflow-x-auto hide-scrollbar flex gap-1.5">
                  {leaderboard.map(p => (
                    <button key={p.profile_id}
                      onClick={() => setViewingProfileId(p.profile_id)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[9px] font-bold transition-all ${p.profile_id === viewingProfileId ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-white/5 text-slate-400 border border-white/5'}`}>
                      {p.profiles?.display_name || 'Player'}
                    </button>
                  ))}
                </div>
              )}
              <DailyTeamHistoryList
                viewingTeams={viewingTeams}
                allFixtures={fixtures}
                activeMatches={activeMatches}
                gamedayPlayers={gamedayPlayers}
                captainVcEnabled={captainVcEnabled}
                seasonPlayers={seasonPlayers}
                mobile
              />
              {isHost && viewingProfileId !== currentUserId && (
                <button onClick={() => { onKick(viewingProfileId); setViewingProfileId(null); }}
                  className="w-full py-2.5 rounded-xl text-sm font-bold text-red-500 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all flex items-center justify-center gap-2">
                  Remove Participant
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ─────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
          onClick={e => { if (e.target === e.currentTarget) setConfirmDelete(false); }}>
          <div className="w-full max-w-sm bg-surface-container-low rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-white/5">
              <div className="w-12 h-12 rounded-xl bg-error/10 flex items-center justify-center mb-4">
                <Trash2 size={22} className="text-error" />
              </div>
              <h3 className="text-lg font-black font-headline text-white">Delete this contest?</h3>
              <p className="text-sm text-on-surface-variant mt-1">
                <span className="font-bold text-white">{activeRoom.name}</span> will be permanently deleted for all participants. This cannot be undone.
              </p>
            </div>
            {/* Actions */}
            <div className="px-6 py-4 flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-on-surface-variant bg-white/5 hover:bg-white/10 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => { setConfirmDelete(false); onDelete(); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-extrabold text-white bg-error hover:bg-error/90 active:scale-[0.98] transition-all">
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── ViewTeamDetail ──────────────────────────────────────────────────────────

function ViewTeamDetail({
  participant, allParticipants, viewingTeams, isOwn, isHost, seasonPlayers,
  gamedayPlayers, captainVcEnabled, allFixtures, activeMatches,
  onClose, onKick, onSwitch,
}: {
  participant: RoomParticipant;
  allParticipants: Array<RoomParticipant & { score: number }>;
  viewingTeams: Array<DailyContestTeam & { fixture?: TourFixture; score: number }>;
  isOwn: boolean;
  isHost: boolean;
  currentUserId: string;
  seasonPlayers: GamedayPlayer[];
  gamedayPlayers: GamedayPlayer[];
  captainVcEnabled: boolean;
  allFixtures: TourFixture[];
  activeMatches: TourFixture[];
  onClose: () => void;
  onKick: () => void;
  onSwitch: (profileId: string) => void;
}) {
  const now = new Date();

  // Build the 3 display fixtures: upcoming (1) + last 2 completed
  const completedFix = [...allFixtures]
    .filter(f => new Date(ensureUTC(f.match_datetime)) <= now)
    .sort((a, b) => new Date(ensureUTC(b.match_datetime)).getTime() - new Date(ensureUTC(a.match_datetime)).getTime())
    .slice(0, 2);
  const upcomingFix = activeMatches.length > 0
    ? [activeMatches[0]]
    : [...allFixtures]
        .filter(f => new Date(ensureUTC(f.match_datetime)) > now)
        .sort((a, b) => new Date(ensureUTC(a.match_datetime)).getTime() - new Date(ensureUTC(b.match_datetime)).getTime())
        .slice(0, 1);
  const displayFixtures = [...upcomingFix, ...completedFix];

  const totalPoints = viewingTeams
    .filter(t => t.fixture && new Date(ensureUTC(t.fixture.match_datetime)) <= now)
    .reduce((s, t) => s + t.score, 0);

  const getTeam = (matchId: number) => viewingTeams.find(t => t.match_id === matchId) ?? null;

  function matchScore(team: DailyContestTeam, matchId: number): number {
    const fix = allFixtures.find(f => f.match_id === matchId);
    if (!fix || new Date(ensureUTC(fix.match_datetime)) > now) return 0;
    const gdPs = gamedayPlayers.filter(gp => gp.gameday_id === fix.tour_gameday_id);
    return Math.round(
      team.selected_players.reduce((s, pid) => {
        const gp = gdPs.find(g => g.player_id === pid);
        if (!gp) return s;
        let pts = gp.gameday_points;
        if (captainVcEnabled && pid === team.captain_id) pts *= 2;
        else if (captainVcEnabled && pid === team.vice_captain_id) pts *= 1.5;
        return s + pts;
      }, 0)
    );
  }

  return (
    <div className="bg-surface-container-low rounded-2xl border border-white/5 overflow-hidden">
      {/* ── Header ── */}
      <div className="p-6 border-b border-white/[0.07] flex items-center gap-4"
        style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.08) 0%,transparent 100%)' }}>
        <button onClick={onClose}
          className="p-2 rounded-full bg-white/5 text-indigo-400 hover:bg-white/10 transition-colors flex-shrink-0">
          <ArrowLeft size={18} strokeWidth={2.5} />
        </button>
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-bold font-headline text-white flex items-center gap-2">
            {participant.profiles?.display_name ?? 'Player'}
            {isOwn && <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-bold uppercase tracking-widest">You</span>}
          </h3>
          <p className="text-sm text-on-surface-variant mt-0.5">
            {viewingTeams.length} team{viewingTeams.length !== 1 ? 's' : ''} submitted ·
            <span className="text-violet-400 font-semibold ml-1">{Math.round(totalPoints)} pts total</span>
          </p>
        </div>
        {isHost && !isOwn && (
          <button onClick={onKick}
            className="text-[10px] font-bold text-error/70 uppercase tracking-widest px-3 py-1.5 border border-error/20 rounded-lg hover:bg-error/10 hover:text-error transition-all flex items-center gap-1.5">
            <Trash2 size={12} /> Remove
          </button>
        )}
      </div>

      {/* ── Switch participant pills ── */}
      {allParticipants.length > 1 && (
        <div className="px-6 py-2.5 border-b border-white/[0.06] overflow-x-auto hide-scrollbar">
          <div className="flex gap-1.5">
            {allParticipants.map(p => (
              <button key={p.profile_id} onClick={() => onSwitch(p.profile_id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[9px] font-bold transition-all
                  ${p.profile_id === participant.profile_id
                    ? 'bg-primary/20 text-primary border border-primary/30'
                    : 'bg-white/5 text-slate-400 border border-white/5 hover:bg-white/10'}`}>
                {p.profiles?.display_name || 'Player'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Match columns (desktop: side by side) ── */}
      <div className="p-6 overflow-x-auto">
        {displayFixtures.length === 0 ? (
          <p className="text-center text-slate-600 py-10 text-sm">No matches to show yet</p>
        ) : (
          <div className={`grid gap-4 ${displayFixtures.length === 1 ? 'grid-cols-1 max-w-sm' : displayFixtures.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}
            style={{ minWidth: displayFixtures.length >= 2 ? '640px' : undefined }}>
            {displayFixtures.map(fix => {
              const isLocked = new Date(ensureUTC(fix.match_datetime)) <= now;
              const team = getTeam(fix.match_id);
              const gdPlayers = gamedayPlayers.filter(gp => gp.gameday_id === fix.tour_gameday_id);
              const score = team ? matchScore(team, fix.match_id) : null;

              return (
                <div key={fix.match_id}
                  className="rounded-2xl border border-white/[0.07] overflow-hidden flex flex-col min-w-0"
                  style={{ background: 'rgba(255,255,255,0.02)' }}>

                  {/* Column header */}
                  <div className="px-3 py-3 border-b border-white/[0.06] flex items-center justify-between gap-2 flex-shrink-0"
                    style={{ background: isLocked ? 'rgba(99,102,241,0.07)' : 'rgba(245,158,11,0.05)' }}>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <img src={`/logos/${fix.home_team_short_name.toLowerCase()}.png`}
                        alt={fix.home_team_short_name} className="w-5 h-5 object-contain flex-shrink-0"
                        onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                      <span className="text-[9px] text-slate-500 font-bold">vs</span>
                      <img src={`/logos/${fix.away_team_short_name.toLowerCase()}.png`}
                        alt={fix.away_team_short_name} className="w-5 h-5 object-contain flex-shrink-0"
                        onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                      <div className="ml-0.5 min-w-0">
                        <p className="text-[10px] font-bold text-white truncate">
                          {fix.home_team_short_name} vs {fix.away_team_short_name}
                        </p>
                        <p className="text-[8px] text-slate-600">{fmtDate(fix.match_datetime)}</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {isLocked ? (
                        score !== null
                          ? <div><p className="text-base font-black text-white leading-none">{score}</p><p className="text-[7px] text-slate-600 uppercase">pts</p></div>
                          : <p className="text-[8px] text-slate-700 font-bold uppercase">No team</p>
                      ) : (
                        <span className="text-[8px] font-black uppercase text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full border border-amber-400/20">Live</span>
                      )}
                    </div>
                  </div>

                  {/* Player rows */}
                  {team ? (
                    <div className="divide-y divide-white/[0.04] flex-1">
                      {team.selected_players.map(pid => {
                        const gp = gdPlayers.find(g => g.player_id === pid) ?? seasonPlayers.find(g => g.player_id === pid);
                        const sp = seasonPlayers.find(g => g.player_id === pid);
                        const isC = captainVcEnabled && pid === team.captain_id;
                        const isVC = captainVcEnabled && pid === team.vice_captain_id;
                        const role = skillLabel(gp?.skill_name ?? sp?.skill_name ?? '');
                        const roleColor = ROLE_CHIP_COLOR[role] ?? '#64748b';
                        const rawPts = gdPlayers.find(g => g.player_id === pid)?.gameday_points ?? null;
                        const dispPts = rawPts === null ? null : isC ? rawPts * 2 : isVC ? rawPts * 1.5 : rawPts;

                        return (
                          <div key={pid} className="flex items-center gap-2 px-3 py-2">
                            <span className="text-[7px] font-black w-6 text-center flex-shrink-0 rounded px-0.5 py-0.5"
                              style={{ background: roleColor + '22', color: roleColor }}>{role}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-semibold text-white truncate flex items-center gap-1">
                                {gp?.short_name ?? sp?.short_name ?? `#${pid}`}
                                {isC && <span className="text-[7px] font-black text-amber-400">C</span>}
                                {isVC && <span className="text-[7px] font-black text-violet-400">VC</span>}
                              </p>
                              <p className="text-[8px] text-slate-600 truncate">{gp?.team_short_name ?? sp?.team_short_name ?? ''}</p>
                            </div>
                            <div className="text-right flex-shrink-0 w-10">
                              {isLocked && rawPts !== null ? (
                                <div>
                                  <p className="text-[11px] font-bold text-white">{Math.round(dispPts!)}</p>
                                  {(isC || isVC) && <p className="text-[7px] text-slate-600">{isC ? '2×' : '1.5×'}{Math.round(rawPts)}</p>}
                                </div>
                              ) : (
                                <span className="text-[9px] text-slate-700">—</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center py-8 gap-1">
                      <p className="text-[10px] text-slate-700 font-semibold">No team submitted</p>
                      <p className="text-[9px] text-slate-800">0 pts</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── DailyTeamHistoryList — MOBILE collapsible sections ──────────────────────

const ROLE_CHIP_COLOR: Record<string, string> = {
  BAT: '#f59e0b', BWL: '#6366f1', AR: '#10b981', WK: '#ec4899',
};

function MobileMatchSection({ fix, team, gamedayPlayers, seasonPlayers, captainVcEnabled }: {
  fix: TourFixture;
  team: DailyContestTeam | null;
  gamedayPlayers: GamedayPlayer[];
  seasonPlayers: GamedayPlayer[];
  captainVcEnabled: boolean;
}) {
  const now = new Date();
  const isLocked = new Date(ensureUTC(fix.match_datetime)) <= now;
  const gdPlayers = gamedayPlayers.filter(gp => gp.gameday_id === fix.tour_gameday_id);
  const [expanded, setExpanded] = useState(isLocked);

  const score = team ? Math.round(team.selected_players.reduce((s, pid) => {
    const gp = gdPlayers.find(g => g.player_id === pid);
    if (!gp) return s;
    let pts = gp.gameday_points;
    if (captainVcEnabled && pid === team.captain_id) pts *= 2;
    else if (captainVcEnabled && pid === team.vice_captain_id) pts *= 1.5;
    return s + pts;
  }, 0)) : null;

  return (
    <div className="rounded-2xl border border-white/[0.07] overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)' }}>
      {/* Collapsible header */}
      <button className="w-full flex items-center justify-between px-4 py-3 text-left"
        style={{ background: isLocked ? 'rgba(99,102,241,0.06)' : 'rgba(245,158,11,0.04)' }}
        onClick={() => setExpanded(v => !v)}>
        <div className="flex items-center gap-2">
          <img src={`/logos/${fix.home_team_short_name.toLowerCase()}.png`}
            alt={fix.home_team_short_name} className="w-5 h-5 object-contain"
            onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
          <span className="text-[8px] text-slate-500 font-bold">vs</span>
          <img src={`/logos/${fix.away_team_short_name.toLowerCase()}.png`}
            alt={fix.away_team_short_name} className="w-5 h-5 object-contain"
            onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
          <div>
            <p className="text-[10px] font-bold text-white">{fix.home_team_short_name} vs {fix.away_team_short_name}</p>
            <p className="text-[8px] text-slate-600">{fmtDate(fix.match_datetime)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isLocked ? (
            score !== null
              ? <p className="text-sm font-black text-white">{score} <span className="text-[8px] text-slate-600 font-normal">pts</span></p>
              : <p className="text-[8px] text-slate-700 font-bold uppercase">No team</p>
          ) : (
            <span className="text-[8px] font-black uppercase text-amber-400">Upcoming</span>
          )}
          <ChevronDown size={13} className={`text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Expandable content */}
      {expanded && (
        <div className="border-t border-white/[0.06]">
          {team ? (
            <div className="divide-y divide-white/[0.04]">
              {team.selected_players.map(pid => {
                const gp = gdPlayers.find(g => g.player_id === pid) ?? seasonPlayers.find(g => g.player_id === pid);
                const sp = seasonPlayers.find(g => g.player_id === pid);
                const isC = captainVcEnabled && pid === team.captain_id;
                const isVC = captainVcEnabled && pid === team.vice_captain_id;
                const role = skillLabel(gp?.skill_name ?? sp?.skill_name ?? '');
                const roleColor = ROLE_CHIP_COLOR[role] ?? '#64748b';
                const rawPts = gdPlayers.find(g => g.player_id === pid)?.gameday_points ?? null;
                const dispPts = rawPts === null ? null : isC ? rawPts * 2 : isVC ? rawPts * 1.5 : rawPts;

                return (
                  <div key={pid} className="flex items-center gap-2.5 px-4 py-2.5">
                    <span className="text-[7px] font-black w-7 text-center rounded px-1 py-0.5 flex-shrink-0"
                      style={{ background: roleColor + '22', color: roleColor }}>{role}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-white truncate flex items-center gap-1">
                        {gp?.short_name ?? sp?.short_name ?? `#${pid}`}
                        {isC && <span className="text-[8px] font-black text-amber-400 bg-amber-400/10 px-1 rounded">C</span>}
                        {isVC && <span className="text-[8px] font-black text-violet-400 bg-violet-400/10 px-1 rounded">VC</span>}
                      </p>
                      <p className="text-[8px] text-slate-600">{gp?.team_short_name ?? sp?.team_short_name ?? ''}</p>
                    </div>
                    <div className="text-right flex-shrink-0 w-12">
                      {isLocked && rawPts !== null ? (
                        <div>
                          <p className="text-[11px] font-bold text-white">{Math.round(dispPts!)}</p>
                          {(isC || isVC) && <p className="text-[7px] text-slate-600">{isC ? '2×' : '1.5×'}{Math.round(rawPts)}</p>}
                        </div>
                      ) : (
                        <span className="text-[9px] text-slate-700">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 gap-1">
              <p className="text-[10px] text-slate-700 font-semibold">No team submitted</p>
              <p className="text-[9px] text-slate-800">0 pts</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DailyTeamHistoryList({
  viewingTeams, allFixtures, activeMatches, gamedayPlayers, captainVcEnabled, seasonPlayers, mobile,
}: {
  viewingTeams: Array<DailyContestTeam & { fixture?: TourFixture; score: number }>;
  allFixtures: TourFixture[];
  activeMatches: TourFixture[];
  gamedayPlayers: GamedayPlayer[];
  captainVcEnabled: boolean;
  seasonPlayers?: GamedayPlayer[];
  mobile?: boolean;
}) {
  const now = new Date();
  const safeSeasonPlayers = seasonPlayers ?? [];

  // Build 3 display fixtures: 1 upcoming + 2 last completed
  const completedFix = [...allFixtures]
    .filter(f => new Date(ensureUTC(f.match_datetime)) <= now)
    .sort((a, b) => new Date(ensureUTC(b.match_datetime)).getTime() - new Date(ensureUTC(a.match_datetime)).getTime())
    .slice(0, 2);
  const upcomingFix = activeMatches.length > 0
    ? [activeMatches[0]]
    : [...allFixtures]
        .filter(f => new Date(ensureUTC(f.match_datetime)) > now)
        .sort((a, b) => new Date(ensureUTC(a.match_datetime)).getTime() - new Date(ensureUTC(b.match_datetime)).getTime())
        .slice(0, 1);
  const displayFixtures = [...upcomingFix, ...completedFix];
  const getTeam = (matchId: number) => viewingTeams.find(t => t.match_id === matchId) ?? null;

  if (displayFixtures.length === 0) {
    return <div className="text-center py-10 text-slate-600 text-sm">No matches yet</div>;
  }

  if (mobile) {
    return (
      <div className="space-y-3">
        {displayFixtures.map(fix => (
          <MobileMatchSection key={fix.match_id} fix={fix} team={getTeam(fix.match_id)}
            gamedayPlayers={gamedayPlayers} seasonPlayers={safeSeasonPlayers} captainVcEnabled={captainVcEnabled} />
        ))}
      </div>
    );
  }

  // Desktop: just the match columns (used in ViewTeamDetail via separate desktop grid)
  return null;
}

// ─── Make Team Section ───────────────────────────────────────────────────────

interface MakeTeamProps {
  activeMatches: TourFixture[];
  makeMatchId: number | null;
  setMakeMatchId: (id: number) => void;
  selFixture: TourFixture | null;
  playerPool: ReturnType<typeof useDailyPlayerPool>;
  sel: Set<number>;
  captainId: number | null;
  vcId: number | null;
  captainVcEnabled: boolean;
  validation: ReturnType<typeof validateDailyTeam>;
  isSaving: boolean;
  saveState: 'idle' | 'saved';
  fixtures: TourFixture[];
  myTeams: DailyContestTeam[];
  constraints: ContestConstraints;
  onToggle: (pid: number) => void;
  onCaptain: (pid: number) => void;
  onVc: (pid: number) => void;
  onSave: () => void;
}

// Role meta (label + color) for constraint pill chips
const ROLE_META = {
  bat: { label: 'BAT', color: '#f59e0b' },
  bwl: { label: 'BWL', color: '#6366f1' },
  ar:  { label: 'AR',  color: '#10b981' },
  wk:  { label: 'WK',  color: '#ec4899' },
} as const;

// IPL team accent colours (fallback → indigo)
const TEAM_ACCENT: Record<string, string> = {
  MI: '#005da0', RCB: '#d4121a', CSK: '#f6ba00', KKR: '#3a225d',
  DC: '#004b8d', PBKS: '#e11c38', RR: '#254aa5', SRH: '#ef7202',
  GT: '#1d3564', LSG: '#00a0e3',
};
function teamAccent(s?: string) { return TEAM_ACCENT[s ?? ''] ?? '#6366f1'; }

function MakeTeamSection({
  activeMatches, selFixture,
  playerPool, sel, captainId, vcId, captainVcEnabled,
  validation, isSaving, saveState, fixtures, myTeams, constraints,
  onToggle, onCaptain, onVc, onSave,
}: MakeTeamProps) {

  // ── Empty / waiting state ──────────────────────────────────────────────────
  if (activeMatches.length === 0) {
    const now = new Date();
    const upcoming = [...fixtures]
      .filter(f => new Date(f.match_datetime) > now)
      .sort((a, b) => new Date(a.match_datetime).getTime() - new Date(b.match_datetime).getTime());

    if (!upcoming.length) {
      return (
        <div className="flex flex-col items-center justify-center py-14 gap-3 px-4">
          <span className="text-4xl">🏁</span>
          <p className="font-headline font-bold text-white text-center">Season complete</p>
          <p className="text-sm text-on-surface-variant text-center">All scheduled matches have been played.</p>
        </div>
      );
    }

    // activeMatches is empty → today's matches all started, next one is upcoming
    const nextMatch = upcoming[0];
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 px-4">
        <span className="text-4xl">⏰</span>
        <p className="font-headline font-bold text-white text-center">Next match coming up</p>
        <p className="text-sm text-on-surface-variant text-center">
          <span className="text-white font-semibold">
            {nextMatch.home_team_short_name} vs {nextMatch.away_team_short_name}
          </span>
          <span className="block text-amber-400 font-semibold mt-1">
            {fmtCountdown(nextMatch.match_datetime)}
          </span>
        </p>
      </div>
    );
  }

  const isFull = sel.size >= 11;
  const minMap = {
    bat: constraints.min_batsmen ?? 1,
    bwl: constraints.min_bowlers ?? 2,
    ar:  constraints.min_all_rounders ?? 1,
    wk:  constraints.min_wicket_keepers ?? 1,
  };
  const homeIds = new Set(playerPool.home.map(p => p.player_id));
  const homeSel = [...sel].filter(id => homeIds.has(id)).length;
  const awaySel = sel.size - homeSel;
  const homeAccent = teamAccent(selFixture?.home_team_short_name);
  const awayAccent = teamAccent(selFixture?.away_team_short_name);
  const canSave = validation.isValid && (!captainVcEnabled || (!!captainId && !!vcId));

  return (
    <div className="flex flex-col">

      {/* ── Constraint pills row ── */}
      <div className="px-4 py-2.5 flex items-center justify-between gap-3 border-b border-white/[0.06]"
        style={{ background: 'rgba(0,0,0,0.18)' }}>
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['bat', 'bwl', 'ar', 'wk'] as const).map(role => {
            const count = validation.counts[role];
            const min = minMap[role];
            const met = count >= min;
            const { label, color } = ROLE_META[role];
            return (
              <div key={role} className="flex items-center gap-1 px-2 py-[3px] rounded-md text-[10px] font-bold"
                style={{
                  background: met ? color + '18' : '#ef444414',
                  border: `1px solid ${met ? color + '38' : '#ef444430'}`,
                  color: met ? color : '#ef4444',
                }}>
                {label}<span className="opacity-40 mx-0.5">·</span>{count}/{min}
              </div>
            );
          })}
        </div>
        {/* Large XX/11 counter */}
        <div className="flex items-baseline gap-0.5 shrink-0">
          <span className="text-[22px] font-black font-headline text-white tabular-nums leading-none">
            {String(sel.size).padStart(2, '0')}
          </span>
          <span className="text-[11px] font-bold text-white/30">/11</span>
        </div>
      </div>

      {/* ── Action bar: hint + Reset + Save ── */}
      <div className="px-4 py-2 flex items-center gap-2 border-b border-white/[0.06] min-h-[44px]">
        {captainVcEnabled && sel.size === 11 && (!captainId || !vcId) && (
          <p className="text-[10px] text-amber-400 flex items-center gap-1 mr-auto">
            <Info size={9} /> Assign Captain &amp; Vice-Captain
          </p>
        )}
        {!validation.isValid && sel.size > 0 && validation.errors.length > 0 && (
          <p className="text-[10px] text-red-400 mr-auto truncate">{validation.errors[0]}</p>
        )}
        <div className="flex items-center gap-2 ml-auto">
          {sel.size > 0 && (
            <button
              onClick={() => { const ids = [...sel]; ids.forEach(pid => onToggle(pid)); }}
              className="px-3.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-400 bg-white/[0.06] hover:bg-white/10 border border-white/10 transition-all active:scale-95">
              Reset
            </button>
          )}
          <button onClick={onSave} disabled={isSaving || !canSave}
            className="px-5 py-1.5 rounded-lg text-[11px] font-extrabold uppercase tracking-wider transition-all active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed text-white"
            style={saveState === 'saved'
              ? { background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7' }
              : { background: 'linear-gradient(135deg,#7c3aed,#6366f1)', boxShadow: canSave ? '0 3px 14px rgba(99,102,241,0.4)' : 'none' }}>
            {isSaving
              ? <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving…
                </span>
              : saveState === 'saved' ? '✓ Saved!' : (
                  myTeams.some(t => t.match_id === selFixture?.match_id)
                    ? 'Update'
                    : 'Save'
                )}
          </button>
        </div>
      </div>

      {/* ── Two-column player grid ── */}
      <div className="flex" style={{ maxHeight: '460px', minHeight: '180px', overflow: 'hidden' }}>
        {([
          { pool: playerPool.home, shortName: selFixture?.home_team_short_name ?? 'Home', accent: homeAccent, selCount: homeSel },
          { pool: playerPool.away, shortName: selFixture?.away_team_short_name ?? 'Away', accent: awayAccent, selCount: awaySel },
        ] as const).map(({ pool, shortName, accent, selCount }) => (
          <div key={shortName} className="flex-1 min-w-0 flex flex-col overflow-hidden"
            style={{ borderRight: '1px solid rgba(255,255,255,0.05)' }}>

            {/* Column team header with logo circle */}
            <div className="px-3 py-2.5 flex items-center gap-2.5 shrink-0 border-b border-white/[0.05]"
              style={{ background: accent + '18' }}>
              <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center border border-white/15"
                style={{ background: accent + '22' }}>
                <img
                  src={`/logos/${shortName.toLowerCase()}.png`}
                  alt={shortName}
                  className="w-7 h-7 object-contain"
                  onError={e => {
                    const el = e.target as HTMLImageElement;
                    el.style.display = 'none';
                    if (el.parentElement) {
                      el.parentElement.style.background = accent;
                      el.parentElement.innerHTML = `<span style="color:#fff;font-size:10px;font-weight:900">${shortName.slice(0,3)}</span>`;
                    }
                  }}
                />
              </div>
              <div className="min-w-0">
                <p className="text-[12px] font-black text-white font-headline truncate">{shortName}</p>
                <p className="text-[8px] font-bold uppercase tracking-widest" style={{ color: accent + 'cc' }}>
                  {selCount} Selected
                </p>
              </div>
            </div>

            {/* Scrollable player list */}
            <div className="overflow-y-auto flex-1 py-0.5" style={{ scrollbarWidth: 'none' }}>
              {pool.length === 0 && <p className="text-center text-slate-700 text-xs py-8">No players</p>}

              {/* LAST XI section */}
              {pool.some(p => p.isLastMatchXI) && (
                <>
                  <div className="px-3 pt-2 pb-0.5 flex items-center gap-2">
                    <span className="text-[8px] font-black uppercase tracking-[0.15em] text-amber-500/80">Last XI</span>
                    <div className="flex-1 h-px bg-amber-500/15" />
                  </div>
                  {pool.filter(p => p.isLastMatchXI).map(player => (
                    <PremiumPlayerRow key={player.player_id} player={player} sel={sel}
                      captainId={captainId} vcId={vcId} captainVcEnabled={captainVcEnabled}
                      isFull={isFull} accent={accent} isLastXI
                      onToggle={onToggle} onCaptain={onCaptain} onVc={onVc} />
                  ))}
                </>
              )}

              {/* BENCH / OTHERS section */}
              {pool.some(p => !p.isLastMatchXI) && (
                <>
                  <div className="px-3 pt-2 pb-0.5 flex items-center gap-2">
                    <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-slate-600">
                      {pool.some(p => p.isLastMatchXI) ? 'Bench / Others' : 'Squad'}
                    </span>
                    <div className="flex-1 h-px bg-white/[0.04]" />
                  </div>
                  {pool.filter(p => !p.isLastMatchXI).map(player => (
                    <PremiumPlayerRow key={player.player_id} player={player} sel={sel}
                      captainId={captainId} vcId={vcId} captainVcEnabled={captainVcEnabled}
                      isFull={isFull} accent={accent} isLastXI={false}
                      onToggle={onToggle} onCaptain={onCaptain} onVc={onVc} />
                  ))}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PremiumPlayerRow ────────────────────────────────────────────────────────

function PremiumPlayerRow({
  player, sel, captainId, vcId, captainVcEnabled, isFull, accent, isLastXI,
  onToggle, onCaptain, onVc,
}: {
  player: ReturnType<typeof useDailyPlayerPool>['home'][number];
  sel: Set<number>;
  captainId: number | null;
  vcId: number | null;
  captainVcEnabled: boolean;
  isFull: boolean;
  accent: string;
  isLastXI: boolean;
  onToggle: (pid: number) => void;
  onCaptain: (pid: number) => void;
  onVc: (pid: number) => void;
}) {
  const isSelected = sel.has(player.player_id);
  const isC = player.player_id === captainId;
  const isVC = player.player_id === vcId;
  const disabled = !isSelected && isFull;
  const skillColor = SKILL_COLOR[player.skill_name] ?? '#64748b';

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onToggle(player.player_id)}
      onKeyDown={e => e.key === 'Enter' && !disabled && onToggle(player.player_id)}
      className="flex items-center pr-3 py-[5px] transition-colors"
      style={{
        opacity: disabled ? 0.28 : 1,
        background: isSelected
          ? `linear-gradient(90deg,${accent}28 0%,transparent 80%)`
          : isLastXI ? 'rgba(245,158,11,0.022)' : 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}>

      {/* Left accent stripe */}
      <div className="w-[3px] self-stretch rounded-r-sm mr-2.5 shrink-0 transition-all"
        style={{
          background: isSelected ? accent : isLastXI ? '#f59e0b55' : 'transparent',
          minHeight: '38px',
        }} />

      {/* Player details */}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold leading-tight truncate"
          style={{ color: isSelected ? '#fff' : isLastXI ? '#e2e8f0' : '#94a3b8' }}>
          {player.name}
        </p>
        <div className="flex items-center gap-1.5 mt-[2px]">
          <span className="text-[8px] font-black px-1 py-[1px] rounded leading-none"
            style={{ color: skillColor, background: skillColor + '25' }}>
            {skillLabel(player.skill_name)}
          </span>
          <span className="text-[9px] font-bold tabular-nums" style={{ color: '#f59e0b80' }}>
            {player.overall_points} PTS
          </span>
        </div>
      </div>

      {/* C / VC badges (visible only when selected + captain mode on) */}
      {captainVcEnabled && isSelected && (
        <div className="flex gap-1 mr-2 shrink-0">
          <button onClick={e => { e.stopPropagation(); onCaptain(player.player_id); }}
            className="w-[22px] h-[22px] rounded-full text-[8px] font-black flex items-center justify-center transition-all"
            style={{
              background: isC ? '#f59e0b' : 'rgba(255,255,255,0.07)',
              color: isC ? '#fff' : '#475569',
              border: isC ? '1.5px solid #f59e0baa' : '1px solid rgba(255,255,255,0.1)',
            }}>C</button>
          <button onClick={e => { e.stopPropagation(); onVc(player.player_id); }}
            className="w-[22px] h-[22px] rounded-full text-[8px] font-black flex items-center justify-center transition-all"
            style={{
              background: isVC ? '#8b5cf6' : 'rgba(255,255,255,0.07)',
              color: isVC ? '#fff' : '#475569',
              border: isVC ? '1.5px solid #8b5cf6aa' : '1px solid rgba(255,255,255,0.1)',
            }}>VC</button>
        </div>
      )}

      {/* Circular selection toggle */}
      <div className="w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0 transition-all"
        style={{
          background: isSelected ? accent : 'rgba(255,255,255,0.06)',
          border: isSelected ? `2px solid ${accent}` : '1.5px solid rgba(255,255,255,0.12)',
          boxShadow: isSelected ? `0 0 10px ${accent}55` : 'none',
        }}>
        {isSelected
          ? <Check size={13} className="text-white" strokeWidth={3} />
          : <span className="text-slate-600 font-black text-[16px] leading-none" style={{ marginTop: '-1px' }}>+</span>}
      </div>
    </div>
  );
}


// ─── AdminControlsCard ───────────────────────────────────────────────────────

function AdminControlsCard({
  show, roomId, settings, isLockRoom, captainVcEnabled,
  numMatches, matchesDone, constraints, updateRoom, patchConstraint, patchNumMatches,
}: {
  show: boolean;
  roomId: string;
  settings: Record<string, unknown>;
  isLockRoom: boolean;
  captainVcEnabled: boolean;
  numMatches: number | null;
  matchesDone: number;
  constraints: ContestConstraints;
  updateRoom: (id: string, data: Partial<Room>) => Promise<unknown>;
  patchConstraint: (k: keyof ContestConstraints, v: number | boolean) => void;
  patchNumMatches: (v: number | null) => void;
}) {
  if (!show) return null;
  return (
    <div className="bg-surface-container-low p-6 rounded-2xl border border-white/5">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-sm font-bold text-outline uppercase tracking-widest">Admin Settings</h3>
        <ShieldCheck size={20} className="text-tertiary" />
      </div>
      <div className="space-y-5">

        {/* Lock Room */}
        <div className="flex items-center justify-between p-4 bg-surface-container-lowest rounded-lg">
          <div>
            <p className="font-semibold text-white flex items-center gap-2"><Lock size={14} className="text-primary" /> Lock Room</p>
            <p className="text-xs text-on-surface-variant">Prevent new participants from joining</p>
          </div>
          <button type="button"
            onClick={() => updateRoom(roomId, { settings: { ...settings, lock_room: !isLockRoom } })}
            className={`w-12 h-6 rounded-full relative transition-all flex-shrink-0 ${isLockRoom ? 'bg-primary' : 'bg-surface-container-highest'}`}>
            <div className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white transition-all ${isLockRoom ? 'right-[3px]' : 'left-[3px]'}`} />
          </button>
        </div>

        {/* Captain / VC */}
        <div className="flex items-center justify-between p-4 bg-surface-container-lowest rounded-lg">
          <div>
            <p className="font-semibold text-white flex items-center gap-2"><Star size={14} className="text-amber-400" /> Captain / VC</p>
            <p className="text-xs text-on-surface-variant">C×2 · VC×1.5 multiplier on points</p>
          </div>
          <button type="button"
            onClick={() => patchConstraint('captain_vc', !captainVcEnabled)}
            className={`w-12 h-6 rounded-full relative transition-all flex-shrink-0 ${captainVcEnabled ? 'bg-amber-500' : 'bg-surface-container-highest'}`}>
            <div className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white transition-all ${captainVcEnabled ? 'right-[3px]' : 'left-[3px]'}`} />
          </button>
        </div>

        {/* Match Count */}
        <div className="p-4 bg-surface-container-lowest rounded-lg space-y-3">
          <div className="flex justify-between items-center">
            <p className="font-semibold text-white">Match Limit</p>
            <button type="button"
              onClick={() => patchNumMatches(numMatches === null ? 70 : null)}
              className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border transition-all ${numMatches === null ? 'bg-primary/20 text-primary border-primary/40' : 'bg-white/5 text-slate-500 border-white/10'}`}>
              {numMatches === null ? '✓ MAX' : 'Set MAX'}
            </button>
          </div>
          <input type="range" min={matchesDone || 1} max={70}
            value={numMatches ?? 70}
            onChange={e => patchNumMatches(Number(e.target.value))}
            disabled={numMatches === null}
            className="w-full accent-indigo-500 disabled:opacity-30" />
          <div className="flex justify-between text-xs text-on-surface-variant">
            <span>Done: {matchesDone}</span>
            <span className={numMatches === null ? 'text-primary font-bold' : 'text-white font-bold'}>
              {numMatches === null ? 'Max (70)' : `Limit: ${numMatches}`}
            </span>
          </div>
        </div>

        {/* Team Composition — capped so the 4 minimums can never exceed 11 total */}
        <div className="p-4 bg-surface-container-lowest rounded-lg">
          <p className="text-xs font-bold text-outline uppercase tracking-widest mb-3">Team Composition</p>
          {(() => {
            const bat = constraints.min_batsmen ?? 1;
            const bwl = constraints.min_bowlers ?? 2;
            const ar  = constraints.min_all_rounders ?? 1;
            const wk  = constraints.min_wicket_keepers ?? 1;
            const TOTAL = 11;
            // Each stepper's max = 11 minus the other three current values (but at least its own value)
            return (
              <>
                <Stepper label="Min Batsmen" value={bat}
                  max={Math.max(bat, TOTAL - bwl - ar - wk)}
                  onChange={v => patchConstraint('min_batsmen', v)} />
                <Stepper label="Min Bowlers" value={bwl}
                  max={Math.max(bwl, TOTAL - bat - ar - wk)}
                  onChange={v => patchConstraint('min_bowlers', v)} />
                <Stepper label="Min All-Rounders" value={ar}
                  max={Math.max(ar, TOTAL - bat - bwl - wk)}
                  onChange={v => patchConstraint('min_all_rounders', v)} />
                <Stepper label="Min Wicket-Keepers" value={wk}
                  max={Math.max(wk, TOTAL - bat - bwl - ar)}
                  onChange={v => patchConstraint('min_wicket_keepers', v)} />
                <p className="text-[9px] text-slate-600 mt-2 text-right">
                  Total minimums: <span className={bat + bwl + ar + wk > 11 ? 'text-red-400 font-bold' : 'text-slate-500'}>{bat + bwl + ar + wk}/11</span>
                </p>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ─── DangerZone (mobile only) ────────────────────────────────────────────────

function DangerZone({ isHost, onLeave, onDelete }: {
  isHost: boolean; onLeave: () => void; onDelete: () => void;
}) {
  const [confirmMobileDelete, setConfirmMobileDelete] = useState(false);
  return (
    <div className="bg-surface-container rounded-xl border border-white/5 p-4 space-y-2">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Danger Zone</p>
      {!isHost && (
        <button type="button" onClick={onLeave}
          className="w-full py-2.5 rounded-xl text-sm font-bold text-error bg-error/8 border border-error/15 hover:bg-error/15 transition-all flex items-center justify-center gap-2">
          <LogOut size={14} /> Leave Contest
        </button>
      )}
      {isHost && (
        <button type="button" onClick={() => setConfirmMobileDelete(true)}
          className="w-full py-2.5 rounded-xl text-sm font-bold text-error bg-error/10 border border-error/20 hover:bg-error/20 transition-all flex items-center justify-center gap-2">
          <Trash2 size={14} /> Delete Contest
        </button>
      )}
      {/* Mobile delete confirm inline */}
      {confirmMobileDelete && (
        <div className="mt-2 p-3 bg-error/10 border border-error/25 rounded-xl space-y-2">
          <p className="text-xs font-bold text-white">Are you sure?</p>
          <p className="text-[10px] text-slate-400">This will permanently delete the contest for everyone.</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmMobileDelete(false)}
              className="flex-1 py-1.5 rounded-lg text-[10px] font-bold text-slate-400 bg-white/5">
              Cancel
            </button>
            <button onClick={() => { setConfirmMobileDelete(false); onDelete(); }}
              className="flex-1 py-1.5 rounded-lg text-[10px] font-bold text-white bg-error">
              Yes, Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
