import { createClient } from '@supabase/supabase-js'

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
}

async function syncGamedayPlayers(env: Env, isManual: boolean = false) {
  console.log(`Starting IPL Fantasy Data Sync (Players)... [Manual: ${isManual}]`);
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

  const now = new Date();
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(yesterday);

  // 1. Check if we have active matches today to throttle cron
  const { data: fixtures, error: fetchErr } = await supabase
    .from('fantasy_tour_fixtures')
    .select('tour_gameday_id, home_team_id, away_team_id, match_datetime')
    .in('match_date', [yesterdayStr, todayStr]);

  if (fetchErr) throw new Error(`Failed to fetch fixtures: ${fetchErr.message}`);

  const nowTime = now.getTime();
  const THIRTY_MINS = 30 * 60 * 1000;
  const SIX_HOURS = 6 * 60 * 60 * 1000;

  let isAnyMatchActive = false;
  if (fixtures) {
    for (const fixture of fixtures) {
      const matchStartTime = new Date(fixture.match_datetime).getTime();
      if (nowTime >= (matchStartTime - THIRTY_MINS) && nowTime <= (matchStartTime + SIX_HOURS)) {
        isAnyMatchActive = true;
        break;
      }
    }
  }

  // Throttle automated crons tightly to only work during matches to save resources
  if (!isManual && !isAnyMatchActive) {
    console.log('No active matches currently. Cron job skipped API fetch to save resources.');
    return;
  }

  // 2. Determine dynamically the most recent gameday_id to ensure players have the absolute newest points
  let globalGamedayId = 1;
  const { data: latestFixture } = await supabase
    .from('fantasy_tour_fixtures')
    .select('tour_gameday_id')
    .lte('match_datetime', now.toISOString())
    .order('match_datetime', { ascending: false })
    .limit(1)
    .single();

  if (latestFixture && latestFixture.tour_gameday_id) {
    globalGamedayId = latestFixture.tour_gameday_id;
  }

  console.log(`Fetching global roster using latest tourgamedayId=${globalGamedayId}...`);
  const globalRes = await fetch(`https://fantasy.iplt20.com/classic/api/feed/live/gamedayplayers?lang=en&tourgamedayId=${globalGamedayId}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://fantasy.iplt20.com/classic/',
      'Origin': 'https://fantasy.iplt20.com'
    }
  });

  if (globalRes.ok) {
    const globalData: any = await globalRes.json();
    const globalPlayers = globalData?.Data?.Value?.Players;
    if (globalPlayers && Array.isArray(globalPlayers) && globalPlayers.length > 0) {
      const globalRoster = globalPlayers.map((p: any) => ({
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
  }

  // 3. Sync time-series data for TODAY's fixtures
  if (!fixtures || fixtures.length === 0) {
    console.log('No matches scheduled for yesterday or today. Skipping time-series sync.');
    return;
  }

  for (const fixture of fixtures) {
    const gamedayId = fixture.tour_gameday_id;
    const matchStartTime = new Date(fixture.match_datetime).getTime();
    
    // Enforce constraints per match unless we triggered it manually
    if (!isManual && (nowTime < (matchStartTime - THIRTY_MINS) || nowTime > (matchStartTime + SIX_HOURS))) {
      console.log(`Gameday ${gamedayId} is inactive. Skipping time-series...`);
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

    if (!res.ok) continue;
    
    const data: any = await res.json();
    const players = data?.Data?.Value?.Players;
    
    if (!players || !Array.isArray(players) || players.length === 0) continue;

    const validPlayers = players.filter((p: any) => 
      p.TeamId === fixture.home_team_id || p.TeamId === fixture.away_team_id
    );
    
    const records = validPlayers.map((p: any) => ({
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
  
  const data: any = await res.json();
  const matches = data?.Data?.Value;
  if (!matches || !Array.isArray(matches)) {
    throw new Error('Invalid fixtures data format received');
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
    venue: m.Venue
  }));

  const chunkSize = 50;
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
    return new Response('Fantasy Data Sync Worker is running. Try /sync-players or /sync-fixtures.', { status: 200 });
  },

  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
      if (event.cron === '0 0 * * *') {
        // Daily run for Tour Fixtures at midnight UTC
        await syncTourFixtures(env);
      } else {
        // Default 5-minute run for Players
        await syncGamedayPlayers(env, false);
      }
    } catch (e) {
      console.error('Exception during scheduled task:', e);
      throw e;
    }
  }
};
