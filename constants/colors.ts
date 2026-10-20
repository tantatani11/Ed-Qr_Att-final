export type ThemeMode = 'light' | 'dark';

const LIGHT = {
  primary: '#1A73E8',
  background: '#F5F8FF',
  card: '#FFFFFF',
  textPrimary: '#0B1B3A',
  textSecondary: '#5A6B8C',
  textOnPrimary: '#FFFFFF',
  surface: '#EEF3FC',
  border: '#D9E4F7',
  shadow: '#000000',
  warning: '#F59E0B',
  success: '#16A34A',
  danger: '#FF3B5C',
  primarySoft: '#BBD4FB',
  logo: '#1A73E8',
} as const;

const DARK = {
  primary: '#5B9BFF',
  background: '#0B1220',
  card: '#141D33',
  textPrimary: '#EAF0FF',
  textSecondary: '#9AA8C7',
  textOnPrimary: '#0B1220',
  surface: '#1B2540',
  border: '#26334F',
  shadow: '#000000',
  warning: '#F5A623',
  success: '#34D17B',
  danger: '#FF6B81',
  primarySoft: '#2A3D66',
  logo: '#6CA6FF',
} as const;

export const LIGHT_COLORS = LIGHT;
export const DARK_COLORS = DARK;

export type Palette = { [K in keyof typeof LIGHT]: string };

// Kept for backward compatibility; prefer useColors() from '@/lib/theme'.
export const COLORS = LIGHT_COLORS;
