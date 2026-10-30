import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  acquireScrollLock,
  releaseScrollLock,
  getScrollLockCount,
  forceResetScrollLock,
} from './utils/scrollLock.ts';

// Minimal DOM environment simulation for Node test environment (no jsdom dependency installed)
class MockBody {
  style: {
    overflow: string;
    paddingRight: string;
  } = { overflow: '', paddingRight: '' };

  attributes: Record<string, string> = {};

  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }

  getAttribute(name: string) {
    return this.attributes[name] ?? null;
  }

  removeAttribute(name: string) {
    delete this.attributes[name];
  }
}

class MockDocumentElement {
  clientWidth = 1024;
}

const mockBody = new MockBody();
const mockDocElement = new MockDocumentElement();

const mockWindow = {
  innerWidth: 1024,
  getComputedStyle: (_el: unknown) => ({
    paddingRight: mockBody.style.paddingRight || '0px',
  }),
};

// Install mock DOM on globalThis
(globalThis as unknown as { document: unknown }).document = {
  body: mockBody,
  documentElement: mockDocElement,
};
(globalThis as unknown as { window: unknown }).window = mockWindow;

describe('Global Modal Background Scroll Lock Utility (scrollLock.ts)', () => {
  beforeEach(() => {
    forceResetScrollLock();
    mockBody.style.overflow = '';
    mockBody.style.paddingRight = '';
    mockBody.attributes = {};
    mockWindow.innerWidth = 1024;
    mockDocElement.clientWidth = 1024;
  });

  afterEach(() => {
    forceResetScrollLock();
  });

  it('1. locks background scroll on single acquire and releases on release', () => {
    expect(getScrollLockCount()).toBe(0);
    expect(mockBody.style.overflow).toBe('');
    expect(mockBody.getAttribute('data-scroll-locked')).toBeNull();

    acquireScrollLock();

    expect(getScrollLockCount()).toBe(1);
    expect(mockBody.style.overflow).toBe('hidden');
    expect(mockBody.getAttribute('data-scroll-locked')).toBe('true');

    releaseScrollLock();

    expect(getScrollLockCount()).toBe(0);
    expect(mockBody.style.overflow).toBe('');
    expect(mockBody.getAttribute('data-scroll-locked')).toBeNull();
  });

  it('2. supports nested modals without premature background unlocking', () => {
    // Open Outer Modal (e.g. ProductEditDialog)
    acquireScrollLock();
    expect(getScrollLockCount()).toBe(1);
    expect(mockBody.style.overflow).toBe('hidden');
    expect(mockBody.getAttribute('data-scroll-locked')).toBe('true');

    // Open Nested Inner Modal (e.g. ProductImageModal)
    acquireScrollLock();
    expect(getScrollLockCount()).toBe(2);
    expect(mockBody.style.overflow).toBe('hidden');
    expect(mockBody.getAttribute('data-scroll-locked')).toBe('true');

    // Close Nested Inner Modal
    releaseScrollLock();
    // Background MUST remain locked for outer modal
    expect(getScrollLockCount()).toBe(1);
    expect(mockBody.style.overflow).toBe('hidden');
    expect(mockBody.getAttribute('data-scroll-locked')).toBe('true');

    // Close Outer Modal
    releaseScrollLock();
    // Now background is unlocked
    expect(getScrollLockCount()).toBe(0);
    expect(mockBody.style.overflow).toBe('');
    expect(mockBody.getAttribute('data-scroll-locked')).toBeNull();
  });

  it('3. preserves and restores original inline overflow and padding styles exactly', () => {
    mockBody.style.overflow = 'auto';
    mockBody.style.paddingRight = '12px';

    acquireScrollLock();

    expect(mockBody.style.overflow).toBe('hidden');

    releaseScrollLock();

    expect(mockBody.style.overflow).toBe('auto');
    expect(mockBody.style.paddingRight).toBe('12px');
  });

  it('4. calculates scrollbar width compensation without cumulative padding buildup', () => {
    // Simulate scrollbar width: 1024px innerWidth - 1008px clientWidth = 16px scrollbar
    mockWindow.innerWidth = 1024;
    mockDocElement.clientWidth = 1008;

    // First acquire: should add 16px
    acquireScrollLock();
    expect(mockBody.style.paddingRight).toBe('16px');

    // Nested acquire: must NOT add 16px again (cumulative bug prevention)
    acquireScrollLock();
    expect(mockBody.style.paddingRight).toBe('16px');

    // First release (inner modal closes)
    releaseScrollLock();
    expect(mockBody.style.paddingRight).toBe('16px');

    // Final release: resets to original
    releaseScrollLock();
    expect(mockBody.style.paddingRight).toBe('');
  });

  it('5. handles repeated releases safely and prevents negative lock count', () => {
    expect(getScrollLockCount()).toBe(0);

    // Call release with 0 count
    releaseScrollLock();
    expect(getScrollLockCount()).toBe(0);

    releaseScrollLock();
    expect(getScrollLockCount()).toBe(0);

    // Acquire once, then release twice
    acquireScrollLock();
    expect(getScrollLockCount()).toBe(1);

    releaseScrollLock();
    expect(getScrollLockCount()).toBe(0);

    releaseScrollLock();
    expect(getScrollLockCount()).toBe(0);
    expect(mockBody.style.overflow).toBe('');
  });

  it('6. simulates React hook effect lifecycle: acquires on mount/open and releases on cleanup/unmount', () => {
    expect(getScrollLockCount()).toBe(0);

    // Simulate mounting a modal with isLocked = true
    function simulateModalHookLifecycle(isLocked: boolean) {
      if (!isLocked) return () => {};
      acquireScrollLock();
      return () => {
        releaseScrollLock();
      };
    }

    // Modal opens
    const cleanup1 = simulateModalHookLifecycle(true);
    expect(getScrollLockCount()).toBe(1);
    expect(mockBody.getAttribute('data-scroll-locked')).toBe('true');

    // Nested modal opens
    const cleanup2 = simulateModalHookLifecycle(true);
    expect(getScrollLockCount()).toBe(2);

    // Nested modal closes/unmounts (effect cleanup executed)
    cleanup2();
    expect(getScrollLockCount()).toBe(1);
    expect(mockBody.getAttribute('data-scroll-locked')).toBe('true');

    // First modal closes/unmounts
    cleanup1();
    expect(getScrollLockCount()).toBe(0);
    expect(mockBody.getAttribute('data-scroll-locked')).toBeNull();
  });
});

