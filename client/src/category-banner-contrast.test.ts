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
    it('uses dark #0D0B14 container background rather than inverted axdoro-charcoal', () => {
      expect(categoryPageContent).toContain('bg-[#0D0B14] text-white');
      expect(categoryPageContent).not.toContain('bg-axdoro-charcoal text-white');
    });

    it('implements directional dark gradient overlays using #0D0B14', () => {
      expect(categoryPageContent).toContain(
        'bg-gradient-to-r from-[#0D0B14] via-[#0D0B14]/85 to-[#0D0B14]/40'
      );
      expect(categoryPageContent).toContain(
        'bg-gradient-to-t from-[#0D0B14] via-transparent to-transparent opacity-80'
      );
    });

    it('ensures overlays do not use light axdoro-charcoal gradient tokens', () => {
      expect(categoryPageContent).not.toContain('from-axdoro-charcoal');
      expect(categoryPageContent).not.toContain('via-axdoro-charcoal');
      expect(categoryPageContent).not.toContain('to-axdoro-charcoal');
    });

    it('maintains strict stacking order: image at z-0, overlays at z-0, and text content at z-10', () => {
      const z0Index = categoryPageContent.indexOf('absolute inset-0 z-0');
      const imgIndex = categoryPageContent.indexOf('<img', z0Index);
      const overlayIndex = categoryPageContent.indexOf('bg-gradient-to-r from-[#0D0B14]', imgIndex);
      const z10Index = categoryPageContent.indexOf('relative z-10', overlayIndex);

      expect(z0Index).toBeGreaterThan(-1);
      expect(imgIndex).toBeGreaterThan(z0Index);
      expect(overlayIndex).toBeGreaterThan(imgIndex);
      expect(z10Index).toBeGreaterThan(overlayIndex);
    });
  });

  describe('2. Text & Badge Contrast Styling', () => {
    it('preserves high-contrast white category title', () => {
      expect(categoryPageContent).toContain(
        '<h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white">'
      );
    });

    it('upgrades description text to high-contrast text-zinc-200', () => {
      expect(categoryPageContent).toContain('text-xs sm:text-sm text-zinc-200 leading-relaxed max-w-xl');
      expect(categoryPageContent).not.toContain('text-zinc-300 leading-relaxed max-w-xl');
    });

    it('provides dark semi-transparent backdrops for Collection and style count badges', () => {
      expect(categoryPageContent).toContain('bg-black/50 backdrop-blur-md border border-white/10');
      expect(categoryPageContent).toContain('text-axdoro-accent uppercase font-bold');
      expect(categoryPageContent).toContain('text-zinc-200 font-mono text-[11px]');
    });
  });

  describe('3. Mathematical WCAG 2.2 AA Contrast Verification', () => {
    // Hex Definitions
    const DARK_BG: [number, number, number] = [13, 11, 20]; // #0D0B14
    const WHITE_TEXT: [number, number, number] = [255, 255, 255]; // #FFFFFF
    const ZINC_200: [number, number, number] = [228, 228, 231]; // #E4E4E7
    const ACCENT_LAVENDER: [number, number, number] = [165, 140, 244]; // #A58CF4 (--axdoro-accent)
    const PURE_WHITE_IMG: [number, number, number] = [255, 255, 255]; // Worst case bright image highlight

    it('Category Title (White #FFFFFF) on dark background achieves > 18:1 contrast (WCAG AA Large requirement is 3.0:1)', () => {
      const ratio = getContrastRatio(WHITE_TEXT, DARK_BG);
      expect(ratio).toBeGreaterThanOrEqual(3.0);
      expect(ratio).toBeGreaterThan(18.0);
    });

    it('Category Title against worst-case 100% white image bleed-through with 85% dark overlay achieves > 4.5:1 contrast', () => {
      const compositeBg = alphaComposite(DARK_BG, 0.85, PURE_WHITE_IMG);
      const ratio = getContrastRatio(WHITE_TEXT, compositeBg);
      expect(ratio).toBeGreaterThanOrEqual(3.0);
      expect(ratio).toBeGreaterThan(4.5);
    });

    it('Category Description (Zinc-200 #E4E4E7) on dark background achieves > 14:1 contrast (WCAG AA Normal requirement is 4.5:1)', () => {
      const ratio = getContrastRatio(ZINC_200, DARK_BG);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(ratio).toBeGreaterThan(14.0);
    });

    it('Category Description against worst-case white image bleed-through with 85% dark overlay achieves >= 4.5:1 contrast', () => {
      const compositeBg = alphaComposite(DARK_BG, 0.85, PURE_WHITE_IMG);
      const ratio = getContrastRatio(ZINC_200, compositeBg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('Collection badge text (Lavender #A58CF4) on dark badge backing achieves > 7:1 contrast (WCAG AA Normal requirement is 4.5:1)', () => {
      const badgeBg = alphaComposite([0, 0, 0], 0.5, DARK_BG);
      const ratio = getContrastRatio(ACCENT_LAVENDER, badgeBg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(ratio).toBeGreaterThan(7.0);
    });

    it('Style count badge text (Zinc-200 #E4E4E7) on dark badge backing achieves > 15:1 contrast (WCAG AA requirement is 4.5:1)', () => {
      const badgeBg = alphaComposite([0, 0, 0], 0.5, DARK_BG);
      const ratio = getContrastRatio(ZINC_200, badgeBg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(ratio).toBeGreaterThan(15.0);
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
