/**
 * AXDORO Permanent Brand Design Tokens — Light Luxury Theme
 *
 * Source of truth:
 * - Canvas: #FFFFFF (Pure White)
 * - Secondary surface: #F7F7F7 (Very Light Grey)
 * - Text: #171717 (Near-Black)
 * - Muted text: #666666 (Neutral Grey)
 * - Border: #E5E5E5 (Subtle Grey)
 * - Accent: #171717 (Restrained Charcoal/Black)
 */

export const THEME = {
  name: 'Light Luxury',
  id: 'light-luxury',
  colors: {
    primary: '#171717',
    accent: '#171717',
    accentMuted: '#525252',
    accentSubtle: '#F3F4F6',
    background: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceMuted: '#F7F7F7',
    text: '#171717',
    textMuted: '#666666',
    border: '#E5E5E5',
    borderStrong: '#D4D4D4',
    ring: '#171717',
  },
} as const;

export type ThemeConfig = typeof THEME;

