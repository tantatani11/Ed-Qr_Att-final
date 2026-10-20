import { Platform } from 'react-native';

// Storage adapter for the Supabase auth client.
//
// Without this, @supabase/supabase-js falls back to an in-memory store on
// React Native and the session is lost on every app restart. We persist to
// the SQLite-backed AsyncStorage (expo-sqlite/kv-store) on native and to
// localStorage on web.

export type AuthStorage = {
  getItem: (key: string) => Promise<string | null> | string | null;
  setItem: (key: string, value: string) => Promise<void> | void;
  removeItem: (key: string) => Promise<void> | void;
};

// Last-resort fallback so auth never crashes if the native store fails.
const memory: Record<string, string> = {};

const memoryStorage: AuthStorage = {
  getItem: (key) => memory[key] ?? null,
  setItem: (key, value) => {
    memory[key] = value;
  },
  removeItem: (key) => {
    delete memory[key];
  },
};

function getWebStorage(): AuthStorage | null {
  try {
    if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
      return (globalThis as any).localStorage as AuthStorage;
    }
  } catch {
    // Access to localStorage can throw (privacy mode) — fall through.
  }
  return null;
}

function getNativeStorage(): AuthStorage | null {
  try {
    // Loaded lazily so the native module is never evaluated on web.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-sqlite/kv-store');
    const store = mod?.default ?? mod?.Storage;
    if (store && typeof store.getItem === 'function') {
      return {
        getItem: (key) => Promise.resolve(store.getItem(key)),
        setItem: (key, value) => Promise.resolve(store.setItem(key, value)),
        removeItem: (key) => Promise.resolve(store.removeItem(key)),
      };
    }
  } catch {
    // Native module unavailable — fall through to memory storage.
  }
  return null;
}

export const authStorage: AuthStorage =
  (Platform.OS === 'web' ? getWebStorage() : getNativeStorage()) ?? memoryStorage;
