/**
 * AXDORO Temporary Theme Preview Switcher (Phase 2)
 *
 * Provides client theme preview capabilities across three approved brand palettes:
 * - Theme A: Deep Purple (#433075, #A58CF4, #FAFAFA, #0D0D0D)
 * - Theme B: Midnight Neon (#02060E, #9303C5, #F4F6FC)
 * - Theme C: Ice White (#F4F6FC, #9303C5, #02060E, #FFFFFF)
 *
 * NOTE: This is a temporary feature for client palette comparison and will be
 * removed after final client brand approval.
 */

export type ThemeId = 'deep-purple' | 'midnight-neon' | 'ice-white';

export interface ThemeOption {
  id: ThemeId;
  name: string;
  badge: string;
  description: string;
  colors: {
    primary: string;
    accent: string;
    background: string;
    surface?: string;
  };
}

export const THEME_STORAGE_KEY = 'axdoro_theme_preview';
export const DEFAULT_THEME: ThemeId = 'deep-purple';

export const THEME_OPTIONS: readonly ThemeOption[] = [
  {
    id: 'deep-purple',
    name: 'Deep Purple',
    badge: 'Theme A',
    description: 'Deep Purple & Lavender on Jet Black',
    colors: {
      primary: '#433075',
      accent: '#A58CF4',
      background: '#0D0D0D',
      surface: '#FAFAFA',
    },
  },
  {
    id: 'midnight-neon',
    name: 'Midnight Neon',
    badge: 'Theme B',
    description: 'Midnight Blue & Neon Purple',
    colors: {
      primary: '#02060E',
      accent: '#9303C5',
      background: '#02060E',
      surface: '#F4F6FC',
    },
  },
  {
    id: 'ice-white',
    name: 'Ice White',
    badge: 'Theme C',
    description: 'Ice White Canvas with Neon Accent',
    colors: {
      primary: '#F4F6FC',
      accent: '#9303C5',
      background: '#F4F6FC',
      surface: '#FFFFFF',
    },
  },
] as const;

export function isValidTheme(val: unknown): val is ThemeId {
  return val === 'deep-purple' || val === 'midnight-neon' || val === 'ice-white';
}

/**
 * Reads and validates the stored theme from localStorage.
 * Falls back safely to DEFAULT_THEME if the value is missing, invalid, or storage throws.
 */
export function getStoredTheme(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const val = localStorage.getItem(THEME_STORAGE_KEY);
    if (isValidTheme(val)) {
      return val;
    }
  } catch {
    // Gracefully handle storage disabled or security restriction
  }
  return DEFAULT_THEME;
}

/**
 * Persists the selected theme into localStorage.
 */
export function setStoredTheme(theme: ThemeId): void {
  if (typeof window === 'undefined') return;
  try {
    if (isValidTheme(theme)) {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  } catch {
    // Gracefully handle storage errors
  }
}

/**
 * Applies the theme data attribute to document.documentElement
 * while respecting admin isolation (does not set theme on /admin).
 */
export function applyThemeToDocument(theme: ThemeId, pathname: string = ''): void {
  if (typeof document === 'undefined') return;
  const currentPath = pathname || (typeof window !== 'undefined' ? window.location.pathname : '');
  if (currentPath.startsWith('/admin')) {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}
