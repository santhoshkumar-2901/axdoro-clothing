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
    it('defines exact Light Luxury design tokens in lib/theme.ts', () => {
      expect(THEME.id).toBe('light-luxury');
      expect(THEME.name).toBe('Light Luxury');
      expect(THEME.colors.primary).toBe('#171717');
      expect(THEME.colors.accent).toBe('#171717');
      expect(THEME.colors.accentMuted).toBe('#525252');
      expect(THEME.colors.accentSubtle).toBe('#F3F4F6');
      expect(THEME.colors.background).toBe('#FFFFFF');
      expect(THEME.colors.surface).toBe('#FFFFFF');
      expect(THEME.colors.surfaceMuted).toBe('#F7F7F7');
      expect(THEME.colors.text).toBe('#171717');
      expect(THEME.colors.textMuted).toBe('#666666');
      expect(THEME.colors.border).toBe('#E5E5E5');
      expect(THEME.colors.borderStrong).toBe('#D4D4D4');
      expect(THEME.colors.ring).toBe('#171717');
    });

    it('verifies index.css defines Light Luxury tokens in :root for universal storefront and admin application', () => {
      const cssContent = fs.readFileSync(path.join(clientDir, 'src', 'index.css'), 'utf-8');

      expect(cssContent).toContain('--axdoro-bg: #FFFFFF;');
      expect(cssContent).toContain('--axdoro-surface: #FFFFFF;');
      expect(cssContent).toContain('--axdoro-surface-muted: #F7F7F7;');
      expect(cssContent).toContain('--axdoro-text: #171717;');
      expect(cssContent).toContain('--axdoro-text-muted: #666666;');
      expect(cssContent).toContain('--axdoro-charcoal: #171717;');
      expect(cssContent).toContain('--axdoro-purple: #171717;');
      expect(cssContent).toContain('--axdoro-accent: #171717;');
      expect(cssContent).toContain('--axdoro-accent-muted: #525252;');
      expect(cssContent).toContain('--axdoro-accent-subtle: #F3F4F6;');
      expect(cssContent).toContain('--axdoro-border: #E5E5E5;');
      expect(cssContent).toContain('--axdoro-border-strong: #D4D4D4;');
      expect(cssContent).toContain('--axdoro-ring: #171717;');
    });

    it('verifies action buttons and dark canvas hover adaptations in index.css', () => {
      const cssContent = fs.readFileSync(path.join(clientDir, 'src', 'index.css'), 'utf-8');

      expect(cssContent).toContain('.bg-axdoro-charcoal {');
      expect(cssContent).toContain('background-color: #171717;');
      expect(cssContent).toContain('.bg-axdoro-charcoal:hover {');
      expect(cssContent).toContain('background-color: #2E2E2E;');
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
      expect(htmlContent).toContain('<meta name="theme-color" content="#FFFFFF" />');
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
    it('verifies transparent logo asset exists and is used across both storefront and admin views', () => {
      const logoTransparentPath = path.join(clientDir, 'public', 'logo-transparent.png');
      expect(fs.existsSync(logoTransparentPath)).toBe(true);

      const navbarContent = fs.readFileSync(
        path.join(clientDir, 'src', 'components', 'Navbar.tsx'),
        'utf-8'
      );
      expect(navbarContent).toContain('src="/logo-dark.png"');

      const footerContent = fs.readFileSync(
        path.join(clientDir, 'src', 'components', 'Footer.tsx'),
        'utf-8'
      );
      expect(footerContent).toContain('src="/logo-dark.png"');

      const adminLoginContent = fs.readFileSync(
        path.join(clientDir, 'src', 'components', 'admin', 'AdminLoginView.tsx'),
        'utf-8'
      );
      expect(adminLoginContent).toContain('src="/logo-dark.png"');

      const adminSidebarContent = fs.readFileSync(
        path.join(clientDir, 'src', 'components', 'admin', 'AdminSidebar.tsx'),
        'utf-8'
      );
      expect(adminSidebarContent).toContain('src="/logo-dark.png"');
    });

    it('verifies product photography integrity rules remain strictly enforced', () => {
      const cssContent = fs.readFileSync(path.join(clientDir, 'src', 'index.css'), 'utf-8');

      expect(cssContent).toContain('filter: none !important;');
      expect(cssContent).toContain('mix-blend-mode: normal !important;');
      expect(cssContent).toContain('opacity: 1 !important;');
    });
  });

  describe('WCAG 2.2 Color Contrast Compliance (AA & AAA)', () => {
    it('validates Near-Black (#171717) on White (#FFFFFF) canvas exceeds AA (4.5:1) and AAA (7.0:1)', () => {
      const ratio = contrastRatio('#171717', '#FFFFFF');
      expect(ratio).toBeGreaterThanOrEqual(17.0); // 17.93:1 (AAA passes)
    });

    it('validates White text (#FFFFFF) on Charcoal/Black (#171717) button exceeds AA (4.5:1) and AAA (7.0:1)', () => {
      const ratio = contrastRatio('#FFFFFF', '#171717');
      expect(ratio).toBeGreaterThanOrEqual(17.0); // 17.93:1 (AAA passes)
    });

    it('validates Neutral Grey text (#666666) on White (#FFFFFF) canvas exceeds AA (4.5:1)', () => {
      const ratio = contrastRatio('#666666', '#FFFFFF');
      expect(ratio).toBeGreaterThanOrEqual(5.5); // 5.74:1 (AA passes)
    });

    it('validates Neutral Accent Muted (#525252) on White (#FFFFFF) canvas exceeds AA (4.5:1) and AAA (7.0:1)', () => {
      const ratio = contrastRatio('#525252', '#FFFFFF');
      expect(ratio).toBeGreaterThanOrEqual(7.5); // 7.81:1 (AAA passes)
    });

    it('validates focus ring (#171717) against White (#FFFFFF) canvas exceeds WCAG 2.2 non-text contrast (3.0:1)', () => {
      const ratio = contrastRatio('#171717', '#FFFFFF');
      expect(ratio).toBeGreaterThanOrEqual(3.0); // 17.93:1 (passes 3:1)
    });
  });
});
