import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import {
  initializeTestDatabase,
  truncateTestCatalogue,
  truncateTestAdmin,
  truncateTestOrders,
  closeTestDatabase,
  testPool,
} from './test-db.js';
import { provisionAdmin, loginAdmin } from '../services/admin-auth.service.js';

describe('Admin Notification Badges & Order Acknowledgment Integration Tests (axdoro_test)', () => {
  let adminToken: string;
  let adminCookie: string;
  let csrfToken: string;
  let categoryId: string;
  let productId: string;
  let variantId1: string;
  let variantId2: string;

  beforeAll(async () => {
    await initializeTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  beforeEach(async () => {
    await truncateTestOrders();
    await truncateTestAdmin();
    await truncateTestCatalogue();

    // 1. Provision admin
    await provisionAdmin({
      email: 'badge-admin@axdoro.test',
      password: 'AdminPassword123!',
      fullName: 'Badge Admin',
    });

    const loginRes = await request(app)
      .post('/api/admin/auth/login')
      .send({
        email: 'badge-admin@axdoro.test',
        password: 'AdminPassword123!',
      });

    expect(loginRes.status).toBe(200);
    adminToken = loginRes.body.data.token;
    csrfToken = loginRes.body.data.csrfToken;
    const cookies = loginRes.headers['set-cookie'] as unknown as string[];
    adminCookie = cookies.find((c: string) => c.startsWith('admin_session=')) || '';

    // 2. Seed catalogue
    const catRes = await testPool.query(`
      INSERT INTO categories (name, slug, description, display_order)
      VALUES ('T-Shirts', 't-shirts', 'Premium Tees', 1)
      RETURNING id;
    `);
    categoryId = catRes.rows[0].id;

    const prodRes = await testPool.query(`
      INSERT INTO products (category_id, name, slug, description, status)
      VALUES ($1, 'Signature Heavyweight Tee', 'signature-heavyweight-tee', '240 GSM Combed Cotton', 'published')
      RETURNING id;
    `, [categoryId]);
    productId = prodRes.rows[0].id;

    // Variant 1: stock 15 (healthy)
    const var1Res = await testPool.query(`
      INSERT INTO product_variants (product_id, sku, size, color, stock_quantity, price_paise)
      VALUES ($1, 'SIG-BLK-M', 'M', 'Black', 15, 99900)
      RETURNING id;
    `, [productId]);
    variantId1 = var1Res.rows[0].id;

    // Variant 2: stock 20 (healthy)
    const var2Res = await testPool.query(`
      INSERT INTO product_variants (product_id, sku, size, color, stock_quantity, price_paise)
      VALUES ($1, 'SIG-BLK-L', 'L', 'Black', 20, 99900)
      RETURNING id;
    `, [productId]);
    variantId2 = var2Res.rows[0].id;
  });

  describe('GET /api/admin/notifications/badge-counts', () => {
    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      const res = await request(app).get('/api/admin/notifications/badge-counts');
      expect(res.status).toBe(401);
    });

    it('returns zero counts initially when all stock is healthy and no orders exist', async () => {
      const res = await request(app)
        .get('/api/admin/notifications/badge-counts')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.orders.unacknowledgedCount).toBe(0);
      expect(res.body.data.inventory.lowStockProductCount).toBe(0);
    });
  });

  describe('Inventory & Stock Badge Counting Rules', () => {
    it('counts distinct published products with at least one active variant < 10 units', async () => {
      // Reduce variant 1 stock to 5 (< 10)
      await testPool.query(`UPDATE product_variants SET stock_quantity = 5 WHERE id = $1`, [variantId1]);

      let res = await request(app)
        .get('/api/admin/notifications/badge-counts')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.inventory.lowStockProductCount).toBe(1);

      // Reduce variant 2 stock to 2 (< 10) on the SAME product
      await testPool.query(`UPDATE product_variants SET stock_quantity = 2 WHERE id = $1`, [variantId2]);

      res = await request(app)
        .get('/api/admin/notifications/badge-counts')
        .set('Authorization', `Bearer ${adminToken}`);

      // Must strictly count DISTINCT products (1, not 2)
      expect(res.body.data.inventory.lowStockProductCount).toBe(1);
    });

    it('includes zero-stock (out of stock) variants in the count', async () => {
      await testPool.query(`UPDATE product_variants SET stock_quantity = 0 WHERE id = $1`, [variantId1]);

      const res = await request(app)
        .get('/api/admin/notifications/badge-counts')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.body.data.inventory.lowStockProductCount).toBe(1);
    });

    it('strictly excludes archived and draft products from low stock counts', async () => {
      // Create an archived product with 0 stock
      const archProd = await testPool.query(`
        INSERT INTO products (category_id, name, slug, description, status)
        VALUES ($1, 'Archived Shirt', 'archived-shirt', 'Old style', 'archived')
        RETURNING id;
      `, [categoryId]);

      await testPool.query(`
        INSERT INTO product_variants (product_id, sku, size, color, stock_quantity, price_paise)
        VALUES ($1, 'ARC-SHT-M', 'M', 'White', 0, 89900);
      `, [archProd.rows[0].id]);

      // Create a draft product with 0 stock
      const draftProd = await testPool.query(`
        INSERT INTO products (category_id, name, slug, description, status)
        VALUES ($1, 'Draft Hoodie', 'draft-hoodie', 'Upcoming', 'draft')
        RETURNING id;
      `, [categoryId]);

      await testPool.query(`
        INSERT INTO product_variants (product_id, sku, size, color, stock_quantity, price_paise)
        VALUES ($1, 'DRF-HOD-M', 'M', 'Grey', 0, 199900);
      `, [draftProd.rows[0].id]);

      const res = await request(app)
        .get('/api/admin/notifications/badge-counts')
        .set('Authorization', `Bearer ${adminToken}`);

      // Neither archived nor draft product should increment the count (published product variants are healthy at 15 & 20)
      expect(res.body.data.inventory.lowStockProductCount).toBe(0);
    });

    it('decrements stock badge count when product is archived or stock is replenished', async () => {
      // Make published product low stock
      await testPool.query(`UPDATE product_variants SET stock_quantity = 3 WHERE id = $1`, [variantId1]);

      let res = await request(app)
        .get('/api/admin/notifications/badge-counts')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.body.data.inventory.lowStockProductCount).toBe(1);

      // Replenish stock to >= 10
      await testPool.query(`UPDATE product_variants SET stock_quantity = 25 WHERE id = $1`, [variantId1]);

      res = await request(app)
        .get('/api/admin/notifications/badge-counts')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.body.data.inventory.lowStockProductCount).toBe(0);

      // Reduce again to low stock
      await testPool.query(`UPDATE product_variants SET stock_quantity = 3 WHERE id = $1`, [variantId1]);
      res = await request(app)
        .get('/api/admin/notifications/badge-counts')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.body.data.inventory.lowStockProductCount).toBe(1);

      // Archive the product
      await testPool.query(`UPDATE products SET status = 'archived' WHERE id = $1`, [productId]);

      res = await request(app)
        .get('/api/admin/notifications/badge-counts')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.body.data.inventory.lowStockProductCount).toBe(0);
    });
  });

  describe('Orders Badge & Acknowledgment Lifecycle', () => {
    it('increments unacknowledged orders count when a new customer order is placed', async () => {
      const checkoutRes = await request(app)
        .post('/api/orders')
        .send({
          customerName: 'Rahul Sharma',
          customerEmail: 'rahul@example.com',
          customerPhone: '9876543210',
          shippingAddressLine1: '42 MG Road',
          shippingCity: 'Bengaluru',
          shippingState: 'Karnataka',
          shippingPincode: '560001',
          paymentMethod: 'COD',
          items: [
            {
              productId,
              variantId: variantId1,
              quantity: 1,
            },
          ],
        });

      expect(checkoutRes.status).toBe(201);
      const orderId = checkoutRes.body.data.id;

      // Verify DB row has acknowledged_at IS NULL
      const dbCheck = await testPool.query('SELECT acknowledged_at FROM orders WHERE id = $1', [orderId]);
      expect(dbCheck.rows[0].acknowledged_at).toBeNull();

      // Check badge count
      const badgeRes = await request(app)
        .get('/api/admin/notifications/badge-counts')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(badgeRes.body.data.orders.unacknowledgedCount).toBe(1);
    });

    it('acknowledges an order idempotently without altering fulfillment or payment status', async () => {
      // Place order
      const checkoutRes = await request(app)
        .post('/api/orders')
        .send({
          customerName: 'Priya Patel',
          customerEmail: 'priya@example.com',
          customerPhone: '9123456780',
          shippingAddressLine1: '12 Linking Road',
          shippingCity: 'Mumbai',
          shippingState: 'Maharashtra',
          shippingPincode: '400050',
          paymentMethod: 'COD',
          items: [{ productId, variantId: variantId1, quantity: 1 }],
        });

      const orderId = checkoutRes.body.data.id;

      // Acknowledge order via POST /api/admin/orders/:id/acknowledge
      const ackRes = await request(app)
        .post(`/api/admin/orders/${orderId}/acknowledge`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-CSRF-Token', csrfToken);

      expect(ackRes.status).toBe(200);
      expect(ackRes.body.status).toBe('success');
      expect(ackRes.body.data.acknowledgedAt).not.toBeNull();
      expect(ackRes.body.data.orderStatus).toBe('PENDING'); // Preserved!
      expect(ackRes.body.data.paymentStatus).toBe('UNPAID'); // Preserved!

      const firstAckTime = ackRes.body.data.acknowledgedAt;

      // Verify badge count drops to 0
      const badgeRes = await request(app)
        .get('/api/admin/notifications/badge-counts')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(badgeRes.body.data.orders.unacknowledgedCount).toBe(0);

      // Idempotency: call acknowledge again
      const ackRes2 = await request(app)
        .post(`/api/admin/orders/${orderId}/acknowledge`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-CSRF-Token', csrfToken);

      expect(ackRes2.status).toBe(200);
      expect(ackRes2.body.data.acknowledgedAt).toBe(firstAckTime); // Did not overwrite timestamp
    });

    it('excludes CANCELLED and DELIVERED orders from the unacknowledged count', async () => {
      // Create order 1
      const order1 = await request(app)
        .post('/api/orders')
        .send({
          customerName: 'Customer One',
          customerEmail: 'c1@example.com',
          customerPhone: '9876500001',
          shippingAddressLine1: 'Address 1',
          shippingCity: 'Delhi',
          shippingState: 'Delhi',
          shippingPincode: '110001',
          paymentMethod: 'COD',
          items: [{ productId, variantId: variantId1, quantity: 1 }],
        });

      // Create order 2
      const order2 = await request(app)
        .post('/api/orders')
        .send({
          customerName: 'Customer Two',
          customerEmail: 'c2@example.com',
          customerPhone: '9876500002',
          shippingAddressLine1: 'Address 2',
          shippingCity: 'Delhi',
          shippingState: 'Delhi',
          shippingPincode: '110001',
          paymentMethod: 'COD',
          items: [{ productId, variantId: variantId2, quantity: 1 }],
        });

      // Initially count is 2
      let badgeRes = await request(app)
        .get('/api/admin/notifications/badge-counts')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(badgeRes.body.data.orders.unacknowledgedCount).toBe(2);

      // Cancel order 1 without acknowledging it
      const cancelRes = await request(app)
        .patch(`/api/admin/orders/${order1.body.data.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-CSRF-Token', csrfToken)
        .send({ status: 'CANCELLED', reason: 'Customer changed mind' });
      expect(cancelRes.status).toBe(200);

      // Count drops to 1 because CANCELLED is excluded
      badgeRes = await request(app)
        .get('/api/admin/notifications/badge-counts')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(badgeRes.body.data.orders.unacknowledgedCount).toBe(1);

      // Confirm order 2 (transition from PENDING to CONFIRMED marks it acknowledged)
      const confirmRes = await request(app)
        .patch(`/api/admin/orders/${order2.body.data.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-CSRF-Token', csrfToken)
        .send({ status: 'CONFIRMED' });
      expect(confirmRes.status).toBe(200);

      // Count drops to 0
      badgeRes = await request(app)
        .get('/api/admin/notifications/badge-counts')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(badgeRes.body.data.orders.unacknowledgedCount).toBe(0);
    });

    it('returns 404 when attempting to acknowledge a non-existent order', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .post(`/api/admin/orders/${fakeId}/acknowledge`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Order not found');
    });
  });
});
