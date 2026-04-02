const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const envFile = fs.readFileSync('../fantasy-dashboard/.env.local', 'utf8');
const url = envFile.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1];
const key = envFile.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1];

const supabase = createClient(url, key);

async function run() {
  const globalRes = await fetch(`https://fantasy.iplt20.com/classic/api/feed/live/gamedayplayers?lang=en&tourgamedayId=5`, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  
  if (globalRes.ok) {
    const globalData = await globalRes.json();
    const globalPlayers = globalData?.Data?.Value?.Players;
    if (globalPlayers && Array.isArray(globalPlayers) && globalPlayers.length > 0) {
      const globalRoster = globalPlayers.map((p) => ({
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
        if (error) console.error(`Supabase Upsert Error: ${error.message}`);
      }
      console.log(`Successfully synced ${globalRoster.length} players!`);
    }
  }
}
run().catch(console.error);
