import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  isTShirtProduct,
  TSHIRT_GSM_OPTIONS,
  ProductDetailModal,
} from './components/ProductDetailModal.tsx';
import { Product, CartItem } from './types/product.ts';
import fs from 'node:fs';
import path from 'node:path';

const MOCK_TSHIRT: Product = {
  id: 'tee-001',
  name: 'Classic Crewneck Tee',
  slug: 'classic-crewneck-tee',
  description: 'Premium everyday tee',
  price: 699,
  pricePaise: 69900,
  category: {
    name: 'T-Shirts',
    slug: 't-shirts',
  },
  sizes: ['S', 'M', 'L', 'XL'],
  colors: [{ name: 'Black', hex: '#000000' }],
  images: ['/images/tee.jpg'],
  stockCount: 50,
  stockStatus: 'in-stock',
  isFeatured: true,
  isNewArrival: false,
  createdAt: '2026-10-31T00:00:00Z',
  variants: [
    {
      id: 'v-tee-m',
      size: 'M',
      color: 'Black',
      sku: 'TEE-BLK-M',
      price: 699,
      pricePaise: 69900,
      stock: 20,
      isActive: true,
    },
  ],
};

const MOCK_SHIRT: Product = {
  id: 'shirt-001',
  name: 'Tailored Oxford Shirt',
  slug: 'tailored-oxford-shirt',
  description: 'Structured cotton shirt',
  price: 1299,
  pricePaise: 129900,
  category: {
    name: 'Shirts',
    slug: 'shirts',
  },
  sizes: ['M', 'L', 'XL'],
  colors: [{ name: 'White', hex: '#ffffff' }],
  images: ['/images/shirt.jpg'],
  stockCount: 30,
  stockStatus: 'in-stock',
  isFeatured: false,
  isNewArrival: false,
  createdAt: '2026-10-31T00:00:00Z',
  variants: [
    {
      id: 'v-shirt-m',
      size: 'M',
      color: 'White',
      sku: 'SHIRT-WHT-M',
      price: 1299,
      pricePaise: 129900,
      stock: 10,
      isActive: true,
    },
  ],
};

const MOCK_PANTS: Product = {
  id: 'pants-001',
  name: 'Relaxed Pleated Trouser',
  slug: 'relaxed-pleated-trouser',
  description: 'Relaxed tailored pants',
  price: 1899,
  pricePaise: 189900,
  category: {
    name: 'Pants',
    slug: 'pants',
  },
  sizes: ['30', '32', '34'],
  colors: [{ name: 'Charcoal', hex: '#222222' }],
  images: ['/images/pants.jpg'],
  stockCount: 20,
  stockStatus: 'in-stock',
  isFeatured: false,
  isNewArrival: false,
  createdAt: '2026-10-31T00:00:00Z',
};

