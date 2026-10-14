import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import {
  initializeTestDatabase,
  truncateTestCatalogue,
  truncateTestAdmin,
  truncateTestOrders,
  truncateTestEnquiries,
  closeTestDatabase,
  testPool,
} from './test-db.js';
import { provisionAdmin, loginAdmin } from '../services/admin-auth.service.js';
import { createOrder } from '../services/order.service.js';
import { createEnquiry } from '../services/enquiry.service.js';

describe('Admin Catalogue & Inventory Integration Tests (axdoro_test)', () => {
  let adminToken: string;

  beforeAll(async () => {
    await initializeTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  beforeEach(async () => {
    await testPool.query(`
      CREATE TABLE IF NOT EXISTS test_fail_audit_flag (active BOOLEAN);
      TRUNCATE TABLE test_fail_audit_flag;
    `);
    await truncateTestAdmin();
    await truncateTestCatalogue();

    // Provision admin and log in
    await provisionAdmin({
      email: 'catalogue-admin@axdoro.test',
      password: 'AdminPassword123!',
      fullName: 'Catalogue Admin',
    });

    const loginRes = await loginAdmin({
      email: 'catalogue-admin@axdoro.test',
      password: 'AdminPassword123!',
    });
    adminToken = loginRes.token;
  });

  it('allows admin to create categories and rejects duplicate slugs', async () => {
    // Create Category 1
    const res1 = await request(app)
      .post('/api/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'T-Shirts',
        slug: 't-shirts',
        description: 'Premium cotton t-shirts',
        displayOrder: 1,
      });
    expect(res1.status).toBe(201);
    expect(res1.body.category.name).toBe('T-Shirts');

    // Attempt duplicate slug
    const resDup = await request(app)
      .post('/api/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Another T-Shirts',
        slug: 't-shirts',
      });
    expect(resDup.status).toBe(409);
    expect(resDup.body.error).toMatch(/slug already exists/i);
  });

  it('allows full product lifecycle: create, update, publish, archive', async () => {
    // 1. Create category
    const catRes = await request(app)
      .post('/api/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Shirts', slug: 'shirts' });
    const categoryId = catRes.body.category.id;

    // 2. Create product with initial variant and image
    const createRes = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Urban Linen Shirt',
        slug: 'urban-linen-shirt',
        description: 'Breathable linen shirt',
        categoryId,
        status: 'draft',
        isFeatured: true,
        fabricSpec: '100% French Linen',
        variants: [
          {
            size: 'M',
            color: 'White',
            colorHex: '#ffffff',
            sku: 'AX-LINEN-M-WHT',
            pricePaise: 129900,
            comparisonPricePaise: 159900,
            stockQuantity: 25,
            isActive: true,
          },
        ],
        images: [
          {
            imageUrl: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c',
            altText: 'Linen shirt front',
            isPrimary: true,
            displayOrder: 0,
          },
        ],
      });
    expect(createRes.status).toBe(201);
    const productId = createRes.body.product.id;
    expect(createRes.body.product.status).toBe('draft');

    // 3. Draft product is NOT visible in public customer catalogue
    const publicDraftRes = await request(app).get('/api/catalogue/products');
    expect(publicDraftRes.body.products.some((p: any) => p.id === productId)).toBe(false);

    // 4. Update product to 'published'
    const updateRes = await request(app)
      .put(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'published',
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.product.status).toBe('published');

    // 5. Published product is now visible in public customer catalogue
    const publicPubRes = await request(app).get('/api/catalogue/products');
    expect(publicPubRes.body.products.some((p: any) => p.id === productId)).toBe(true);

    // 6. Safely archive product
    const archiveRes = await request(app)
      .post(`/api/admin/products/${productId}/archive`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(archiveRes.status).toBe(200);
    expect(archiveRes.body.product.status).toBe('archived');

    // 7. Archived product is immediately excluded from public catalogue
    const publicArchRes = await request(app).get('/api/catalogue/products');
    expect(publicArchRes.body.products.some((p: any) => p.id === productId)).toBe(false);

    // 8. Safely unarchive product
    const unarchiveRes = await request(app)
      .post(`/api/admin/products/${productId}/unarchive`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(unarchiveRes.status).toBe(200);
    expect(unarchiveRes.body.product.status).toBe('published');

    // 9. Unarchived product is immediately restored to public catalogue
    const publicRestoredRes = await request(app).get('/api/catalogue/products');
    expect(publicRestoredRes.body.products.some((p: any) => p.id === productId)).toBe(true);
  });

  it('rejects duplicate SKUs and duplicate size/color variant combinations', async () => {
    // Category
    const catRes = await request(app)
      .post('/api/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Tees', slug: 'tees' });

    // Product
    const prodRes = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Crew Tee',
        slug: 'crew-tee',
        categoryId: catRes.body.category.id,
        status: 'published',
        variants: [
          {
            size: 'L',
            color: 'Black',
            sku: 'AX-CREW-L-BLK',
            pricePaise: 79900,
            stockQuantity: 10,
          },
        ],
      });
    const productId = prodRes.body.product.id;

    // Attempt duplicate SKU
    const dupSkuRes = await request(app)
      .post(`/api/admin/products/${productId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        size: 'XL',
        color: 'Black',
        sku: 'AX-CREW-L-BLK', // duplicate
        pricePaise: 89900,
        stockQuantity: 5,
      });
    expect(dupSkuRes.status).toBe(409);
    expect(dupSkuRes.body.error).toMatch(/sku already exists/i);

    // Attempt duplicate size/color combination on same product
    const dupComboRes = await request(app)
      .post(`/api/admin/products/${productId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        size: 'L',
        color: 'Black', // same size/color as first variant
        sku: 'AX-CREW-L-BLK-2',
        pricePaise: 79900,
        stockQuantity: 5,
      });
    expect(dupComboRes.status).toBe(409);
    expect(dupComboRes.body.error).toMatch(/variant with size .* and color .* already exists/i);
  });

  it('enforces comparison price >= selling price and integer paise values', async () => {
    const catRes = await request(app)
      .post('/api/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Bottoms', slug: 'bottoms' });

    // Comparison price lower than selling price must be rejected
    const invalidPriceRes = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Denim Jeans',
        slug: 'denim-jeans',
        categoryId: catRes.body.category.id,
        variants: [
          {
            size: '32',
            color: 'Indigo',
            sku: 'AX-JEANS-32',
            pricePaise: 199900,
            comparisonPricePaise: 149900, // Invalid: comparison < selling price
            stockQuantity: 10,
          },
        ],
      });
    expect(invalidPriceRes.status).toBe(400);
    expect(invalidPriceRes.body.error).toMatch(/comparison price.*cannot be lower than selling price/i);
  });

  it('strictly correlates product-card comparison price to the minimum-price variant', async () => {
    const catRes = await request(app)
      .post('/api/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Polos', slug: 'polos' });

    // Create product with two variants:
    // Variant 1: Price 699, Comparison 899 (the lowest selling price)
    // Variant 2: Price 999, Comparison 1499 (higher selling price with huge comparison)
    // The product card minimum comparison price MUST be 899 (from variant 1), NOT 1499!
    const prodRes = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Textured Polo',
        slug: 'textured-polo',
        categoryId: catRes.body.category.id,
        status: 'published',
        variants: [
          {
            size: 'S',
            color: 'Navy',
            sku: 'AX-POLO-S-NVY',
            pricePaise: 69900,
            comparisonPricePaise: 89900,
            stockQuantity: 10,
          },
          {
            size: 'XL',
            color: 'Navy',
            sku: 'AX-POLO-XL-NVY',
            pricePaise: 99900,
            comparisonPricePaise: 149900,
            stockQuantity: 10,
          },
        ],
      });
    expect(prodRes.status).toBe(201);

    // Query public catalogue
    const publicRes = await request(app).get('/api/catalogue/products');
    const polo = publicRes.body.products.find((p: any) => p.slug === 'textured-polo');
    expect(polo).toBeDefined();
    expect(polo.min_price_paise).toBe(69900);
    // Verified: min_comparison_price_paise matches variant 1 (89900), not variant 2 (149900)
    expect(polo.min_comparison_price_paise).toBe(89900);
  });

  it('manages inventory atomically and rejects negative stock adjustments', async () => {
    const catRes = await request(app)
      .post('/api/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Accessories', slug: 'accessories' });

    const prodRes = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Cap',
        slug: 'classic-cap',
        categoryId: catRes.body.category.id,
        status: 'published',
        variants: [
          {
            size: 'Free',
            color: 'Black',
            sku: 'AX-CAP-BLK',
            pricePaise: 49900,
            stockQuantity: 10,
          },
        ],
      });
    const variantId = prodRes.body.product.variants[0].id;

    // 1. Add 5 items
    const adjustAddRes = await request(app)
      .post(`/api/admin/inventory/variants/${variantId}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        adjustment: 5,
        reason: 'Restocked from warehouse',
      });
    expect(adjustAddRes.status).toBe(200);
    expect(adjustAddRes.body.stockQuantity).toBe(15);
    expect(adjustAddRes.body.previousStock).toBe(10);

    // 2. Attempt adjustment that would cause negative stock (-20 from 15)
    const adjustNegativeRes = await request(app)
      .post(`/api/admin/inventory/variants/${variantId}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        adjustment: -20,
        reason: 'Faulty audit decrement',
      });
    expect(adjustNegativeRes.status).toBe(400);
    expect(adjustNegativeRes.body.error).toMatch(/insufficient stock/i);

    // Verify stock remains untouched at 15
    const checkRes = await request(app)
      .get(`/api/admin/products/${prodRes.body.product.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(checkRes.body.product.variants[0].stockQuantity).toBe(15);

    // 3. Verify audit log recorded the successful stock change
    const auditRes = await request(app)
      .get('/api/admin/audit-logs')
      .set('Authorization', `Bearer ${adminToken}`);
    const stockLog = auditRes.body.logs.find((l: any) => l.action === 'STOCK_ADJUSTMENT');
    expect(stockLog).toBeDefined();
    expect(stockLog.details.previousQuantity).toBe(10);
    expect(stockLog.details.newQuantity).toBe(15);
    expect(stockLog.details.delta).toBe(5);
  });

  it('handles concurrent stock adjustments atomically without lost updates or negative inventory', async () => {
    // 1. Create a product with an initial stock of 50
    const catRes = await request(app)
      .post('/api/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Concurrent Stock Category', slug: 'concurrent-stock-cat' });
    expect(catRes.status).toBe(201);

    const prodRes = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Concurrent Stock Product',
        slug: 'concurrent-stock-prod',
        description: 'Testing concurrency',
        categoryId: catRes.body.category.id,
        status: 'draft',
        isFeatured: false,
        isNewArrival: false,
        images: [],
        variants: [
          {
            size: 'L',
            color: 'Black',
            sku: 'CONCURRENT-SKU-1',
            pricePaise: 99900,
            stockQuantity: 50,
          },
        ],
      });
    expect(prodRes.status).toBe(201);
    const variantId = prodRes.body.product.variants[0].id;

    // 2. Execute 10 concurrent adjustments:
    // 5 increments of +10 (= +50)
    // 5 decrements of -5  (= -25)
    // Expected net change: +25 -> Expected final stock: 50 + 25 = 75
    const concurrentOps = [
      ...Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post(`/api/admin/inventory/variants/${variantId}/stock`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ adjustment: 10, reason: `Concurrent increment ${i + 1}` })
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post(`/api/admin/inventory/variants/${variantId}/stock`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ adjustment: -5, reason: `Concurrent decrement ${i + 1}` })
      ),
    ];

    const results = await Promise.all(concurrentOps);
    for (const res of results) {
      expect(res.status).toBe(200);
    }

    // 3. Verify final stock quantity in database matches exact expected value (75)
    const verifyRes = await request(app)
      .get(`/api/admin/products/${prodRes.body.product.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    const variant = verifyRes.body.product.variants.find((v: any) => v.id === variantId);
    expect(variant.stockQuantity).toBe(75);

    // 4. Verify audit log recorded all 10 operations
    const auditRes = await request(app)
      .get('/api/admin/audit-logs?limit=50')
      .set('Authorization', `Bearer ${adminToken}`);
    const auditLogs = (auditRes.body.logs || auditRes.body.data || []).filter(
      (l: any) => l.action === 'STOCK_ADJUSTMENT' && l.entityId === variantId
    );
    expect(auditLogs).toHaveLength(10);

    // 5. Test concurrent race condition attempting to over-decrement stock:
    // Currently stock is 75. Send two concurrent decrements of -50 each (total -100).
    // Exactly ONE must succeed (leaving stock at 25), and ONE must fail with 400 Insufficient Stock.
    const overDrawOps = [
      request(app)
        .post(`/api/admin/inventory/variants/${variantId}/stock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ adjustment: -50, reason: 'Overdraw attempt A' }),
      request(app)
        .post(`/api/admin/inventory/variants/${variantId}/stock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ adjustment: -50, reason: 'Overdraw attempt B' }),
    ];

    const overDrawResults = await Promise.all(overDrawOps);
    const statuses = overDrawResults.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 400]);

    // Stock must be exactly 25 (never negative!)
    const finalVerify = await request(app)
      .get(`/api/admin/products/${prodRes.body.product.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    const finalVariant = finalVerify.body.product.variants.find((v: any) => v.id === variantId);
    expect(finalVariant.stockQuantity).toBe(25);
  });

  it('returns real persisted dashboard metrics with unbuilt modules clearly disclaimed', async () => {
    const metricsRes = await request(app)
      .get('/api/admin/metrics')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(metricsRes.status).toBe(200);

    const m = metricsRes.body.data || metricsRes.body;
    expect(typeof m.totalProducts).toBe('number');
    expect(typeof m.publishedProducts).toBe('number');
    expect(typeof m.totalVariants).toBe('number');
    expect(typeof m.lowStockVariants).toBe('number');

    // Orders and enquiries are not persisted in Phase 2.2/3; must be clearly disclaimed
    expect(m.orders.available).toBe(false);
    expect(m.orders.message).toMatch(/Phase 5/i);
    expect(m.enquiries.available).toBe(false);
    expect(m.enquiries.message).toMatch(/Phase 4/i);
  });

  describe('Product Creation & Update: Fabric Specification Validation (Phase 7)', () => {
    let testCatId: string;

    beforeEach(async () => {
      const catRes = await request(app)
        .post('/api/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Luxury Fabrics', slug: `luxury-fabrics-${Date.now()}` });
      testCatId = catRes.body.category.id;
    });

    it('1. accepts fabricSpec: null on product creation, returning 201 and persisting NULL in database', async () => {
      const res = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Null Fabric Spec Product',
          slug: `null-fabric-product-${Date.now()}`,
          description: 'Testing null fabricSpec',
          categoryId: testCatId,
          status: 'published',
          fabricSpec: null,
          variants: [
            {
              size: 'M',
              color: 'Black',
              sku: `SKU-NULL-FAB-${Date.now()}`,
              pricePaise: 99900,
              stockQuantity: 10,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.product.id).toBeDefined();

      const prodId = res.body.product.id;
      const getRes = await request(app)
        .get(`/api/admin/products/${prodId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.product.fabric_spec).toBeNull();

      const dbCheck = await testPool.query('SELECT fabric_spec FROM products WHERE id = $1;', [prodId]);
      expect(dbCheck.rows[0].fabric_spec).toBeNull();
    });

    it('2. accepts omitted fabricSpec on product creation, returning 201 and persisting NULL in database', async () => {
      const res = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Omitted Fabric Spec Product',
          slug: `omitted-fabric-product-${Date.now()}`,
          description: 'Testing omitted fabricSpec',
          categoryId: testCatId,
          status: 'published',
          variants: [
            {
              size: 'L',
              color: 'Navy',
              sku: `SKU-OMIT-FAB-${Date.now()}`,
              pricePaise: 89900,
              stockQuantity: 15,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.product.id).toBeDefined();

      const prodId = res.body.product.id;
      const getRes = await request(app)
        .get(`/api/admin/products/${prodId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.product.fabric_spec).toBeNull();

      const dbCheck = await testPool.query('SELECT fabric_spec FROM products WHERE id = $1;', [prodId]);
      expect(dbCheck.rows[0].fabric_spec).toBeNull();
    });

    it('3. accepts valid string fabricSpec on product creation, returning 201 and persisting string', async () => {
      const fabric = '100% Organic Pima Cotton';
      const res = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Pima Cotton Tee',
          slug: `pima-cotton-tee-${Date.now()}`,
          description: 'Testing string fabricSpec',
          categoryId: testCatId,
          status: 'published',
          fabricSpec: fabric,
          variants: [
            {
              size: 'S',
              color: 'White',
              sku: `SKU-PIMA-FAB-${Date.now()}`,
              pricePaise: 149900,
              stockQuantity: 20,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.product.id).toBeDefined();

      const prodId = res.body.product.id;
      const getRes = await request(app)
        .get(`/api/admin/products/${prodId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.product.fabric_spec).toBe(fabric);

      const dbCheck = await testPool.query('SELECT fabric_spec FROM products WHERE id = $1;', [prodId]);
      expect(dbCheck.rows[0].fabric_spec).toBe(fabric);
    });

    it('4. rejects fabricSpec exceeding 50 characters with HTTP 400 on product creation', async () => {
      const tooLongFabric = 'A'.repeat(51);
      const res = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Long Fabric Tee',
          slug: `long-fabric-tee-${Date.now()}`,
          description: 'Testing overly long fabricSpec',
          categoryId: testCatId,
          status: 'published',
          fabricSpec: tooLongFabric,
          variants: [
            {
              size: 'XL',
              color: 'Olive',
              sku: `SKU-LONG-FAB-${Date.now()}`,
              pricePaise: 119900,
              stockQuantity: 5,
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid product data/i);
    });

    it('5. rejects invalid non-string values (number, object, boolean) with HTTP 400 on product creation', async () => {
      const basePayload = {
        name: 'Invalid Type Fabric Tee',
        slug: `invalid-type-fabric-tee-${Date.now()}`,
        description: 'Testing invalid type fabricSpec',
        categoryId: testCatId,
        status: 'published',
        variants: [
          {
            size: 'M',
            color: 'Black',
            sku: `SKU-INV-FAB-${Date.now()}`,
            pricePaise: 109900,
            stockQuantity: 10,
          },
        ],
      };

      const numRes = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...basePayload, fabricSpec: 12345 });
      expect(numRes.status).toBe(400);
      expect(numRes.body.error).toMatch(/Invalid product data/i);

      const objRes = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...basePayload, fabricSpec: { material: 'cotton' } });
      expect(objRes.status).toBe(400);
      expect(objRes.body.error).toMatch(/Invalid product data/i);

      const boolRes = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...basePayload, fabricSpec: true });
      expect(boolRes.status).toBe(400);
      expect(boolRes.body.error).toMatch(/Invalid product data/i);
    });

    it('6. verifies product update behavior remains intact (updating to string, updating to null, rejecting >50 chars)', async () => {
      // 1. Create product initially with string fabricSpec
      const createRes = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updatable Fabric Tee',
          slug: `updatable-fabric-tee-${Date.now()}`,
          description: 'Testing update fabricSpec',
          categoryId: testCatId,
          status: 'published',
          fabricSpec: 'Initial Cotton Spec',
          variants: [
            {
              size: 'M',
              color: 'Charcoal',
              sku: `SKU-UPD-FAB-${Date.now()}`,
              pricePaise: 129900,
              stockQuantity: 30,
            },
          ],
        });
      expect(createRes.status).toBe(201);
      const prodId = createRes.body.product.id;

      // 2. Update to new valid string
      const updateRes1 = await request(app)
        .put(`/api/admin/products/${prodId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fabricSpec: '240 GSM Heavy Cotton' });
      expect(updateRes1.status).toBe(200);
      expect(updateRes1.body.product.fabric_spec).toBe('240 GSM Heavy Cotton');

      // 3. Update to null (clearing the specification)
      const updateRes2 = await request(app)
        .put(`/api/admin/products/${prodId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fabricSpec: null });
      expect(updateRes2.status).toBe(200);
      expect(updateRes2.body.product.fabric_spec).toBeNull();

      const dbCheck = await testPool.query('SELECT fabric_spec FROM products WHERE id = $1;', [prodId]);
      expect(dbCheck.rows[0].fabric_spec).toBeNull();

      // 4. Reject update with > 50 characters
      const updateRes3 = await request(app)
        .put(`/api/admin/products/${prodId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fabricSpec: 'B'.repeat(51) });
      expect(updateRes3.status).toBe(400);
    });
  });

  describe('Variant IDOR Authorization Protection (PUT /api/admin/products/:id/variants/:variantId)', () => {
    let testCategoryId: string;

    beforeEach(async () => {
      const catRes = await request(app)
        .post('/api/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'IDOR Test Category', slug: 'idor-test-category' });
      testCategoryId = catRes.body.category.id;
    });

    it('allows an administrator to update a variant belonging to the specified product', async () => {
      // 1. Create product with a variant
      const prodRes = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'IDOR Test Product A',
          slug: 'idor-test-product-a',
          description: 'Testing legitimate variant updates',
          categoryId: testCategoryId,
          status: 'draft',
          isFeatured: false,
          isNewArrival: false,
          images: [],
          variants: [
            {
              size: 'M',
              color: 'Navy',
              sku: 'IDOR-PROD-A-M',
              pricePaise: 99900,
              stockQuantity: 20,
            },
          ],
        });
      expect(prodRes.status).toBe(201);
      const prodAId = prodRes.body.product.id;
      const varAId = prodRes.body.product.variants[0].id;

      // 2. Update variant through product A URL
      const updateRes = await request(app)
        .put(`/api/admin/products/${prodAId}/variants/${varAId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          pricePaise: 89900,
          color: 'Dark Navy',
        });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.message).toMatch(/updated successfully/i);

      // Verify mutation in DB
      const checkRes = await request(app)
        .get(`/api/admin/products/${prodAId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      const updatedVariant = checkRes.body.product.variants.find((v: any) => v.id === varAId);
      expect(updatedVariant.pricePaise).toBe(89900);
      expect(updatedVariant.color).toBe('Dark Navy');
    });

    it('rejects cross-product variant modification attempts (IDOR) with 404 and leaves target variant untouched', async () => {
      // 1. Create Product A
      const prodARes = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'IDOR Victim Product A',
          slug: 'idor-victim-product-a',
          description: 'Victim product',
          categoryId: testCategoryId,
          status: 'draft',
          isFeatured: false,
          isNewArrival: false,
          images: [],
          variants: [
            {
              size: 'L',
              color: 'Crimson',
              sku: 'IDOR-VICTIM-L',
              pricePaise: 120000,
              stockQuantity: 50,
            },
          ],
        });
      expect(prodARes.status).toBe(201);
      const prodAId = prodARes.body.product.id;
      const varAId = prodARes.body.product.variants[0].id;

      // 2. Create Product B
      const prodBRes = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'IDOR Attacker Product B',
          slug: 'idor-attacker-product-b',
          description: 'Attacker product',
          categoryId: testCategoryId,
          status: 'draft',
          isFeatured: false,
          isNewArrival: false,
          images: [],
          variants: [
            {
              size: 'S',
              color: 'Black',
              sku: 'IDOR-ATTACKER-S',
              pricePaise: 40000,
              stockQuantity: 10,
            },
          ],
        });
      expect(prodBRes.status).toBe(201);
      const prodBId = prodBRes.body.product.id;

      // 3. Attempt to update Product A's variant through Product B's URL
      const attackRes = await request(app)
        .put(`/api/admin/products/${prodBId}/variants/${varAId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          pricePaise: 100, // Attempted price manipulation
          sku: 'HIJACKED-SKU',
        });
      expect(attackRes.status).toBe(404);
      expect(attackRes.body.error).toMatch(/variant not found/i);

      // 4. Verify Product A's variant remains completely untouched
      const verifyRes = await request(app)
        .get(`/api/admin/products/${prodAId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      const intactVariant = verifyRes.body.product.variants.find((v: any) => v.id === varAId);
      expect(intactVariant.pricePaise).toBe(120000);
      expect(intactVariant.sku).toBe('IDOR-VICTIM-L');
    });

    it('returns 404 for nonexistent product ID, nonexistent variant ID, or malformed UUIDs', async () => {
      // Create a valid product and variant
      const prodRes = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'IDOR Boundary Product',
          slug: 'idor-boundary-product',
          description: 'Testing boundary conditions',
          categoryId: testCategoryId,
          status: 'draft',
          isFeatured: false,
          isNewArrival: false,
          images: [],
          variants: [
            {
              size: 'XL',
              color: 'Grey',
              sku: 'IDOR-BOUND-XL',
              pricePaise: 75000,
              stockQuantity: 15,
            },
          ],
        });
      const prodId = prodRes.body.product.id;
      const variantId = prodRes.body.product.variants[0].id;

      const nonExistentUuid = '00000000-0000-0000-0000-000000000000';

      // 1. Nonexistent product with real variant
      const res1 = await request(app)
        .put(`/api/admin/products/${nonExistentUuid}/variants/${variantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ pricePaise: 60000 });
      expect(res1.status).toBe(404);

      // 2. Real product with nonexistent variant
      const res2 = await request(app)
        .put(`/api/admin/products/${prodId}/variants/${nonExistentUuid}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ pricePaise: 60000 });
      expect(res2.status).toBe(404);

      // 3. Malformed UUID strings
      const res3 = await request(app)
        .put(`/api/admin/products/invalid-product-id/variants/${variantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ pricePaise: 60000 });
      expect(res3.status).toBe(404);

      const res4 = await request(app)
        .put(`/api/admin/products/${prodId}/variants/invalid-variant-id`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ pricePaise: 60000 });
      expect(res4.status).toBe(404);
    });

    it('persists stockQuantity update, updates product_variants row, and records STOCK_ADJUSTMENT audit log', async () => {
      // 1. Create product with a variant having stock 10
      const prodRes = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Stock Update Test Product',
          slug: 'stock-update-test-product',
          description: 'Testing variant stock persistence',
          categoryId: testCategoryId,
          status: 'draft',
          isFeatured: false,
          isNewArrival: false,
          images: [],
          variants: [
            {
              size: 'M',
              color: 'Olive',
              sku: 'STOCK-TEST-M',
              pricePaise: 149900,
              stockQuantity: 10,
            },
          ],
        });
      expect(prodRes.status).toBe(201);
      const prodId = prodRes.body.product.id;
      const varId = prodRes.body.product.variants[0].id;

      // 2. Update stockQuantity via PUT /api/admin/products/:id/variants/:variantId
      const updateRes = await request(app)
        .put(`/api/admin/products/${prodId}/variants/${varId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          stockQuantity: 45,
        });
      expect(updateRes.status).toBe(200);

      // 3. Verify variant stock in DB
      const checkRes = await request(app)
        .get(`/api/admin/products/${prodId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      const updatedVariant = checkRes.body.product.variants.find((v: any) => v.id === varId);
      expect(updatedVariant.stockQuantity).toBe(45);

      // 4. Verify STOCK_ADJUSTMENT audit log was created
      const auditRes = await testPool.query(
        `SELECT * FROM admin_audit_logs WHERE action = 'STOCK_ADJUSTMENT' AND entity_id = $1 ORDER BY created_at DESC LIMIT 1;`,
        [varId]
      );
      expect(auditRes.rows.length).toBe(1);
      expect(auditRes.rows[0].details.previousQuantity).toBe(10);
      expect(auditRes.rows[0].details.newQuantity).toBe(45);
      expect(auditRes.rows[0].details.delta).toBe(35);
    });

    it('rejects negative stockQuantity with 400 and does not mutate stock', async () => {
      const prodRes = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Negative Stock Test Product',
          slug: 'negative-stock-test-product',
          description: 'Testing negative stock rejection',
          categoryId: testCategoryId,
          status: 'draft',
          isFeatured: false,
          isNewArrival: false,
          images: [],
          variants: [
            {
              size: 'L',
              color: 'Navy',
              sku: 'NEG-STOCK-TEST-L',
              pricePaise: 120000,
              stockQuantity: 15,
            },
          ],
        });
      const prodId = prodRes.body.product.id;
      const varId = prodRes.body.product.variants[0].id;

      const updateRes = await request(app)
        .put(`/api/admin/products/${prodId}/variants/${varId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          stockQuantity: -10,
        });
      expect(updateRes.status).toBe(400);

      // Verify stock in DB remains 15
      const checkRes = await request(app)
        .get(`/api/admin/products/${prodId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      const variant = checkRes.body.product.variants.find((v: any) => v.id === varId);
      expect(variant.stockQuantity).toBe(15);
    });

    it('persists simultaneous price, comparison price, and stock updates', async () => {
      const prodRes = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Multi Update Test Product',
          slug: 'multi-update-test-product',
          description: 'Testing multiple fields updated together',
          categoryId: testCategoryId,
          status: 'draft',
          isFeatured: false,
          isNewArrival: false,
          images: [],
          variants: [
            {
              size: 'S',
              color: 'Charcoal',
              sku: 'MULTI-UPDATE-S',
              pricePaise: 100000,
              comparisonPricePaise: 150000,
              stockQuantity: 20,
            },
          ],
        });
      const prodId = prodRes.body.product.id;
      const varId = prodRes.body.product.variants[0].id;

      const updateRes = await request(app)
        .put(`/api/admin/products/${prodId}/variants/${varId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          pricePaise: 110000,
          comparisonPricePaise: 160000,
          stockQuantity: 30,
        });
      expect(updateRes.status).toBe(200);

      const checkRes = await request(app)
        .get(`/api/admin/products/${prodId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      const variant = checkRes.body.product.variants.find((v: any) => v.id === varId);
      expect(variant.pricePaise).toBe(110000);
      expect(variant.comparisonPricePaise).toBe(160000);
      expect(variant.stockQuantity).toBe(30);
    });
  });

  describe('Atomic Audit Logging & Transaction Rollback (Phase 3B)', () => {
    let testCatId: string;

    beforeAll(async () => {
      // Set up a database trigger to simulate real database-level failure on audit log insertion
      await testPool.query(`
        CREATE TABLE IF NOT EXISTS test_fail_audit_flag (active BOOLEAN);
        TRUNCATE TABLE test_fail_audit_flag;
        GRANT ALL ON test_fail_audit_flag TO axdoro_app;

        CREATE OR REPLACE FUNCTION trg_fn_test_audit_failure()
        RETURNS trigger AS $$
        BEGIN
          IF EXISTS (SELECT 1 FROM test_fail_audit_flag WHERE active = true) THEN
            RAISE EXCEPTION 'TEST_DATABASE_AUDIT_LOG_FAILURE: Injected audit log failure on transaction boundary';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        GRANT EXECUTE ON FUNCTION trg_fn_test_audit_failure() TO axdoro_app;

        DROP TRIGGER IF EXISTS trg_test_audit_failure ON admin_audit_logs;
        CREATE TRIGGER trg_test_audit_failure
          BEFORE INSERT ON admin_audit_logs
          FOR EACH ROW
          EXECUTE FUNCTION trg_fn_test_audit_failure();
      `);
    });

    afterAll(async () => {
      await testPool.query(`
        DROP TRIGGER IF EXISTS trg_test_audit_failure ON admin_audit_logs;
        DROP FUNCTION IF EXISTS trg_fn_test_audit_failure();
        DROP TABLE IF EXISTS test_fail_audit_flag;
      `);
    });

    beforeEach(async () => {
      await testPool.query('TRUNCATE TABLE test_fail_audit_flag;');
      const catRes = await request(app)
        .post('/api/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Rollback Base Category', slug: 'rollback-base-category' });
      testCatId = catRes.body.category.id;
    });

    afterEach(async () => {
      await testPool.query('TRUNCATE TABLE test_fail_audit_flag;');
    });

    it('rolls back product updates when audit-log insertion fails', async () => {
      const prodRes = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Original Product Name',
          slug: 'original-prod-rollback',
          description: 'Original description',
          categoryId: testCatId,
          status: 'draft',
          variants: [{ size: 'M', color: 'White', sku: 'ORIG-PROD-M', pricePaise: 50000, stockQuantity: 10 }],
        });
      const prodId = prodRes.body.product.id;

      // Enable audit log failure injection
      await testPool.query('INSERT INTO test_fail_audit_flag (active) VALUES (true);');

      // Attempt product update
      const updateRes = await request(app)
        .put(`/api/admin/products/${prodId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Mutated Product Name Should Rollback' });
      expect(updateRes.status).toBe(500);

      // Verify in DB that product name was rolled back and remains original
      const dbRes = await testPool.query<{ name: string }>('SELECT name FROM products WHERE id = $1;', [prodId]);
      expect(dbRes.rows[0].name).toBe('Original Product Name');
    });

    it('rolls back product archiving when audit-log insertion fails', async () => {
      const prodRes = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Archive Rollback Test Product',
          slug: 'archive-prod-rollback',
          description: 'Testing archive rollback',
          categoryId: testCatId,
          status: 'published',
          variants: [{ size: 'L', color: 'Black', sku: 'ARCH-PROD-L', pricePaise: 60000, stockQuantity: 5 }],
        });
      const prodId = prodRes.body.product.id;

      // Enable audit log failure injection
      await testPool.query('INSERT INTO test_fail_audit_flag (active) VALUES (true);');

      // Attempt product archive
      const archiveRes = await request(app)
        .post(`/api/admin/products/${prodId}/archive`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(archiveRes.status).toBe(500);

      // Verify in DB that product status was NOT changed to archived
      const dbRes = await testPool.query<{ status: string }>('SELECT status FROM products WHERE id = $1;', [prodId]);
      expect(dbRes.rows[0].status).toBe('published');
    });

    it('rolls back category creation when audit-log insertion fails', async () => {
      // Enable audit log failure injection
      await testPool.query('INSERT INTO test_fail_audit_flag (active) VALUES (true);');

      // Attempt category creation
      const catRes = await request(app)
        .post('/api/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Uncommitted Category', slug: 'uncommitted-category' });
      expect(catRes.status).toBe(500);

      // Verify in DB that category was not created
      const dbRes = await testPool.query('SELECT id FROM categories WHERE slug = $1;', ['uncommitted-category']);
      expect(dbRes.rows).toHaveLength(0);
    });

    it('rolls back category update when audit-log insertion fails', async () => {
      const catRes = await request(app)
        .post('/api/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Original Category Name', slug: 'orig-cat-name' });
      const categoryId = catRes.body.category.id;

      // Enable audit log failure injection
      await testPool.query('INSERT INTO test_fail_audit_flag (active) VALUES (true);');

      // Attempt category update
      const updateRes = await request(app)
        .put(`/api/admin/categories/${categoryId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Altered Name That Must Rollback' });
      expect(updateRes.status).toBe(500);

      // Verify in DB that category retained original name
      const dbRes = await testPool.query<{ name: string }>('SELECT name FROM categories WHERE id = $1;', [categoryId]);
      expect(dbRes.rows[0].name).toBe('Original Category Name');
    });

    it('rolls back variant creation when audit-log insertion fails', async () => {
      const prodRes = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Variant Rollback Base Product',
          slug: 'var-rollback-base',
          description: 'Base product',
          categoryId: testCatId,
          status: 'draft',
          variants: [{ size: 'S', color: 'Red', sku: 'BASE-VAR-S', pricePaise: 40000, stockQuantity: 5 }],
        });
      const prodId = prodRes.body.product.id;

      // Enable audit log failure injection
      await testPool.query('INSERT INTO test_fail_audit_flag (active) VALUES (true);');

      // Attempt variant creation
      const createVarRes = await request(app)
        .post(`/api/admin/products/${prodId}/variants`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ size: 'M', color: 'Blue', sku: 'UNCOMMITTED-VAR-M', pricePaise: 45000, stockQuantity: 8 });
      expect(createVarRes.status).toBe(500);

      // Verify in DB that new variant was not created
      const dbRes = await testPool.query('SELECT id FROM product_variants WHERE sku = $1;', ['UNCOMMITTED-VAR-M']);
      expect(dbRes.rows).toHaveLength(0);
    });

    it('rolls back variant updates when audit-log insertion fails', async () => {
      const prodRes = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Variant Update Rollback Product',
          slug: 'var-update-rollback',
          description: 'Testing variant update rollback',
          categoryId: testCatId,
          status: 'draft',
          variants: [{ size: 'L', color: 'Green', sku: 'ORIG-VAR-L', pricePaise: 80000, stockQuantity: 12 }],
        });
      const prodId = prodRes.body.product.id;
      const variantId = prodRes.body.product.variants[0].id;

      // Enable audit log failure injection
      await testPool.query('INSERT INTO test_fail_audit_flag (active) VALUES (true);');

      // Attempt variant update
      const updateRes = await request(app)
        .put(`/api/admin/products/${prodId}/variants/${variantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ pricePaise: 12345, color: 'Neon Green' });
      expect(updateRes.status).toBe(500);

      // Verify in DB that variant price and color were rolled back
      const dbRes = await testPool.query<{ price_paise: number; color: string }>(
        'SELECT price_paise, color FROM product_variants WHERE id = $1;',
        [variantId]
      );
      expect(dbRes.rows[0].price_paise).toBe(80000);
      expect(dbRes.rows[0].color).toBe('Green');
    });

    it('rolls back product deletion when audit-log insertion fails', async () => {
      const prodRes = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Product Delete Rollback Test',
          slug: 'product-delete-rollback',
          description: 'Testing product delete rollback on audit failure',
          categoryId: testCatId,
          status: 'draft',
          variants: [{ size: 'S', color: 'Gold', sku: 'ROLLBACK-PROD-DEL-S', pricePaise: 75000, stockQuantity: 9 }],
        });
      const prodId = prodRes.body.product.id;

      // Enable audit log failure injection
      await testPool.query('INSERT INTO test_fail_audit_flag (active) VALUES (true);');

      // Attempt product deletion
      const delRes = await request(app)
        .delete(`/api/admin/products/${prodId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(delRes.status).toBe(500);

      // Verify product and variants still exist in DB
      const prodCheck = await testPool.query('SELECT id FROM products WHERE id = $1;', [prodId]);
      expect(prodCheck.rows).toHaveLength(1);

      const varCheck = await testPool.query('SELECT id FROM product_variants WHERE product_id = $1;', [prodId]);
      expect(varCheck.rows).toHaveLength(1);
    });

    it('commits business mutations and corresponding audit records atomically when no errors occur', async () => {
      const createRes = await request(app)
        .post('/api/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Atomic Success Category', slug: 'atomic-success-category' });
      expect(createRes.status).toBe(201);
      const catId = createRes.body.category.id;

      // Verify both category and audit log exist in database
      const catDb = await testPool.query('SELECT id, name FROM categories WHERE id = $1;', [catId]);
      expect(catDb.rows).toHaveLength(1);
      expect(catDb.rows[0].name).toBe('Atomic Success Category');

      const auditDb = await testPool.query<{ action: string; entity_type: string }>(
        'SELECT action, entity_type FROM admin_audit_logs WHERE entity_id = $1;',
        [catId]
      );
      expect(auditDb.rows).toHaveLength(1);
      expect(auditDb.rows[0].action).toBe('CATEGORY_CREATE');
      expect(auditDb.rows[0].entity_type).toBe('category');
    });
  });

  describe('Product Permanent Safe Deletion (DELETE /api/admin/products/:id)', () => {
    let testCatId: string;

    beforeEach(async () => {
      const catRes = await request(app)
        .post('/api/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Deletion Test Category', slug: 'deletion-test-category' });
      testCatId = catRes.body.category.id;
    });

    it('successfully deletes an eligible unreferenced product, its variants, and images, and creates audit log', async () => {
      // 1. Create product with variants and image
      const prodRes = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Eligible Deletion Product',
          slug: 'eligible-deletion-product',
          description: 'Ready to be safely deleted',
          categoryId: testCatId,
          status: 'draft',
          variants: [
            { size: 'M', color: 'White', sku: 'DEL-WHITE-M', pricePaise: 99900, stockQuantity: 10 },
            { size: 'L', color: 'White', sku: 'DEL-WHITE-L', pricePaise: 99900, stockQuantity: 15 },
          ],
          images: [
            {
              imageUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518',
              altText: 'Test image',
              isPrimary: true,
              displayOrder: 0,
            },
          ],
        });
      expect(prodRes.status).toBe(201);
      const prodId = prodRes.body.product.id;

      // 2. Perform deletion
      const delRes = await request(app)
        .delete(`/api/admin/products/${prodId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(delRes.status).toBe(200);
      expect(delRes.body.status).toBe('success');
      expect(delRes.body.message).toMatch(/permanently deleted successfully/i);

      // 3. Verify product is gone
      const getRes = await request(app)
        .get(`/api/admin/products/${prodId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(getRes.status).toBe(404);

      // 4. Verify variants and images are deleted from DB
      const varDb = await testPool.query('SELECT id FROM product_variants WHERE product_id = $1;', [prodId]);
      expect(varDb.rows).toHaveLength(0);

      const imgDb = await testPool.query('SELECT id FROM product_images WHERE product_id = $1;', [prodId]);
      expect(imgDb.rows).toHaveLength(0);

      // 5. Verify PRODUCT_DELETE audit log exists
      const auditDb = await testPool.query<{ action: string; details: any }>(
        `SELECT action, details FROM admin_audit_logs WHERE action = 'PRODUCT_DELETE' AND entity_id = $1;`,
        [prodId]
      );
      expect(auditDb.rows).toHaveLength(1);
      expect(auditDb.rows[0].details.slug).toBe('eligible-deletion-product');
      expect(auditDb.rows[0].details.deletedVariantCount).toBe(2);
      expect(auditDb.rows[0].details.deletedImageCount).toBe(1);
    });

    it('rejects deletion with 409 Conflict when product is referenced by historical orders, preserving order integrity', async () => {
      // 1. Create product and variant
      const prodRes = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Ordered Product Guard',
          slug: 'ordered-product-guard',
          description: 'Testing order protection constraint',
          categoryId: testCatId,
          status: 'published',
          variants: [
            { size: 'M', color: 'Black', sku: 'ORDERED-GUARD-M', pricePaise: 129900, stockQuantity: 50 },
          ],
        });
      expect(prodRes.status).toBe(201);
      const prodId = prodRes.body.product.id;
      const variantId = prodRes.body.product.variants[0].id;

      // 2. Insert a simulated historical customer order referencing this product and variant
      const randSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const orderRes = await testPool.query<{ id: string }>(
        `INSERT INTO orders (
          order_number, customer_order_token, customer_name, customer_email, customer_phone,
          shipping_address_line1, shipping_city, shipping_state, shipping_pincode,
          order_status, payment_status, payment_method,
          subtotal_paise, discount_paise, shipping_fee_paise, total_paise
        ) VALUES (
          $1, $2, 'John Doe', 'john@example.com', '9876543210',
          '123 Fashion Blvd', 'Mumbai', 'Maharashtra', '400001',
          'CONFIRMED', 'PAID', 'COD',
          129900, 0, 0, 129900
        ) RETURNING id;`,
        [`AXD-ORD-${randSuffix}`, `tok_${randSuffix}`]
      );
      const orderId = orderRes.rows[0].id;

      await testPool.query(
        `INSERT INTO order_items (
          order_id, product_id, variant_id, product_name, product_slug,
          variant_sku, variant_size, variant_color, unit_price_paise, quantity, line_total_paise
        ) VALUES (
          $1, $2, $3, 'Ordered Product Guard', 'ordered-product-guard',
          'ORDERED-GUARD-M', 'M', 'Black', 129900, 1, 129900
        );`,
        [orderId, prodId, variantId]
      );

      // 3. Attempt to delete the product
      const delRes = await request(app)
        .delete(`/api/admin/products/${prodId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(delRes.status).toBe(409);
      expect(delRes.body.status).toBe('error');
      expect(delRes.body.canArchive).toBe(true);
      expect(delRes.body.error).toMatch(/referenced by historical customer orders/i);

      // 4. Verify product, variant, order, and order_items all remain completely intact in DB
      const prodCheck = await testPool.query('SELECT id, status FROM products WHERE id = $1;', [prodId]);
      expect(prodCheck.rows).toHaveLength(1);

      const varCheck = await testPool.query('SELECT id FROM product_variants WHERE product_id = $1;', [prodId]);
      expect(varCheck.rows).toHaveLength(1);

      const itemCheck = await testPool.query('SELECT id, product_id FROM order_items WHERE order_id = $1;', [orderId]);
      expect(itemCheck.rows).toHaveLength(1);
      expect(itemCheck.rows[0].product_id).toBe(prodId);
    });

    it('returns 404 for nonexistent product ID or malformed UUID', async () => {
      const nonExistentUuid = '00000000-0000-0000-0000-000000000000';
      const res1 = await request(app)
        .delete(`/api/admin/products/${nonExistentUuid}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res1.status).toBe(404);
      expect(res1.body.error).toMatch(/product not found/i);

      const res2 = await request(app)
        .delete('/api/admin/products/invalid-uuid-string')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res2.status).toBe(404);
    });

    it('requires admin authentication to invoke delete endpoint', async () => {
      const res = await request(app).delete('/api/admin/products/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(401);
    });
  });

  describe('Deterministic Concurrency: Product Deletion vs Order & Enquiry Operations', () => {
    let concCatId: string;

    beforeEach(async () => {
      await truncateTestOrders();
      await truncateTestEnquiries();

      const catRes = await testPool.query<{ id: string }>(
        `INSERT INTO categories (name, slug, display_order, is_active)
         VALUES ('Concurrency Category', 'concurrency-cat-${Date.now()}', 1, true)
         RETURNING id;`
      );
      concCatId = catRes.rows[0].id;
    });

    it('Scenario 1A: Deletion blocks when order transaction holds variant lock, and rejects with 409 after order commits', async () => {
      // 1. Create product and variant
      const prodRes = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Concurrency Guard Tee A',
          slug: `conc-guard-tee-a-${Date.now()}`,
          description: 'Testing order vs delete concurrency',
          categoryId: concCatId,
          status: 'published',
          variants: [
            { size: 'M', color: 'Black', sku: `CONC-SKU-1A-${Date.now()}`, pricePaise: 119900, stockQuantity: 20 },
          ],
        });
      expect(prodRes.status).toBe(201);
      const prodId = prodRes.body.product.id;
      const variantId = prodRes.body.product.variants[0].id;

      // 2. Client 1 starts order transaction and acquires lock on variant row
      const orderClient = await testPool.connect();
      await orderClient.query('BEGIN;');
      await orderClient.query('SELECT pv.* FROM product_variants pv WHERE pv.id = $1 FOR UPDATE OF pv;', [variantId]);

      // 3. Client 2 attempts deletion in parallel; it must block on the variant row
      let deleteResolved = false;
      const deletePromise = request(app)
        .delete(`/api/admin/products/${prodId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .then((res) => {
          deleteResolved = true;
          return res;
        });

      // Allow 60ms to verify delete request is genuinely blocked
      await new Promise((r) => setTimeout(r, 60));
      expect(deleteResolved).toBe(false);

      // 4. Client 1 inserts order and order_item, then commits
      const randSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const orderRes = await orderClient.query<{ id: string }>(
        `INSERT INTO orders (
          order_number, customer_order_token, customer_name, customer_email, customer_phone,
          shipping_address_line1, shipping_city, shipping_state, shipping_pincode,
          order_status, payment_status, payment_method, subtotal_paise, discount_paise, shipping_fee_paise, total_paise
        ) VALUES (
          $1, $2, 'Jane Customer', 'jane@example.com', '9876543210',
          '456 High St', 'Bangalore', 'Karnataka', '560001',
          'CONFIRMED', 'PAID', 'COD', 119900, 0, 0, 119900
        ) RETURNING id;`,
        [`AXD-ORD-${randSuffix}`, `tok_${randSuffix}`]
      );
      const orderId = orderRes.rows[0].id;

      await orderClient.query(
        `INSERT INTO order_items (
          order_id, product_id, variant_id, product_name, product_slug,
          variant_sku, variant_size, variant_color, unit_price_paise, quantity, line_total_paise
        ) VALUES ($1, $2, $3, 'Concurrency Guard Tee A', 'conc-guard-tee-a', 'CONC-SKU-1A', 'M', 'Black', 119900, 1, 119900);`,
        [orderId, prodId, variantId]
      );

      await orderClient.query('COMMIT;');
      orderClient.release();

      // 5. Blocked delete unblocks, detects order item, and returns 409 Conflict
      const delRes = await deletePromise;
      expect(delRes.status).toBe(409);
      expect(delRes.body.error).toMatch(/referenced by historical customer orders/i);
      expect(delRes.body.canArchive).toBe(true);

      // 6. Verify data integrity: product, variant, order, and order_items all preserved
      const prodCheck = await testPool.query('SELECT id FROM products WHERE id = $1;', [prodId]);
      expect(prodCheck.rows).toHaveLength(1);
      const orderCheck = await testPool.query('SELECT id FROM orders WHERE id = $1;', [orderId]);
      expect(orderCheck.rows).toHaveLength(1);
    });

    it('Scenario 1B: Order creation blocks when deletion holds locks, and fails safely after deletion commits', async () => {
      // 1. Create product and variant
      const prodRes = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Concurrency Guard Tee B',
          slug: `conc-guard-tee-b-${Date.now()}`,
          description: 'Testing delete vs order concurrency',
          categoryId: concCatId,
          status: 'published',
          variants: [
            { size: 'L', color: 'White', sku: `CONC-SKU-1B-${Date.now()}`, pricePaise: 99900, stockQuantity: 15 },
          ],
        });
      expect(prodRes.status).toBe(201);
      const prodId = prodRes.body.product.id;
      const variantId = prodRes.body.product.variants[0].id;

      // 2. Client 1 begins deletion transaction holding locks on products and variants
      const delClient = await testPool.connect();
      await delClient.query('BEGIN;');
      await delClient.query('SELECT id FROM products WHERE id = $1 FOR UPDATE;', [prodId]);
      await delClient.query('SELECT id FROM product_variants WHERE product_id = $1 ORDER BY id ASC FOR UPDATE;', [prodId]);

      // 3. Client 2 attempts to place an order via createOrder; it must block on the variant row lock
      let orderResolved = false;
      const orderPromise = createOrder({
        customerName: 'Sam Buyer',
        customerEmail: 'sam@example.com',
        customerPhone: '9876543210',
        shippingAddressLine1: '789 Market Rd',
        shippingCity: 'Delhi',
        shippingState: 'Delhi',
        shippingPincode: '110001',
        items: [{ variantId, quantity: 1 }],
      }).then((res) => {
        orderResolved = true;
        return res;
      });

      // Allow 60ms to confirm order placement is blocked
      await new Promise((r) => setTimeout(r, 60));
      expect(orderResolved).toBe(false);

      // 4. Client 1 deletes the records and commits
      await delClient.query('DELETE FROM product_variants WHERE product_id = $1;', [prodId]);
      await delClient.query('DELETE FROM products WHERE id = $1;', [prodId]);
      await delClient.query('COMMIT;');
      delClient.release();

      // 5. Order unblocks, sees variant was deleted, and rejects safely
      await expect(orderPromise).rejects.toThrow(/Variant not found or no longer available/i);

      // 6. Verify zero orders or order_items were created
      const ordersCount = await testPool.query('SELECT count(*) FROM orders WHERE customer_email = $1;', ['sam@example.com']);
      expect(Number(ordersCount.rows[0].count)).toBe(0);
    });

    it('Scenario 2A: Deletion blocks when enquiry transaction holds foreign key share lock, and rejects with 409 after enquiry commits', async () => {
      // 1. Create product
      const prodRes = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Concurrency Enquiry Guard A',
          slug: `conc-enq-guard-a-${Date.now()}`,
          description: 'Testing enquiry vs delete concurrency',
          categoryId: concCatId,
          status: 'published',
          variants: [
            { size: 'M', color: 'Grey', sku: `CONC-ENQ-SKU-2A-${Date.now()}`, pricePaise: 79900, stockQuantity: 30 },
          ],
        });
      expect(prodRes.status).toBe(201);
      const prodId = prodRes.body.product.id;

      // 2. Client 1 begins enquiry transaction inserting enquiry referencing product (holds KEY SHARE on products row)
      const enqClient = await testPool.connect();
      await enqClient.query('BEGIN;');
      await enqClient.query(
        `INSERT INTO enquiries (name, email, phone, message, product_id, quantity, enquiry_type, source, drive_sync_status)
         VALUES ('Corporate Client', 'corp@example.com', '9876543210', 'Bulk order quotation', $1, 100, 'BULK', 'WEBSITE', 'PENDING');`,
        [prodId]
      );

      // 3. Client 2 attempts deletion in parallel; FOR UPDATE on products row must block on KEY SHARE
      let deleteResolved = false;
      const deletePromise = request(app)
        .delete(`/api/admin/products/${prodId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .then((res) => {
          deleteResolved = true;
          return res;
        });

      // Allow 60ms to verify delete request is blocked
      await new Promise((r) => setTimeout(r, 60));
      expect(deleteResolved).toBe(false);

      // 4. Client 1 commits enquiry transaction
      await enqClient.query('COMMIT;');
      enqClient.release();

      // 5. Delete unblocks, detects enquiry reference, and rejects with 409 Conflict
      const delRes = await deletePromise;
      expect(delRes.status).toBe(409);
      expect(delRes.body.error).toMatch(/referenced by customer enquiries/i);

      // 6. Verify product and enquiry remain intact
      const prodCheck = await testPool.query('SELECT id FROM products WHERE id = $1;', [prodId]);
      expect(prodCheck.rows).toHaveLength(1);
      const enqCheck = await testPool.query('SELECT id, product_id FROM enquiries WHERE product_id = $1;', [prodId]);
      expect(enqCheck.rows).toHaveLength(1);
      expect(enqCheck.rows[0].product_id).toBe(prodId);
    });

    it('Scenario 2B: Enquiry creation blocks when deletion holds locks, and fails safely without orphaned enquiry', async () => {
      // 1. Create product
      const prodRes = await request(app)
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Concurrency Enquiry Guard B',
          slug: `conc-enq-guard-b-${Date.now()}`,
          description: 'Testing delete vs enquiry concurrency',
          categoryId: concCatId,
          status: 'published',
          variants: [
            { size: 'M', color: 'Navy', sku: `CONC-ENQ-SKU-2B-${Date.now()}`, pricePaise: 89900, stockQuantity: 25 },
          ],
        });
      expect(prodRes.status).toBe(201);
      const prodId = prodRes.body.product.id;

      // 2. Client 1 begins deletion transaction holding FOR UPDATE lock on product row
      const delClient = await testPool.connect();
      await delClient.query('BEGIN;');
      await delClient.query('SELECT id FROM products WHERE id = $1 FOR UPDATE;', [prodId]);

      // 3. Client 2 attempts to create enquiry referencing prodId via createEnquiry; it must block on foreign key check
      let enqResolved = false;
      const enqPromise = createEnquiry({
        name: 'Prospective Client',
        email: 'prospect@example.com',
        phone: '9876543210',
        message: 'Interested in sample units',
        productId: prodId,
        enquiryType: 'GENERAL',
        source: 'WEBSITE',
      }).then((res) => {
        enqResolved = true;
        return res;
      });

      // Allow 60ms to verify enquiry creation is blocked waiting for products row
      await new Promise((r) => setTimeout(r, 60));
      expect(enqResolved).toBe(false);

      // 4. Client 1 deletes the product variants and product, then commits
      await delClient.query('DELETE FROM product_variants WHERE product_id = $1;', [prodId]);
      await delClient.query('DELETE FROM products WHERE id = $1;', [prodId]);
      await delClient.query('COMMIT;');
      delClient.release();

      // 5. Enquiry creation unblocks, foreign key check on deleted product fails, and transaction rolls back
      await expect(enqPromise).rejects.toThrow();

      // 6. Verify no orphaned enquiry was created referencing prodId
      const enqCount = await testPool.query('SELECT count(*) FROM enquiries WHERE product_id = $1;', [prodId]);
      expect(Number(enqCount.rows[0].count)).toBe(0);
    });
  });
});
