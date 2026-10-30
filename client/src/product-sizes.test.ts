import { describe, it, expect } from 'vitest';
import { sortProductSizes, CANONICAL_SIZE_ORDER } from './utils/sizes.ts';
import fs from 'node:fs';
import path from 'node:path';

describe('AXDORO — Standardize Product Size Display Order (sortProductSizes)', () => {
  describe('1. Canonical Size Order Definition', () => {
    it('defines canonical size order strictly as S → M → L → XL → XXL → XXXL', () => {
      expect(CANONICAL_SIZE_ORDER).toEqual(['S', 'M', 'L', 'XL', 'XXL', 'XXXL']);
    });
  });

  describe('2. Permutations & Reordering of Canonical Sizes', () => {
    it('reorders [M, L, S, XL] into [S, M, L, XL]', () => {
      const input = ['M', 'L', 'S', 'XL'];
      expect(sortProductSizes(input)).toEqual(['S', 'M', 'L', 'XL']);
    });

    it('reorders [XL, M, S] into [S, M, XL]', () => {
      const input = ['XL', 'M', 'S'];
      expect(sortProductSizes(input)).toEqual(['S', 'M', 'XL']);
    });

    it('reorders complete inverted canonical list [XXXL, XXL, XL, L, M, S] into canonical order', () => {
      const input = ['XXXL', 'XXL', 'XL', 'L', 'M', 'S'];
      expect(sortProductSizes(input)).toEqual(['S', 'M', 'L', 'XL', 'XXL', 'XXXL']);
    });

    it('reorders shuffled canonical sizes [XXL, S, XXXL, L, M, XL] into canonical order', () => {
      const input = ['XXL', 'S', 'XXXL', 'L', 'M', 'XL'];
      expect(sortProductSizes(input)).toEqual(['S', 'M', 'L', 'XL', 'XXL', 'XXXL']);
    });
  });

  describe('3. Missing Sizes Guarantee', () => {
    it('never injects missing canonical sizes into the output', () => {
      const input = ['M', 'XL'];
      const result = sortProductSizes(input);
      expect(result).toEqual(['M', 'XL']);
      expect(result).not.toContain('S');
      expect(result).not.toContain('L');
      expect(result).not.toContain('XXL');
      expect(result).not.toContain('XXXL');
    });

    it('preserves single size arrays as-is', () => {
      expect(sortProductSizes(['M'])).toEqual(['M']);
      expect(sortProductSizes(['S'])).toEqual(['S']);
      expect(sortProductSizes(['XXL'])).toEqual(['XXL']);
    });
  });

  describe('4. Duplicate Values Elimination', () => {
    it('removes duplicate sizes while maintaining canonical ordering', () => {
      const input = ['M', 'S', 'M', 'L', 'S', 'XL', 'XL'];
      expect(sortProductSizes(input)).toEqual(['S', 'M', 'L', 'XL']);
    });

    it('deduplicates case-insensitively while preserving the first seen original token', () => {
      const input = ['m', 'M', 's', 'S'];
      // First seen: 'm', 's' -> sorted canonically: 's', 'm'
      expect(sortProductSizes(input)).toEqual(['s', 'm']);
    });
  });

  describe('5. Lowercase & Mixed-case Value Handling', () => {
    it('sorts lowercase canonical sizes in correct order while preserving original case', () => {
      const input = ['m', 'l', 's', 'xl', 'xxl'];
      expect(sortProductSizes(input)).toEqual(['s', 'm', 'l', 'xl', 'xxl']);
    });

    it('sorts mixed-case canonical sizes [Xl, m, S, Xxl]', () => {
      const input = ['Xl', 'm', 'S', 'Xxl'];
      expect(sortProductSizes(input)).toEqual(['S', 'm', 'Xl', 'Xxl']);
    });
  });

  describe('6. Whitespace Handling', () => {
    it('safely sorts sizes containing leading/trailing whitespace without crashing', () => {
      const input = ['  M  ', 'S', '  L  '];
      expect(sortProductSizes(input)).toEqual(['S', '  M  ', '  L  ']);
    });

    it('ignores empty or whitespace-only elements', () => {
      const input = ['M', '', '  ', 'S'];
      expect(sortProductSizes(input)).toEqual(['S', 'M']);
    });
  });

  describe('7. Custom & Unknown Size Handling', () => {
    it('places custom sizes predictably after canonical sizes without dropping them', () => {
      const input = ['XL', '38 (S)', 'M', '40 (M)', 'S'];
      const result = sortProductSizes(input);
      expect(result).toEqual(['S', 'M', 'XL', '38 (S)', '40 (M)']);
    });

    it('sorts non-canonical named sizes (e.g. One Size, Custom) after canonical sizes', () => {
      const input = ['One Size', 'L', 'Custom Cut', 'S'];
      const result = sortProductSizes(input);
      expect(result).toEqual(['S', 'L', 'Custom Cut', 'One Size']);
    });

    it('treats 3XL as alias of XXXL in canonical order', () => {
      const input = ['3XL', 'M', 'S', 'XXL'];
      expect(sortProductSizes(input)).toEqual(['S', 'M', 'XXL', '3XL']);
    });

    it('sorts purely custom sizes predictably', () => {
      const input = ['42 (L)', '38 (S)', '40 (M)'];
      expect(sortProductSizes(input)).toEqual(['38 (S)', '40 (M)', '42 (L)']);
    });
  });

  describe('8. Null, Undefined & Empty Array Safety', () => {
    it('returns empty array for empty input', () => {
      expect(sortProductSizes([])).toEqual([]);
    });

    it('returns empty array for null or undefined input', () => {
      expect(sortProductSizes(null)).toEqual([]);
      expect(sortProductSizes(undefined)).toEqual([]);
    });

    it('does not mutate the original input array', () => {
      const original = ['XL', 'M', 'S'];
      const copy = [...original];
      sortProductSizes(original);
      expect(original).toEqual(copy);
    });
  });

  describe('9. Component Integration Verifications', () => {
    const clientDir = path.resolve(__dirname);

    it('ProductCard.tsx imports and applies sortProductSizes to preview pills', () => {
      const code = fs.readFileSync(path.join(clientDir, 'components', 'ProductCard.tsx'), 'utf-8');
      expect(code).toContain("import { sortProductSizes } from '../utils/sizes.ts'");
      expect(code).toContain('{sortProductSizes(product.sizes).map((s) => (');
    });

    it('CategorySectionBlock.tsx imports and applies sortProductSizes to preview pills', () => {
      const code = fs.readFileSync(path.join(clientDir, 'components', 'CategorySectionBlock.tsx'), 'utf-8');
      expect(code).toContain("import { sortProductSizes } from '../utils/sizes.ts'");
      expect(code).toContain('{sortProductSizes(product.sizes).slice(0, 4).map((s) => (');
    });

    it('ProductDetailModal.tsx imports and applies sortProductSizes to size selector', () => {
      const code = fs.readFileSync(path.join(clientDir, 'components', 'ProductDetailModal.tsx'), 'utf-8');
      expect(code).toContain("import { sortProductSizes } from '../utils/sizes.ts'");
      expect(code).toContain('{sortProductSizes(product.sizes).map((size) => {');
    });
  });
});
