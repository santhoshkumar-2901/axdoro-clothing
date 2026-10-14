import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  isValidTheme,
  getStoredTheme,
  setStoredTheme,
  applyThemeToDocument,
  THEME_STORAGE_KEY,
  DEFAULT_THEME,
  THEME_OPTIONS,
} from './lib/theme.ts';

// Helper: standard WCAG 2.2 relative luminance calculation
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return [r, g, b];
}

function channelLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channelLinear(r) + 0.7152 * channelLinear(g) + 0.0722 * channelLinear(b);
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('AXDORO Temporary Theme Preview Switcher (Phase 2)', () => {
  const clientDir = path.resolve(__dirname, '..');

  // Setup DOM / localStorage environment for Node runner
  const storageMap = new Map<string, string>();
  const docAttributes = new Map<string, string>();

  const mockLocalStorage = {
    getItem: (k: string) => storageMap.get(k) ?? null,
    setItem: (k: string, v: string) => {
      storageMap.set(k, String(v));
    },
    removeItem: (k: string) => {
      storageMap.delete(k);
    },
    clear: () => {
      storageMap.clear();
    },
  };

  const mockDocument = {
    documentElement: {
      getAttribute: (attr: string) => docAttributes.get(attr) ?? null,
      setAttribute: (attr: string, val: string) => {
        docAttributes.set(attr, val);
      },
      removeAttribute: (attr: string) => {
        docAttributes.delete(attr);
      },
    },
  };

  const originalWindow = (globalThis as any).window;
  const originalDocument = (globalThis as any).document;
  const originalLocalStorage = (globalThis as any).localStorage;

  beforeEach(() => {
    storageMap.clear();
    docAttributes.clear();

    (globalThis as any).window = {
      location: { pathname: '/' },
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    (globalThis as any).localStorage = mockLocalStorage;
    (globalThis as any).document = mockDocument;
  });

  afterEach(() => {
    storageMap.clear();
    docAttributes.clear();

    if (originalWindow !== undefined) (globalThis as any).window = originalWindow;
    else delete (globalThis as any).window;

    if (originalDocument !== undefined) (globalThis as any).document = originalDocument;
    else delete (globalThis as any).document;

    if (originalLocalStorage !== undefined) (globalThis as any).localStorage = originalLocalStorage;
    else delete (globalThis as any).localStorage;
  });

  describe('Theme Validation & Persistence', () => {
    it('validates only the three approved theme IDs', () => {
      expect(isValidTheme('deep-purple')).toBe(true);
      expect(isValidTheme('midnight-neon')).toBe(true);
      expect(isValidTheme('ice-white')).toBe(true);

      // Rejects unapproved or malformed values
      expect(isValidTheme('dark')).toBe(false);
      expect(isValidTheme('light')).toBe(false);
      expect(isValidTheme('')).toBe(false);
      expect(isValidTheme(null)).toBe(false);
      expect(isValidTheme(undefined)).toBe(false);
      expect(isValidTheme(123)).toBe(false);
    });

    it('persists selected theme in localStorage under axdoro_theme_preview', () => {
      setStoredTheme('midnight-neon');
      expect((globalThis as any).localStorage.getItem(THEME_STORAGE_KEY)).toBe('midnight-neon');
      expect(getStoredTheme()).toBe('midnight-neon');

      setStoredTheme('ice-white');
      expect((globalThis as any).localStorage.getItem(THEME_STORAGE_KEY)).toBe('ice-white');
      expect(getStoredTheme()).toBe('ice-white');

      setStoredTheme('deep-purple');
      expect((globalThis as any).localStorage.getItem(THEME_STORAGE_KEY)).toBe('deep-purple');
      expect(getStoredTheme()).toBe('deep-purple');
    });

    it('falls back safely to default theme (deep-purple) on corrupt or missing values', () => {
      (globalThis as any).localStorage.removeItem(THEME_STORAGE_KEY);
      expect(getStoredTheme()).toBe(DEFAULT_THEME);

      (globalThis as any).localStorage.setItem(THEME_STORAGE_KEY, 'invalid-theme-xyz');
      expect(getStoredTheme()).toBe(DEFAULT_THEME);

      (globalThis as any).localStorage.setItem(THEME_STORAGE_KEY, '');
      expect(getStoredTheme()).toBe(DEFAULT_THEME);
    });

    it('contains all three approved palettes in THEME_OPTIONS without substitution', () => {
      expect(THEME_OPTIONS.length).toBe(3);

      const deepPurple = THEME_OPTIONS.find((t) => t.id === 'deep-purple')!;
      expect(deepPurple.colors.primary).toBe('#433075');
      expect(deepPurple.colors.accent).toBe('#A58CF4');
      expect(deepPurple.colors.background).toBe('#0D0D0D');
      expect(deepPurple.colors.surface).toBe('#FAFAFA');

      const midnightNeon = THEME_OPTIONS.find((t) => t.id === 'midnight-neon')!;
      expect(midnightNeon.colors.primary).toBe('#02060E');
      expect(midnightNeon.colors.accent).toBe('#9303C5');
      expect(midnightNeon.colors.background).toBe('#02060E');
      expect(midnightNeon.colors.surface).toBe('#F4F6FC');

      const iceWhite = THEME_OPTIONS.find((t) => t.id === 'ice-white')!;
      expect(iceWhite.colors.primary).toBe('#F4F6FC');
      expect(iceWhite.colors.accent).toBe('#9303C5');
      expect(iceWhite.colors.background).toBe('#F4F6FC');
      expect(iceWhite.colors.surface).toBe('#FFFFFF');
    });
  });

  describe('Admin Isolation & Initial Theme Application', () => {
    it('applies theme to document element on storefront routes', () => {
      applyThemeToDocument('midnight-neon', '/');
      expect((globalThis as any).document.documentElement.getAttribute('data-theme')).toBe('midnight-neon');

      applyThemeToDocument('ice-white', '/collection');
      expect((globalThis as any).document.documentElement.getAttribute('data-theme')).toBe('ice-white');
    });

    it('removes data-theme from document element on /admin routes to preserve neutral styling', () => {
      (globalThis as any).document.documentElement.setAttribute('data-theme', 'midnight-neon');

      // Navigate to admin
      applyThemeToDocument('midnight-neon', '/admin');
      expect((globalThis as any).document.documentElement.getAttribute('data-theme')).toBeNull();

      applyThemeToDocument('deep-purple', '/admin/products');
      expect((globalThis as any).document.documentElement.getAttribute('data-theme')).toBeNull();
    });

    it('verifies index.css contains the admin isolation guard pinning original tokens', () => {
      const cssContent = fs.readFileSync(path.join(clientDir, 'src', 'index.css'), 'utf-8');

      expect(cssContent).toContain('.admin-portal');
      expect(cssContent).toContain('[data-theme] .admin-portal');
      expect(cssContent).toContain('--axdoro-bg: #FAF8F5;');
      expect(cssContent).toContain('--axdoro-charcoal: #171717;');
      expect(cssContent).toContain('--axdoro-accent: #8A2BE2;');
    });
  });

  describe('WCAG 2.2 Relative Luminance & Contrast Verification', () => {
    it('Theme A (Deep Purple): validates Soft White on Jet Black and Deep Purple exceeds AA/AAA', () => {
      // Soft White (#FAFAFA) on Jet Black (#0D0D0D)
      const textOnCanvas = contrastRatio('#FAFAFA', '#0D0D0D');
      expect(textOnCanvas).toBeGreaterThanOrEqual(18.0); // AAA requires 7.0:1

      // Soft White (#FAFAFA) on Deep Purple (#433075) button
      const textOnPurpleBtn = contrastRatio('#FAFAFA', '#433075');
      expect(textOnPurpleBtn).toBeGreaterThanOrEqual(10.0); // AAA passes

      // Lavender (#A58CF4) on Jet Black (#0D0D0D)
      const lavenderOnBlack = contrastRatio('#A58CF4', '#0D0D0D');
      expect(lavenderOnBlack).toBeGreaterThanOrEqual(7.0); // AAA passes

      // Jet Black (#0D0D0D) text on Lavender (#A58CF4) surface
      const blackOnLavender = contrastRatio('#0D0D0D', '#A58CF4');
      expect(blackOnLavender).toBeGreaterThanOrEqual(7.0); // AAA passes

      // Confirms white (#FAFAFA) on light lavender (#A58CF4) fails (2.62:1), validating design decision
      const whiteOnLavender = contrastRatio('#FAFAFA', '#A58CF4');
      expect(whiteOnLavender).toBeLessThan(3.0);
    });

    it('Theme B (Midnight Neon): calculates exact contrast for #9303C5 and validates Ice White pairs', () => {
      // Exact calculation for Neon Purple (#9303C5) against Ice White (#F4F6FC)
      const neonPurpleOnIceWhite = contrastRatio('#9303C5', '#F4F6FC');
      expect(neonPurpleOnIceWhite).toBeCloseTo(6.34, 1);
      expect(neonPurpleOnIceWhite).toBeGreaterThanOrEqual(4.5); // Passes WCAG AA 4.5:1

      // Ice White (#F4F6FC) on Midnight Blue/Black (#02060E) canvas
      const iceWhiteOnMidnight = contrastRatio('#F4F6FC', '#02060E');
      expect(iceWhiteOnMidnight).toBeGreaterThanOrEqual(18.0); // Passes AAA

      // High-contrast Neon Accent (#C084FC) on Midnight (#02060E)
      const accentOnMidnight = contrastRatio('#C084FC', '#02060E');
      expect(accentOnMidnight).toBeGreaterThanOrEqual(7.0); // Passes AAA

      // Confirms raw #9303C5 on #02060E canvas is 2.96:1 (fails normal text 4.5:1), validating Ice White text on neon buttons
      const rawNeonOnMidnight = contrastRatio('#9303C5', '#02060E');
      expect(rawNeonOnMidnight).toBeLessThan(3.0);
    });

    it('Theme C (Ice White): validates Neon Purple on Ice White and White surfaces exceeds 4.5:1', () => {
      // Neon Purple (#9303C5) on Ice White (#F4F6FC) canvas
      const neonOnIceWhite = contrastRatio('#9303C5', '#F4F6FC');
      expect(neonOnIceWhite).toBeCloseTo(6.34, 1);
      expect(neonOnIceWhite).toBeGreaterThanOrEqual(4.5); // Passes AA for normal text

      // Neon Purple (#9303C5) on Pure White (#FFFFFF) surface
      const neonOnWhite = contrastRatio('#9303C5', '#FFFFFF');
      expect(neonOnWhite).toBeCloseTo(6.84, 1);
      expect(neonOnWhite).toBeGreaterThanOrEqual(4.5); // Passes AA for normal text

      // Midnight (#02060E) primary text on Ice White (#F4F6FC)
      const midnightOnIceWhite = contrastRatio('#02060E', '#F4F6FC');
      expect(midnightOnIceWhite).toBeGreaterThanOrEqual(18.0); // Passes AAA

      // White (#FFFFFF) text on Midnight (#02060E) button
      const whiteOnMidnight = contrastRatio('#FFFFFF', '#02060E');
      expect(whiteOnMidnight).toBeGreaterThanOrEqual(20.0); // Passes AAA
    });
  });

  describe('Component Architecture & Photograph Integrity', () => {
    it('verifies Navbar includes ThemePreviewSwitcher for desktop and mobile without removing existing controls', () => {
      const navbarContent = fs.readFileSync(
        path.join(clientDir, 'src', 'components', 'Navbar.tsx'),
        'utf-8'
      );

      // Theme switcher integration
      expect(navbarContent).toContain('<ThemePreviewSwitcher');
      expect(navbarContent).toContain('variant="desktop"');
      expect(navbarContent).toContain('variant="mobile"');

      // Preserved core navigation, Escape handling, and dimensions
      expect(navbarContent).toContain("if (e.key === 'Escape' && mobileMenuOpen)");
      expect(navbarContent).toContain('width={144}');
      expect(navbarContent).toContain('height={36}');
      expect(navbarContent).toContain('aria-controls="mobile-navigation-menu"');
      expect(navbarContent).toContain('id="mobile-navigation-menu"');
      expect(navbarContent).toContain('cartCount');
      expect(navbarContent).toContain('onScrollToShop');
    });

    it('verifies ThemePreviewSwitcher exposes accessible roles, labels, and 44px min touch targets', () => {
      const switcherContent = fs.readFileSync(
        path.join(clientDir, 'src', 'components', 'ThemePreviewSwitcher.tsx'),
        'utf-8'
      );

      // Accessibility landmarks and states
      expect(switcherContent).toContain('aria-label="Theme preview switcher"');
      expect(switcherContent).toContain('role="radiogroup"');
      expect(switcherContent).toContain('role="radio"');
      expect(switcherContent).toContain('aria-haspopup="listbox"');
      expect(switcherContent).toContain('aria-expanded={isOpen}');
      expect(switcherContent).toContain('min-h-[44px]');
      expect(switcherContent).toContain("if (e.key === 'Escape')");
    });

    it('verifies product photography preservation rules in index.css guarantee untouched images', () => {
      const cssContent = fs.readFileSync(path.join(clientDir, 'src', 'index.css'), 'utf-8');

      expect(cssContent).toContain('filter: none !important;');
      expect(cssContent).toContain('mix-blend-mode: normal !important;');
      expect(cssContent).toContain('opacity: 1 !important;');
    });

    it('verifies index.html includes pre-render theme script to prevent visual flicker', () => {
      const htmlContent = fs.readFileSync(path.join(clientDir, 'index.html'), 'utf-8');

      expect(htmlContent).toContain('axdoro_theme_preview');
      expect(htmlContent).toContain("document.documentElement.setAttribute('data-theme', theme);");
      expect(htmlContent).toContain("!window.location.pathname.startsWith('/admin')");
    });
  });
});