describe('Modal & Dialog Integration Verification (Source Code Inspection)', () => {
  const componentsDir = path.resolve(__dirname, 'components');

  const checkComponentScrollLock = (relativePath: string, expectedCondition: string) => {
    const fullPath = path.join(componentsDir, relativePath);
    const code = fs.readFileSync(fullPath, 'utf-8');

    expect(code).toContain("import { useScrollLock } from '");
    expect(code).toContain(`useScrollLock(${expectedCondition})`);
  };

  it('verifies Storefront components use the shared useScrollLock hook', () => {
    // ProductDetailModal
    checkComponentScrollLock('ProductDetailModal.tsx', 'Boolean(product)');

    // CartDrawer
    checkComponentScrollLock('CartDrawer.tsx', 'isOpen');

    // CheckoutModal
    checkComponentScrollLock('CheckoutModal.tsx', 'isOpen');

    // BulkEnquiryModal
    checkComponentScrollLock('BulkEnquiryModal.tsx', 'isOpen');

    // Footer policy modal
    checkComponentScrollLock('Footer.tsx', 'Boolean(activePolicyModal)');
  });

  it('verifies Admin Portal dialogs use the shared useScrollLock hook', () => {
    // ProductCreateDialog
    checkComponentScrollLock('admin/ProductCreateDialog.tsx', 'isOpen');

    // ProductEditDialog
    checkComponentScrollLock('admin/ProductEditDialog.tsx', 'isOpen && Boolean(productId)');

    // ProductImageModal
    checkComponentScrollLock('admin/ProductImageModal.tsx', 'true');

    // StockAdjustmentDialog
    checkComponentScrollLock('admin/StockAdjustmentDialog.tsx', 'true');

    // CategoryManagementView
    checkComponentScrollLock('admin/CategoryManagementView.tsx', 'isAddOpen || Boolean(editingCategory)');

    // CollectionManagementView
    checkComponentScrollLock('admin/CollectionManagementView.tsx', 'isHeroModalOpen');

    // AdminPortal delete product dialog
    checkComponentScrollLock('admin/AdminPortal.tsx', 'Boolean(productToDelete)');

    // AdminSidebar mobile drawer
    checkComponentScrollLock('admin/AdminSidebar.tsx', 'isMobileOpen');

    // AdminPortalModal legacy modal
    checkComponentScrollLock('admin/AdminPortalModal.tsx', 'isOpen');
  });

  it('verifies ProductDetailModal no longer uses naive document.body.style.overflow mutation directly', () => {
    const fullPath = path.join(componentsDir, 'ProductDetailModal.tsx');
    const code = fs.readFileSync(fullPath, 'utf-8');

    expect(code).not.toContain("document.body.style.overflow = 'hidden'");
    expect(code).not.toContain('document.body.style.overflow = originalOverflow');
  });

  it('verifies modal containers maintain overflow-y-auto for internal content scrolling', () => {
    const detailModalCode = fs.readFileSync(path.join(componentsDir, 'ProductDetailModal.tsx'), 'utf-8');
    expect(detailModalCode).toContain('overflow-y-auto');

    const cartDrawerCode = fs.readFileSync(path.join(componentsDir, 'CartDrawer.tsx'), 'utf-8');
    expect(cartDrawerCode).toContain('overflow-y-auto');

    const checkoutModalCode = fs.readFileSync(path.join(componentsDir, 'CheckoutModal.tsx'), 'utf-8');
    expect(checkoutModalCode).toContain('overflow-y-auto');

    const productCreateCode = fs.readFileSync(path.join(componentsDir, 'admin/ProductCreateDialog.tsx'), 'utf-8');
    expect(productCreateCode).toContain('overflow-y-auto');

    const productEditCode = fs.readFileSync(path.join(componentsDir, 'admin/ProductEditDialog.tsx'), 'utf-8');
    expect(productEditCode).toContain('overflow-y-auto');
  });
});
