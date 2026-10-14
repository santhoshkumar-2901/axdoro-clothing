import { describe, it, expect } from 'vitest';
import { cn } from './lib/utils.ts';

describe('Admin Portal Route Isolation & UI Helpers (Phase 2)', () => {
  it('cn helper combines class strings and handles Tailwind class merging correctly', () => {
    const combined = cn('px-4 py-2', 'bg-axdoro-bg', { 'text-white': true, 'hidden': false });
    expect(combined).toContain('px-4');
    expect(combined).toContain('py-2');
    expect(combined).toContain('bg-axdoro-bg');
    expect(combined).toContain('text-white');
    expect(combined).not.toContain('hidden');

    // Tailwing merge overrides conflicting utilities
    const overridden = cn('p-2', 'p-4');
    expect(overridden).toBe('p-4');
  });

  it('correctly maps URL pathnames to supported Admin tabs', () => {
    function getTabFromPath(pathname: string): string {
      const normalized = pathname.replace(/\/+$/, '');
      if (normalized.endsWith('/products')) return 'products';
      if (normalized.endsWith('/stock')) return 'stock';
      if (normalized.endsWith('/orders')) return 'orders';
      if (normalized.endsWith('/enquiries')) return 'enquiries';
      if (normalized.endsWith('/audit')) return 'audit';
      return 'metrics';
    }

    expect(getTabFromPath('/admin')).toBe('metrics');
    expect(getTabFromPath('/admin/')).toBe('metrics');
    expect(getTabFromPath('/admin/metrics')).toBe('metrics');
    expect(getTabFromPath('/admin/products')).toBe('products');
    expect(getTabFromPath('/admin/stock')).toBe('stock');
    expect(getTabFromPath('/admin/orders')).toBe('orders');
    expect(getTabFromPath('/admin/enquiries')).toBe('enquiries');
    expect(getTabFromPath('/admin/audit')).toBe('audit');
    expect(getTabFromPath('/admin/unknown')).toBe('metrics');
  });

  it('determines admin vs storefront routing correctly', () => {
    const isAdminRoute = (path: string) => path.startsWith('/admin');

    expect(isAdminRoute('/admin')).toBe(true);
    expect(isAdminRoute('/admin/metrics')).toBe(true);
    expect(isAdminRoute('/admin/products')).toBe(true);
    expect(isAdminRoute('/')).toBe(false);
    expect(isAdminRoute('/shop')).toBe(false);
    expect(isAdminRoute('/about')).toBe(false);
  });

  it('correctly calculates and formats discount based on product comparison price', () => {
    function computeDiscount(minPricePaise: number, minComparisonPricePaise?: number | null) {
      const hasDiscount = Boolean(
        minComparisonPricePaise && minComparisonPricePaise > minPricePaise
      );
      const discountPercent = hasDiscount && minComparisonPricePaise
        ? Math.round(((minComparisonPricePaise - minPricePaise) / minComparisonPricePaise) * 100)
        : 0;

      if (!hasDiscount) {
        return { hasDiscount: false, label: 'No discount' };
      }

      return {
        hasDiscount: true,
        discountPercent,
        originalPriceRupees: Math.round(minComparisonPricePaise! / 100),
        sellingPriceRupees: Math.round(minPricePaise / 100),
      };
    }

    // Case 1: Product with discount (₹899 original, ₹699 selling -> 22% OFF)
    const discounted = computeDiscount(69900, 89900);
    expect(discounted.hasDiscount).toBe(true);
    expect(discounted.discountPercent).toBe(22);
    expect(discounted.originalPriceRupees).toBe(899);
    expect(discounted.sellingPriceRupees).toBe(699);

    // Case 2: Product with no comparison price
    const noComp = computeDiscount(69900, null);
    expect(noComp.hasDiscount).toBe(false);
    expect(noComp.label).toBe('No discount');

    // Case 3: Comparison price equal to selling price
    const equalPrice = computeDiscount(69900, 69900);
    expect(equalPrice.hasDiscount).toBe(false);
    expect(equalPrice.label).toBe('No discount');

    // Case 4: Zero comparison price
    const zeroComp = computeDiscount(69900, 0);
    expect(zeroComp.hasDiscount).toBe(false);
    expect(zeroComp.label).toBe('No discount');
  });
});
