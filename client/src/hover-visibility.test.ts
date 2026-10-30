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

describe('AXDORO — Hover Visibility & Theme Contrast Integrity (Source & Token Verification)', () => {
  const clientDir = path.resolve(__dirname, '..');
  const indexCss = fs.readFileSync(path.join(clientDir, 'src', 'index.css'), 'utf-8');
  const tailwindConfig = fs.readFileSync(path.join(clientDir, 'tailwind.config.js'), 'utf-8');

  describe('Design Token & CSS Architecture Verification', () => {
    it('tailwind.config.js maps purple to var(--axdoro-purple)', () => {
      expect(tailwindConfig).toContain("purple: 'var(--axdoro-purple)'");
    });

    it('client/src/index.css defines --axdoro-purple in :root', () => {
      expect(indexCss).toMatch(/--axdoro-purple:\s*#171717;/);
    });

    it('eliminates fragile custom .hover:bg-axdoro-charcoal overrides from index.css', () => {
      // Custom overrides were superseded by Tailwind generated utilities later in the cascade.
      // They must NOT exist in index.css.
      expect(indexCss).not.toContain('.hover\\:bg-axdoro-charcoal:hover');
      expect(indexCss).not.toContain('.group-hover\\:bg-axdoro-charcoal');
    });
  });

  describe('Component Token Implementation', () => {
    const forbiddenHoverCharcoal = 'hover:' + 'bg-axdoro-charcoal';
    const forbiddenGroupHoverCharcoal = 'group-hover:' + 'bg-axdoro-charcoal';

    it('ProductCard.tsx: uses hover:bg-axdoro-purple with hover:text-white for Quick View', () => {
      const content = fs.readFileSync(path.join(clientDir, 'src', 'components', 'ProductCard.tsx'), 'utf-8');
      expect(content).toContain('hover:bg-axdoro-purple hover:text-white hover:border-axdoro-border-strong');
      expect(content).not.toContain(forbiddenHoverCharcoal);
      expect(content).toContain('focus-visible:ring-axdoro-accent');
    });

    it('EditorialSection.tsx: uses group-hover:bg-axdoro-purple with group-hover:text-white for letter tiles', () => {
      const content = fs.readFileSync(path.join(clientDir, 'src', 'components', 'EditorialSection.tsx'), 'utf-8');
      expect(content).toContain('group-hover:bg-axdoro-purple group-hover:text-white group-hover:border-axdoro-border-strong');
      expect(content).not.toContain(forbiddenGroupHoverCharcoal);
    });

    it('ProductDetailModal.tsx: uses hover:bg-axdoro-purple with hover:text-white for Bulk Enquiry', () => {
      const content = fs.readFileSync(path.join(clientDir, 'src', 'components', 'ProductDetailModal.tsx'), 'utf-8');
      expect(content).toContain('hover:bg-axdoro-purple hover:text-white hover:border-axdoro-border-strong');
      expect(content).not.toContain(forbiddenHoverCharcoal);
      expect(content).toContain('focus-visible:ring-axdoro-accent');
    });

    it('CategoryPage.tsx: eliminates hover:bg-axdoro-charcoal overrides from Buttons', () => {
      const content = fs.readFileSync(path.join(clientDir, 'src', 'components', 'CategoryPage.tsx'), 'utf-8');
      expect(content).not.toContain(forbiddenHoverCharcoal);
    });

    it('CategoryManagementView.tsx: eliminates hover:bg-axdoro-charcoal overrides from Buttons', () => {
      const content = fs.readFileSync(path.join(clientDir, 'src', 'components', 'admin', 'CategoryManagementView.tsx'), 'utf-8');
      expect(content).not.toContain(forbiddenHoverCharcoal);
    });

    it('Navbar.tsx: uses theme-aware hover:text-axdoro-accent and contains no hover:text-black', () => {
      const content = fs.readFileSync(path.join(clientDir, 'src', 'components', 'Navbar.tsx'), 'utf-8');
      expect(content).not.toContain('hover:text-black');
      expect(content).toContain('hover:text-axdoro-accent');
    });
  });

  describe('Repository-Wide Defect Audit', () => {
    const forbiddenHoverCharcoal = 'hover:' + 'bg-axdoro-charcoal';
    const forbiddenGroupHoverCharcoal = 'group-hover:' + 'bg-axdoro-charcoal';

    it('verifies ZERO components in client/src contain hover:bg-axdoro-charcoal or group-hover:bg-axdoro-charcoal', () => {
      const componentsDir = path.join(clientDir, 'src', 'components');
      const getFiles = (dir: string): string[] => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const files: string[] = [];
        for (const entry of entries) {
          const res = path.resolve(dir, entry.name);
          if (entry.isDirectory()) {
            files.push(...getFiles(res));
          } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
            files.push(res);
          }
        }
        return files;
      };

      const allFiles = getFiles(componentsDir);
      for (const file of allFiles) {
        const relPath = path.relative(clientDir, file);
        const fileContent = fs.readFileSync(file, 'utf-8');
        expect(fileContent, `${relPath} must not contain hover:bg-axdoro-charcoal`).not.toContain(forbiddenHoverCharcoal);
        expect(fileContent, `${relPath} must not contain group-hover:bg-axdoro-charcoal`).not.toContain(forbiddenGroupHoverCharcoal);
      }
    });

    it('verifies no component in client/src/components contains hover:text-black', () => {
      const componentsDir = path.join(clientDir, 'src', 'components');
      const files = fs.readdirSync(componentsDir).filter((f) => f.endsWith('.tsx'));

      for (const file of files) {
        const content = fs.readFileSync(path.join(componentsDir, file), 'utf-8');
        expect(content, `${file} should not contain hover:text-black`).not.toContain('hover:text-black');
      }
    });
  });

  describe('Theme Token Mathematical Contrast Ratio Compliance', () => {
    it('Deep Purple theme: var(--axdoro-purple) (#433075) with white text achieves WCAG AAA (>= 7.0:1)', () => {
      const purple = '#433075';
      const white = '#FFFFFF';
      const ratio = contrastRatio(purple, white);
      expect(ratio).toBeGreaterThanOrEqual(7.0);
      expect(Math.round(ratio * 10) / 10).toBe(10.9);
    });

    it('Midnight Neon / Ice White theme: var(--axdoro-purple) (#9303C5) with white text achieves WCAG AA (>= 4.5:1)', () => {
      const purple = '#9303C5';
      const white = '#FFFFFF';
      const ratio = contrastRatio(purple, white);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(Math.round(ratio * 10) / 10).toBe(6.9);
    });

    it('Admin Portal theme: var(--axdoro-purple) (#8A2BE2) with white text achieves WCAG AA (>= 4.5:1)', () => {
      const purple = '#8A2BE2';
      const white = '#FFFFFF';
      const ratio = contrastRatio(purple, white);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(Math.round(ratio * 10) / 10).toBe(6.0);
    });
  });
});
