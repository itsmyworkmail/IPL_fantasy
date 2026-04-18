import { createClient } from '@supabase/supabase-js'

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
}

interface PlayerRecord {
  Id: number;
  Name: string;
  ShortName: string;
  TeamId: number;
  TeamName: string;
  TeamShortName: string;
  SkillName: string;
  SkillId: number;
  OverallPoints: number;
  GamedayPoints: number;
  /** 'P' = playing/played, 'NP' = not playing/not played */
  IsAnnounced?: string;
}

interface TournamentFixture {
  MatchId: number;
  TourGamedayId: number;
  Matchdate: string;
  MatchdateTime: string;
  HomeTeamId: number;
  HomeTeamName: string;
  HomeTeamShortName: string;
  AwayTeamId: number;
  AwayTeamName: string;
  AwayTeamShortName: string;
  MatchName: string;
  MatchdayName: string;
  Venue: string;
  IsLive: number | boolean;
  MatchStatus: number;
  matchstatus?: number;
}

/**
 * Syncs the global player roster (overall_points) to the `players` table.
 * This runs on EVERY scheduled tick (NOT throttled) so that overall_points
 * stays current between matches — e.g. after a match finishes and the 90-min
 * grace window closes, the next cron still refreshes cumulative points.
 */
async function syncGlobalRoster(env: Env) {
  console.log('Starting Global Roster Sync (overall_points)...');
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
  const now = new Date();

  // Use the most recent match that has already started as the gameday reference
  const { data: latestFixture } = await supabase
    .from('fantasy_tour_fixtures')
    .select('tour_gameday_id')
    .lte('match_datetime', now.toISOString())
    .order('match_datetime', { ascending: false })
    .limit(1)
    .single();

  const globalGamedayId = latestFixture?.tour_gameday_id ?? 1;
  console.log(`Fetching global roster using latest tourgamedayId=${globalGamedayId}...`);

  const globalRes = await fetch(
    `https://fantasy.iplt20.com/classic/api/feed/live/gamedayplayers?lang=en&tourgamedayId=${globalGamedayId}`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://fantasy.iplt20.com/classic/',
        'Origin': 'https://fantasy.iplt20.com'
      }
    }
  );

  if (!globalRes.ok) {
    console.error(`Global roster API returned ${globalRes.status}`);
    return;
  }

  const globalData = await globalRes.json() as { Data: { Value: { Players: PlayerRecord[] } } };
  const globalPlayers = globalData?.Data?.Value?.Players;
  if (!globalPlayers || !Array.isArray(globalPlayers) || globalPlayers.length === 0) {
    console.warn('No players found in global roster response');
    return;
  }

  const globalRoster = globalPlayers.map((p: PlayerRecord) => ({
    player_id: p.Id,
    name: p.Name,
    short_name: p.ShortName,
    team_id: p.TeamId,
    team_name: p.TeamName,
    team_short_name: p.TeamShortName,
    skill_name: p.SkillName,
    skill_id: p.SkillId,
    overall_points: p.OverallPoints,
    last_updated_at: new Date().toISOString()
  }));

  const chunkSize = 200;
  for (let i = 0; i < globalRoster.length; i += chunkSize) {
    const chunk = globalRoster.slice(i, i + chunkSize);
    const { error } = await supabase.from('players').upsert(chunk, { onConflict: 'player_id' });
    if (error) console.error(`Supabase Upsert Error (Global Roster): ${error.message}`);
  }
  console.log(`Successfully synced ${globalRoster.length} players to global roster.`);
}

/**
 * Syncs per-match (time-series) player data into `fantasy_gameday_players`.
 * THROTTLED: only runs during active match windows to conserve resources.
 */
