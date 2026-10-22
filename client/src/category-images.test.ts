import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { adminGetCategoryUploadSignature } from './api/admin.ts';

describe('Admin-Managed Category Images Client Suite', () => {
  const clientDir = path.resolve(__dirname, '..');

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Client Admin API Signature Generation', () => {
    it('requests general upload signature when categoryId is omitted', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'success',
          data: {
            signature: 'sig123',
            timestamp: 1600000000,
            apiKey: 'key_123',
            cloudName: 'test-cloud',
            folder: 'axdoro/categories',
            publicId: 'cat_asset_123',
            uploadUrl: 'https://api.cloudinary.com/v1_1/test-cloud/image/upload',
          },
        }),
      });
      global.fetch = fetchMock;

      const res = await adminGetCategoryUploadSignature();
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/categories/upload-signature',
        expect.objectContaining({ method: 'POST', credentials: 'include' })
      );
      expect(res.signature).toBe('sig123');
      expect(res.folder).toBe('axdoro/categories');
    });

    it('requests category-scoped upload signature when categoryId is provided', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'success',
          data: {
            signature: 'sig456',
            timestamp: 1600000000,
            apiKey: 'key_123',
            cloudName: 'test-cloud',
            folder: 'axdoro/categories',
            publicId: 'cat_tshirts_123',
            uploadUrl: 'https://api.cloudinary.com/v1_1/test-cloud/image/upload',
          },
        }),
      });
      global.fetch = fetchMock;

      const res = await adminGetCategoryUploadSignature('cat-tshirts');
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/categories/cat-tshirts/images/signature',
        expect.objectContaining({ method: 'POST', credentials: 'include' })
      );
      expect(res.signature).toBe('sig456');
    });
  });

  describe('2. Storefront CategoryShowcase Dynamic Image Verification', () => {
    it('verifies CategoryShowcase uses cat.imageUrl with safe fallback and onError recovery', () => {
      const showcaseContent = fs.readFileSync(
        path.join(clientDir, 'src', 'components', 'CategoryShowcase.tsx'),
        'utf-8'
      );

      // Prioritizes category imageUrl with fallback
      expect(showcaseContent).toContain(
        'const bgImage = cat.imageUrl || DEFAULT_CATEGORY_IMAGES[cat.slug] || GENERIC_CATEGORY_IMAGE;'
      );

      // Includes onError fallback recovery
      expect(showcaseContent).toContain('onError={(e) => {');
      expect(showcaseContent).toContain('DEFAULT_CATEGORY_IMAGES[cat.slug] || GENERIC_CATEGORY_IMAGE');
      expect(showcaseContent).toContain('loading="lazy"');
    });
  });

  describe('3. Storefront CategoryPage Hero Image Verification', () => {
    it('verifies CategoryPage prioritizes category.imageUrl in hero cover banner', () => {
      const pageContent = fs.readFileSync(
        path.join(clientDir, 'src', 'components', 'CategoryPage.tsx'),
        'utf-8'
      );

      // Checks for category.imageUrl in coverImage calculation
      expect(pageContent).toContain('category?.imageUrl');
      expect(pageContent).toContain('const coverImage = category?.imageUrl');
      expect(pageContent).toContain('onError={(e) => {');
    });
  });

  describe('4. Admin Portal CategoryManagementView Integration', () => {
    it('verifies CategoryManagementView includes table image thumbnail, Image action button, and modal', () => {
      const viewContent = fs.readFileSync(
        path.join(clientDir, 'src', 'components', 'admin', 'CategoryManagementView.tsx'),
        'utf-8'
      );

      // Table Image Column Header
      expect(viewContent).toContain('<TableHead className="w-16 text-center font-semibold text-xs">Image</TableHead>');

      // Thumbnail rendering with click-to-change action
      expect(viewContent).toContain('cat.imageUrl ?');
      expect(viewContent).toContain('handleOpenImageModal(cat)');

      // Table Action Button
      expect(viewContent).toContain('title="Upload or Change Category Image"');
      expect(viewContent).toContain('<ImageIcon className="w-3.5 h-3.5 mr-1" /> Image');

      // Category Image Modal Header & Handlers
      expect(viewContent).toContain('Manage Image: {imageModalCategory.name}');
      expect(viewContent).toContain('handleSaveCategoryImage');
      expect(viewContent).toContain('handleCloseImageModal');
      expect(viewContent).toContain('handleRemoveCurrentImage');

      // File upload and direct URL modes
      expect(viewContent).toContain('Upload File');
      expect(viewContent).toContain('Direct URL');
      expect(viewContent).toContain('Select Replacement File');
      expect(viewContent).toContain('Image Preview');

      // Scroll lock inclusion
      expect(viewContent).toContain('useScrollLock(Boolean(imageModalCategory));');
    });
  });
});
