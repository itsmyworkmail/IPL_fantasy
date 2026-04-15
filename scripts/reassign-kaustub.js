// Script to reassign Kaustub's placeholder profile to the real account (force mode)
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://bximuboykndvqoljvvtr.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const OLD_UUID = '4fac68ba-d636-4740-9a3d-4c3e8cd873e1'; // placeholder "Kaustub"
const NEW_UUID = 'a2b22e9a-0bfb-4ecb-bc8f-8be8e5953680'; // real account "Granger"
const ROOM_ID  = '51b1ec64-8daf-4091-962f-7fe33714d875'; // IPL 2026

async function main() {
  // 1. Ensure real profile exists in public.profiles
  console.log('1️⃣  Ensuring real profile exists...');
  const { error: upsertErr } = await supabase
    .from('profiles')
    .upsert({ id: NEW_UUID, display_name: 'Granger', updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (upsertErr) { console.error('❌ Profile upsert error:', upsertErr.message); process.exit(1); }
  console.log('   ✅ Profile "Granger" ensured');

  // 2. Update room_participants
  console.log('2️⃣  Updating room_participants...');
  const { error: rpErr } = await supabase
    .from('room_participants')
    .update({ profile_id: NEW_UUID })
    .eq('profile_id', OLD_UUID)
    .eq('room_id', ROOM_ID);
  if (rpErr) { console.error('❌', rpErr.message); process.exit(1); }
  console.log('   ✅ room_participants updated');

  // 3. Update teams
  console.log('3️⃣  Updating teams...');
  const { error: teamErr } = await supabase
    .from('teams')
    .update({ profile_id: NEW_UUID })
    .eq('profile_id', OLD_UUID)
    .eq('room_id', ROOM_ID);
  if (teamErr) { console.error('❌', teamErr.message); process.exit(1); }
  console.log('   ✅ teams updated');

  // 4. Delete old placeholder profile
  console.log('4️⃣  Removing old placeholder profile...');
  const { error: delErr } = await supabase.from('profiles').delete().eq('id', OLD_UUID);
  if (delErr) { console.warn('   ⚠️  Could not delete placeholder (FK constraint?):', delErr.message); }
  else console.log('   ✅ Old placeholder removed');

  // 5. Verify final state
  console.log('\n📊 Final room participants:');
  const { data } = await supabase
    .from('room_participants')
    .select('ipl_team, profiles(display_name), teams(name, selected_players)')
    .eq('room_id', ROOM_ID);

  (data || []).forEach(p => {
    console.log(`   • ${p.profiles?.display_name} | ${p.ipl_team} | ${p.teams?.name} | ${p.teams?.selected_players?.length} players`);
  });

  console.log('\n✅ Done! Kaustub → Granger migration complete.');
}

main().catch(console.error);
