import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type Role = 'student' | 'teacher' | 'admin';

export const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year'] as const;
export type YearLevel = (typeof YEAR_LEVELS)[number];

// Usba ni nga lista para mo-match sa imong eskwelahan.
// Kini ang choices nga mogawas sa Register ug Profile (single source).
export const PROGRAMS = [
  'BEEd',
  'BPEd',
  'BSEd',
  'BSIT',
  'BSEntrep',
] as const;
export type Program = (typeof PROGRAMS)[number];

export const BLOCKS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export type Block = (typeof BLOCKS)[number];

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  year_level: string | null;
  program: string | null;
  block: string | null;
};

const PROFILE_COLUMNS = 'id, email, full_name, role, year_level, program, block';

// Short-lived in-memory cache so multiple screens (tab layout, home,
// history, admin) don't refetch the same profile on every focus.
const CACHE_TTL_MS = 30_000;
const profileCache = new Map<string, { profile: Profile | null; at: number }>();

export function invalidateProfile(userId: string) {
  profileCache.delete(userId);
}

export function clearProfileCache() {
  profileCache.clear();
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  let { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    // Older DBs without the academic columns → retry with base columns.
    const retry = await supabase
      .from('profiles')
      .select('id, email, full_name, role')
      .eq('id', userId)
      .maybeSingle();
    data = { ...retry.data, year_level: null, program: null, block: null } as any;
    error = retry.error as any;
  }

  if (error || !data) {
    return null;
  }

  return data as Profile;
}

export async function getProfile(
  userId: string,
  options?: { fresh?: boolean }
): Promise<Profile | null> {
  if (!options?.fresh) {
    const cached = profileCache.get(userId);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return cached.profile;
    }
  }
  const profile = await fetchProfile(userId);
  profileCache.set(userId, { profile, at: Date.now() });
  return profile;
}

export type ProfileUpdates = {
  full_name?: string;
  role?: Role;
  year_level?: string | null;
  program?: string | null;
  block?: string | null;
};

export async function updateProfile(
  userId: string,
  updates: ProfileUpdates
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId);

  if (!error) invalidateProfile(userId);

  return { error: error?.message ?? null };
}

// Sync sa user_metadata (full_name/role/academic info gikan sa Register)
// ngadto sa profiles table. Mao ni ang fix nganong blank ang name sa Profile:
// kung email-confirmation ON, walay session pag-signUp mao nga ang
// trigger ra ang nagsalig — kung napalya to, blank forever.
// Kini nga function mo-self-heal pag-open sa Profile o pag-signIn.
export async function syncProfileFromMetadata(
  user: User
): Promise<Profile | null> {
  const meta = (user.user_metadata ?? {}) as {
    full_name?: string;
    role?: Role;
    year_level?: string;
    program?: string;
    block?: string;
  };
  const metaName = meta.full_name?.trim();
  const metaRole =
    meta.role === 'teacher' ? 'teacher' : meta.role === 'admin' ? 'admin' : undefined;
  const metaYear = meta.year_level?.trim() || undefined;
  const metaProgram = meta.program?.trim() || undefined;
  const metaBlock =
    meta.block && (BLOCKS as readonly string[]).includes(meta.block)
      ? meta.block
      : undefined;
  const email =
    user.email ?? ((user.user_metadata ?? {}) as any)?.email ?? '';

  const current = await getProfile(user.id);

  // Wala pay row (trigger wala kadagan) → buhata via upsert.
  if (!current) {
    const { data, error } = await supabase
      .from('profiles')
      .upsert(
        {
          id: user.id,
          email,
          full_name: metaName ?? null,
          role: metaRole ?? 'student',
          year_level: metaYear ?? null,
          program: metaProgram ?? null,
          block: metaBlock ?? null,
        },
        { onConflict: 'id' }
      )
      .select(PROFILE_COLUMNS)
      .maybeSingle();
    if (error || !data) return null;
    profileCache.set(user.id, { profile: data as Profile, at: Date.now() });
    return data as Profile;
  }

  // Naa nay row pero kulang og name/role/academic info → pun-a gikan sa metadata.
  const updates: ProfileUpdates = {};
  if ((!current.full_name || !current.full_name.trim()) && metaName) {
    updates.full_name = metaName;
  }
  if (current.role !== 'teacher' && current.role !== 'admin' && metaRole) {
    updates.role = metaRole;
  }
  if (!current.year_level && metaYear) updates.year_level = metaYear;
  if (!current.program && metaProgram) updates.program = metaProgram;
  if (!current.block && metaBlock) updates.block = metaBlock;
  if (Object.keys(updates).length === 0) return current;

  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id);
  if (error) return current;
  const merged = { ...current, ...updates };
  profileCache.set(user.id, { profile: merged, at: Date.now() });
  return merged;
}
