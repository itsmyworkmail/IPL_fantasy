import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Supabase Realtime internally uses the Web Locks API and may emit an
// "AbortError: Lock broken by another request with the 'steal' option"
// when a new WebSocket connection steals its lock. This is a known Supabase
// client internals issue (not our code) and is safe to suppress.
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (
      reason instanceof Error &&
      reason.name === 'AbortError' &&
      reason.message.includes('steal')
    ) {
      event.preventDefault(); // Suppress the console error
    }
  });
}
