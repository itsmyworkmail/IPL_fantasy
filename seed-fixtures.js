const { createClient } = require('@supabase/supabase-js');

// Must provide valid URL and API key from our worker configuration
const supabase = createClient(
  'https://bximuboykndvqoljvvtr.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4aW11Ym95a25kdnFvbGp2dnRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODAzNTksImV4cCI6MjA5MDQ1NjM1OX0.QiAbO4FTuoFhu5ppl0in30CeeIvCW56fND_ol1OaJ1k'
);

async function syncTourFixtures() {
  console.log('Fetching tour fixtures from IPL API...');
  
  const res = await fetch('https://fantasy.iplt20.com/classic/api/feed/tour-fixtures?lang=en', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://fantasy.iplt20.com/classic/',
      'Origin': 'https://fantasy.iplt20.com'
    }
  });

  if (!res.ok) {
    console.error(`Status ${res.status}: Failed to fetch IPL data`);
    return;
  }
  
  const data = await res.json();
  const matches = data?.Data?.Value;
  if (!matches || !Array.isArray(matches)) {
    console.error('Invalid data format received');
    return;
  }

  const records = matches.map(m => {
    // Convert generic timestamp '03/28/2026 14:00:00' to an actual parsable string if needed
    // Assuming standard format matches Postgres timestamp
    return {
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
    };
  });

  console.log(`Inserting ${records.length} total fixtures into Supabase...`);

  // Insert to supabase
  const chunkSize = 50;
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    const { error } = await supabase
      .from('fantasy_tour_fixtures')
      .upsert(chunk, { onConflict: 'match_id' });
    
    if (error) {
      console.error('Error inserting fixtures:', error);
      return;
    }
  }

  console.log('✅ Successfully seeded Tour Fixtures!');
}

syncTourFixtures();
