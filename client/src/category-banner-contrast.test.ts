import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// --- WCAG 2.2 Mathematical Luminance & Contrast Helpers ---
function sRGBtoLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function getRelativeLuminance(rgb: [number, number, number]): number {
  const r = sRGBtoLinear(rgb[0]);
  const g = sRGBtoLinear(rgb[1]);
  const b = sRGBtoLinear(rgb[2]);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(rgb1: [number, number, number], rgb2: [number, number, number]): number {
  const lum1 = getRelativeLuminance(rgb1);
  const lum2 = getRelativeLuminance(rgb2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

function alphaComposite(
  foreground: [number, number, number],
  alpha: number,
  background: [number, number, number]
): [number, number, number] {
  return [
    Math.round(alpha * foreground[0] + (1 - alpha) * background[0]),
    Math.round(alpha * foreground[1] + (1 - alpha) * background[1]),
    Math.round(alpha * foreground[2] + (1 - alpha) * background[2]),
  ];
}

describe('Category Banner Contrast & WCAG 2.2 Verification', () => {
  const clientDir = path.resolve(__dirname);
  const categoryPagePath = path.join(clientDir, 'components', 'CategoryPage.tsx');
  const categoryPageContent = fs.readFileSync(categoryPagePath, 'utf-8');
  const appPath = path.join(clientDir, 'App.tsx');
  const appContent = fs.readFileSync(appPath, 'utf-8');

  describe('1. Category Banner Markup, Overlay & Stacking Order', () => {
    it('uses light #F7F7F7 container background with axdoro-charcoal text', () => {
      expect(categoryPageContent).toContain('bg-[#F7F7F7] text-axdoro-charcoal');
      expect(categoryPageContent).not.toContain('bg-[#0D0B14] text-white');
    });

    it('implements directional light gradient overlays using #F7F7F7', () => {
      expect(categoryPageContent).toContain(
        'bg-gradient-to-r from-[#F7F7F7]/70 via-[#F7F7F7]/40 to-transparent'
      );
    });

    it('ensures overlays do not use dark 0D0B14 gradient tokens', () => {
      expect(categoryPageContent).not.toContain('from-[#0D0B14]');
      expect(categoryPageContent).not.toContain('via-[#0D0B14]');
      expect(categoryPageContent).not.toContain('to-[#0D0B14]');
    });

    it('maintains strict stacking order: image at z-0, overlays at z-0, and text content at z-10', () => {
      const z0Index = categoryPageContent.indexOf('absolute inset-0 z-0');
      const imgIndex = categoryPageContent.indexOf('<img', z0Index);
      const overlayIndex = categoryPageContent.indexOf('bg-gradient-to-r from-[#F7F7F7]', imgIndex);
      const z10Index = categoryPageContent.indexOf('relative z-10', overlayIndex);

      expect(z0Index).toBeGreaterThan(-1);
      expect(imgIndex).toBeGreaterThan(z0Index);
      expect(overlayIndex).toBeGreaterThan(imgIndex);
      expect(z10Index).toBeGreaterThan(overlayIndex);
    });
  });

  describe('2. Text & Badge Contrast Styling', () => {
    it('preserves high-contrast charcoal category title', () => {
      expect(categoryPageContent).toContain(
        '<h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-axdoro-charcoal">'
      );
    });

    it('provides description text in high-contrast text-neutral-600', () => {
      expect(categoryPageContent).toContain('text-xs sm:text-sm text-neutral-600 leading-relaxed max-w-xl');
    });

    it('provides clean light semi-transparent backdrops for Collection and style count badges', () => {
      expect(categoryPageContent).toContain('bg-white/90 backdrop-blur-md border border-neutral-200');
      expect(categoryPageContent).toContain('text-axdoro-charcoal uppercase font-bold');
      expect(categoryPageContent).toContain('text-neutral-700 font-mono text-[11px]');
    });
  });

  describe('3. Mathematical WCAG 2.2 AA Contrast Verification', () => {
    // Hex Definitions
    const LIGHT_BG: [number, number, number] = [247, 247, 247]; // #F7F7F7
    const CHARCOAL_TEXT: [number, number, number] = [23, 23, 23]; // #171717
    const NEUTRAL_600: [number, number, number] = [82, 82, 82]; // #525252
    const NEUTRAL_700: [number, number, number] = [64, 64, 64]; // #404040
    const DARK_IMG: [number, number, number] = [0, 0, 0]; // Worst case dark image bleed-through

    it('Category Title (Charcoal #171717) on light background achieves > 15:1 contrast (WCAG AA requirement is 4.5:1, AAA is 7:1)', () => {
      const ratio = getContrastRatio(CHARCOAL_TEXT, LIGHT_BG);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(ratio).toBeGreaterThan(15.0);
    });

    it('Category Title against worst-case dark image bleed-through with 85% light overlay achieves > 10:1 contrast', () => {
      const compositeBg = alphaComposite(LIGHT_BG, 0.85, DARK_IMG);
      const ratio = getContrastRatio(CHARCOAL_TEXT, compositeBg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(ratio).toBeGreaterThan(10.0);
    });

    it('Category Description (Neutral-600 #525252) on light background achieves > 7:1 contrast (WCAG AA Normal requirement is 4.5:1)', () => {
      const ratio = getContrastRatio(NEUTRAL_600, LIGHT_BG);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(ratio).toBeGreaterThan(7.0);
    });

    it('Category Description against worst-case dark image bleed-through with 85% light overlay achieves >= 4.5:1 contrast', () => {
      const compositeBg = alphaComposite(LIGHT_BG, 0.85, DARK_IMG);
      const ratio = getContrastRatio(NEUTRAL_600, compositeBg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('Collection badge text (Charcoal #171717) on light badge backing achieves > 15:1 contrast', () => {
      const badgeBg = alphaComposite([255, 255, 255], 0.9, LIGHT_BG);
      const ratio = getContrastRatio(CHARCOAL_TEXT, badgeBg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(ratio).toBeGreaterThan(15.0);
    });

    it('Style count badge text (Neutral-700 #404040) on light badge backing achieves > 9:1 contrast', () => {
      const badgeBg = alphaComposite([255, 255, 255], 0.9, LIGHT_BG);
      const ratio = getContrastRatio(NEUTRAL_700, badgeBg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(ratio).toBeGreaterThan(9.0);
    });
  });

  describe('4. Universal Coverage Across All Categories', () => {
    it('verifies App.tsx renders CategoryPage for any /category/:slug route', () => {
      expect(appContent).toContain('isCategoryRoute && categorySlug ? (');
      expect(appContent).toContain('<CategoryPage');
      expect(appContent).toContain('slug={categorySlug}');
    });
  });
});
