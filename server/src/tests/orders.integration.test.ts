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

describe('Phase 4 — COD Orders & Order Management Integration Tests (axdoro_test)', () => {
  let adminToken: string;
  let testProductId: string;
  let testVariantId: string;
  const initialStock = 10;
  const unitPricePaise = 149900; // ₹1499.00

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

    // Provision admin and log in
    await provisionAdmin({
      email: 'order-admin@axdoro.test',
      password: 'AdminPassword123!',
      fullName: 'Order Admin',
    });

    const loginRes = await loginAdmin({
      email: 'order-admin@axdoro.test',
      password: 'AdminPassword123!',
    });
    adminToken = loginRes.token;

    // Seed test category
    const catRes = await testPool.query(`
      INSERT INTO categories (name, slug, description, display_order)
      VALUES ('T-Shirts', 't-shirts', 'Premium Tees', 1)
      RETURNING id;
    `);
    const categoryId = catRes.rows[0].id;

    // Seed test product
    const prodRes = await testPool.query(`
      INSERT INTO products (category_id, name, slug, description, status)
      VALUES ($1, 'Classic Oversized Tee', 'classic-oversized-tee', '100% Cotton', 'published')
      RETURNING id;
    `, [categoryId]);
    testProductId = prodRes.rows[0].id;

    // Seed test variant with stock and price
    const varRes = await testPool.query(`
      INSERT INTO product_variants (product_id, sku, size, color, stock_quantity, price_paise)
      VALUES ($1, 'AXD-COT-BLK-M', 'M', 'Black', $2, $3)
      RETURNING id;
    `, [testProductId, initialStock, unitPricePaise]);
    testVariantId = varRes.rows[0].id;
  });

  // 1. Valid COD checkout and customer confirmation
  it('successfully creates a valid COD order, deducts inventory, and returns safe customer reference', async () => {
    const orderPayload = {
      customerName: 'Aarav Sharma',
      customerEmail: 'aarav@example.com',
      customerPhone: '+919876543210',
      shippingAddressLine1: 'Flat 402, Prestige Towers, MG Road',
      shippingCity: 'Bengaluru',
      shippingState: 'Karnataka',
      shippingPincode: '560001',
      items: [
        {
          variantId: testVariantId,
          quantity: 2,
        },
      ],
      paymentMethod: 'COD',
      idempotencyKey: 'idem-test-valid-1',
    };

    const res = await request(app)
      .post('/api/orders')
      .send(orderPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.orderNumber).toMatch(/^AXD-\d{8}-[A-Z0-9]{6}$/);
    expect(res.body.data.customerOrderToken).toBeDefined();
    expect(res.body.data.grandTotalPaise).toBe(2 * unitPricePaise);
    expect(res.body.data.paymentMethod).toBe('COD');
    expect(res.body.data.paymentStatus).toBe('UNPAID');
    expect(res.body.data.orderStatus).toBe('PENDING');

    // Verify stock deducted in DB
    const stockCheck = await testPool.query(
      'SELECT stock_quantity FROM product_variants WHERE id = $1',
      [testVariantId]
    );
    expect(stockCheck.rows[0].stock_quantity).toBe(initialStock - 2);

    // Verify order lookup with customerOrderToken
    const lookupRes = await request(app)
      .get(`/api/orders/${res.body.data.customerOrderToken}`);

    expect(lookupRes.status).toBe(200);
    expect(lookupRes.body.data.orderNumber).toBe(res.body.data.orderNumber);
    expect(lookupRes.body.data.items).toHaveLength(1);
    expect(lookupRes.body.data.items[0].productName).toBe('Classic Oversized Tee');
    expect(lookupRes.body.data.items[0].variantSku).toBe('AXD-COT-BLK-M');
  });

  // 2. Forged client prices, discounts, subtotals, and totals
  it('strictly ignores client-submitted prices and totals, recalculating exclusively from database', async () => {
    const forgedPayload = {
      customerName: 'Sneaky Shopper',
      customerEmail: 'sneaky@example.com',
      customerPhone: '+919876543211',
      shippingAddressLine1: '123 Fake Street',
      shippingCity: 'Mumbai',
      shippingState: 'Maharashtra',
      shippingPincode: '400001',
      items: [
        {
          variantId: testVariantId,
          quantity: 1,
          unitPricePaise: 100, // Attacker attempts ₹1 unit price
          lineTotalPaise: 100,
        },
      ],
      paymentMethod: 'COD',
      subtotalPaise: 100,
      discountPaise: 50,
      grandTotalPaise: 50,
      idempotencyKey: 'idem-forged-pricing',
    };

    const res = await request(app)
      .post('/api/orders')
      .send(forgedPayload);

    expect(res.status).toBe(201);
    // Server must enforce trusted DB price of 149900 paise
    expect(res.body.data.subtotalPaise).toBe(149900);
    expect(res.body.data.grandTotalPaise).toBe(149900);
    expect(res.body.data.items[0].unitPricePaise).toBe(149900);
  });

  // 3. Negative, fractional, zero, malformed, and oversized quantities
  it('rejects invalid quantities (negative, zero, fractional, oversized)', async () => {
    const makePayload = (qty: any) => ({
      customerName: 'Test Buyer',
      customerEmail: 'buyer@example.com',
      customerPhone: '+919876543210',
      shippingAddressLine1: 'Test Address Line',
      shippingCity: 'Delhi',
      shippingState: 'Delhi',
      shippingPincode: '110001',
      paymentMethod: 'COD',
      items: [{ variantId: testVariantId, quantity: qty }],
      idempotencyKey: `idem-qty-${qty}`,
    });

    // Zero quantity
    const resZero = await request(app).post('/api/orders').send(makePayload(0));
    expect(resZero.status).toBe(400);

    // Negative quantity
    const resNeg = await request(app).post('/api/orders').send(makePayload(-3));
    expect(resNeg.status).toBe(400);

    // Fractional quantity
    const resFrac = await request(app).post('/api/orders').send(makePayload(1.5));
    expect(resFrac.status).toBe(400);

    // Oversized quantity (> 20 max per item)
    const resOver = await request(app).post('/api/orders').send(makePayload(25));
    expect(resOver.status).toBe(400);
  });

  // 4. Duplicate order submissions and idempotency behavior
  it('returns the existing order without duplicate stock deductions when submitted with same idempotency key', async () => {
    const orderPayload = {
      customerName: 'Dev Patel',
      customerEmail: 'dev@example.com',
      customerPhone: '+919876543212',
      shippingAddressLine1: '45 Lotus Court',
      shippingCity: 'Ahmedabad',
      shippingState: 'Gujarat',
      shippingPincode: '380015',
      paymentMethod: 'COD',
      items: [{ variantId: testVariantId, quantity: 3 }],
      idempotencyKey: 'idem-duplicate-submission-key',
    };

    // First submission
    const res1 = await request(app).post('/api/orders').send(orderPayload);
    expect(res1.status).toBe(201);
    const orderId1 = res1.body.data.id;

    // Verify stock deducted by 3 (10 - 3 = 7)
    const stockAfterFirst = await testPool.query(
      'SELECT stock_quantity FROM product_variants WHERE id = $1',
      [testVariantId]
    );
    expect(stockAfterFirst.rows[0].stock_quantity).toBe(7);

    // Second submission with exact same idempotency key (e.g. network retry or double-click)
    const res2 = await request(app).post('/api/orders').send(orderPayload);
    expect([200, 201]).toContain(res2.status);
    expect(res2.body.data.id).toBe(orderId1);
    expect(res2.body.data.orderNumber).toBe(res1.body.data.orderNumber);

    // Stock must STILL be 7, NOT deducted again
    const stockAfterSecond = await testPool.query(
      'SELECT stock_quantity FROM product_variants WHERE id = $1',
      [testVariantId]
    );
    expect(stockAfterSecond.rows[0].stock_quantity).toBe(7);
  });

  // 5. Concurrent orders competing for the last available item
  it('prevents overselling when concurrent orders compete for remaining stock via row locking', async () => {
    // Set stock to exactly 1
    await testPool.query(
      'UPDATE product_variants SET stock_quantity = 1 WHERE id = $1',
      [testVariantId]
    );

    const makeOrder = (idemSuffix: string) =>
      request(app)
        .post('/api/orders')
        .send({
          customerName: `Concurrent Buyer ${idemSuffix}`,
          customerEmail: `concurrent${idemSuffix}@example.com`,
          customerPhone: '+919876543210',
          shippingAddressLine1: 'Fast Lane Express',
          shippingCity: 'Pune',
          shippingState: 'Maharashtra',
          shippingPincode: '411001',
          paymentMethod: 'COD',
          items: [{ variantId: testVariantId, quantity: 1 }],
          idempotencyKey: `idem-race-${idemSuffix}`,
        });

    // Launch two concurrent orders simultaneously for the 1 remaining item
    const [resA, resB] = await Promise.all([makeOrder('A'), makeOrder('B')]);

    const statuses = [resA.status, resB.status];
    expect(statuses).toContain(201);
    expect(statuses).toContain(409); // One succeeded, one got 409 Conflict (insufficient stock)

    // Stock must be exactly 0, never negative
    const finalStock = await testPool.query(
      'SELECT stock_quantity FROM product_variants WHERE id = $1',
      [testVariantId]
    );
    expect(finalStock.rows[0].stock_quantity).toBe(0);
  });

  // 6. Transaction rollback on order, inventory, or audit failure
  it('rolls back all mutations if order transaction encounters an unrecoverable failure', async () => {
    // Attempt order with an invalid variant ID that does not exist
    const invalidPayload = {
      customerName: 'Faulty Buyer',
      customerEmail: 'faulty@example.com',
      customerPhone: '+919876543210',
      shippingAddressLine1: 'Error St',
      shippingCity: 'Jaipur',
      shippingState: 'Rajasthan',
      shippingPincode: '302001',
      paymentMethod: 'COD',
      items: [
        {
          variantId: '00000000-0000-0000-0000-000000000000',
          quantity: 1,
        },
      ],
      idempotencyKey: 'idem-rollback-test',
    };

    const res = await request(app).post('/api/orders').send(invalidPayload);
    expect(res.status).toBe(400);

    // Verify zero orders inserted in DB
    const orderCount = await testPool.query('SELECT count(*) FROM orders');
    expect(parseInt(orderCount.rows[0].count, 10)).toBe(0);

    // Verify stock remains untouched at 10
    const stock = await testPool.query(
      'SELECT stock_quantity FROM product_variants WHERE id = $1',
      [testVariantId]
    );
    expect(stock.rows[0].stock_quantity).toBe(initialStock);
  });

  // 7. Immutable order-item snapshots
  it('preserves historical order item snapshots even if product name and price change later in catalogue', async () => {
    // Create an order
    const res = await request(app)
      .post('/api/orders')
      .send({
        customerName: 'Snapshot Customer',
        customerEmail: 'snapshot@example.com',
        customerPhone: '+919876543210',
        shippingAddressLine1: 'Historical Road',
        shippingCity: 'Chennai',
        shippingState: 'Tamil Nadu',
        shippingPincode: '600001',
        paymentMethod: 'COD',
        items: [{ variantId: testVariantId, quantity: 1 }],
        idempotencyKey: 'idem-snapshot-test',
      });
    expect(res.status).toBe(201);
    const token = res.body.data.customerOrderToken;

    // Mutate the product in catalogue: rename it and triple the price on variant
    await testPool.query(`
      UPDATE products SET name = 'Modern Modified Tee' WHERE id = $1
    `, [testProductId]);
    await testPool.query(`
      UPDATE product_variants SET price_paise = 499900 WHERE id = $1
    `, [testVariantId]);

    // Lookup order via token
    const lookup = await request(app).get(`/api/orders/${token}`);
    expect(lookup.status).toBe(200);

    // Order snapshot MUST retain original name and price
    expect(lookup.body.data.items[0].productName).toBe('Classic Oversized Tee');
    expect(lookup.body.data.items[0].unitPricePaise).toBe(149900);
    expect(lookup.body.data.items[0].lineTotalPaise).toBe(149900);
  });

  // 8. Order status transitions and inventory lifecycle
  it('enforces server-side status transitions and restores stock upon cancellation', async () => {
    // Create an order for 2 items
    const createRes = await request(app)
      .post('/api/orders')
      .send({
        customerName: 'Status Transitioner',
        customerEmail: 'status@example.com',
        customerPhone: '+919876543210',
        shippingAddressLine1: 'Lifecycle Blvd',
        shippingCity: 'Kochi',
        shippingState: 'Kerala',
        shippingPincode: '682001',
        paymentMethod: 'COD',
        items: [{ variantId: testVariantId, quantity: 2 }],
        idempotencyKey: 'idem-lifecycle-test',
      });
    expect(createRes.status).toBe(201);
    const orderId = createRes.body.data.id;

    // Stock is 10 - 2 = 8
    let stock = await testPool.query('SELECT stock_quantity FROM product_variants WHERE id = $1', [testVariantId]);
    expect(stock.rows[0].stock_quantity).toBe(8);

    // Admin transitions: PENDING -> CONFIRMED
    const confRes = await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'CONFIRMED' });
    expect(confRes.status).toBe(200);
    expect(confRes.body.data.orderStatus).toBe('CONFIRMED');

    // Admin transitions: CONFIRMED -> PROCESSING
    const procRes = await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PROCESSING' });
    expect(procRes.status).toBe(200);

    // Invalid transition: PROCESSING -> PENDING (backward transition not allowed)
    const invalidRes = await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PENDING' });
    expect(invalidRes.status).toBe(400);

    // Admin cancels order: PROCESSING -> CANCELLED
    const cancelRes = await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'CANCELLED', reason: 'Customer requested cancellation' });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.orderStatus).toBe('CANCELLED');

    // Stock must be restored to initial 10!
    stock = await testPool.query('SELECT stock_quantity FROM product_variants WHERE id = $1', [testVariantId]);
    expect(stock.rows[0].stock_quantity).toBe(10);

    // Cancelled order cannot transition to DELIVERED
    const postCancelRes = await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'DELIVERED' });
    expect(postCancelRes.status).toBe(400);
  });

  // 9. Order lookup authorization and IDOR protection
  it('protects order lookup against IDOR and rejects unauthorized access', async () => {
    // Attempt lookup with forged/invalid token
    const resFake = await request(app).get('/api/orders/forged-token-xyz-12345');
    expect(resFake.status).toBe(404);

    // Attempt admin order list without token
    const resUnauth = await request(app).get('/api/admin/orders');
    expect(resUnauth.status).toBe(401);

    // Authorized admin can fetch order list
    const resAuth = await request(app)
      .get('/api/admin/orders')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resAuth.status).toBe(200);
    expect(Array.isArray(resAuth.body.data)).toBe(true);
  });

  // 10. F-01: Reject duplicate variant IDs in the same request
  it('rejects order with duplicate variant IDs in the same request with HTTP 400', async () => {
    const duplicateVariantPayload = {
      customerName: 'Duplicate Variant Tester',
      customerEmail: 'dupvariant@example.com',
      customerPhone: '+919876543210',
      shippingAddressLine1: '123 Multi Variant Road',
      shippingCity: 'Bengaluru',
      shippingState: 'Karnataka',
      shippingPincode: '560001',
      paymentMethod: 'COD',
      items: [
        { variantId: testVariantId, quantity: 1 },
        { variantId: testVariantId, quantity: 2 },
      ],
      idempotencyKey: 'idem-dup-variant-test',
    };

    const res = await request(app)
      .post('/api/orders')
      .send(duplicateVariantPayload);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Duplicate product variant IDs in order items are not permitted');

    // Verify no orders were created
    const orderCheck = await testPool.query('SELECT count(*) FROM orders WHERE customer_email = $1', [
      'dupvariant@example.com',
    ]);
    expect(parseInt(orderCheck.rows[0].count, 10)).toBe(0);
  });

  // 11. F-01: Deterministic variant row-locking under concurrent opposite-order requests
  it('handles concurrent orders with opposite variant lock ordering without deadlock (F-01)', async () => {
    // Seed a second product and variant to verify cross-product lock independence (FOR UPDATE OF pv)
    const catRes = await testPool.query('SELECT id FROM categories LIMIT 1');
    const categoryId = catRes.rows[0].id;
    const prod2Res = await testPool.query(`
      INSERT INTO products (category_id, name, slug, description, status)
      VALUES ($1, 'Heavyweight Hoodie', 'heavyweight-hoodie', 'French Terry', 'published')
      RETURNING id;
    `, [categoryId]);
    const testProductId2 = prod2Res.rows[0].id;

    const var2Res = await testPool.query(`
      INSERT INTO product_variants (product_id, sku, size, color, stock_quantity, price_paise)
      VALUES ($1, 'AXD-HOD-BLK-L', 'L', 'Black', 10, 199900)
      RETURNING id;
    `, [testProductId2]);
    const testVariantId2 = var2Res.rows[0].id;

    // Cart 1 requests [Variant 1, Variant 2]
    const cart1Payload = {
      customerName: 'Buyer Opposite 1',
      customerEmail: 'opp1@example.com',
      customerPhone: '+919876543210',
      shippingAddressLine1: 'Lane 1, Cyber City',
      shippingCity: 'Gurugram',
      shippingState: 'Haryana',
      shippingPincode: '122002',
      paymentMethod: 'COD',
      items: [
        { variantId: testVariantId, quantity: 2 },
        { variantId: testVariantId2, quantity: 3 },
      ],
      idempotencyKey: 'idem-opp-lock-order-1',
    };

    // Cart 2 requests [Variant 2, Variant 1] (opposite order!)
    const cart2Payload = {
      customerName: 'Buyer Opposite 2',
      customerEmail: 'opp2@example.com',
      customerPhone: '+919876543211',
      shippingAddressLine1: 'Lane 2, Cyber City',
      shippingCity: 'Gurugram',
      shippingState: 'Haryana',
      shippingPincode: '122002',
      paymentMethod: 'COD',
      items: [
        { variantId: testVariantId2, quantity: 2 },
        { variantId: testVariantId, quantity: 3 },
      ],
      idempotencyKey: 'idem-opp-lock-order-2',
    };

    // Launch both simultaneously
    const [res1, res2] = await Promise.all([
      request(app).post('/api/orders').send(cart1Payload),
      request(app).post('/api/orders').send(cart2Payload),
    ]);

    // Both must succeed without PostgreSQL deadlock error (40P01)
    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);

    // Verify final stock:
    // Variant 1: 10 - 2 - 3 = 5
    // Variant 2: 10 - 3 - 2 = 5
    const stock1 = await testPool.query('SELECT stock_quantity FROM product_variants WHERE id = $1', [testVariantId]);
    const stock2 = await testPool.query('SELECT stock_quantity FROM product_variants WHERE id = $1', [testVariantId2]);
    expect(stock1.rows[0].stock_quantity).toBe(5);
    expect(stock2.rows[0].stock_quantity).toBe(5);

    // Verify snapshot items preserved submitted cart item ordering
    expect(res1.body.data.items[0].variantId).toBe(testVariantId);
    expect(res1.body.data.items[1].variantId).toBe(testVariantId2);

    expect(res2.body.data.items[0].variantId).toBe(testVariantId2);
    expect(res2.body.data.items[1].variantId).toBe(testVariantId);
  });

  // 12. F-02: Idempotency payload mismatch rejection (409 Conflict)
  it('rejects idempotency key reuse when payload differs with HTTP 409 Conflict (F-02)', async () => {
    const originalPayload = {
      customerName: 'Original Requester',
      customerEmail: 'orig@example.com',
      customerPhone: '+919876543210',
      shippingAddressLine1: '100 South Street',
      shippingCity: 'Madurai',
      shippingState: 'Tamil Nadu',
      shippingPincode: '625001',
      paymentMethod: 'COD',
      items: [{ variantId: testVariantId, quantity: 1 }],
      idempotencyKey: 'idem-mismatch-key-12345',
    };

    const firstRes = await request(app).post('/api/orders').send(originalPayload);
    expect(firstRes.status).toBe(201);

    // Attempt reuse of the exact same key with a different customer name
    const mismatchedPayload = {
      ...originalPayload,
      customerName: 'Different Impersonator',
    };

    const conflictRes = await request(app).post('/api/orders').send(mismatchedPayload);
    expect(conflictRes.status).toBe(409);
    expect(conflictRes.body.error).toContain('Idempotency key already exists with differing order payload');

    // Attempt reuse with different quantity
    const mismatchedQtyPayload = {
      ...originalPayload,
      items: [{ variantId: testVariantId, quantity: 2 }],
    };

    const conflictQtyRes = await request(app).post('/api/orders').send(mismatchedQtyPayload);
    expect(conflictQtyRes.status).toBe(409);
    expect(conflictQtyRes.body.error).toContain('Idempotency key already exists with differing order payload');
  });

  // 13. F-03: Concurrent same-key submissions handled without 23505 becoming HTTP 500
  it('handles simultaneous concurrent same-key submissions without 23505 becoming HTTP 500 (F-03)', async () => {
    const concurrentPayload = {
      customerName: 'Simultaneous Submitter',
      customerEmail: 'simul@example.com',
      customerPhone: '+919876543210',
      shippingAddressLine1: 'Race Condition Ave',
      shippingCity: 'Hyderabad',
      shippingState: 'Telangana',
      shippingPincode: '500001',
      paymentMethod: 'COD',
      items: [{ variantId: testVariantId, quantity: 2 }],
      idempotencyKey: 'idem-simul-race-key-456',
    };

    // Fire 4 identical requests simultaneously
    const responses = await Promise.all([
      request(app).post('/api/orders').send(concurrentPayload),
      request(app).post('/api/orders').send(concurrentPayload),
      request(app).post('/api/orders').send(concurrentPayload),
      request(app).post('/api/orders').send(concurrentPayload),
    ]);

    // Zero 500 errors! All must be either 201 (created) or 200 (safe replay)
    const statusCodes = responses.map((r) => r.status);
    expect(statusCodes.every((s) => s === 200 || s === 201)).toBe(true);

    const createdCount = statusCodes.filter((s) => s === 201).length;
    const replayCount = statusCodes.filter((s) => s === 200).length;

    expect(createdCount).toBe(1);
    expect(replayCount).toBe(3);

    // Verify all return the exact same order ID and order number
    const firstOrderId = responses[0].body.data.id;
    for (const r of responses) {
      expect(r.body.data.id).toBe(firstOrderId);
    }

    // Verify database has exactly 1 order row
    const orderCount = await testPool.query(
      'SELECT count(*) FROM orders WHERE idempotency_key = $1',
      ['idem-simul-race-key-456']
    );
    expect(parseInt(orderCount.rows[0].count, 10)).toBe(1);

    // Verify stock deducted exactly once (initialStock 10 - 2 = 8)
    const stock = await testPool.query(
      'SELECT stock_quantity FROM product_variants WHERE id = $1',
      [testVariantId]
    );
    expect(stock.rows[0].stock_quantity).toBe(8);
  });

  // 14. F-07: Public order token validation, rate limiting, and PII minimization
  it('validates public order token format and protects endpoint with rate limiting (F-07)', async () => {
    // 1. Malformed token (too short) -> 404 before DB
    const resShort = await request(app).get('/api/orders/too-short');
    expect(resShort.status).toBe(404);
    expect(resShort.body.error).toBe('Order not found');

    // 2. Malformed token (48 chars but non-hex uppercase/invalid chars) -> 404 before DB
    const nonHex = 'Z'.repeat(48);
    const resNonHex = await request(app).get(`/api/orders/${nonHex}`);
    expect(resNonHex.status).toBe(404);
    expect(resNonHex.body.error).toBe('Order not found');

    // 3. Unknown token (valid 48-char lowercase hex) -> 404
    const validFormatUnknown = '0'.repeat(48);
    const resUnknown = await request(app).get(`/api/orders/${validFormatUnknown}`);
    expect(resUnknown.status).toBe(404);
    expect(resUnknown.body.error).toBe('Order not found');

    // 4. Create real order to get valid 48-char token
    const createRes = await request(app)
      .post('/api/orders')
      .send({
        customerName: 'Token Verification Buyer',
        customerEmail: 'tokenverify@example.com',
        customerPhone: '+919876543210',
        shippingAddressLine1: 'Secret House 42, Private Lane',
        shippingAddressLine2: 'Apt 1B',
        shippingCity: 'Bengaluru',
        shippingState: 'Karnataka',
        shippingPincode: '560001',
        paymentMethod: 'COD',
        items: [{ variantId: testVariantId, quantity: 1 }],
        idempotencyKey: 'idem-token-validation-key',
      });
    expect(createRes.status).toBe(201);
    const validToken = createRes.body.data.customerOrderToken;
    expect(validToken).toMatch(/^[a-f0-9]{48}$/);

    // 5. Query with valid token -> 200 with minimized PII
    const validRes = await request(app).get(`/api/orders/${validToken}`);
    expect(validRes.status).toBe(200);
    expect(validRes.body.data.orderNumber).toBe(createRes.body.data.orderNumber);
    expect(validRes.body.data.shippingCity).toBe('Bengaluru');
    expect(validRes.body.data.items).toHaveLength(1);

    // Verify full PII is NOT disclosed on public tracking endpoint
    expect(validRes.body.data.customerPhone).toBeUndefined();
    expect(validRes.body.data.customerEmail).toBeUndefined();
    expect(validRes.body.data.shippingAddressLine1).toBeUndefined();
    expect(validRes.body.data.shippingAddressLine2).toBeUndefined();
    expect(validRes.body.data.customerOrderToken).toBeUndefined();

    // Verify rate limit headers are present
    expect(validRes.headers['ratelimit-limit']).toBeDefined();
  });
});
