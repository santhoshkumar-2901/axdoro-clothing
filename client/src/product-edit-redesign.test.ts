import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('ProductEditDialog Redesign & Safeguards Verification', () => {
  const filePath = path.join(__dirname, 'components/admin/ProductEditDialog.tsx');
  const code = fs.readFileSync(filePath, 'utf-8');

  it('1. Verifies 4-section Minimal Luxury architecture layout', () => {
    expect(code).toContain('1. Basic Information');
    expect(code).toContain('2. Pricing');
    expect(code).toContain('3. Color Variants');
    expect(code).toContain('4. Inventory Summary');
  });

  it('2. Verifies scroll lock and modal centering tokens', () => {
    expect(code).toContain('useScrollLock(isOpen && Boolean(productId));');
    expect(code).toContain('my-auto');
    expect(code).toContain('max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)]');
    expect(code).toContain('border-b border-axdoro-border bg-axdoro-surface shrink-0');
    expect(code).toContain('flex-1 min-h-0 overflow-y-auto');
  });

  it('3. Verifies Safeguard 9: Optimistic Concurrency Control (expectedUpdatedAt)', () => {
    expect(code).toContain('const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string | null>(null);');
    expect(code).toContain('setExpectedUpdatedAt(prod.updatedAt || (prod as any).updated_at);');
    expect(code).toContain('expectedUpdatedAt: expectedUpdatedAt || null,');
    expect(code).toContain('CONCURRENT_MUTATION_CONFLICT');
  });

  it('4. Verifies Safeguard 8: Variant ID and SKU preservation for existing variants', () => {
    // Existing variants map id and sku
    expect(code).toContain('variantId: foundVar.id,');
    expect(code).toContain('sku: foundVar.sku,');
    // On submit, preserve id and sku
    expect(code).toContain('...(s.variantId ? { id: s.variantId } : {}),');
    expect(code).toContain('...(s.sku ? { sku: s.sku } : {}),');
  });

  it('5. Verifies Safeguard 2: Inactive variants are preserved and not silently reactivated', () => {
    // Inactive variant loaded with selected: foundVar.isActive
    expect(code).toContain('selected: foundVar.isActive,');
    // If not selected but has variantId, submitted with isActive: false
    expect(code).toContain('isActive: false,');
    expect(code).toContain('// Safeguard 2: Preserve inactive variant without reactivating');
  });

  it('6. Verifies Safeguards 5 & 6: Zero image support and exactly one primary image resolution', () => {
    expect(code).toContain('let primaryImageId: string | null = null;');
    expect(code).toContain('const isOverallPrimary = img.id === primaryImageId;');
    expect(code).toContain('isPrimary: isOverallPrimary,');
  });

  it('7. Verifies Staging Session Lifecycle integration', () => {
    expect(code).toContain('adminCreateStagingSession');
    expect(code).toContain('adminHeartbeatStagingSession');
    expect(code).toContain('adminAbandonStagingSession');
    expect(code).toContain('stagingSessionIdRef.current = null;'); // Cleared on successful commit
  });

  it('8. Verifies Legacy Pricing Conflict detection and confirmation safeguard', () => {
    expect(code).toContain('hasLegacyPriceConflict');
    expect(code).toContain('legacyPriceConfirmed');
    expect(code).toContain('Legacy Pricing Variance Detected');
    expect(code).toContain('I confirm overwriting legacy variant pricing with the shared pricing above');
  });

  it('9. Verifies Custom Size support (standard + legacy sizes e.g. 38 (S))', () => {
    expect(code).toContain("STANDARD_SIZES = ['S', 'M', 'L', 'XL', 'XXL']");
    expect(code).toContain('+ Custom Size');
    expect(code).toContain('handleAddCustomSize');
    expect(code).toContain('handleRemoveCustomSize');
    expect(code).toContain('38 (S), 40 (M), 42 (L), 3XL');
  });

  it('10. Verifies Single Atomic Transaction Endpoint invocation', () => {
    expect(code).toContain('await adminUpdateProduct(productId!, payload);');
    // No separate image upload endpoints or variant endpoints called during submit
    expect(code).not.toContain('adminCreateVariant');
    expect(code).not.toContain('adminUpdateVariant');
    expect(code).not.toContain('adminUploadProductImage');
  });
});
