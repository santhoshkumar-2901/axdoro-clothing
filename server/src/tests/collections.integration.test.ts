import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import {
  initializeTestDatabase,
  truncateTestCatalogue,
  truncateTestAdmin,
  truncateTestCollections,
  closeTestDatabase,
  testPool,
} from './test-db.js';
import { provisionAdmin, loginAdmin } from '../services/admin-auth.service.js';
import { generateCsrfToken } from '../middleware/csrf.js';

describe('Homepage Collections Integration Tests (axdoro_test)', () => {
  let adminToken: string;
  let adminCookie: string;
  let csrfToken: string;
  let categoryId: string;
  let product1Id: string;
  let product2Id: string;
  let product3Id: string;
  let draftProductId: string;
  let bestSellersId: string;
  let signaturePicksId: string;

  beforeAll(async () => {
    await initializeTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  beforeEach(async () => {
    await truncateTestAdmin();
    await truncateTestCatalogue();
    await truncateTestCollections();

    // 1. Provision and log in an admin
    await provisionAdmin({
      email: 'collections-admin@axdoro.test',
      password: 'AdminPassword123!',
      fullName: 'Collections Admin',
    });

    const loginRes = await loginAdmin({
      email: 'collections-admin@axdoro.test',
      password: 'AdminPassword123!',
    });
    adminToken = loginRes.token;
    adminCookie = `axdoro_admin_session=${adminToken}`;
    csrfToken = generateCsrfToken(adminToken);

    // 2. Fetch default seeded collections
    const colRes = await testPool.query<{ id: string; slug: string }>(
      `SELECT id, slug FROM homepage_collections ORDER BY display_order ASC;`
    );
    const bs = colRes.rows.find((r) => r.slug === 'best-sellers');
    const sp = colRes.rows.find((r) => r.slug === 'signature-picks');
    expect(bs).toBeDefined();
    expect(sp).toBeDefined();
    bestSellersId = bs!.id;
    signaturePicksId = sp!.id;

    // 3. Create a category
    const catRes = await testPool.query<{ id: string }>(
      `INSERT INTO categories (name, slug, is_active) VALUES ('T-Shirts', 't-shirts', true) RETURNING id;`
    );
    categoryId = catRes.rows[0].id;

    // 4. Create 3 published products and 1 draft product
    const p1 = await testPool.query<{ id: string }>(
      `INSERT INTO products (name, slug, category_id, status)
       VALUES ('Axdoro Silk Tee', 'axdoro-silk-tee', $1, 'published')
       RETURNING id;`,
      [categoryId]
    );
    product1Id = p1.rows[0].id;

    await testPool.query(
      `INSERT INTO product_variants (product_id, size, color, sku, price_paise, stock_quantity)
       VALUES ($1, 'M', 'Ivory', 'AX-SILK-M-IV', 249900, 15);`,
      [product1Id]
    );
    await testPool.query(
      `INSERT INTO product_images (product_id, image_url, display_order, is_primary)
       VALUES ($1, 'https://res.cloudinary.com/axdoro/image/upload/v1/silk.jpg', 1, true);`,
      [product1Id]
    );

    const p2 = await testPool.query<{ id: string }>(
      `INSERT INTO products (name, slug, category_id, status)
       VALUES ('Axdoro Linen Shirt', 'axdoro-linen-shirt', $1, 'published')
       RETURNING id;`,
      [categoryId]
    );
    product2Id = p2.rows[0].id;

    await testPool.query(
      `INSERT INTO product_variants (product_id, size, color, sku, price_paise, stock_quantity)
       VALUES ($1, 'L', 'Charcoal', 'AX-LINEN-L-CH', 349900, 20);`,
      [product2Id]
    );
    await testPool.query(
      `INSERT INTO product_images (product_id, image_url, display_order, is_primary)
       VALUES ($1, 'https://res.cloudinary.com/axdoro/image/upload/v1/linen.jpg', 1, true);`,
      [product2Id]
    );

    const p3 = await testPool.query<{ id: string }>(
      `INSERT INTO products (name, slug, category_id, status)
       VALUES ('Axdoro Velvet Blazer', 'axdoro-velvet-blazer', $1, 'published')
       RETURNING id;`,
      [categoryId]
    );
    product3Id = p3.rows[0].id;

    await testPool.query(
      `INSERT INTO product_variants (product_id, size, color, sku, price_paise, stock_quantity)
       VALUES ($1, '40', 'Midnight Black', 'AX-BLAZ-40-BK', 799900, 5);`,
      [product3Id]
    );

    const pDraft = await testPool.query<{ id: string }>(
      `INSERT INTO products (name, slug, category_id, status)
       VALUES ('Draft Concept Item', 'draft-concept-item', $1, 'draft')
       RETURNING id;`,
      [categoryId]
    );
    draftProductId = pDraft.rows[0].id;
    await testPool.query(
      `INSERT INTO product_variants (product_id, size, color, sku, price_paise, stock_quantity)
       VALUES ($1, 'S', 'Grey', 'AX-DRAFT-S-GR', 99900, 10);`,
      [draftProductId]
    );
  });

  describe('Authorization & CSRF Security', () => {
    it('rejects unauthenticated GET /api/admin/collections with 401', async () => {
      const res = await request(app).get('/api/admin/collections');
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated PUT /api/admin/collections/:id with 401', async () => {
      const res = await request(app)
        .put(`/api/admin/collections/${bestSellersId}`)
        .send({ title: 'Hacked Title' });
      expect(res.status).toBe(401);
    });

    it('rejects request with untrusted Referer header with 403', async () => {
      const res = await request(app)
        .put(`/api/admin/collections/${bestSellersId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Referer', 'https://malicious-attacker.com/evil-admin')
        .send({ title: 'Malicious Update' });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Cross-Site Request Forgery attempt detected');
    });

    it('rejects cookie-authenticated request when X-CSRF-Token header is missing with 403', async () => {
      const res = await request(app)
        .put(`/api/admin/collections/${bestSellersId}`)
        .set('Cookie', adminCookie)
        .send({ title: 'Cookie Update' });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('CSRF token missing');
    });
  });

  describe('Admin Homepage Collections API', () => {
    it('returns seeded collections with default titles and empty product arrays', async () => {
      const res = await request(app)
        .get('/api/admin/collections')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveLength(2);

      const bestSellers = res.body.data.find((c: any) => c.slug === 'best-sellers');
      expect(bestSellers).toBeDefined();
      expect(bestSellers.title).toBe("This Month's Best Sellers");
      expect(bestSellers.isEnabled).toBe(true);
      expect(bestSellers.products).toEqual([]);

      const signaturePicks = res.body.data.find((c: any) => c.slug === 'signature-picks');
      expect(signaturePicks).toBeDefined();
      expect(signaturePicks.title).toBe('Signature Picks');
      expect(signaturePicks.isEnabled).toBe(true);
      expect(signaturePicks.products).toEqual([]);
    });

    it('allows admin to edit title and toggle isEnabled', async () => {
      const res = await request(app)
        .put(`/api/admin/collections/${bestSellersId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: "Curated Autumn Best Sellers",
          isEnabled: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.title).toBe("Curated Autumn Best Sellers");
      expect(res.body.data.isEnabled).toBe(false);

      // Verify audit log
      const audit = await testPool.query(
        `SELECT action, entity_type, entity_id, details
         FROM admin_audit_logs
         WHERE action = 'COLLECTION_UPDATE' AND entity_id = $1;`,
        [bestSellersId]
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0].entity_type).toBe('collection');
      expect(audit.rows[0].details.title).toBe("Curated Autumn Best Sellers");
    });

    it('validates collection update payload (rejects empty title)', async () => {
      const res = await request(app)
        .put(`/api/admin/collections/${bestSellersId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Title cannot be empty');
    });

    it('returns 404 for non-existent collection ID on update', async () => {
      const randomUuid = '00000000-0000-0000-0000-000000000099';
      const res = await request(app)
        .put(`/api/admin/collections/${randomUuid}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'New Title' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Collection not found');
    });
  });

  describe('Admin Collection Product Association & Ordering', () => {
    it('associates products to best-sellers and preserves explicit display order', async () => {
      // Put Product 2 then Product 1
      const res = await request(app)
        .put(`/api/admin/collections/${bestSellersId}/products`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productIds: [product2Id, product1Id] });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.products).toHaveLength(2);
      expect(res.body.data.products[0].id).toBe(product2Id);
      expect(res.body.data.products[0].displayOrder).toBe(1);
      expect(res.body.data.products[1].id).toBe(product1Id);
      expect(res.body.data.products[1].displayOrder).toBe(2);

      // Audit log check
      const audit = await testPool.query(
        `SELECT action, entity_type, entity_id, details
         FROM admin_audit_logs
         WHERE action = 'COLLECTION_PRODUCTS_UPDATE' AND entity_id = $1;`,
        [bestSellersId]
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0].details.count).toBe(2);
    });

    it('keeps product selections strictly independent between collections', async () => {
      // Best sellers gets product 1
      await request(app)
        .put(`/api/admin/collections/${bestSellersId}/products`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productIds: [product1Id] });

      // Signature picks gets product 2 and product 3
      await request(app)
        .put(`/api/admin/collections/${signaturePicksId}/products`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productIds: [product2Id, product3Id] });

      const adminRes = await request(app)
        .get('/api/admin/collections')
        .set('Authorization', `Bearer ${adminToken}`);

      const bs = adminRes.body.data.find((c: any) => c.slug === 'best-sellers');
      const sp = adminRes.body.data.find((c: any) => c.slug === 'signature-picks');

      expect(bs.products).toHaveLength(1);
      expect(bs.products[0].id).toBe(product1Id);

      expect(sp.products).toHaveLength(2);
      expect(sp.products[0].id).toBe(product2Id);
      expect(sp.products[1].id).toBe(product3Id);
    });

    it('rejects invalid/non-existent product IDs with 400', async () => {
      const nonExistentUuid = '99999999-9999-9999-9999-999999999999';
      const res = await request(app)
        .put(`/api/admin/collections/${bestSellersId}/products`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productIds: [product1Id, nonExistentUuid] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('do not exist');

      // Verify no partial insert occurred
      const dbCheck = await testPool.query(
        `SELECT * FROM homepage_collection_products WHERE collection_id = $1;`,
        [bestSellersId]
      );
      expect(dbCheck.rows).toHaveLength(0);
    });

    it('allows clearing all products from a collection', async () => {
      // First add products
      await request(app)
        .put(`/api/admin/collections/${bestSellersId}/products`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productIds: [product1Id, product2Id] });

      // Clear by sending empty array
      const clearRes = await request(app)
        .put(`/api/admin/collections/${bestSellersId}/products`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productIds: [] });

      expect(clearRes.status).toBe(200);
      expect(clearRes.body.data.products).toHaveLength(0);

      const dbCheck = await testPool.query(
        `SELECT * FROM homepage_collection_products WHERE collection_id = $1;`,
        [bestSellersId]
      );
      expect(dbCheck.rows).toHaveLength(0);
    });
  });

  describe('Storefront Visibility & Filtering Rules', () => {
    it('omits enabled collections that have 0 products from GET /api/collections', async () => {
      // Both collections are enabled, but neither has products
      const res = await request(app).get('/api/collections');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('omits collections that only contain draft products', async () => {
      // Add draft product to best-sellers
      await request(app)
        .put(`/api/admin/collections/${bestSellersId}/products`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productIds: [draftProductId] });

      const res = await request(app).get('/api/collections');
      expect(res.status).toBe(200);
      // Because draft items are not eligible published products, collection has 0 eligible products and is omitted
      expect(res.body.data).toEqual([]);
    });

    it('omits disabled collections even if they contain published products', async () => {
      // Add published product to best-sellers
      await request(app)
        .put(`/api/admin/collections/${bestSellersId}/products`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productIds: [product1Id] });

      // Disable best-sellers
      await request(app)
        .put(`/api/admin/collections/${bestSellersId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isEnabled: false });

      const res = await request(app).get('/api/collections');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('shows enabled collection with published products and formats prices and images accurately', async () => {
      // Add product 1 and product 2 to best-sellers
      await request(app)
        .put(`/api/admin/collections/${bestSellersId}/products`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productIds: [product1Id, product2Id] });

      const res = await request(app).get('/api/collections');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveLength(1);

      const col = res.body.data[0];
      expect(col.slug).toBe('best-sellers');
      expect(col.title).toBe("This Month's Best Sellers");
      expect(col.products).toHaveLength(2);

      // Verify product formatting
      const p1 = col.products[0];
      expect(p1.id).toBe(product1Id);
      expect(p1.name).toBe('Axdoro Silk Tee');
      expect(p1.pricePaise).toBe(249900);
      expect(p1.price).toBe(2499);
      expect(p1.stockStatus).toBe('in-stock');
      expect(p1.stockCount).toBe(15);
      expect(p1.images[0]).toContain('silk.jpg');
    });

    it('supports GET /api/collections/:slug', async () => {
      // Add product to signature picks
      await request(app)
        .put(`/api/admin/collections/${signaturePicksId}/products`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ productIds: [product3Id] });

      const res = await request(app).get('/api/collections/signature-picks');
      expect(res.status).toBe(200);
      expect(res.body.data.slug).toBe('signature-picks');
      expect(res.body.data.products).toHaveLength(1);
      expect(res.body.data.products[0].id).toBe(product3Id);

      // Requesting an empty collection returns 404
      const emptyRes = await request(app).get('/api/collections/best-sellers');
      expect(emptyRes.status).toBe(404);
    });
  });
});
