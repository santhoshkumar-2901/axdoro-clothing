import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { THEME } from './lib/theme.ts';

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

describe('AXDORO Permanent Theme — Deep Purple Verification', () => {
  const clientDir = path.resolve(__dirname, '..');

  describe('Theme Token Source of Truth', () => {
    it('defines exact Deep Purple design tokens in lib/theme.ts', () => {
      expect(THEME.id).toBe('deep-purple');
      expect(THEME.name).toBe('Deep Purple');
      expect(THEME.colors.primary).toBe('#433075');
      expect(THEME.colors.accent).toBe('#A58CF4');
      expect(THEME.colors.background).toBe('#0D0D0D');
      expect(THEME.colors.surface).toBe('#171224');
      expect(THEME.colors.surfaceMuted).toBe('#221B36');
      expect(THEME.colors.text).toBe('#FAFAFA');
      expect(THEME.colors.textMuted).toBe('#C5B8EA');
      expect(THEME.colors.border).toBe('#3E2C6A');
      expect(THEME.colors.borderStrong).toBe('#6D52AB');
      expect(THEME.colors.ring).toBe('#A58CF4');
    });

    it('verifies index.css defines Deep Purple tokens in :root for universal storefront and admin application', () => {
      const cssContent = fs.readFileSync(path.join(clientDir, 'src', 'index.css'), 'utf-8');

      expect(cssContent).toContain('--axdoro-bg: #0D0D0D;');
      expect(cssContent).toContain('--axdoro-surface: #171224;');
      expect(cssContent).toContain('--axdoro-surface-muted: #221B36;');
      expect(cssContent).toContain('--axdoro-text: #FAFAFA;');
      expect(cssContent).toContain('--axdoro-text-muted: #C5B8EA;');
      expect(cssContent).toContain('--axdoro-charcoal: #FAFAFA;');
      expect(cssContent).toContain('--axdoro-purple: #433075;');
      expect(cssContent).toContain('--axdoro-accent: #A58CF4;');
      expect(cssContent).toContain('--axdoro-accent-muted: #BBA6F7;');
      expect(cssContent).toContain('--axdoro-accent-subtle: #261A42;');
      expect(cssContent).toContain('--axdoro-border: #3E2C6A;');
      expect(cssContent).toContain('--axdoro-border-strong: #6D52AB;');
      expect(cssContent).toContain('--axdoro-ring: #A58CF4;');
    });

    it('verifies action buttons and dark canvas hover adaptations in index.css', () => {
      const cssContent = fs.readFileSync(path.join(clientDir, 'src', 'index.css'), 'utf-8');

      expect(cssContent).toContain('.bg-axdoro-charcoal {');
      expect(cssContent).toContain('background-color: #433075;');
      expect(cssContent).toContain('.bg-axdoro-charcoal:hover {');
      expect(cssContent).toContain('background-color: #553E92;');
      expect(cssContent).toContain('.hover\\:text-black:hover {');
      expect(cssContent).toContain('color: var(--axdoro-accent) !important;');
    });
  });

  describe('Complete Removal of Temporary Preview Functionality', () => {
    it('confirms ThemePreviewSwitcher.tsx component has been deleted', () => {
      const switcherPath = path.join(clientDir, 'src', 'components', 'ThemePreviewSwitcher.tsx');
      expect(fs.existsSync(switcherPath)).toBe(false);
    });

    it('confirms Navbar.tsx does not contain ThemePreviewSwitcher or theme switcher props', () => {
      const navbarContent = fs.readFileSync(
        path.join(clientDir, 'src', 'components', 'Navbar.tsx'),
        'utf-8'
      );

      expect(navbarContent).not.toContain('ThemePreviewSwitcher');
      expect(navbarContent).not.toContain('currentTheme');
      expect(navbarContent).not.toContain('onSelectTheme');
      expect(navbarContent).not.toContain('effectiveTheme');
      expect(navbarContent).not.toContain('axdoro_theme_preview');
    });

    it('confirms Footer.tsx does not contain theme switcher props', () => {
      const footerContent = fs.readFileSync(
        path.join(clientDir, 'src', 'components', 'Footer.tsx'),
        'utf-8'
      );

      expect(footerContent).not.toContain('currentTheme');
      expect(footerContent).not.toContain('effectiveTheme');
      expect(footerContent).not.toContain('axdoro_theme_preview');
    });

    it('confirms index.html does not contain theme-preview localStorage script', () => {
      const htmlContent = fs.readFileSync(path.join(clientDir, 'index.html'), 'utf-8');

      expect(htmlContent).not.toContain('axdoro_theme_preview');
      expect(htmlContent).not.toContain('midnight-neon');
      expect(htmlContent).not.toContain('ice-white');
      expect(htmlContent).toContain('<meta name="theme-color" content="#0D0D0D" />');
    });

    it('confirms index.css does not contain Theme B or Theme C schemas or the old admin isolation guard', () => {
      const cssContent = fs.readFileSync(path.join(clientDir, 'src', 'index.css'), 'utf-8');

      expect(cssContent).not.toContain("[data-theme='midnight-neon']");
      expect(cssContent).not.toContain("[data-theme='ice-white']");
      expect(cssContent).not.toContain("[data-theme='deep-purple']");
      expect(cssContent).not.toContain('.admin-portal');
      expect(cssContent).not.toContain('[data-admin-root]');
    });
  });

  describe('Storefront and Admin Visual Consistency', () => {
    it('verifies white logo asset exists and is used across both storefront and admin views', () => {
      const logoWhitePath = path.join(clientDir, 'public', 'logo-white.png');
      expect(fs.existsSync(logoWhitePath)).toBe(true);

      const navbarContent = fs.readFileSync(
        path.join(clientDir, 'src', 'components', 'Navbar.tsx'),
        'utf-8'
      );
      expect(navbarContent).toContain('src="/logo-white.png"');

      const footerContent = fs.readFileSync(
        path.join(clientDir, 'src', 'components', 'Footer.tsx'),
        'utf-8'
      );
      expect(footerContent).toContain('src="/logo-white.png"');

      const adminLoginContent = fs.readFileSync(
        path.join(clientDir, 'src', 'components', 'admin', 'AdminLoginView.tsx'),
        'utf-8'
      );
      expect(adminLoginContent).toContain('src="/logo-white.png"');

      const adminSidebarContent = fs.readFileSync(
        path.join(clientDir, 'src', 'components', 'admin', 'AdminSidebar.tsx'),
        'utf-8'
      );
      expect(adminSidebarContent).toContain('src="/logo-white.png"');
    });

    it('verifies product photography integrity rules remain strictly enforced', () => {
      const cssContent = fs.readFileSync(path.join(clientDir, 'src', 'index.css'), 'utf-8');

      expect(cssContent).toContain('filter: none !important;');
      expect(cssContent).toContain('mix-blend-mode: normal !important;');
      expect(cssContent).toContain('opacity: 1 !important;');
    });
  });

  describe('WCAG 2.2 Color Contrast Compliance (AA & AAA)', () => {
    it('validates Soft White (#FAFAFA) on Jet Black (#0D0D0D) canvas exceeds AA (4.5:1) and AAA (7.0:1)', () => {
      const ratio = contrastRatio('#FAFAFA', '#0D0D0D');
      expect(ratio).toBeGreaterThanOrEqual(18.0); // 18.65:1 (AAA passes)
    });

    it('validates Soft White (#FAFAFA) on Deep Purple (#433075) button exceeds AA (4.5:1) and AAA (7.0:1)', () => {
      const ratio = contrastRatio('#FAFAFA', '#433075');
      expect(ratio).toBeGreaterThanOrEqual(10.0); // 10.39:1 (AAA passes)
    });

    it('validates Lavender accent (#A58CF4) on Jet Black (#0D0D0D) canvas exceeds AA (4.5:1) and AAA (7.0:1)', () => {
      const ratio = contrastRatio('#A58CF4', '#0D0D0D');
      expect(ratio).toBeGreaterThanOrEqual(7.0); // 7.11:1 (AAA passes)
    });

    it('validates Lavender accent (#A58CF4) on Deep Purple surface (#171224) exceeds AA (4.5:1)', () => {
      const ratio = contrastRatio('#A58CF4', '#171224');
      expect(ratio).toBeGreaterThanOrEqual(4.5); // 6.44:1 (AA passes)
    });

    it('validates Lavender tint text (#C5B8EA) on Jet Black (#0D0D0D) canvas exceeds AA (4.5:1) and AAA (7.0:1)', () => {
      const ratio = contrastRatio('#C5B8EA', '#0D0D0D');
      expect(ratio).toBeGreaterThanOrEqual(10.0); // 10.57:1 (passes AAA 7.0:1)
    });

    it('validates focus ring (#A58CF4) against Jet Black (#0D0D0D) exceeds WCAG 2.2 non-text contrast (3.0:1)', () => {
      const ratio = contrastRatio('#A58CF4', '#0D0D0D');
      expect(ratio).toBeGreaterThanOrEqual(3.0); // 7.11:1 (passes 3:1)
    });

    it('validates form control boundary (#6D52AB) against Jet Black (#0D0D0D) exceeds WCAG 2.2 non-text contrast (3.0:1)', () => {
      const ratio = contrastRatio('#6D52AB', '#0D0D0D');
      expect(ratio).toBeGreaterThanOrEqual(3.0); // 3.25:1 (passes 3:1)
    });
  });
});
