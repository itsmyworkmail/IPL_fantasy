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

  // Track whether the initial session check has already run so that the
  // onAuthStateChange listener (which fires immediately on mount) does not
  // redundantly re-trigger a loading flip and cause a double-render flicker.
  const initializedRef = useRef(false);

  // Track the current user ID so we can detect genuine user changes
  // (new sign-in / sign-out) vs silent token refreshes for the same user.
  // A ref avoids stale closure issues inside the auth listener callback.
  const currentUserIdRef = useRef<string | undefined>(undefined);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching profile:', error);
      } else if (data) {
        setProfile(data as Profile);
      }
    } catch (err) {
      console.error('Failed to fetch profile', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Step 1: grab the persisted session synchronously via getSession so we
    // can immediately set user state without waiting for the listener.
    const initSession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) console.error('Error fetching session:', error);

      initializedRef.current = true;
      currentUserIdRef.current = session?.user?.id;

      setSession(session);
      setUser(session?.user || null);

      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    };

    // Step 2: listen for subsequent auth changes (sign-in/sign-out events).
    // We skip INITIAL_SESSION (handled by initSession above).
    // For TOKEN_REFRESHED and any other silent-refresh-like event (SIGNED_IN
    // fired for the SAME user), we must NOT show a loading spinner — that
    // would blank out every page momentarily on every tab focus.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // INITIAL_SESSION: already handled by initSession, skip.
        if (event === 'INITIAL_SESSION') return;

        // TOKEN_REFRESHED fires silently when the user returns to the tab.
        // The session user hasn't changed, so we only update the session token
        // without triggering any loading state or profile re-fetch.
        if (event === 'TOKEN_REFRESHED') {
          setSession(session);
          return;
        }

        // For all other events (SIGNED_IN, USER_UPDATED, SIGNED_OUT…)
        // determine whether this is a *genuine* user change or a silent
        // re-auth for the same account (e.g. Supabase fires SIGNED_IN on
        // some token refreshes when the JWT has fully expired).
        const incomingUserId = session?.user?.id;
        const isNewUser = incomingUserId !== currentUserIdRef.current;
        currentUserIdRef.current = incomingUserId;

        setSession(session);
        setUser(session?.user || null);

        if (session?.user) {
          // Only block the UI with a loading spinner when a genuinely new
          // user signs in.  For same-user silent refreshes keep the UI alive.
          if (isNewUser) setLoading(true);
          await fetchProfile(session.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    initSession();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        console.error('Error signing in with Google:', error.message);
      }
    } catch (err: unknown) {
      console.error('Sign-in catch error:', err);
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error signing out:', error.message);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
