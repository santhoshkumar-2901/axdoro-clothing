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
});
