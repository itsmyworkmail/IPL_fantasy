const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const envFile = fs.readFileSync('../fantasy-dashboard/.env.local', 'utf8');
const url = envFile.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1];
const key = envFile.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1];

const supabase = createClient(url, key);

async function run() {
  const now = new Date();
  const { data: latestFixture } = await supabase
    .from('fantasy_tour_fixtures')
    .select('tour_gameday_id')
    .lte('match_datetime', now.toISOString())
    .order('match_datetime', { ascending: false })
    .limit(1)
    .single();

  const globalGamedayId = latestFixture?.tour_gameday_id || 1;
  console.log('Resolved globalGamedayId:', globalGamedayId);
  
  const res = await fetch(`https://fantasy.iplt20.com/classic/api/feed/live/gamedayplayers?lang=en&tourgamedayId=${globalGamedayId}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const data = await res.json();
  const p = data?.Data?.Value?.Players?.find(x => x.Id === 5407); // Kohli
  console.log('Virat Kohli points:', p?.OverallPoints);
}
run().catch(console.error);
