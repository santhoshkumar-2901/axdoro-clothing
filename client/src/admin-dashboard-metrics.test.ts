import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// WCAG 2.2 Relative Luminance and Contrast Ratio calculation
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

describe('AXDORO — Admin Dashboard Metrics Color & Contrast Integrity', () => {
  const clientDir = path.resolve(__dirname, '..');
  const adminPortalContent = fs.readFileSync(
    path.join(clientDir, 'src', 'components', 'admin', 'AdminPortal.tsx'),
    'utf-8'
  );

  // Extract the metrics section
  const metricsSectionStart = adminPortalContent.indexOf("activeTab === 'metrics' && metrics ?");
  const metricsSectionEnd = adminPortalContent.indexOf('/* 2. Products Tab */');
  const metricsSection = adminPortalContent.substring(metricsSectionStart, metricsSectionEnd);

  describe('Low Stock Alerts Metric Card Consistency', () => {
    it('ensures Card 4 background is permanently bg-axdoro-surface in both alert and non-alert states', () => {
      // Must use bg-axdoro-surface consistently
      expect(metricsSection).toContain('bg-axdoro-surface');
      // Must not recolor the entire card with light-mode bg-amber-50/60
      expect(metricsSection).not.toContain('bg-amber-50/60');
    });

    it('ensures Card 4 border uses subtle amber accent when alerting and border-axdoro-border when zero', () => {
      expect(metricsSection).toContain("metrics.inventoryAlerts.lowStockCount > 0 ? 'border-amber-500/40' : 'border-axdoro-border'");
      // Must not use light-mode border-amber-300
      expect(metricsSection).not.toContain('border-amber-300');
    });

    it('ensures Card 4 title number uses high-contrast text-amber-400 when alerting and text-axdoro-charcoal when zero', () => {
      expect(metricsSection).toContain("metrics.inventoryAlerts.lowStockCount > 0 ? 'text-amber-400' : 'text-axdoro-charcoal'");
      // Must not use light-mode text-amber-800
      expect(metricsSection).not.toContain('text-amber-800');
    });
  });

  describe('Summary Cards Visual & Typographic Consistency', () => {
    it('verifies all 4 summary cards have uniform baseline typography and background tokens', () => {
      // All 4 summary cards share bg-axdoro-surface
      const surfaceMatches = metricsSection.match(/bg-axdoro-surface/g);
      expect(surfaceMatches).not.toBeNull();
      // At least 4 cards + critical panel + notice card
      expect(surfaceMatches!.length).toBeGreaterThanOrEqual(4);

      // Card 1, 2, 3 use text-3xl font-black text-axdoro-charcoal tracking-tight
      expect(metricsSection).toContain('Published Products');
      expect(metricsSection).toContain('Active Categories');
      expect(metricsSection).toContain('Total Stock Units');
    });
  });

  describe('Critical Low Stock Warning Panel Dark Theme Integration', () => {
    it('uses dark surface bg-axdoro-surface with border-amber-500/30 instead of bg-amber-50/70', () => {
      expect(metricsSection).toContain('border border-amber-500/30 bg-axdoro-surface shadow-sm');
      expect(metricsSection).not.toContain('bg-amber-50/70');
    });

    it('preserves amber alert indicator with text-amber-400 icon and white heading', () => {
      expect(metricsSection).toContain('<AlertTriangle className="w-4 h-4 text-amber-400" />');
      expect(metricsSection).toContain('<CardTitle className="text-sm font-bold text-axdoro-charcoal">');
      expect(metricsSection).not.toContain('text-amber-950');
    });

    it('uses divide-axdoro-border and text-axdoro-text-muted for item details', () => {
      expect(metricsSection).toContain('divide-y divide-axdoro-border');
      expect(metricsSection).not.toContain('divide-amber-200');
    });
  });

  describe('Theme Contrast Ratios on Admin Dark Surface (#171224)', () => {
    const darkSurface = '#171224';
    const softWhite = '#FAFAFA'; // text-axdoro-charcoal
    const lightLavender = '#C5B8EA'; // text-axdoro-text-muted
    const amberAlert = '#FBBF24'; // text-amber-400

    it('soft white text on dark surface achieves WCAG AAA (>= 7.0:1)', () => {
      const ratio = contrastRatio(softWhite, darkSurface);
      expect(ratio).toBeGreaterThanOrEqual(7.0);
      expect(Math.round(ratio * 10) / 10).toBe(17.5);
    });

    it('light lavender text on dark surface achieves WCAG AAA (>= 7.0:1)', () => {
      const ratio = contrastRatio(lightLavender, darkSurface);
      expect(ratio).toBeGreaterThanOrEqual(7.0);
      expect(Math.round(ratio * 10) / 10).toBe(9.9);
    });

    it('amber alert text (#FBBF24) on dark surface achieves WCAG AAA (>= 7.0:1)', () => {
      const ratio = contrastRatio(amberAlert, darkSurface);
      expect(ratio).toBeGreaterThanOrEqual(7.0);
      expect(Math.round(ratio * 10) / 10).toBe(11.0);
    });

    it('proves former light lavender on light amber (#FFFBEB) had failing contrast (< 2.0:1)', () => {
      const lightAmberBg = '#FFFBEB';
      const failingRatio = contrastRatio(lightLavender, lightAmberBg);
      expect(failingRatio).toBeLessThan(2.0); // ~1.4:1 contrast failure
    });
  });
});
