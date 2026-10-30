/**
 * Computes a deterministic 5-character base-36 checksum of a product slug using FNV-1a 32-bit hash.
 * Provides over 60 million distinct values, eliminating cross-product SKU collisions
 * when different products share identical 14-char or 15-char prefixes.
 */
export function computeSlugChecksum(slug: string): string {
  const normalized = (slug || 'AXDORO').trim().toLowerCase();
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 60466176).toString(36).toUpperCase().padStart(5, '0');
}

/**
 * Generates a deterministic, collision-resistant SKU for a product variant.
 *
 * Requirements:
 * 1. Base format: AX-${cleanSlug}-${slugChecksum}-${cleanSize}-${cleanColor}
 *    - cleanSlug: human-readable prefix (up to 14 chars)
 *    - slugChecksum: deterministic 5-char token from full slug preventing cross-product collisions
 *      when different products share identical prefixes.
 * 2. Deterministic disambiguation: if identical base SKU exists in seen set (due to similar
 *    color names, special characters, or duplicate clean tokens), append a deterministic numeric
 *    suffix (-2, -3, etc.).
 * 3. Max length: under 100 characters to strictly satisfy database constraint VARCHAR(100).
 */
export function generateVariantSku(
  baseSlug: string,
  size: string,
  color: string,
  existingSkus?: Set<string>
): string {
  const cleanSlug = (baseSlug || 'AXDORO')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 14) || 'AXDORO';

  const slugChecksum = computeSlugChecksum(baseSlug);

  // Size token: preserve alphanumeric (e.g. "38 (S)" -> "38S", "XL" -> "XL")
  const cleanSize = size.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'M';

  // Color token: clean alphanumeric without aggressive 4-char truncation (allow up to 16 chars)
  const cleanColor = color.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16) || 'STD';

  const baseSku = `AX-${cleanSlug}-${slugChecksum}-${cleanSize}-${cleanColor}`;

  if (!existingSkus || !existingSkus.has(baseSku)) {
    existingSkus?.add(baseSku);
    return baseSku;
  }

  // Disambiguation loop: find first available deterministic suffix -2, -3...
  let counter = 2;
  while (true) {
    const candidate = `${baseSku}-${counter}`;
    if (!existingSkus.has(candidate)) {
      existingSkus.add(candidate);
      return candidate;
    }
    counter++;
  }
}
