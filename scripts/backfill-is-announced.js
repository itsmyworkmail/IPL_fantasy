#!/usr/bin/env node
/**
 * One-time backfill script: populates is_announced in fantasy_gameday_players
 * by hitting the IPL Fantasy API for every distinct gameday_id in the DB.
 *
 * Usage:
 *   SUPABASE_URL=https://... SUPABASE_KEY=service_role_key node scripts/backfill-is-announced.js
 *
 * The SUPABASE_KEY must be the SERVICE ROLE key (not anon key) so it can bypass RLS.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bximuboykndvqoljvvtr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY; // must be service_role key

if (!SUPABASE_KEY) {
  console.error('ERROR: Set SUPABASE_KEY to your Supabase service_role key');
  process.exit(1);
}

const HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal',
};

const API_HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://fantasy.iplt20.com/classic/',
  'Origin': 'https://fantasy.iplt20.com',
};

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: { ...HEADERS, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${options.method || 'GET'} ${path} → ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function main() {
  // 1. Get all distinct gameday_ids we have data for
  console.log('Fetching distinct gameday_ids from fantasy_gameday_players...');
  const rows = await sbFetch('/fantasy_gameday_players?select=gameday_id&order=gameday_id.asc');
  const gamedays = [...new Set(rows.map(r => r.gameday_id))].sort((a, b) => a - b);
  console.log(`Found ${gamedays.length} distinct gameday IDs: ${gamedays[0]} → ${gamedays[gamedays.length - 1]}`);

  let totalUpdated = 0;
  let failedGamedays = [];

  for (const gamedayId of gamedays) {
    try {
      console.log(`\n[${gamedayId}] Fetching API...`);
      const res = await fetch(
        `https://fantasy.iplt20.com/classic/api/feed/live/gamedayplayers?lang=en&tourgamedayId=${gamedayId}`,
        { headers: API_HEADERS }
      );

      if (!res.ok) {
        console.warn(`  API returned ${res.status} — skipping`);
        failedGamedays.push({ id: gamedayId, reason: `HTTP ${res.status}` });
        continue;
      }

      const json = await res.json();
      const players = json?.Data?.Value?.Players;

      if (!players || !Array.isArray(players) || players.length === 0) {
        console.warn(`  No players in response — skipping`);
        failedGamedays.push({ id: gamedayId, reason: 'empty response' });
        continue;
      }

      // Build per-player updates: only players with explicit IsAnnounced
      const updates = players
        .filter(p => p.IsAnnounced !== undefined && p.IsAnnounced !== null)
        .map(p => ({
          player_id: p.Id,
          gameday_id: gamedayId,
          is_announced: String(p.IsAnnounced),
        }));

      if (updates.length === 0) {
        console.log(`  No IsAnnounced data in response for gameday ${gamedayId}`);
        continue;
      }

      // Patch in batches of 100
      const BATCH = 100;
      let updated = 0;
      for (let i = 0; i < updates.length; i += BATCH) {
        const batch = updates.slice(i, i + BATCH);
        for (const u of batch) {
          try {
            await sbFetch(
              `/fantasy_gameday_players?player_id=eq.${u.player_id}&gameday_id=eq.${u.gameday_id}`,
              {
                method: 'PATCH',
                body: JSON.stringify({ is_announced: u.is_announced }),
              }
            );
            updated++;
          } catch (err) {
            // Row might not exist yet if this gameday was never synced — that's OK
          }
        }
      }

      const announcing = updates.filter(u => u.is_announced === 'P').length;
      console.log(`  ✓ Updated ${updated} players (${announcing} announced as P)`);
      totalUpdated += updated;

    } catch (err) {
      console.error(`  ERROR for gameday ${gamedayId}: ${err.message}`);
      failedGamedays.push({ id: gamedayId, reason: err.message });
    }

    // Polite delay — don't hammer the IPL Fantasy API
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n========================================`);
  console.log(`Backfill complete. Total updated: ${totalUpdated}`);
  if (failedGamedays.length > 0) {
    console.log(`Failed gamedays (${failedGamedays.length}):`, failedGamedays);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
