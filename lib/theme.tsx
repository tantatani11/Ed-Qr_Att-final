import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as SecureStore from 'expo-secure-store';

import {
  DARK_COLORS,
  LIGHT_COLORS,
  type Palette,
  type ThemeMode,
} from '@/constants/colors';

const STORAGE_KEY = 'qr-att-theme';

type ThemeContextValue = {
  mode: ThemeMode;
  colors: Palette;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'light',
  colors: LIGHT_COLORS,
  setMode: () => {},
  toggle: () => {},
});

// EVENT: toggle pressed → HANDLER: toggle/setMode → ACTION: swap palette + persist → RESULT: whole UI repaints
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('light');

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((saved) => {
        if (saved === 'dark' || saved === 'light') setModeState(saved);
      })
      .catch(() => {});
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      colors: mode === 'dark' ? DARK_COLORS : LIGHT_COLORS,
      setMode: (next) => {
        setModeState(next);
        SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {});
      },
      toggle: () => {
        setModeState((prev) => {
          const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
          SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {});
          return next;
        });
      },
    }),
    [mode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

export function useColors(): Palette {
  return useContext(ThemeContext).colors;
}
