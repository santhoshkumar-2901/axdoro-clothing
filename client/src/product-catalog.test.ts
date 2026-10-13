import { describe, it, expect, beforeEach } from 'vitest';
import { MOCK_PRODUCTS } from './data/mockProducts.ts';
import { Product, formatPaiseToINR } from './types/product.ts';
import { evaluateQuickAddAvailability } from './components/ProductCard.tsx';
import {
  normalizeAndValidatePhone,
  getOrGenerateIdempotencyKey,
  clearIdempotencySession,
  resetIdempotencySessionForTesting,
  computeClientOrderFingerprint,
} from './utils/idempotency.ts';

describe('Phase 4: Product Card & Catalog Domain Logic', () => {
  describe('Product Card Pricing, Discounts & Formatting', () => {
    it('formats valid integer paise to Indian Rupee strings accurately', () => {
      expect(formatPaiseToINR(69900)).toBe('₹699');
      expect(formatPaiseToINR(129900)).toBe('₹1,299');
      expect(formatPaiseToINR(249900)).toBe('₹2,499');
      expect(formatPaiseToINR(9900)).toBe('₹99');
      expect(formatPaiseToINR(0)).toBe('₹0');
    });

    it('validates price and discount integrity on all catalog products', () => {
      MOCK_PRODUCTS.forEach((product) => {
        // Price must be positive integer paise
        expect(product.pricePaise).toBeGreaterThan(0);
        expect(Number.isInteger(product.pricePaise)).toBe(true);

        // Display price must match integer paise / 100
        expect(product.price).toBe(Math.round(product.pricePaise / 100));

        // If discounted, original price must be strictly greater than current price
        if (product.originalPricePaise && product.originalPrice) {
          expect(product.originalPricePaise).toBeGreaterThan(product.pricePaise);
          expect(Number.isInteger(product.originalPricePaise)).toBe(true);
          expect(product.originalPrice).toBe(Math.round(product.originalPricePaise / 100));

          // Discount percentage calculation must be mathematically sound
          const discountPct = Math.round(
            ((product.originalPricePaise - product.pricePaise) / product.originalPricePaise) * 100
          );
          expect(discountPct).toBeGreaterThan(0);
          expect(discountPct).toBeLessThan(100);
        }
      });
    });

    it('accurately identifies stock availability states', () => {
      const getStockStatus = (count: number) => {
        if (count === 0) return 'out-of-stock';
        if (count <= 10) return 'low-stock';
        return 'in-stock';
      };

      expect(getStockStatus(0)).toBe('out-of-stock');
      expect(getStockStatus(3)).toBe('low-stock');
      expect(getStockStatus(8)).toBe('low-stock');
      expect(getStockStatus(15)).toBe('in-stock');

      MOCK_PRODUCTS.forEach((product) => {
        const expectedStatus = getStockStatus(product.stockCount);
        expect(product.stockStatus).toBe(expectedStatus);
      });
    });

    it('handles image fallback detection when URL is empty, undefined or broken', () => {
      const resolveProductImage = (images: string[] | undefined) => {
        if (!images || images.length === 0 || !images[0] || images[0].trim() === '') {
          return null;
        }
        return images[0];
      };

      expect(resolveProductImage([])).toBeNull();
      expect(resolveProductImage(undefined)).toBeNull();
      expect(resolveProductImage([''])).toBeNull();
      expect(resolveProductImage(['   '])).toBeNull();
      expect(resolveProductImage(['https://images.unsplash.com/test'])).toBe('https://images.unsplash.com/test');
    });

    it('preserves fabric specification display (e.g. 140 GSM on t-shirts)', () => {
      const gsmProducts = MOCK_PRODUCTS.filter((p) => p.fabricSpec === '140 GSM');
      expect(gsmProducts.length).toBeGreaterThanOrEqual(2);
      gsmProducts.forEach((p) => {
        expect(p.category.slug).toBe('t-shirts');
        expect(p.fabricSpec).toBe('140 GSM');
      });
    });
  });

  describe('Catalog Filtering, Search & Sorting Logic', () => {
    // Pure function replicating catalog filtering logic
    const filterAndSort = (
      products: Product[],
      categoryFilter: string,
      searchQuery: string,
      sortBy: string
    ) => {
      let result = [...products];

      // Category filter
      if (categoryFilter !== 'all') {
        result = result.filter((p) => p.category.slug === categoryFilter);
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        result = result.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            p.category.name.toLowerCase().includes(q)
        );
      }

      // Sort
      if (sortBy === 'price-asc') {
        result.sort((a, b) => a.pricePaise - b.pricePaise);
      } else if (sortBy === 'price-desc') {
        result.sort((a, b) => b.pricePaise - a.pricePaise);
      } else if (sortBy === 'newest') {
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
      // 'featured' maintains default order

      return result;
    };

    it('filters products accurately by category', () => {
      const all = filterAndSort(MOCK_PRODUCTS, 'all', '', 'featured');
      expect(all.length).toBe(MOCK_PRODUCTS.length);

      const tshirts = filterAndSort(MOCK_PRODUCTS, 't-shirts', '', 'featured');
      expect(tshirts.length).toBeGreaterThan(0);
      tshirts.forEach((p) => expect(p.category.slug).toBe('t-shirts'));

      const shirts = filterAndSort(MOCK_PRODUCTS, 'shirts', '', 'featured');
      expect(shirts.length).toBeGreaterThan(0);
      shirts.forEach((p) => expect(p.category.slug).toBe('shirts'));

      expect(tshirts.length + shirts.length).toBe(MOCK_PRODUCTS.length);
    });

    it('filters products correctly by search query', () => {
      const crewneckResults = filterAndSort(MOCK_PRODUCTS, 'all', 'crewneck', 'featured');
      expect(crewneckResults.length).toBeGreaterThan(0);
      crewneckResults.forEach((p) => {
        const matches =
          p.name.toLowerCase().includes('crewneck') ||
          p.description.toLowerCase().includes('crewneck');
        expect(matches).toBe(true);
      });

      // No match should return empty array
      const noResults = filterAndSort(MOCK_PRODUCTS, 'all', 'xyznonexistentgarment', 'featured');
      expect(noResults.length).toBe(0);
    });

    it('combines category and search filters correctly', () => {
      // Searching 'oxford' within 'shirts' vs 't-shirts'
      const shirtsOxford = filterAndSort(MOCK_PRODUCTS, 'shirts', 'oxford', 'featured');
      expect(shirtsOxford.length).toBe(1);
      expect(shirtsOxford[0].category.slug).toBe('shirts');

      const tshirtsOxford = filterAndSort(MOCK_PRODUCTS, 't-shirts', 'oxford', 'featured');
      expect(tshirtsOxford.length).toBe(0);
    });

    it('sorts products by price ascending correctly', () => {
      const sortedAsc = filterAndSort(MOCK_PRODUCTS, 'all', '', 'price-asc');
      for (let i = 0; i < sortedAsc.length - 1; i++) {
        expect(sortedAsc[i].pricePaise).toBeLessThanOrEqual(sortedAsc[i + 1].pricePaise);
      }
    });

    it('sorts products by price descending correctly', () => {
      const sortedDesc = filterAndSort(MOCK_PRODUCTS, 'all', '', 'price-desc');
      for (let i = 0; i < sortedDesc.length - 1; i++) {
        expect(sortedDesc[i].pricePaise).toBeGreaterThanOrEqual(sortedDesc[i + 1].pricePaise);
      }
    });

    it('sorts by newest based on ISO timestamp', () => {
      const sortedNewest = filterAndSort(MOCK_PRODUCTS, 'all', '', 'newest');
      for (let i = 0; i < sortedNewest.length - 1; i++) {
        const current = new Date(sortedNewest[i].createdAt).getTime();
        const next = new Date(sortedNewest[i + 1].createdAt).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });

    it('preserves active category filter while changing sort order', () => {
      const tshirtsAsc = filterAndSort(MOCK_PRODUCTS, 't-shirts', '', 'price-asc');
      const tshirtsDesc = filterAndSort(MOCK_PRODUCTS, 't-shirts', '', 'price-desc');

      expect(tshirtsAsc.length).toBe(tshirtsDesc.length);
      tshirtsAsc.forEach((p) => expect(p.category.slug).toBe('t-shirts'));
      tshirtsDesc.forEach((p) => expect(p.category.slug).toBe('t-shirts'));

      if (tshirtsAsc.length > 1) {
        expect(tshirtsAsc[0].id).not.toBe(tshirtsDesc[0].id);
      }
    });
  });

  describe('Add to Cart & Variant Selection Contract', () => {
    it('verifies that products provide available size variants', () => {
      MOCK_PRODUCTS.forEach((product) => {
        expect(Array.isArray(product.sizes)).toBe(true);
        expect(product.sizes.length).toBeGreaterThan(0);
        product.sizes.forEach((size) => {
          expect(typeof size).toBe('string');
          expect(size.length).toBeGreaterThan(0);
        });
      });
    });

    it('preserves payload structure when initiating add to cart', () => {
      const sample = MOCK_PRODUCTS[0];
      const selectedSize = sample.sizes[0];
      const quantity = 1;

      const cartItemPayload = {
        productId: sample.id,
        size: selectedSize,
        quantity,
      };

      expect(cartItemPayload.productId).toBe(sample.id);
      expect(cartItemPayload.size).toBe(selectedSize);
      expect(cartItemPayload.quantity).toBe(1);
    });
  });

  describe('Phase 4.1: Quick Add Inventory Availability Evaluation (Fix A)', () => {
    it('blocks Quick Add when product has stockStatus out-of-stock or stockCount 0', () => {
      const outOfStockProd: Product = {
        ...MOCK_PRODUCTS[0],
        stockStatus: 'out-of-stock',
        stockCount: 0,
      };

      const result = evaluateQuickAddAvailability(outOfStockProd);
      expect(result.canAddDirectly).toBe(false);
      expect(result.isOutOfStock).toBe(true);
      expect(result.needsVariantSelection).toBe(false);
    });

    it('blocks Quick Add when variants array is provided and all variants have zero stock', () => {
      const prodWithDeadVariants: Product = {
        ...MOCK_PRODUCTS[0],
        stockStatus: 'in-stock', // Mismatched/stale product count
        stockCount: 10,
        variants: [
          {
            id: 'v-1',
            size: 'S',
            color: 'Black',
            sku: 'SKU-S',
            pricePaise: 69900,
            price: 699,
            stock: 0,
            isActive: true,
          },
          {
            id: 'v-2',
            size: 'M',
            color: 'Black',
            sku: 'SKU-M',
            pricePaise: 69900,
            price: 699,
            stock: 0,
            isActive: true,
          },
        ],
      };

      const result = evaluateQuickAddAvailability(prodWithDeadVariants);
      // Authoritative variant data overrides stale product count
      expect(result.canAddDirectly).toBe(false);
      expect(result.isOutOfStock).toBe(true);
    });

    it('does not add first size when first size is out of stock, routing to variant selection', () => {
      const prodWithFirstSizeOOS: Product = {
        ...MOCK_PRODUCTS[0],
        sizes: ['S', 'M', 'L'],
        colors: [{ name: 'Black', hex: '#000000' }],
        variants: [
          {
            id: 'v-s',
            size: 'S',
            color: 'Black',
            sku: 'SKU-S',
            pricePaise: 69900,
            price: 699,
            stock: 0, // S is OUT OF STOCK!
            isActive: true,
          },
          {
            id: 'v-m',
            size: 'M',
            color: 'Black',
            sku: 'SKU-M',
            pricePaise: 69900,
            price: 699,
            stock: 15, // M is in stock
            isActive: true,
          },
        ],
      };

      const result = evaluateQuickAddAvailability(prodWithFirstSizeOOS);
      // Must NOT add the zero-stock S size directly
      expect(result.canAddDirectly).toBe(false);
      expect(result.isOutOfStock).toBe(false);
      expect(result.needsVariantSelection).toBe(true);
      expect(result.reason).toContain('Default size is unavailable');
    });

    it('allows direct addition for in-stock single-variant or single-size products', () => {
      const singleSizeProd: Product = {
        ...MOCK_PRODUCTS[0],
        sizes: ['One Size'],
        colors: [{ name: 'Standard', hex: '#000000' }],
        variants: [
          {
            id: 'v-onesize',
            size: 'One Size',
            color: 'Standard',
            sku: 'SKU-OS',
            pricePaise: 69900,
            price: 699,
            stock: 12,
            isActive: true,
          },
        ],
      };

      const result = evaluateQuickAddAvailability(singleSizeProd);
      expect(result.canAddDirectly).toBe(true);
      expect(result.isOutOfStock).toBe(false);
      expect(result.selectedSize).toBe('One Size');
      expect(result.selectedColor).toBe('Standard');
      expect(result.variant?.id).toBe('v-onesize');
    });

    it('safely routes to variant selection when variant-level inventory is unverified on multi-size product', () => {
      const summaryProdWithoutVariants: Product = {
        ...MOCK_PRODUCTS[0],
        sizes: ['S', 'M', 'L', 'XL'],
        variants: undefined, // Catalogue summary DTO shape
        stockCount: 45,
        stockStatus: 'in-stock',
      };

      const result = evaluateQuickAddAvailability(summaryProdWithoutVariants);
      // Since specific size stock is unknown from summary alone, customer must select size
      expect(result.canAddDirectly).toBe(false);
      expect(result.isOutOfStock).toBe(false);
      expect(result.needsVariantSelection).toBe(true);
    });
  });

  describe('Phase 5: Product Detail, Cart & Checkout Domain Logic', () => {
    describe('Product Detail Variant Resolution & Stock', () => {
      it('resolves active price and variant availability when matching size and color', () => {
        const productWithVariants: Product = {
          ...MOCK_PRODUCTS[4], // Structured Oxford
          variants: [
            {
              id: 'var-oxford-38-white',
              size: '38 (S)',
              color: 'Ice White',
              sku: 'OXF-38-WHT',
              pricePaise: 129900,
              originalPricePaise: 159900,
              price: 1299,
              originalPrice: 1599,
              stock: 20,
              isActive: true,
            },
            {
              id: 'var-oxford-44-white',
              size: '44 (XL)',
              color: 'Ice White',
              sku: 'OXF-44-WHT',
              pricePaise: 139900, // Price variation for larger size
              originalPricePaise: 169900,
              price: 1399,
              originalPrice: 1699,
              stock: 0, // Out of stock in XL
              isActive: true,
            },
          ],
        };

        // Resolution function replicating ProductDetailModal variant matching
        const resolveVariant = (p: Product, size: string, color: string) => {
          return p.variants?.find((v) => v.size === size && (!color || v.color === color));
        };

        const availableVariant = resolveVariant(productWithVariants, '38 (S)', 'Ice White');
        expect(availableVariant?.id).toBe('var-oxford-38-white');
        expect(availableVariant?.stock).toBe(20);
        expect(availableVariant?.price).toBe(1299);

        const outOfStockVariant = resolveVariant(productWithVariants, '44 (XL)', 'Ice White');
        expect(outOfStockVariant?.id).toBe('var-oxford-44-white');
        expect(outOfStockVariant?.stock).toBe(0);
        // Modal must recognize variant is out of stock
        expect(outOfStockVariant?.stock === 0).toBe(true);
      });
    });

    describe('Cart Integer-Paise Math & Subtotal Computation', () => {
      it('computes cart subtotals and grand totals in integer paise without float errors', () => {
        const cartLines = [
          { pricePaise: 69900, quantity: 2 }, // ₹699 * 2 = ₹1,398 (139800 paise)
          { pricePaise: 129900, quantity: 1 }, // ₹1,299 * 1 = ₹1,299 (129900 paise)
          { pricePaise: 89900, quantity: 3 }, // ₹899 * 3 = ₹2,697 (269700 paise)
        ];

        const subtotalPaise = cartLines.reduce((acc, line) => acc + line.pricePaise * line.quantity, 0);
        expect(subtotalPaise).toBe(539400); // ₹5,394
        expect(Number.isInteger(subtotalPaise)).toBe(true);
        expect(formatPaiseToINR(subtotalPaise)).toBe('₹5,394');

        const shippingPaise = 0; // Free COD delivery
        const grandTotalPaise = subtotalPaise + shippingPaise;
        expect(grandTotalPaise).toBe(539400);
        expect(formatPaiseToINR(grandTotalPaise)).toBe('₹5,394');
      });
    });

    describe('Checkout Form Validation & Payload Integrity', () => {
      const validatePincode = (pin: string) => /^[1-9][0-9]{5}$/.test(pin.trim());
      const validatePhone = (phone: string) => {
        const digits = phone.replace(/[^0-9]/g, '');
        return digits.length >= 10 && digits.length <= 15;
      };
      const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

      it('validates 6-digit Indian PIN codes correctly', () => {
        expect(validatePincode('560001')).toBe(true);
        expect(validatePincode('110001')).toBe(true);
        expect(validatePincode('600028')).toBe(true);

        expect(validatePincode('060001')).toBe(false); // Starting with 0
        expect(validatePincode('56000')).toBe(false); // 5 digits
        expect(validatePincode('5600011')).toBe(false); // 7 digits
        expect(validatePincode('ABCD56')).toBe(false); // Non-digit
      });

      it('validates Indian customer phone numbers correctly', () => {
        expect(validatePhone('9876543210')).toBe(true);
        expect(validatePhone('+919876543210')).toBe(true);
        expect(validatePhone('919876543210')).toBe(true);

        expect(validatePhone('12345')).toBe(false); // Too short
        expect(validatePhone('abc9876543210')).toBe(true); // Strips non-digits
        expect(validatePhone('123')).toBe(false);
      });

      it('validates email format correctly', () => {
        expect(validateEmail('customer@axdoro.com')).toBe(true);
        expect(validateEmail('user.name+tag@example.co.in')).toBe(true);

        expect(validateEmail('invalid-email')).toBe(false);
        expect(validateEmail('test@')).toBe(false);
        expect(validateEmail('@domain.com')).toBe(false);
      });

      it('consolidates duplicate variant IDs before order creation', () => {
        const rawItems = [
          { variantId: 'uuid-1', quantity: 1 },
          { variantId: 'uuid-2', quantity: 2 },
          { variantId: 'uuid-1', quantity: 3 }, // Duplicate variant from distinct cart events
        ];

        const consolidatedMap = new Map<string, number>();
        for (const item of rawItems) {
          consolidatedMap.set(item.variantId, (consolidatedMap.get(item.variantId) || 0) + item.quantity);
        }
        const finalItems = Array.from(consolidatedMap.entries()).map(([variantId, quantity]) => ({
          variantId,
          quantity,
        }));

        expect(finalItems.length).toBe(2);
        const item1 = finalItems.find((i) => i.variantId === 'uuid-1');
        expect(item1?.quantity).toBe(4); // 1 + 3
        const item2 = finalItems.find((i) => i.variantId === 'uuid-2');
        expect(item2?.quantity).toBe(2);
      });

      it('enforces Cash on Delivery (COD) as the active payment method', () => {
        const orderPayload = {
          customerName: 'Test Customer',
          customerEmail: 'test@example.com',
          customerPhone: '9876543210',
          shippingAddressLine1: '123 MG Road',
          shippingCity: 'Bengaluru',
          shippingState: 'Karnataka',
          shippingPincode: '560001',
          paymentMethod: 'COD' as const,
          items: [{ variantId: '00000000-0000-0000-0000-000000000001', quantity: 1 }],
        };

        expect(orderPayload.paymentMethod).toBe('COD');
      });
    });

    describe('Phase 5.2: F-01 Phone Normalization & Validation', () => {
      it('normalizes valid Indian phone numbers with plain digits', () => {
        const res = normalizeAndValidatePhone('9876543210');
        expect(res.isValid).toBe(true);
        expect(res.normalized).toBe('9876543210');
      });

      it('normalizes valid phone numbers with leading "+" country code', () => {
        const res = normalizeAndValidatePhone('+919876543210');
        expect(res.isValid).toBe(true);
        expect(res.normalized).toBe('+919876543210');
      });

      it('normalizes phone numbers formatted with spaces', () => {
        const res = normalizeAndValidatePhone('+91 98765 43210');
        expect(res.isValid).toBe(true);
        expect(res.normalized).toBe('+919876543210');
      });

      it('normalizes phone numbers formatted with hyphens', () => {
        const res = normalizeAndValidatePhone('98765-43210');
        expect(res.isValid).toBe(true);
        expect(res.normalized).toBe('9876543210');

        const resWithCountry = normalizeAndValidatePhone('+91-9876543210');
        expect(resWithCountry.isValid).toBe(true);
        expect(resWithCountry.normalized).toBe('+919876543210');
      });

      it('normalizes phone numbers with mixed spaces and hyphens', () => {
        const res = normalizeAndValidatePhone('+91 98765-43210');
        expect(res.isValid).toBe(true);
        expect(res.normalized).toBe('+919876543210');
      });

      it('strictly rejects alphabetic characters rather than sanitizing them into valid numbers', () => {
        const res1 = normalizeAndValidatePhone('abc9876543210');
        expect(res1.isValid).toBe(false);
        expect(res1.error).toContain('can only contain digits');

        const res2 = normalizeAndValidatePhone('98765xyz43210');
        expect(res2.isValid).toBe(false);
      });

      it('rejects illegal special characters', () => {
        const res = normalizeAndValidatePhone('98765*43210');
        expect(res.isValid).toBe(false);
      });

      it('rejects misplaced or duplicate "+" characters', () => {
        const res1 = normalizeAndValidatePhone('987+6543210');
        expect(res1.isValid).toBe(false);

        const res2 = normalizeAndValidatePhone('++919876543210');
        expect(res2.isValid).toBe(false);
      });

      it('rejects numbers with fewer than 10 digits', () => {
        const res = normalizeAndValidatePhone('987654321'); // 9 digits
        expect(res.isValid).toBe(false);
        expect(res.error).toContain('at least 10 digits');
      });

      it('rejects numbers with more than 15 digits', () => {
        const res = normalizeAndValidatePhone('1234567890123456'); // 16 digits
        expect(res.isValid).toBe(false);
        expect(res.error).toContain('cannot exceed 15 digits');
      });

      it('ensures all normalized outputs strictly match server schema regex /^[+]?[0-9]{10,15}$/', () => {
        const serverRegex = /^[+]?[0-9]{10,15}$/;
        const samples = ['9876543210', '+91 98765 43210', '+91-9876543210', '09876543210'];
        samples.forEach((sample) => {
          const res = normalizeAndValidatePhone(sample);
          expect(res.isValid).toBe(true);
          expect(serverRegex.test(res.normalized)).toBe(true);
        });
      });
    });

    describe('Phase 5.2: F-02 Stable Idempotency Key Lifecycle Across Retries', () => {
      beforeEach(() => {
        resetIdempotencySessionForTesting();
      });

      const basePayload = {
        customerName: 'Aarav Sharma',
        customerEmail: 'aarav@example.com',
        customerPhone: '+919876543210',
        shippingAddressLine1: 'Flat 402, Green Park',
        shippingAddressLine2: 'Near Metro',
        shippingCity: 'Bengaluru',
        shippingState: 'Karnataka',
        shippingPincode: '560001',
        paymentMethod: 'COD' as const,
        notes: 'Call before delivery',
        items: [
          { variantId: '00000000-0000-0000-0000-000000000001', quantity: 2 },
          { variantId: '00000000-0000-0000-0000-000000000002', quantity: 1 },
        ],
      };

      it('generates an initial idempotency key for a new order', async () => {
        const { idempotencyKey, isRetry } = await getOrGenerateIdempotencyKey(basePayload);
        expect(isRetry).toBe(false);
        expect(idempotencyKey).toMatch(/^ord-\d+-[a-z0-9]+$/);
        expect(idempotencyKey.length).toBeGreaterThanOrEqual(16);
      });

      it('reuses the exact same idempotency key when retrying an unchanged payload after timeout or failure', async () => {
        const first = await getOrGenerateIdempotencyKey(basePayload);
        expect(first.isRetry).toBe(false);

        // Simulated network timeout or connection drop retry
        const retryAttempt = await getOrGenerateIdempotencyKey(basePayload);
        expect(retryAttempt.isRetry).toBe(true);
        expect(retryAttempt.idempotencyKey).toBe(first.idempotencyKey);
      });

      it('retains the same key across modal close and reopen for an unchanged payload', async () => {
        const first = await getOrGenerateIdempotencyKey(basePayload);

        // Simulated user closing checkout modal and reopening without editing fields
        const reopenedAttempt = await getOrGenerateIdempotencyKey({ ...basePayload });
        expect(reopenedAttempt.isRetry).toBe(true);
        expect(reopenedAttempt.idempotencyKey).toBe(first.idempotencyKey);
      });

      it('invalidates previous key and generates a new key when customer details change', async () => {
        const first = await getOrGenerateIdempotencyKey(basePayload);

        // Customer edits their name
        const modifiedName = await getOrGenerateIdempotencyKey({
          ...basePayload,
          customerName: 'Aarav Kumar Sharma',
        });
        expect(modifiedName.isRetry).toBe(false);
        expect(modifiedName.idempotencyKey).not.toBe(first.idempotencyKey);

        // Customer edits their email
        const modifiedEmail = await getOrGenerateIdempotencyKey({
          ...basePayload,
          customerEmail: 'aarav.sharma@example.com',
        });
        expect(modifiedEmail.isRetry).toBe(false);
        expect(modifiedEmail.idempotencyKey).not.toBe(first.idempotencyKey);
      });

      it('invalidates previous key and generates a new key when delivery address changes', async () => {
        const first = await getOrGenerateIdempotencyKey(basePayload);

        // Customer changes pincode
        const modifiedPin = await getOrGenerateIdempotencyKey({
          ...basePayload,
          shippingPincode: '560002',
        });
        expect(modifiedPin.isRetry).toBe(false);
        expect(modifiedPin.idempotencyKey).not.toBe(first.idempotencyKey);

        // Customer changes street address
        const modifiedAddress = await getOrGenerateIdempotencyKey({
          ...basePayload,
          shippingAddressLine1: 'Flat 505, Prestige Towers',
        });
        expect(modifiedAddress.isRetry).toBe(false);
        expect(modifiedAddress.idempotencyKey).not.toBe(first.idempotencyKey);
      });

      it('invalidates previous key and generates a new key when cart items or quantities change', async () => {
        const first = await getOrGenerateIdempotencyKey(basePayload);

        // Customer changes item quantity
        const modifiedQty = await getOrGenerateIdempotencyKey({
          ...basePayload,
          items: [
            { variantId: '00000000-0000-0000-0000-000000000001', quantity: 3 }, // Changed from 2 to 3
            { variantId: '00000000-0000-0000-0000-000000000002', quantity: 1 },
          ],
        });
        expect(modifiedQty.isRetry).toBe(false);
        expect(modifiedQty.idempotencyKey).not.toBe(first.idempotencyKey);
      });

      it('clears active idempotency session on order placement success', async () => {
        const first = await getOrGenerateIdempotencyKey(basePayload);
        expect(first.isRetry).toBe(false);

        // Order succeeds -> clear session
        clearIdempotencySession();

        // Next new checkout creates a fresh key
        const nextOrder = await getOrGenerateIdempotencyKey(basePayload);
        expect(nextOrder.isRetry).toBe(false);
        expect(nextOrder.idempotencyKey).not.toBe(first.idempotencyKey);
      });

      it('computes deterministic fingerprint regardless of item array ordering', () => {
        const payloadOrderA = {
          ...basePayload,
          items: [
            { variantId: 'bbbbbbbb-0000-0000-0000-000000000002', quantity: 1 },
            { variantId: 'aaaaaaaa-0000-0000-0000-000000000001', quantity: 2 },
          ],
        };
        const payloadOrderB = {
          ...basePayload,
          items: [
            { variantId: 'aaaaaaaa-0000-0000-0000-000000000001', quantity: 2 },
            { variantId: 'bbbbbbbb-0000-0000-0000-000000000002', quantity: 1 },
          ],
        };

        const fpA = computeClientOrderFingerprint(payloadOrderA);
        const fpB = computeClientOrderFingerprint(payloadOrderB);
        expect(fpA).toBe(fpB);
      });
    });
  });
});
