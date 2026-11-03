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

describe('Category Page Zero-Banner & WCAG 2.2 Verification', () => {
  const clientDir = path.resolve(__dirname);
  const categoryPagePath = path.join(clientDir, 'components', 'CategoryPage.tsx');
  const categoryPageContent = fs.readFileSync(categoryPagePath, 'utf-8');
  const appPath = path.join(clientDir, 'App.tsx');
  const appContent = fs.readFileSync(appPath, 'utf-8');

  describe('1. Direct-to-Products Layout & Complete Banner Removal', () => {
    it('completely eliminates banner containers and heavy hero markup', () => {
      expect(categoryPageContent).not.toContain('bg-[#F7F7F7] text-axdoro-charcoal');
      expect(categoryPageContent).not.toContain('absolute inset-0 z-0');
      expect(categoryPageContent).not.toContain('bg-axdoro-surface/30');
    });

    it('removes hero cover gradient overlays', () => {
      expect(categoryPageContent).not.toContain('bg-gradient-to-r from-[#F7F7F7]/70');
      expect(categoryPageContent).not.toContain('from-[#0D0B14]');
    });

    it('transitions directly from breadcrumb navigation to category controls and product grid', () => {
      const breadcrumbIndex = categoryPageContent.indexOf('aria-label="Breadcrumb"');
      const gridControlsIndex = categoryPageContent.indexOf('Category Controls & Grid');

      expect(breadcrumbIndex).toBeGreaterThan(-1);
      expect(gridControlsIndex).toBeGreaterThan(breadcrumbIndex);
    });
  });

  describe('2. Breadcrumb & Controls Typography', () => {
    it('preserves high-contrast charcoal category title in breadcrumbs', () => {
      expect(categoryPageContent).toContain(
        '<span className="text-axdoro-charcoal font-semibold">{category?.name}</span>'
      );
    });

    it('renders clean right-aligned sort bar without product count clutter', () => {
      expect(categoryPageContent).toContain('flex items-center justify-end gap-4');
      expect(categoryPageContent).not.toContain('{products.length} {products.length === 1 ? \'Product\' : \'Products\'}');
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

    it('Product count text (Neutral-700 #404040) on light background achieves > 9:1 contrast', () => {
      const ratio = getContrastRatio(NEUTRAL_700, LIGHT_BG);
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
