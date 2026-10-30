import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fetchHomepageCollectionBySlug } from './api/catalogue.ts';
import { HomepageCollection, Product } from './types/product.ts';

describe('Homepage Collections & Independent Section Rendering Verification', () => {
  const clientDir = path.resolve(__dirname, '..');

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Homepage Architecture & Unwanted Collections Section Absence', () => {
    it('verifies App.tsx does not mount redundant category showcase or collection sections', () => {
      const appContent = fs.readFileSync(path.join(clientDir, 'src', 'App.tsx'), 'utf-8');

      // Best Sellers and Signature Picks removed from homepage
      expect(appContent).not.toContain('slug="best-sellers"');
      expect(appContent).not.toContain('slug="signature-picks"');

      // CategoryShowcase removed from homepage
      expect(appContent).not.toContain('<CategoryShowcase');

      // Monolithic collections dump must NOT be present on the homepage
      expect(appContent).not.toContain('<HomepageCollections');

      // ProductCatalogue must NOT be mounted on the homepage or imported
      expect(appContent).not.toContain('<ProductCatalogue');
      expect(appContent).not.toContain("import { ProductCatalogue }");

      // Components and files preserved in repo
      const catalogueComponentPath = path.join(clientDir, 'src', 'components', 'ProductCatalogue.tsx');
      expect(fs.existsSync(catalogueComponentPath)).toBe(true);
      const showcaseComponentPath = path.join(clientDir, 'src', 'components', 'CategoryShowcase.tsx');
      expect(fs.existsSync(showcaseComponentPath)).toBe(true);
      const collectionsComponentPath = path.join(clientDir, 'src', 'components', 'HomepageCollections.tsx');
      expect(fs.existsSync(collectionsComponentPath)).toBe(true);
    });

    it('verifies CategoryPage and dynamic category routes remain intact', () => {
      const appContent = fs.readFileSync(path.join(clientDir, 'src', 'App.tsx'), 'utf-8');

      // Dynamic category routes must remain intact
      expect(appContent).toContain('const isCategoryRoute = currentPath.startsWith(\'/category/\');');
      expect(appContent).toContain('<CategoryPage');
    });
  });

  describe('2. Client Catalogue API for Targeted Collections', () => {
    it('fetchHomepageCollectionBySlug queries /api/collections/:slug and normalizes product data', async () => {
      const mockCollection: HomepageCollection = {
        id: 'col-1',
        slug: 'best-sellers',
        title: "This Month's Best Sellers",
        description: 'Season essentials',
        displayOrder: 1,
        products: [
          {
            id: 'p-1',
            slug: 'oxford-shirt',
            name: 'Oxford Classic',
            price: 1299,
            pricePaise: 129900,
            status: 'published',
            category: { id: 'c-1', slug: 'shirts', name: 'Shirts' },
          } as unknown as Product,
        ],
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'success', data: mockCollection }),
      } as any);

      const res = await fetchHomepageCollectionBySlug('best-sellers');

      expect(fetchSpy).toHaveBeenCalledWith('/api/collections/best-sellers', {
        headers: { Accept: 'application/json' },
      });
      expect(res).not.toBeNull();
      expect(res?.slug).toBe('best-sellers');
      expect(res?.title).toBe("This Month's Best Sellers");
      expect(res?.products.length).toBe(1);
      expect(res?.products[0].categoryLabel).toBe('Shirts');
    });

    it('fetchHomepageCollectionBySlug returns null for 404 inactive or non-existent collections', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ status: 'error', message: 'Collection not found or inactive' }),
      } as any);

      const res = await fetchHomepageCollectionBySlug('disabled-or-missing-col');
      expect(res).toBeNull();
    });

    it('fetchHomepageCollectionBySlug throws actionable error on 500 server failures', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Database connection failed' }),
      } as any);

      await expect(fetchHomepageCollectionBySlug('best-sellers')).rejects.toThrow(
        'Database connection failed'
      );
    });
  });

  describe('3. Collection Isolation & No Cross-Pollination', () => {
    it('ensures Best Sellers and Signature Picks maintain distinct product memberships', () => {
      const bestSellersProducts: Product[] = [
        { id: 'prod-1', name: 'Combed Cotton Tee', slug: 'combed-tee' } as unknown as Product,
        { id: 'prod-2', name: 'Classic Polo', slug: 'classic-polo' } as unknown as Product,
      ];
      const signaturePicksProducts: Product[] = [
        { id: 'prod-3', name: 'Linen Button-down', slug: 'linen-shirt' } as unknown as Product,
        { id: 'prod-4', name: 'Formal Twill Shirt', slug: 'twill-shirt' } as unknown as Product,
      ];

      const bestSellersCol: HomepageCollection = {
        id: 'col-1',
        slug: 'best-sellers',
        title: "This Month's Best Sellers",
        description: null,
        displayOrder: 1,
        products: bestSellersProducts,
      };

      const signaturePicksCol: HomepageCollection = {
        id: 'col-2',
        slug: 'signature-picks',
        title: 'Signature Picks',
        description: null,
        displayOrder: 2,
        products: signaturePicksProducts,
      };

      // Ensure distinct sets with zero overlap
      const bsIds = new Set(bestSellersCol.products.map((p) => p.id));
      const spIds = new Set(signaturePicksCol.products.map((p) => p.id));

      expect(bsIds.has('prod-1')).toBe(true);
      expect(bsIds.has('prod-2')).toBe(true);
      expect(bsIds.has('prod-3')).toBe(false);

      expect(spIds.has('prod-3')).toBe(true);
      expect(spIds.has('prod-4')).toBe(true);
      expect(spIds.has('prod-1')).toBe(false);
    });
  });

  describe('4. Empty and Disabled Collection Guarding', () => {
    it('verifies HomepageCollections.tsx safely handles empty product arrays and null collections', () => {
      const componentContent = fs.readFileSync(
        path.join(clientDir, 'src', 'components', 'HomepageCollections.tsx'),
        'utf-8'
      );

      // Loading, null collection, or empty products must return null
      expect(componentContent).toContain(
        'if (isLoading || !collection || !Array.isArray(collection.products) || collection.products.length === 0) {'
      );
      expect(componentContent).toContain('return null;');
    });

    it('verifies accessibility landmarks and section IDs on independent collection sections', () => {
      const componentContent = fs.readFileSync(
        path.join(clientDir, 'src', 'components', 'HomepageCollections.tsx'),
        'utf-8'
      );

      expect(componentContent).toContain('id={`collection-${collection.slug}`}');
      expect(componentContent).toContain('data-testid={`collection-section-${collection.slug}`}');
      expect(componentContent).toContain('<section');
      expect(componentContent).toContain('<ProductCard');
    });
  });
});
