import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import {
  initializeTestDatabase,
  truncateTestCatalogue,
  truncateTestAdmin,
  closeTestDatabase,
  testPool,
} from './test-db.js';
import { provisionAdmin, loginAdmin } from '../services/admin-auth.service.js';

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
});
