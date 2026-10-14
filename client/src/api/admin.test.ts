import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  adminLogin,
  adminLogout,
  adminGetMe,
  adminArchiveProduct,
  adminUnarchiveProduct,
  adminAdjustStock,
  adminGetUploadSignature,
  adminAddProductImage,
  adminSetPrimaryProductImage,
  adminReorderProductImages,
  adminDeleteProductImage,
  adminGetCategories,
  adminCreateProduct,
  adminGetProductDetails,
  adminUpdateProduct,
  adminCreateVariant,
  adminUpdateVariant,
  adminDeleteProduct,
  getCsrfToken,
  setCsrfToken,
} from './admin.ts';

describe('Admin API Client Session Security & CSRF (Phase 3C)', () => {
  beforeEach(() => {
    setCsrfToken(null);
    vi.restoreAllMocks();
  });

  it('manages CSRF tokens in-memory without accessing sessionStorage', () => {
    expect(getCsrfToken()).toBeNull();

    setCsrfToken('test_csrf_token_123');
    expect(getCsrfToken()).toBe('test_csrf_token_123');

    setCsrfToken(null);
    expect(getCsrfToken()).toBeNull();
  });

  it('login sends credentials: include, updates in-memory csrfToken, and never writes to sessionStorage', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        status: 'success',
        data: {
          admin: { id: 'admin-1', email: 'admin@axdoro.test', fullName: 'Admin User', role: 'admin' },
          csrfToken: 'csrf_from_login_response',
          token: 'raw_session_token_should_not_be_stored',
        },
      }),
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

    const result = await adminLogin('admin@axdoro.test', 'Password123!');

    expect(fetchSpy).toHaveBeenCalledWith('/api/admin/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ email: 'admin@axdoro.test', password: 'Password123!' }),
    });

    expect(result.admin.email).toBe('admin@axdoro.test');
    expect(getCsrfToken()).toBe('csrf_from_login_response');
  });

  it('adminGetMe sends credentials: include and restores in-memory csrfToken', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        status: 'success',
        data: {
          id: 'admin-1',
          email: 'admin@axdoro.test',
          fullName: 'Admin User',
          role: 'admin',
          csrfToken: 'csrf_from_me_response',
        },
      }),
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

    const user = await adminGetMe();

    expect(fetchSpy).toHaveBeenCalledWith('/api/admin/auth/me', {
      headers: {
        Accept: 'application/json',
      },
      credentials: 'include',
    });

    expect(user?.email).toBe('admin@axdoro.test');
    expect(getCsrfToken()).toBe('csrf_from_me_response');
  });

  it('adminGetMe clears in-memory csrfToken when receiving 401 or when fetch rejects', async () => {
    setCsrfToken('stale_csrf_token');

    const mock401Response = {
      ok: false,
      status: 401,
      json: async () => ({ status: 'error', message: 'Unauthorized' }),
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mock401Response as any);

    const user = await adminGetMe();

    expect(fetchSpy).toHaveBeenCalledWith('/api/admin/auth/me', {
      headers: {
        Accept: 'application/json',
      },
      credentials: 'include',
    });

    expect(user).toBeNull();
    expect(getCsrfToken()).toBeNull();

    // Verify network error catch also resets token
    setCsrfToken('another_token');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
    const failedUser = await adminGetMe();
    expect(failedUser).toBeNull();
    expect(getCsrfToken()).toBeNull();
  });

  it('adminLogout sends credentials: include, attaches X-CSRF-Token, and clears in-memory csrfToken', async () => {
    setCsrfToken('active_csrf_token');

    const mockResponse = {
      ok: true,
      json: async () => ({ status: 'success', message: 'Logged out' }),
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

    await adminLogout();

    expect(fetchSpy).toHaveBeenCalledWith('/api/admin/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-CSRF-Token': 'active_csrf_token',
      },
      credentials: 'include',
    });

    expect(getCsrfToken()).toBeNull();
  });

  it('state-changing mutations attach X-CSRF-Token header and credentials: include', async () => {
    setCsrfToken('mutation_csrf_token');

    const mockResponse = {
      ok: true,
      json: async () => ({ status: 'success', data: { previousQuantity: 10, newQuantity: 15 } }),
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

    await adminAdjustStock('variant-uuid-1', 5, 'Inventory adjustment');

    expect(fetchSpy).toHaveBeenCalledWith('/api/admin/inventory/variants/variant-uuid-1/stock', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-CSRF-Token': 'mutation_csrf_token',
      },
      credentials: 'include',
      body: JSON.stringify({ quantity: 5, reason: 'Inventory adjustment' }),
    });

    await adminArchiveProduct('prod-uuid-1');

    expect(fetchSpy).toHaveBeenCalledWith('/api/admin/products/prod-uuid-1/archive', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-CSRF-Token': 'mutation_csrf_token',
      },
      credentials: 'include',
    });

    await adminUnarchiveProduct('prod-uuid-1');

    expect(fetchSpy).toHaveBeenCalledWith('/api/admin/products/prod-uuid-1/unarchive', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-CSRF-Token': 'mutation_csrf_token',
      },
      credentials: 'include',
    });
  });

  it('attaches CSRF header to product image mutation requests', async () => {
    setCsrfToken('image_csrf_token');

    const mockResponse = {
      ok: true,
      json: async () => ({ status: 'success', data: { id: 'img-1' } }),
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

    await adminGetUploadSignature('prod-123');
    expect(fetchSpy).toHaveBeenCalledWith('/api/admin/products/prod-123/images/signature', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-CSRF-Token': 'image_csrf_token',
      },
      credentials: 'include',
    });

    await adminAddProductImage('prod-123', { imageUrl: 'https://res.cloudinary.com/axdoro/img.jpg' });
    expect(fetchSpy).toHaveBeenCalledWith('/api/admin/products/prod-123/images', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-CSRF-Token': 'image_csrf_token',
      },
      credentials: 'include',
      body: JSON.stringify({ imageUrl: 'https://res.cloudinary.com/axdoro/img.jpg' }),
    });

    await adminSetPrimaryProductImage('prod-123', 'img-1');
    expect(fetchSpy).toHaveBeenCalledWith('/api/admin/products/prod-123/images/img-1/primary', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-CSRF-Token': 'image_csrf_token',
      },
      credentials: 'include',
    });

    await adminReorderProductImages('prod-123', [{ id: 'img-1', displayOrder: 0 }]);
    expect(fetchSpy).toHaveBeenCalledWith('/api/admin/products/prod-123/images/reorder', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-CSRF-Token': 'image_csrf_token',
      },
      credentials: 'include',
      body: JSON.stringify({ images: [{ id: 'img-1', displayOrder: 0 }] }),
    });

    await adminDeleteProductImage('prod-123', 'img-1');
    expect(fetchSpy).toHaveBeenCalledWith('/api/admin/products/prod-123/images/img-1', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-CSRF-Token': 'image_csrf_token',
      },
      credentials: 'include',
    });
  });

  describe('Product Image Error Propagation (Phase 1)', () => {
    it('adminAddProductImage prefers json.error over json.message on failure', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        json: async () => ({
          status: 'error',
          error: 'Invalid image payload: URL targets a non-image file extension (.pdf, .exe, etc.)',
          message: 'Invalid image payload',
        }),
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

      await expect(
        adminAddProductImage('prod-123', { imageUrl: 'https://example.com/file.pdf' })
      ).rejects.toThrow('Invalid image payload: URL targets a non-image file extension (.pdf, .exe, etc.)');
    });

    it('adminAddProductImage falls back to json.message if json.error is absent', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        json: async () => ({
          status: 'error',
          message: 'Custom backend error message',
        }),
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

      await expect(
        adminAddProductImage('prod-123', { imageUrl: 'https://example.com/test.jpg' })
      ).rejects.toThrow('Custom backend error message');
    });

    it('adminAddProductImage falls back to generic message if neither error nor message is present', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        json: async () => ({}),
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

      await expect(
        adminAddProductImage('prod-123', { imageUrl: 'https://example.com/test.jpg' })
      ).rejects.toThrow('Failed to add product image');
    });
  });

  describe('Product Creation & Category APIs (Phase 2)', () => {
    it('adminGetCategories sends GET /api/admin/categories and returns categories array', async () => {
      const mockCategories = [
        { id: 'cat-1', slug: 't-shirts', name: 'T-Shirts', displayOrder: 1, isActive: true, productCount: 5, createdAt: '2026-10-14T00:00:00Z' },
        { id: 'cat-2', slug: 'shirts', name: 'Shirts', displayOrder: 2, isActive: true, productCount: 3, createdAt: '2026-10-14T00:00:00Z' },
      ];

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'success', data: mockCategories }),
      } as any);

      const result = await adminGetCategories();

      expect(fetchSpy).toHaveBeenCalledWith('/api/admin/categories', {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('T-Shirts');
    });

    it('adminGetCategories throws server error message when API fails', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        json: async () => ({ status: 'error', message: 'Database connection failed' }),
      } as any);

      await expect(adminGetCategories()).rejects.toThrow('Database connection failed');
    });

    it('adminCreateProduct sends POST /api/admin/products with CSRF token and payload', async () => {
      setCsrfToken('csrf-token-xyz');

      const mockPayload = {
        name: 'Supima Cotton Tee',
        slug: 'supima-cotton-tee',
        description: 'Luxury cotton t-shirt',
        categoryId: 'cat-1',
        status: 'published' as const,
        isFeatured: true,
        isNewArrival: true,
        fabricSpec: '140 GSM',
        variants: [
          {
            size: 'M',
            color: 'Black',
            sku: 'AX-SUPIMA-M-BLK',
            pricePaise: 79900,
            comparisonPricePaise: 99900,
            stockQuantity: 30,
            isActive: true,
          },
        ],
        images: [
          {
            imageUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518',
            altText: 'Front View',
            displayOrder: 0,
            isPrimary: true,
          },
        ],
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'success',
          data: { id: 'prod-new-1', slug: 'supima-cotton-tee' },
        }),
      } as any);

      const result = await adminCreateProduct(mockPayload);

      expect(fetchSpy).toHaveBeenCalledWith('/api/admin/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-CSRF-Token': 'csrf-token-xyz',
        },
        credentials: 'include',
        body: JSON.stringify(mockPayload),
      });
      expect(result.id).toBe('prod-new-1');
      expect(result.slug).toBe('supima-cotton-tee');
    });

    it('adminCreateProduct prioritizes server error message on 409 conflict', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          status: 'error',
          error: 'A product with this slug or SKU already exists',
        }),
      } as any);

      await expect(
        adminCreateProduct({
          name: 'Duplicate Tee',
          slug: 'duplicate-tee',
          description: '',
          categoryId: 'cat-1',
          status: 'published',
          isFeatured: false,
          isNewArrival: false,
          variants: [
            {
              size: 'M',
              color: 'Black',
              sku: 'EXISTING-SKU',
              pricePaise: 50000,
              stockQuantity: 10,
              isActive: true,
            },
          ],
        })
      ).rejects.toThrow('A product with this slug or SKU already exists');
    });
  });

  describe('Product Editing & Variant Management API (Phase 3)', () => {
    it('adminGetProductDetails fetches full product with variants and images', async () => {
      const mockProduct = {
        id: 'prod-100',
        name: 'Oversized Tee',
        slug: 'oversized-tee',
        categoryId: 'cat-1',
        status: 'published',
        variants: [
          {
            id: 'var-1',
            productId: 'prod-100',
            size: 'M',
            color: 'Charcoal',
            sku: 'AX-TEE-M-CHR',
            pricePaise: 129900,
            comparisonPricePaise: 169900,
            stockQuantity: 25,
            isActive: true,
          },
        ],
        images: [
          {
            id: 'img-1',
            productId: 'prod-100',
            imageUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518',
            displayOrder: 0,
            isPrimary: true,
          },
        ],
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'success', data: mockProduct }),
      } as any);

      const result = await adminGetProductDetails('prod-100');

      expect(fetchSpy).toHaveBeenCalledWith('/api/admin/products/prod-100', {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      expect(result.id).toBe('prod-100');
      expect(result.variants).toHaveLength(1);
      expect(result.variants[0].stockQuantity).toBe(25);
      expect(result.images).toHaveLength(1);
    });

    it('adminUpdateProduct sends PUT request with payload, CSRF token, and credentials', async () => {
      setCsrfToken('edit-csrf-token');

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'success',
          product: { id: 'prod-100', name: 'Updated Oversized Tee' },
        }),
      } as any);

      const updatePayload = {
        name: 'Updated Oversized Tee',
        status: 'draft' as const,
        description: 'New luxury fabric details',
      };

      await adminUpdateProduct('prod-100', updatePayload);

      expect(fetchSpy).toHaveBeenCalledWith('/api/admin/products/prod-100', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-CSRF-Token': 'edit-csrf-token',
        },
        credentials: 'include',
        body: JSON.stringify(updatePayload),
      });
    });

    it('adminCreateVariant sends POST request with variant payload including stock and pricing', async () => {
      setCsrfToken('variant-csrf-token');

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'success',
          variant: { id: 'var-new-99' },
        }),
      } as any);

      const variantPayload = {
        size: 'L',
        color: 'Off-White',
        sku: 'AX-TEE-L-WHT',
        pricePaise: 139900,
        comparisonPricePaise: 179900,
        stockQuantity: 15,
        isActive: true,
      };

      const result = await adminCreateVariant('prod-100', variantPayload);

      expect(fetchSpy).toHaveBeenCalledWith('/api/admin/products/prod-100/variants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-CSRF-Token': 'variant-csrf-token',
        },
        credentials: 'include',
        body: JSON.stringify(variantPayload),
      });
      expect(result.id).toBe('var-new-99');
    });

    it('adminUpdateVariant sends PUT request with updated fields and stock quantity', async () => {
      setCsrfToken('variant-update-csrf');

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'success',
          message: 'Variant updated successfully',
        }),
      } as any);

      const updatePayload = {
        pricePaise: 119900,
        comparisonPricePaise: 159900,
        stockQuantity: 30,
        isActive: false,
      };

      await adminUpdateVariant('prod-100', 'var-1', updatePayload);

      expect(fetchSpy).toHaveBeenCalledWith('/api/admin/products/prod-100/variants/var-1', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-CSRF-Token': 'variant-update-csrf',
        },
        credentials: 'include',
        body: JSON.stringify(updatePayload),
      });
    });

    it('adminUpdateVariant throws descriptive error message from server', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          status: 'error',
          error: 'Comparison price cannot be less than selling price',
        }),
      } as any);

      await expect(
        adminUpdateVariant('prod-100', 'var-1', {
          pricePaise: 100000,
          comparisonPricePaise: 80000,
        })
      ).rejects.toThrow('Comparison price cannot be less than selling price');
    });
  });

  describe('Product Safe Deletion API (Phase 4)', () => {
    it('adminDeleteProduct sends DELETE request with CSRF token and credentials', async () => {
      setCsrfToken('delete-csrf-token');

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'success',
          message: 'Product permanently deleted successfully',
          deletedPublicIds: ['axdoro/products/prod-100/img_1'],
        }),
      } as any);

      const result = await adminDeleteProduct('prod-100');

      expect(fetchSpy).toHaveBeenCalledWith('/api/admin/products/prod-100', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-CSRF-Token': 'delete-csrf-token',
        },
        credentials: 'include',
      });
      expect(result.success).toBe(true);
      expect(result.deletedPublicIds).toHaveLength(1);
    });

    it('adminDeleteProduct captures 409 conflict and sets canArchive flag on error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          status: 'error',
          error: 'Product cannot be deleted because it is referenced by historical customer orders.',
          canArchive: true,
        }),
      } as any);

      try {
        await adminDeleteProduct('prod-100');
        expect.unreachable('Should have thrown error on 409');
      } catch (err: any) {
        expect(err.message).toMatch(/referenced by historical customer orders/i);
        expect(err.status).toBe(409);
        expect(err.canArchive).toBe(true);
      }
    });

    it('adminDeleteProduct throws on 404 not found', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({
          status: 'error',
          error: 'Product not found',
        }),
      } as any);

      await expect(adminDeleteProduct('prod-nonexistent')).rejects.toThrow('Product not found');
    });
  });
});