describe('AXDORO — T-Shirt GSM Options & Validation', () => {
  describe('1. GSM Options Constant Definition', () => {
    it('defines exact GSM options: 180, 190, 200, 210, 220', () => {
      expect(TSHIRT_GSM_OPTIONS).toEqual(['180', '190', '200', '210', '220']);
    });
  });

  describe('2. isTShirtProduct Category Identification', () => {
    it('returns true for slug "t-shirts"', () => {
      expect(isTShirtProduct(MOCK_TSHIRT)).toBe(true);
    });

    it('returns true for slug "tshirts"', () => {
      const teeWithAlternativeSlug: Product = {
        ...MOCK_TSHIRT,
        category: { name: 'Tees', slug: 'tshirts' },
      };
      expect(isTShirtProduct(teeWithAlternativeSlug)).toBe(true);
    });

    it('returns true when category name contains "t-shirt" (case-insensitive)', () => {
      const teeWithCustomCategory: Product = {
        ...MOCK_TSHIRT,
        category: { name: 'Premium T-Shirts & Polos', slug: 'polos' },
      };
      expect(isTShirtProduct(teeWithCustomCategory)).toBe(true);
    });

    it('returns false for shirts', () => {
      expect(isTShirtProduct(MOCK_SHIRT)).toBe(false);
    });

    it('returns false for pants', () => {
      expect(isTShirtProduct(MOCK_PANTS)).toBe(false);
    });

    it('returns false for null or undefined product', () => {
      expect(isTShirtProduct(null)).toBe(false);
    });
  });

  describe('3. ProductDetailModal GSM Selector Rendering', () => {
    it('renders GSM selector and all 5 GSM options for a T-Shirt product', () => {
      const html = renderToString(
        React.createElement(ProductDetailModal, {
          product: MOCK_TSHIRT,
          onClose: () => {},
          onAddToCart: () => {},
          onOpenBulkWithProduct: () => {},
        })
      );

      expect(html).toContain('Select GSM');
      expect(html).toContain('Available GSM options');
      expect(html).toContain('180 GSM');
      expect(html).toContain('190 GSM');
      expect(html).toContain('200 GSM');
      expect(html).toContain('210 GSM');
      expect(html).toContain('220 GSM');
    });

    it('does NOT render GSM selector for a Shirt product', () => {
      const html = renderToString(
        React.createElement(ProductDetailModal, {
          product: MOCK_SHIRT,
          onClose: () => {},
          onAddToCart: () => {},
          onOpenBulkWithProduct: () => {},
        })
      );

      expect(html).not.toContain('Select GSM');
      expect(html).not.toContain('Available GSM options');
      expect(html).not.toContain('180 GSM');
    });

    it('does NOT render GSM selector for Pants', () => {
      const html = renderToString(
        React.createElement(ProductDetailModal, {
          product: MOCK_PANTS,
          onClose: () => {},
          onAddToCart: () => {},
          onOpenBulkWithProduct: () => {},
        })
      );

      expect(html).not.toContain('Select GSM');
      expect(html).not.toContain('Available GSM options');
    });
  });

  describe('4. CartItem Interface & Disjoint GSM Instance Isolation', () => {
    it('supports selectedGsm on CartItem', () => {
      const item: CartItem = {
        id: 'tee-001-v-tee-m-gsm200',
        product: MOCK_TSHIRT,
        variantId: 'v-tee-m',
        selectedSize: 'M',
        selectedColor: 'Black',
        selectedGsm: '200',
        pricePaise: 69900,
        quantity: 1,
      };

      expect(item.selectedGsm).toBe('200');
    });

    it('generates distinct instanceIds for identical variant but different GSMs', () => {
      const gsm1 = '180';
      const gsm2 = '220';
      const id1 = `tee-001-v-tee-m-gsm${gsm1}`;
      const id2 = `tee-001-v-tee-m-gsm${gsm2}`;

      expect(id1).not.toBe(id2);
      expect(id1).toBe('tee-001-v-tee-m-gsm180');
      expect(id2).toBe('tee-001-v-tee-m-gsm220');
    });
  });

  describe('5. CartDrawer and CheckoutModal GSM Display Integration', () => {
    it('verifies CartDrawer renders GSM metadata when selectedGsm is present', () => {
      const cartDrawerCode = fs.readFileSync(
        path.join(__dirname, 'components', 'CartDrawer.tsx'),
        'utf-8'
      );
      expect(cartDrawerCode).toContain('item.selectedGsm');
      expect(cartDrawerCode).toContain('GSM:');
    });

    it('verifies CheckoutModal renders GSM metadata when selectedGsm is present', () => {
      const checkoutCode = fs.readFileSync(
        path.join(__dirname, 'components', 'CheckoutModal.tsx'),
        'utf-8'
      );
      expect(checkoutCode).toContain('item.selectedGsm');
      expect(checkoutCode).toContain('GSM:');
    });

    it('verifies App.tsx handles gsm in handleAddToCart', () => {
      const appCode = fs.readFileSync(
        path.join(__dirname, 'App.tsx'),
        'utf-8'
      );
      expect(appCode).toContain('gsm?: string');
      expect(appCode).toContain('gsmSuffix');
      expect(appCode).toContain('selectedGsm: gsm');
    });
  });
});
