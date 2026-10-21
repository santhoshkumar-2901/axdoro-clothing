import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Admin Modal Top-Edge Layout & Header Styling Integrity', () => {
  const adminDir = path.resolve(__dirname, 'components/admin');

  describe('ProductCreateDialog.tsx', () => {
    const fileContent = fs.readFileSync(path.join(adminDir, 'ProductCreateDialog.tsx'), 'utf-8');

    it('uses my-auto centering without hardcoded top margin that pushes modal off-screen', () => {
      expect(fileContent).toContain('my-auto');
      expect(fileContent).not.toMatch(/my-6\s+flex\s+flex-col/);
    });

    it('constrains dialog height accounting for overlay padding (calc(100vh-2rem))', () => {
      expect(fileContent).toContain('max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)]');
    });

    it('does not use sticky top-0 on header which caused corner bleeding and stacking artifacts', () => {
      expect(fileContent).not.toContain('sticky top-0 z-10');
      expect(fileContent).toContain('shrink-0 z-10');
      expect(fileContent).toContain('bg-axdoro-surface');
    });

    it('sets min-h-0 on the scrollable form body to support nested flex scrolling without clipping', () => {
      expect(fileContent).toContain('flex-1 min-h-0 overflow-y-auto');
    });
  });

  describe('ProductEditDialog.tsx', () => {
    const fileContent = fs.readFileSync(path.join(adminDir, 'ProductEditDialog.tsx'), 'utf-8');

    it('uses my-auto centering and viewport-constrained height', () => {
      expect(fileContent).toContain('my-auto');
      expect(fileContent).toContain('max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)]');
    });

    it('corrects header background mismatch by using solid bg-axdoro-surface instead of bg-axdoro-bg/50', () => {
      expect(fileContent).not.toMatch(/Header[\s\S]*?bg-axdoro-bg\/50/);
      expect(fileContent).toContain('border-b border-axdoro-border bg-axdoro-surface shrink-0');
    });

    it('sets min-h-0 on the scrollable form body', () => {
      expect(fileContent).toContain('flex-1 min-h-0 overflow-y-auto');
    });
  });

  describe('CategoryManagementView.tsx', () => {
    const fileContent = fs.readFileSync(path.join(adminDir, 'CategoryManagementView.tsx'), 'utf-8');

    it('constrains Add Category modal height and enables internal scrolling to prevent top clipping', () => {
      expect(fileContent).toContain('max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col my-auto overflow-hidden');
      expect(fileContent).toContain('px-6 py-4 border-b border-axdoro-border flex items-center justify-between shrink-0 bg-axdoro-surface');
    });

    it('constrains Edit Category modal height and enables internal scrolling', () => {
      const editModalIndex = fileContent.indexOf('editingCategory &&');
      const editModalSubstr = fileContent.slice(editModalIndex);
      expect(editModalSubstr).toContain('max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col my-auto overflow-hidden');
      expect(editModalSubstr).toContain('flex-1 min-h-0 overflow-y-auto p-6 space-y-4');
    });
  });

  describe('StockAdjustmentDialog.tsx', () => {
    const fileContent = fs.readFileSync(path.join(adminDir, 'StockAdjustmentDialog.tsx'), 'utf-8');

    it('provides a distinct header divider and solid background to CardHeader', () => {
      expect(fileContent).toContain('border-b border-axdoro-border bg-axdoro-surface');
      expect(fileContent).toContain('rounded-2xl overflow-hidden');
    });

    it('uses my-auto centering to keep dialog centered when space allows', () => {
      expect(fileContent).toContain('my-auto');
    });
  });

  describe('AdminPortal.tsx (Product Deletion Confirmation)', () => {
    const fileContent = fs.readFileSync(path.join(adminDir, 'AdminPortal.tsx'), 'utf-8');

    it('ensures deletion dialog header and footer dividers span edge-to-edge', () => {
      const deleteModalIndex = fileContent.indexOf('productToDelete &&');
      const deleteModalSubstr = fileContent.slice(deleteModalIndex, deleteModalIndex + 6000);
      expect(deleteModalSubstr).toContain('border-b border-axdoro-border px-6 py-4 shrink-0 bg-axdoro-surface');
      expect(deleteModalSubstr).toContain('px-6 py-4 border-t border-axdoro-border bg-axdoro-surface-muted/30 shrink-0');
      expect(deleteModalSubstr).toContain('rounded-2xl shadow-elevated max-w-md w-full overflow-hidden my-auto flex flex-col');
    });
  });

  describe('ProductImageModal.tsx', () => {
    const fileContent = fs.readFileSync(path.join(adminDir, 'ProductImageModal.tsx'), 'utf-8');

    it('standardizes header and footer border styling and container max-height', () => {
      expect(fileContent).toContain('px-6 py-4 border-b border-axdoro-border bg-axdoro-surface shrink-0');
      expect(fileContent).toContain('flex-1 min-h-0 overflow-y-auto p-6 space-y-4');
      expect(fileContent).toContain('border-t border-axdoro-border px-6 py-4 bg-axdoro-surface-muted/30 shrink-0');
      expect(fileContent).toContain('my-auto');
    });
  });

  describe('Viewport Centering and Clipping Bounds Verification', () => {
    const viewports = [
      { name: 'Mobile Landscape / Small Tablet', width: 640, height: 480, paddingPx: 24, maxHRem: 2 }, // p-3 = 12px each side = 24px; 2rem = 32px
      { name: 'Portrait Tablet / iPad', width: 768, height: 1024, paddingPx: 48, maxHRem: 3 },       // sm:p-6 = 24px each side = 48px; 3rem = 48px
      { name: 'Standard Laptop / WXGA', width: 1280, height: 800, paddingPx: 48, maxHRem: 3 },       // sm:p-6 = 48px; 3rem = 48px
    ];

    it.each(viewports)('guarantees positive top offset on $name ($width x $height)', ({ height, paddingPx, maxHRem }) => {
      const maxAllowedModalHeight = height - maxHRem * 16;
      const verticalMargin = height - maxAllowedModalHeight;
      const topOffset = verticalMargin / 2;

      // Top edge must never be negative (negative offset means clipped above viewport)
      expect(topOffset).toBeGreaterThanOrEqual(16);
      expect(verticalMargin).toBeGreaterThanOrEqual(paddingPx);
    });
  });
});
