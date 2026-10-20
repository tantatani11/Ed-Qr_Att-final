import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import type { Session, User } from '@supabase/supabase-js';

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

// Never block the UI on session restore — the app opens straight to Login
// (or Home if already signed in). The stored session is restored in the
// background; when it arrives, setAuth redirects automatically.
//
// This is an external store: components subscribe via useSyncExternalStore.
// We must NOT read plain module-level variables during render — React
// Compiler (enabled in app.json) caches such reads and the UI never updates.
let state: AuthState = { session: null, user: null, loading: false };
let listeners: Set<() => void> = new Set();
let initialized = false;

function notify() {
  listeners.forEach((l) => l());
}

export function setAuth(session: Session | null) {
  // Replace the snapshot (never mutate) so useSyncExternalStore's Object.is
  // comparison detects the change and re-renders subscribers.
  state = { session, user: session?.user ?? null, loading: false };
  notify();
}

// EVENT: app startup → HANDLER: initAuth → ACTION: restore session in
// background → RESULT: auto-login if a session exists, Login screen if none.
// Never traps the user on a loading screen, even if Supabase is unreachable.
export function initAuth() {
  if (initialized) return;
  initialized = true;
  try {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setAuth(data.session);
      })
      .catch(() => {
        setAuth(null);
      });
    supabase.auth.onAuthStateChange((_event, session) => {
      setAuth(session);
    });
  } catch {
    setAuth(null);
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): AuthState {
  return state;
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export type SignUpProfile = {
  full_name: string;
  role: 'student' | 'teacher' | 'admin';
  year_level?: string;
  program?: string;
  block?: string;
};

export async function signUp(
  email: string,
  password: string,
  profile?: SignUpProfile
) {
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: profile
      ? {
          data: {
            full_name: profile.full_name,
            role: profile.role,
            email: normalizedEmail,
            year_level: profile.year_level ?? null,
            program: profile.program ?? null,
            block: profile.block ?? null,
          },
        }
      : undefined,
  });
  if (!error && data.session && profile) {
    // The Phase 3 trigger creates the profile row on signup.
    // Fill in the full_name and role the user chose.
    // (Trigger already tries to set these from user_metadata,
    // this upsert is a backup in case the trigger ran with old code
    // or hasn't created the row yet — update alone would affect 0 rows.)
    await supabase.from('profiles').upsert(
      {
        id: data.session.user.id,
        email: normalizedEmail,
        full_name: profile.full_name,
        role: profile.role,
        year_level: profile.year_level ?? null,
        program: profile.program ?? null,
        block: profile.block ?? null,
      },
      { onConflict: 'id' }
    );
  }
  if (!error && data.session) {
    setAuth(data.session);
  }
  return { data, error };
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (!error && data.session) {
    setAuth(data.session);
    // Self-heal: kung daan nga account nga blank ang name sa DB pero
    // naa sa metadata, pun-a ang profiles row karon.
    const { syncProfileFromMetadata } = await import('./profiles');
    syncProfileFromMetadata(data.session.user).catch(() => {});
  }
  return { data, error };
}

// Sends a password-recovery email to the given address. The link inside
// the email points to the project's configured Site URL (Supabase
// dashboard → Authentication → URL Configuration). Requires email
// confirmations to be enabled for the flow to work end-to-end.
export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(
    email.trim().toLowerCase()
  );
  return { error };
}

export async function signOut() {
  setAuth(null);
  supabase.auth.signOut().catch(() => {});
  const { clearProfileCache } = await import('./profiles');
  clearProfileCache();
  return { error: null };
}