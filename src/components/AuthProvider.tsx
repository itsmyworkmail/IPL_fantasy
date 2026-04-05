'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { Profile } from '@/types';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Tracks the current user ID so we can detect genuine sign-ins vs silent
  // same-user token refreshes, without stale closure issues.
  const currentUserIdRef = useRef<string | undefined>(undefined);

  // ── fetchProfile ────────────────────────────────────────────────────────────
  // Fetches the user profile row. Has its own 5 s timeout so a slow/unreachable
  // Supabase instance never leaves loading=true indefinitely.
  const fetchProfile = useCallback(async (userId: string) => {
    // Race the real fetch against a 5 s timeout. If Supabase is unreachable
    // the timeout wins and we unblock the UI rather than hanging forever.
    const fetchPromise = supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Profile fetch timed out')), 5000)
    );

    try {
      const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);

      if (error && error.code !== 'PGRST116') {
        console.error('[Auth] Error fetching profile:', error.message);
      } else if (data) {
        setProfile(data as Profile);
      }
    } catch (err: unknown) {
      // Timeout or network failure — log and move on. The user will still be
      // authenticated; they just won't have a profile object yet.
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[Auth] fetchProfile did not complete:', msg);
    } finally {
      setLoading(false); // Always unblock, errors or not
    }
  }, []);

  // ── Auth subscription ────────────────────────────────────────────────────────
  useEffect(() => {
    // ── Safety net ────────────────────────────────────────────────────────────
    // If Supabase never fires INITIAL_SESSION within 8 s (e.g. the CDN/network
    // is completely unreachable), force loading=false so the app is never
    // permanently stuck on a skeleton. The user will see the login page instead
    // of an infinite spinner.
    const safetyTimer = setTimeout(() => {
      setLoading(prev => {
        if (prev) {
          console.warn('[Auth] Init safety timeout fired after 8 s — unblocking UI');
        }
        return false;
      });
    }, 8000);

    // ── Supabase auth listener ────────────────────────────────────────────────
    // We use onAuthStateChange exclusively (canonical Supabase v2 pattern).
    // The INITIAL_SESSION event fires immediately with the persisted session from
    // localStorage, so we never need to call getSession() separately.
    // getSession() can make a network call if the token is expired and that
    // network call can hang — this pattern avoids that entirely.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // ── INITIAL_SESSION ────────────────────────────────────────────────────
      // Fires immediately on subscription creation with the current persisted
      // session. This is our startup path — no separate getSession() required.
      if (event === 'INITIAL_SESSION') {
        clearTimeout(safetyTimer);
        currentUserIdRef.current = session?.user?.id;
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // fetchProfile has its own timeout + finally setLoading(false)
          await fetchProfile(session.user.id);
        } else {
          setLoading(false);
        }
        return;
      }

      // ── TOKEN_REFRESHED ────────────────────────────────────────────────────
      // Fires silently when the user returns to the tab. The access token
      // has been refreshed but no user change occurred — just update the session
      // object so API calls use the fresh token. Never show a loading spinner.
      if (event === 'TOKEN_REFRESHED') {
        setSession(session);
        return;
      }

      // ── SIGNED_IN, USER_UPDATED, SIGNED_OUT, etc. ─────────────────────────
      // Determine whether this is a genuine user change (new sign-in / sign-out)
      // or a silent re-auth for the same account. We only show a loading spinner
      // on genuine user transitions — never on same-user silent refreshes.
      const incomingUserId = session?.user?.id;
      const isNewUser = incomingUserId !== currentUserIdRef.current;
      currentUserIdRef.current = incomingUserId;

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        if (isNewUser) setLoading(true);
        await fetchProfile(session.user.id);
      } else {
        // Signed out — clear local state immediately
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // ── Auth actions ─────────────────────────────────────────────────────────────

  const signInWithGoogle = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) console.error('[Auth] OAuth error:', error.message);
    } catch (err: unknown) {
      console.error('[Auth] Sign-in failed:', err);
    }
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('[Auth] Sign-out error:', error.message);
      throw error;
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
