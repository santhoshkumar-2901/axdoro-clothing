import { describe, it, expect } from 'vitest';
import { MOCK_PRODUCTS } from './data/mockProducts.ts';
import { formatPaiseToINR } from './types/product.ts';

describe('AXDORO Storefront Demo Data & State Logic', () => {
  it('contains expected mock products across confirmed categories', () => {
    expect(MOCK_PRODUCTS.length).toBe(8);
    const categorySlugs = new Set(MOCK_PRODUCTS.map((p) => p.category.slug));
    expect(categorySlugs.has('t-shirts')).toBe(true);
    expect(categorySlugs.has('shirts')).toBe(true);
    // Strict requirement: No third invented category
    expect(categorySlugs.size).toBe(2);
  });

  it('correctly includes 140 GSM specification only on applicable T-shirts', () => {
    const gsm140Tees = MOCK_PRODUCTS.filter((p) => p.fabricSpec === '140 GSM');
    expect(gsm140Tees.length).toBeGreaterThanOrEqual(2);
    gsm140Tees.forEach((tee) => {
      expect(tee.category.slug).toBe('t-shirts');
    });
  });

  it('ensures all products have valid pricing in integer paise and non-empty size breakdowns', () => {
    MOCK_PRODUCTS.forEach((p) => {
      expect(p.pricePaise).toBeGreaterThan(0);
      expect(Number.isInteger(p.pricePaise)).toBe(true);
      expect(p.price).toBe(Math.round(p.pricePaise / 100));
      if (p.originalPricePaise) {
        expect(p.originalPricePaise).toBeGreaterThan(p.pricePaise);
        expect(Number.isInteger(p.originalPricePaise)).toBe(true);
      }
      expect(p.sizes.length).toBeGreaterThan(0);
      expect(p.images.length).toBeGreaterThan(0);
    });
  });

  it('calculates cart item subtotal consistently in integer paise and formats to INR', () => {
    const item1Paise = 69900; // ₹699
    const item1Qty = 2;
    const item2Paise = 129900; // ₹1,299
    const item2Qty = 1;
    const subtotalPaise = item1Paise * item1Qty + item2Paise * item2Qty;
    expect(subtotalPaise).toBe(269700);
    expect(formatPaiseToINR(subtotalPaise)).toBe('₹2,697');
  });

  it('correctly detects category routes and extracts category slug from URL pathnames', () => {
    function parseCategoryRoute(pathname: string): { isCategoryRoute: boolean; categorySlug: string } {
      const isCategoryRoute = pathname.startsWith('/category/');
      const categorySlug = isCategoryRoute
        ? decodeURIComponent(pathname.replace(/^\/category\//, '').replace(/\/.*$/, ''))
        : '';
      return { isCategoryRoute, categorySlug };
    }

    expect(parseCategoryRoute('/category/t-shirts')).toEqual({
      isCategoryRoute: true,
      categorySlug: 't-shirts',
    });
    expect(parseCategoryRoute('/category/shirts')).toEqual({
      isCategoryRoute: true,
      categorySlug: 'shirts',
    });
    expect(parseCategoryRoute('/category/casual-shorts')).toEqual({
      isCategoryRoute: true,
      categorySlug: 'casual-shorts',
    });
    expect(parseCategoryRoute('/category/shirts/')).toEqual({
      isCategoryRoute: true,
      categorySlug: 'shirts',
    });
    expect(parseCategoryRoute('/admin/categories')).toEqual({
      isCategoryRoute: false,
      categorySlug: '',
    });
    expect(parseCategoryRoute('/')).toEqual({
      isCategoryRoute: false,
      categorySlug: '',
    });
  });
});
