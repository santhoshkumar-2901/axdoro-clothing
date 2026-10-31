import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('AXDORO — Admin Orders Items Display & Details Modal', () => {
  const adminPortalPath = path.resolve(__dirname, 'components', 'admin', 'AdminPortal.tsx');
  const adminApiPath = path.resolve(__dirname, 'api', 'admin.ts');

  const portalContent = fs.readFileSync(adminPortalPath, 'utf-8');
  const apiContent = fs.readFileSync(adminApiPath, 'utf-8');

  it('defines AdminOrderItem and items property on AdminOrder in admin.ts', () => {
    expect(apiContent).toContain('export interface AdminOrderItem');
    expect(apiContent).toContain('productName: string;');
    expect(apiContent).toContain('variantSku?: string | null;');
    expect(apiContent).toContain('variantSize?: string | null;');
    expect(apiContent).toContain('variantColor?: string | null;');
    expect(apiContent).toContain('unitPricePaise: number;');
    expect(apiContent).toContain('quantity: number;');
    expect(apiContent).toContain('lineTotalPaise: number;');
    expect(apiContent).toContain('items?: AdminOrderItem[];');
  });

  it('contains Items Ordered column in the admin orders table', () => {
    const ordersSectionStart = portalContent.indexOf('/* 3. Orders Tab */');
    expect(ordersSectionStart).toBeGreaterThan(-1);

    const ordersSectionEnd = portalContent.indexOf('/* 5. Enquiries Tab */', ordersSectionStart);
    expect(ordersSectionEnd).toBeGreaterThan(-1);

    const ordersSection = portalContent.substring(ordersSectionStart, ordersSectionEnd);

    // Verify column headers
    expect(ordersSection).toContain('<TableHead className="min-w-[200px]">Items Ordered</TableHead>');
    expect(ordersSection).toContain('<TableHead className="text-right">Actions</TableHead>');

    // Verify row item rendering
    expect(ordersSection).toContain('order.items');
    expect(ordersSection).toContain('item.productName');
    expect(ordersSection).toContain('item.variantSize');
    expect(ordersSection).toContain('item.variantColor');
    expect(ordersSection).toContain('&times;{item.quantity}');
    expect(ordersSection).toContain('setSelectedOrderDetails(order)');
  });

  it('contains Order Details Modal with full shipping and line item breakdown', () => {
    expect(portalContent).toContain('{/* Order Details Modal */}');
    expect(portalContent).toContain('selectedOrderDetails &&');
    expect(portalContent).toContain('id="order-details-dialog-title"');
    expect(portalContent).toContain('selectedOrderDetails.shippingAddressLine1');
    expect(portalContent).toContain('selectedOrderDetails.shippingCity');
    expect(portalContent).toContain('selectedOrderDetails.items');
    expect(portalContent).toContain('item.lineTotalPaise');
    expect(portalContent).toContain('selectedOrderDetails.totalPaise');
  });
});
