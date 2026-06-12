import { createContext, useContext, useState } from 'react';

export type ThemeMode = 'dark' | 'light';

export interface ThemeColors {
  accent: string;
  bgApp: string;
  bgPanel: string;
  bgRow: string;
  bgRowHover: string;
  bgSelected: string;
  bgInput: string;
  fg: string;
  fgDim: string;
  fgMuted: string;
  fgSubtle: string;
  divider: string;
  dropBorder: string;
  sectionLabel: string;
  thumbnailBg: string;
  presetRing: string;
}

const DARK: ThemeColors = {
  accent: '#e94f37',
  bgApp: '#161616',
  bgPanel: '#0d0d0d',
  bgRow: '#161616',
  bgRowHover: '#1c1c1c',
  bgSelected: '#1e100e',
  bgInput: '#0f0f0f',
  fg: '#E9E9E9',
  fgDim: '#666',
  fgMuted: '#444',
  fgSubtle: '#333',
  divider: 'rgba(255,255,255,0.04)',
  dropBorder: 'rgba(255,255,255,0.12)',
  sectionLabel: '#555',
  thumbnailBg: '#0a0a0a',
  presetRing: 'rgba(255,255,255,0.08)',
};

const LIGHT: ThemeColors = {
  accent: '#e94f37',
  bgApp: '#eeeeee',
  bgPanel: '#f9f9f9',
  bgRow: '#f3f3f3',
  bgRowHover: '#e8e8e8',
  bgSelected: '#fff2ef',
  bgInput: '#e8e8e8',
  fg: '#1a1a1a',
  fgDim: '#888',
  fgMuted: '#bbb',
  fgSubtle: '#aaa',
  divider: 'rgba(0,0,0,0.06)',
  dropBorder: 'rgba(0,0,0,0.15)',
  sectionLabel: '#aaa',
  thumbnailBg: '#e0e0e0',
  presetRing: 'rgba(0,0,0,0.1)',
};

export const THEME_COLORS: Record<ThemeMode, ThemeColors> = { dark: DARK, light: LIGHT };

interface ThemeContextValue {
  mode: ThemeMode;
  colors: ThemeColors;
  setMode: (m: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({ mode: 'dark', colors: DARK, setMode: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    return (localStorage.getItem('moka-theme') as ThemeMode) ?? 'dark';
  });

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    localStorage.setItem('moka-theme', m);
  };

  return (
    <ThemeContext.Provider value={{ mode, colors: THEME_COLORS[mode], setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
