export const CANONICAL_SIZE_ORDER = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'] as const;

/**
 * Returns the canonical order index for a size string (case-insensitive, trimmed).
 * Maps '3XL' as an alias of 'XXXL'.
 * Returns -1 for non-canonical or custom sizes.
 */
function getCanonicalIndex(size: string): number {
  const normalized = size.trim().toUpperCase();
  const index = (CANONICAL_SIZE_ORDER as readonly string[]).indexOf(normalized);
  if (index !== -1) return index;
  if (normalized === '3XL') {
    return (CANONICAL_SIZE_ORDER as readonly string[]).indexOf('XXXL');
  }
  return -1;
}

/**
 * Deterministically sorts product sizes according to the canonical order:
 * S → M → L → XL → XXL → XXXL
 *
 * Guarantees:
 * - Returns exact original size strings to preserve variant-to-stock associations.
 * - Deduplicates values (matching case-insensitively and whitespace-trimmed while preserving the first seen original string).
 * - Never adds missing sizes.
 * - Places custom/unknown sizes (e.g. '38 (S)', 'One Size') deterministically after canonical sizes.
 * - Safe against null, undefined, or empty arrays.
 */
export function sortProductSizes(sizes: string[] | undefined | null): string[] {
  if (!sizes || !Array.isArray(sizes) || sizes.length === 0) {
    return [];
  }

  // Deduplicate while preserving exact original string representation
  const seen = new Set<string>();
  const uniqueSizes: string[] = [];

  for (const s of sizes) {
    if (typeof s !== 'string') continue;
    const trimmed = s.trim();
    if (!trimmed) continue;
    const key = trimmed.toUpperCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueSizes.push(s); // Preserve original string for exact variant-to-stock lookups
    }
  }

  return uniqueSizes.sort((a, b) => {
    const aIndex = getCanonicalIndex(a);
    const bIndex = getCanonicalIndex(b);

    // Both sizes are in canonical order: sort by canonical position
    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex;
    }

    // Canonical sizes precede custom/unknown sizes
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;

    // Both are custom/unknown sizes: sort naturally/alphanumerically
    return a.trim().localeCompare(b.trim(), undefined, { numeric: true, sensitivity: 'base' });
  });
}
