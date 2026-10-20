/**
 * AXDORO Permanent Brand Design Tokens — Deep Purple Theme
 *
 * Source of truth:
 * - Primary: #433075 (Deep Purple)
 * - Accent: #A58CF4 (Lavender)
 * - Light surface/text: #FAFAFA (Soft White)
 * - Dark canvas: #0D0D0D (Jet Black)
 */

export const THEME = {
  name: 'Deep Purple',
  id: 'deep-purple',
  colors: {
    primary: '#433075',
    accent: '#A58CF4',
    accentMuted: '#BBA6F7',
    accentSubtle: '#261A42',
    background: '#0D0D0D',
    surface: '#171224',
    surfaceMuted: '#221B36',
    text: '#FAFAFA',
    textMuted: '#C5B8EA',
    border: '#3E2C6A',
    borderStrong: '#6D52AB',
    ring: '#A58CF4',
  },
} as const;

export type ThemeConfig = typeof THEME;