async function syncGamedayPlayers(env: Env, isManual: boolean = false) {
  console.log(`Starting IPL Fantasy Data Sync (Gameday Players)... [Manual: ${isManual}]`);
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

  const now = new Date();
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(yesterday);

  // 1. Check if we have active matches today to throttle cron
  const { data: fixtures, error: fetchErr } = await supabase
    .from('fantasy_tour_fixtures')
    .select('tour_gameday_id, home_team_id, away_team_id, match_datetime, match_status')
    .in('match_date', [yesterdayStr, todayStr]);

  if (fetchErr) throw new Error(`Failed to fetch fixtures: ${fetchErr.message}`);

  const nowTime = now.getTime();
  const THIRTY_MINS = 30 * 60 * 1000;
  const SIX_HOURS = 6 * 60 * 60 * 1000;

  let isAnyMatchActive = false;
  if (fixtures) {
    for (const fixture of fixtures) {
      const matchStartTime = new Date(fixture.match_datetime).getTime();
      const status = String(fixture.match_status || '');

      // Rule 1: Always sync if LIVE
      if (status === '1') {
        isAnyMatchActive = true;
        break;
      }
      // Rule 2: Sync from 30m before start until 6 hours after start.
      //   The 6-hour window covers the full match duration even if match_status
      //   never gets updated from '0' to '1' (deadlock prevention).
      if (status === '0' || status === '') {
        if (nowTime >= (matchStartTime - THIRTY_MINS) && nowTime <= (matchStartTime + SIX_HOURS)) {
          isAnyMatchActive = true;
          break;
        }
      }
      // Rule 3: Allow 90m grace period after "Finished" (Status 2) to capture final points
      if (status === '2') {
        const NINETY_MINS = 90 * 60 * 1000;
        const estimatedEndTime = matchStartTime + (4 * 60 * 60 * 1000); // 4h duration estimate
        if (nowTime <= (estimatedEndTime + NINETY_MINS)) {
          isAnyMatchActive = true;
          break;
        }
      }
    }
  }

  // Throttle: only proceed if a match is active (or this is a manual call)
  if (!isManual && !isAnyMatchActive) {
    console.log('No active matches currently. Gameday sync skipped to save resources.');
    return;
  }

  // 2. Sync time-series data for TODAY's fixtures
  if (!fixtures || fixtures.length === 0) {
    console.log('No matches scheduled for yesterday or today. Skipping time-series sync.');
    return;
  }

  for (const fixture of fixtures) {
    const gamedayId = fixture.tour_gameday_id;
    const matchStartTime = new Date(fixture.match_datetime).getTime();
    
    const status = String(fixture.match_status || '');
    
    let shouldSyncThisFixture = false;
    if (status === '1') {
      shouldSyncThisFixture = true;
    } else if (status === '0' || status === '') {
      // Sync from 30m before start until 6h after — covers full match even if
      // match_status stuck at '0' (avoids deadlock with throttle check above).
      if (nowTime >= (matchStartTime - THIRTY_MINS) && nowTime <= (matchStartTime + SIX_HOURS)) {
        shouldSyncThisFixture = true;
      }
    } else if (status === '2') {
      const NINETY_MINS = 90 * 60 * 1000;
      const estimatedEndTime = matchStartTime + (4 * 60 * 60 * 1000);
      if (nowTime <= (estimatedEndTime + NINETY_MINS)) {
        shouldSyncThisFixture = true;
      }
    }

    if (!isManual && !shouldSyncThisFixture) {
      console.log(`Gameday ${gamedayId} (Status: ${status}) is inactive. Skipping...`);
      continue;
    }

    console.log(`Fetching specific match data for tourgamedayId=${gamedayId}...`);
    const res = await fetch(`https://fantasy.iplt20.com/classic/api/feed/live/gamedayplayers?lang=en&tourgamedayId=${gamedayId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://fantasy.iplt20.com/classic/',
        'Origin': 'https://fantasy.iplt20.com'
      }
    });

    if (!res.ok) {
      console.error(`Failed to fetch match data for gameday ${gamedayId}: HTTP ${res.status}`);
      continue;
    }
    
    const data = await res.json() as { Data: { Value: { Players: PlayerRecord[] } } };
    const players = data?.Data?.Value?.Players;
    
    if (!players || !Array.isArray(players) || players.length === 0) {
      console.log(`No players found in API response for gameday ${gamedayId}`);
      continue;
    }

    const validPlayers = players.filter((p: PlayerRecord) => 
      p.TeamId === fixture.home_team_id || p.TeamId === fixture.away_team_id
    );
    
    const records = validPlayers.map((p: PlayerRecord) => ({
      player_id: p.Id,
      gameday_id: gamedayId,
      name: p.Name,
      short_name: p.ShortName,
      team_id: p.TeamId,
      team_name: p.TeamName,
      team_short_name: p.TeamShortName,
      skill_name: p.SkillName,
      skill_id: p.SkillId,
      overall_points: p.OverallPoints,
      gameday_points: p.GamedayPoints,
      is_announced: p.IsAnnounced ?? 'NP',
      last_updated_at: new Date().toISOString()
    }));

    if (records.length === 0) continue;

    const chunkSize = 200;
    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);
      const { error } = await supabase.from('fantasy_gameday_players').upsert(chunk, { onConflict: 'player_id,gameday_id' });
      if (error) console.error(`Supabase Upsert Error (Gameday Players): ${error.message}`);
    }

    console.log(`Successfully synced ${records.length} active match players for gameday ${gamedayId}.`);
  }
}

async function syncTourFixtures(env: Env) {
  console.log('Starting scheduled IPL Fantasy Data Sync (Fixtures)...');
  const res = await fetch('https://fantasy.iplt20.com/classic/api/feed/tour-fixtures?lang=en', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://fantasy.iplt20.com/classic/',
      'Origin': 'https://fantasy.iplt20.com'
    }
  });

  if (!res.ok) throw new Error(`Status ${res.status}: Failed to fetch IPL fixtures`);
  
  const data = await res.json() as { Data: { Value: TournamentFixture[] } };
  const matches = data?.Data?.Value;
  if (!matches || !Array.isArray(matches)) {
    throw new Error('Invalid fixtures data format received or empty matches array');
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
  const records = matches.map(m => ({
    match_id: m.MatchId,
    tour_gameday_id: m.TourGamedayId,
    match_date: m.Matchdate,
    match_datetime: new Date(m.MatchdateTime).toISOString(),
    home_team_id: m.HomeTeamId,
    home_team_name: m.HomeTeamName,
    home_team_short_name: m.HomeTeamShortName,
    away_team_id: m.AwayTeamId,
    away_team_name: m.AwayTeamName,
    away_team_short_name: m.AwayTeamShortName,
    match_name: m.MatchName,
    matchday_name: m.MatchdayName,
    venue: m.Venue,
    is_live: m.IsLive === true || m.IsLive === 1 || m.IsLive === 2 || String(m.IsLive).toLowerCase() === 'true',
    // FIX: Using nullish coalescing to prevent '0' status from becoming null
    match_status: String(m.MatchStatus ?? m.matchstatus ?? '')
  }));

  const chunkSize = 50;

  // ── Pre-cleanup: resolve tour_gameday_id conflicts before upserting ──────────
  // IPL occasionally reschedules fixtures, swapping match_ids between gamedays.
  // This creates a circular conflict where neither match_id nor tour_gameday_id
  // can be used as a single upsert key without hitting one of the two unique
  // constraints.  The fix: null out tour_gameday_id on any DB row that has
  // "our" gameday ID but a different match_id (i.e., got rescheduled away).
  // These are always future matches (no child fantasy_gameday_players rows yet),
  // so nulling is safe and the main upsert below will set the correct value.
  const incomingGamedayIds = records.map(r => r.tour_gameday_id).filter(Boolean) as number[];
  const incomingMatchIds   = records.map(r => r.match_id);

  if (incomingGamedayIds.length > 0) {
    const { data: conflictingRows } = await supabase
      .from('fantasy_tour_fixtures')
      .select('match_id, tour_gameday_id')
      .in('tour_gameday_id', incomingGamedayIds)
      .not('match_id', 'in', `(${incomingMatchIds.join(',')})`);

    if (conflictingRows && conflictingRows.length > 0) {
      console.log(`Resolving ${conflictingRows.length} tour_gameday_id conflict(s) from schedule changes...`);
      for (const row of conflictingRows) {
        const { error: clearErr } = await supabase
          .from('fantasy_tour_fixtures')
          .update({ tour_gameday_id: null })
          .eq('match_id', row.match_id);
        if (clearErr) console.error(`  Could not null tour_gameday_id for match ${row.match_id}:`, clearErr.message);
        else console.log(`  Cleared tour_gameday_id=${row.tour_gameday_id} from match_id=${row.match_id} (rescheduled)`);
      }
    }
  }

  // ── Main upsert on match_id (canonical PK, now free of gameday conflicts) ──
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    const { error } = await supabase.from('fantasy_tour_fixtures').upsert(chunk, { onConflict: 'match_id' });
    if (error) throw new Error(`Supabase Upsert Error (Fixtures): ${error.message}`);
  }

  console.log(`Successfully synced ${records.length} fixtures to Supabase.`);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/sync-players') {
      try {
        await syncGlobalRoster(env);
        await syncGamedayPlayers(env, true);
        return new Response('Players Sync completed successfully!', { status: 200 });
      } catch (e: any) {
        return new Response(`Players Sync failed: ${e.message}`, { status: 500 });
      }
    }
    if (url.pathname === '/sync-fixtures') {
      try {
        await syncTourFixtures(env);
        return new Response('Fixtures Sync completed successfully!', { status: 200 });
      } catch (e: any) {
        return new Response(`Fixtures Sync failed: ${e.message}`, { status: 500 });
      }
    }
    if (url.pathname === '/sync-global-roster') {
      try {
        await syncGlobalRoster(env);
        return new Response('Global Roster Sync completed successfully!', { status: 200 });
      } catch (e: any) {
        return new Response(`Global Roster Sync failed: ${e.message}`, { status: 500 });
      }
    }
    return new Response(
      'Fantasy Data Sync Worker is running. Endpoints: /sync-players, /sync-fixtures, /sync-global-roster',
      { status: 200 }
    );
  },

  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
      // Always sync fixtures and global roster (overall_points) on every tick.
      // The global roster sync is NOT throttled so overall_points stays current
      // even between matches (after the match window + 90-min grace period closes).
      await syncTourFixtures(env);
      await syncGlobalRoster(env);

      // Throttled: only syncs per-match gameday data during active match windows.
      await syncGamedayPlayers(env, false);
    } catch (e) {
      console.error('Exception during scheduled task:', e);
      throw e;
    }
  }
};
