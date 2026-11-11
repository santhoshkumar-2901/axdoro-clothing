import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import {
  initializeTestDatabase,
  truncateTestOrders,
  truncateTestReturns,
  closeTestDatabase,
  testPool,
} from './test-db.js';

describe('Phase 2 — Return Request System & Public Submission API (axdoro_test)', () => {
  let deliveredOrderId: string;
  let deliveredOrderNumber: string;
  let expiredOrderId: string;
  let expiredOrderNumber: string;
  let undeliveredOrderId: string;
  let undeliveredOrderNumber: string;

  beforeAll(async () => {
    await initializeTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  beforeEach(async () => {
    await truncateTestReturns();
    await truncateTestOrders();

    // 1. Seed Order A: Delivered 2 days ago (within 7-day window)
    const orderARes = await testPool.query<{ id: string; order_number: string }>(`
      INSERT INTO orders (
        order_number,
        customer_name,
        customer_email,
        customer_phone,
        shipping_address_line1,
        shipping_city,
        shipping_state,
        shipping_pincode,
        subtotal_paise,
        total_paise,
        customer_order_token,
        order_status,
        delivered_at
      ) VALUES (
        'AX-202611-0001',
        'Santhosh Kumar',
        'customer1@example.com',
        '+919876543210',
        '123 Fashion Ave',
        'Chennai',
        'Tamil Nadu',
        '600001',
        149900,
        149900,
        'abcdef1234567890abcdef1234567890abcdef1234567890',
        'DELIVERED',
        NOW() - INTERVAL '2 days'
      ) RETURNING id, order_number;
    `);
    deliveredOrderId = orderARes.rows[0].id;
    deliveredOrderNumber = orderARes.rows[0].order_number;

    // 2. Seed Order B: Delivered 10 days ago (exceeds 7-day window)
    const orderBRes = await testPool.query<{ id: string; order_number: string }>(`
      INSERT INTO orders (
        order_number,
        customer_name,
        customer_email,
        customer_phone,
        shipping_address_line1,
        shipping_city,
        shipping_state,
        shipping_pincode,
        subtotal_paise,
        total_paise,
        customer_order_token,
        order_status,
        delivered_at
      ) VALUES (
        'AX-202611-0002',
        'Priya Sharma',
        'customer2@example.com',
        '+919876543211',
        '456 Silk Road',
        'Bangalore',
        'Karnataka',
        '560001',
        249900,
        249900,
        '123456abcdef7890123456abcdef7890123456abcdef7890',
        'DELIVERED',
        NOW() - INTERVAL '10 days'
      ) RETURNING id, order_number;
    `);
    expiredOrderId = orderBRes.rows[0].id;
    expiredOrderNumber = orderBRes.rows[0].order_number;

    // 3. Seed Order C: Shipped but NO delivery timestamp recorded yet
    const orderCRes = await testPool.query<{ id: string; order_number: string }>(`
      INSERT INTO orders (
        order_number,
        customer_name,
        customer_email,
        customer_phone,
        shipping_address_line1,
        shipping_city,
        shipping_state,
        shipping_pincode,
        subtotal_paise,
        total_paise,
        customer_order_token,
        order_status,
        delivered_at
      ) VALUES (
        'AX-202611-0003',
        'Rahul Verma',
        'customer3@example.com',
        '+919876543212',
        '789 Cotton Lane',
        'Mumbai',
        'Maharashtra',
        '400001',
        99900,
        99900,
        '987654fedcba3210987654fedcba3210987654fedcba3210',
        'SHIPPED',
        NULL
      ) RETURNING id, order_number;
    `);
    undeliveredOrderId = orderCRes.rows[0].id;
    undeliveredOrderNumber = orderCRes.rows[0].order_number;
  });

  // =========================================================================
  // 1. VALID RETURN REQUEST SUBMISSION
  // =========================================================================
  it('submits a valid return request and returns 201 Created with generic response', async () => {
    const payload = {
      orderId: deliveredOrderNumber,
      phone: '+919876543210',
      email: 'customer1@example.com',
      reason: 'SIZE_DOES_NOT_FIT',
      description: 'Garment is slightly tight around the shoulders.',
    };

    const res = await request(app).post('/api/returns').send(payload);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.message).toContain('Your return request has been submitted successfully');
    expect(res.body.data.requestId).toMatch(/^RET-\d{6}-[A-F0-9]{6}$/);

    // Verify database record in return_requests
    const dbRes = await testPool.query(
      'SELECT * FROM return_requests WHERE request_number = $1',
      [res.body.data.requestId]
    );
    expect(dbRes.rows.length).toBe(1);
    const row = dbRes.rows[0];
    expect(row.submitted_order_id).toBe(deliveredOrderNumber);
    expect(row.customer_phone).toBe('+919876543210');
    expect(row.customer_email).toBe('customer1@example.com');
    expect(row.reason).toBe('SIZE_DOES_NOT_FIT');
    expect(row.description).toBe('Garment is slightly tight around the shoulders.');
    expect(row.status).toBe('REQUEST_SUBMITTED');
    expect(row.is_order_matched).toBe(true);
    expect(row.matched_order_id).toBe(deliveredOrderId);
    expect(row.eligibility_flag).toBe('WITHIN_7_DAYS');
    expect(row.requires_delivery_review).toBe(false);

    // Verify initial audit history row
    const historyRes = await testPool.query(
      'SELECT * FROM return_request_history WHERE return_request_id = $1',
      [row.id]
    );
    expect(historyRes.rows.length).toBe(1);
    expect(historyRes.rows[0].new_status).toBe('REQUEST_SUBMITTED');
    expect(historyRes.rows[0].actor_type).toBe('CUSTOMER');
  });

  // =========================================================================
  // 2. MISSING ORDER ID
  // =========================================================================
  it('rejects submission with missing Order ID with 400 Bad Request', async () => {
    const payload = {
      phone: '+919876543210',
      email: 'customer@example.com',
      reason: 'SIZE_DOES_NOT_FIT',
    };

    const res = await request(app).post('/api/returns').send(payload);
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toContain('Order ID is required');
  });

  // =========================================================================
  // 3. MISSING PHONE
  // =========================================================================
  it('rejects submission with missing phone with 400 Bad Request', async () => {
    const payload = {
      orderId: 'AX-202611-0001',
      email: 'customer@example.com',
      reason: 'SIZE_DOES_NOT_FIT',
    };

    const res = await request(app).post('/api/returns').send(payload);
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toContain('Phone number is required');
  });

  // =========================================================================
  // 4. MISSING EMAIL
  // =========================================================================
  it('rejects submission with missing email with 400 Bad Request', async () => {
    const payload = {
      orderId: 'AX-202611-0001',
      phone: '+919876543210',
      reason: 'SIZE_DOES_NOT_FIT',
    };

    const res = await request(app).post('/api/returns').send(payload);
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toContain('Email address is required');
  });

  // =========================================================================
  // 5. INVALID EMAIL FORMAT
  // =========================================================================
  it('rejects submission with invalid email format with 400 Bad Request', async () => {
    const payload = {
      orderId: 'AX-202611-0001',
      phone: '+919876543210',
      email: 'not-an-email',
      reason: 'SIZE_DOES_NOT_FIT',
    };

    const res = await request(app).post('/api/returns').send(payload);
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toContain('Invalid email address');
  });

  // =========================================================================
  // 6. INVALID REASON ENUM
  // =========================================================================
  it('rejects submission with unapproved return reason with 400 Bad Request', async () => {
    const payload = {
      orderId: 'AX-202611-0001',
      phone: '+919876543210',
      email: 'customer@example.com',
      reason: 'INVENTED_REASON_FOUND_CHEAPER',
    };

    const res = await request(app).post('/api/returns').send(payload);
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toContain('Invalid return reason');
  });

  // =========================================================================
  // 7. EXCESSIVELY LONG DESCRIPTION
  // =========================================================================
  it('rejects submission exceeding 1000 characters description with 400 Bad Request', async () => {
    const payload = {
      orderId: 'AX-202611-0001',
      phone: '+919876543210',
      email: 'customer@example.com',
      reason: 'OTHER',
      description: 'A'.repeat(1001),
    };

    const res = await request(app).post('/api/returns').send(payload);
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toContain('Description cannot exceed 1000 characters');
  });

  // =========================================================================
  // 8. MALFORMED PAYLOAD (NON-OBJECT OR INVALID JSON)
  // =========================================================================
  it('rejects non-object or malformed payload with 400 Bad Request', async () => {
    const res = await request(app)
      .post('/api/returns')
      .set('Content-Type', 'application/json')
      .send('"just a string"');

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
  });

  // =========================================================================
  // 9. SQL INJECTION ATTEMPTS (SAFE PARAMETERIZATION)
  // =========================================================================
  it('safely handles SQL injection attempts in orderId and phone without executing raw SQL', async () => {
    const payload = {
      orderId: "AX-001' OR '1'='1' --",
      phone: "+919876543210",
      email: "sqli@example.com",
      reason: "OTHER",
      description: "'); DROP TABLE return_requests; --",
    };

    const res = await request(app).post('/api/returns').send(payload);

    // Successfully persists as a regular string parameter with 201 Created
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');

    // Confirm return_requests table was NOT dropped and record was safely parameterized
    const tableCheck = await testPool.query("SELECT to_regclass('public.return_requests') IS NOT NULL AS exists;");
    expect(tableCheck.rows[0].exists).toBe(true);

    const record = await testPool.query("SELECT * FROM return_requests WHERE request_number = $1", [res.body.data.requestId]);
    expect(record.rows[0].submitted_order_id).toBe("AX-001' OR '1'='1' --");
    expect(record.rows[0].description).toBe("'); DROP TABLE return_requests; --");
  });

  // =========================================================================
  // 10. GENERIC RESPONSE BEHAVIOR (ZERO PUBLIC DATA DISCLOSURE)
  // =========================================================================
  it('ensures public response NEVER leaks customer name, address, order items, or total', async () => {
    const payload = {
      orderId: deliveredOrderNumber,
      phone: '+919876543210',
      email: 'customer1@example.com',
      reason: 'WRONG_PRODUCT_RECEIVED',
    };

    const res = await request(app).post('/api/returns').send(payload);

    expect(res.status).toBe(201);
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('Santhosh');
    expect(bodyStr).not.toContain('Fashion Ave');
    expect(bodyStr).not.toContain('149900');
    expect(bodyStr).not.toContain('DELIVERED');
    expect(bodyStr).not.toContain('WITHIN_7_DAYS');
  });

  // =========================================================================
  // 11. UNMATCHED ORDER SUBMISSION HANDLING
  // =========================================================================
  it('preserves unmatched order submissions with is_order_matched=false and identical 201 response', async () => {
    const payload = {
      orderId: 'AX-NON-EXISTENT-999',
      phone: '+919876543299',
      email: 'unmatched@example.com',
      reason: 'OTHER',
      description: 'Order placed over WhatsApp.',
    };

    const res = await request(app).post('/api/returns').send(payload);

    // Client receives identical generic success response
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.requestId).toBeDefined();

    // Database stores with is_order_matched=false and flag 'ORDER_UNMATCHED' for admin triage
    const dbRes = await testPool.query(
      'SELECT * FROM return_requests WHERE request_number = $1',
      [res.body.data.requestId]
    );
    expect(dbRes.rows.length).toBe(1);
    const row = dbRes.rows[0];
    expect(row.is_order_matched).toBe(false);
    expect(row.matched_order_id).toBeNull();
    expect(row.eligibility_flag).toBe('ORDER_UNMATCHED');
    expect(row.requires_delivery_review).toBe(true);
    expect(row.status).toBe('REQUEST_SUBMITTED');
  });

  // =========================================================================
  // 12. MISSING DELIVERY TIMESTAMP HANDLING
  // =========================================================================
  it('preserves submissions for orders with missing delivery timestamp with NO_DELIVERY_DATE flag', async () => {
    const payload = {
      orderId: undeliveredOrderNumber,
      phone: '+919876543212',
      email: 'customer3@example.com',
      reason: 'PRODUCT_DAMAGED_OR_DEFECTIVE',
    };

    const res = await request(app).post('/api/returns').send(payload);

    expect(res.status).toBe(201);
    const dbRes = await testPool.query(
      'SELECT * FROM return_requests WHERE request_number = $1',
      [res.body.data.requestId]
    );
    const row = dbRes.rows[0];
    expect(row.is_order_matched).toBe(true);
    expect(row.matched_order_id).toBe(undeliveredOrderId);
    expect(row.delivery_date_recorded).toBeNull();
    expect(row.eligibility_flag).toBe('NO_DELIVERY_DATE');
    expect(row.requires_delivery_review).toBe(true);
    // Not automatically approved or rejected!
    expect(row.status).toBe('REQUEST_SUBMITTED');
  });

  // =========================================================================
  // 13. REQUESTS OUTSIDE 7-DAY PERIOD (PRESERVED FOR ADMIN REVIEW)
  // =========================================================================
  it('preserves submissions outside 7 days with EXCEEDS_7_DAYS flag instead of rejecting them', async () => {
    const payload = {
      orderId: expiredOrderNumber,
      phone: '+919876543211',
      email: 'customer2@example.com',
      reason: 'CHANGED_MY_MIND',
    };

    const res = await request(app).post('/api/returns').send(payload);

    // Critical policy check: MUST NOT auto-reject!
    expect(res.status).toBe(201);
    const dbRes = await testPool.query(
      'SELECT * FROM return_requests WHERE request_number = $1',
      [res.body.data.requestId]
    );
    const row = dbRes.rows[0];
    expect(row.is_order_matched).toBe(true);
    expect(row.matched_order_id).toBe(expiredOrderId);
    expect(row.eligibility_flag).toBe('EXCEEDS_7_DAYS');
    expect(row.requires_delivery_review).toBe(true);
    expect(row.status).toBe('REQUEST_SUBMITTED');
  });

  // =========================================================================
  // 14. CRYPTOGRAPHICALLY SECURE REFERENCE UNIQUENESS
  // =========================================================================
  it('generates distinct cryptographically secure request references for consecutive submissions', async () => {
    const req1 = await request(app).post('/api/returns').send({
      orderId: 'AX-001',
      phone: '+919876543210',
      email: 'user1@example.com',
      reason: 'OTHER',
    });

    const req2 = await request(app).post('/api/returns').send({
      orderId: 'AX-002',
      phone: '+919876543211',
      email: 'user2@example.com',
      reason: 'OTHER',
    });

    expect(req1.body.data.requestId).not.toBe(req2.body.data.requestId);
    expect(req1.body.data.requestId).toMatch(/^RET-\d{6}-[A-F0-9]{6}$/);
    expect(req2.body.data.requestId).toMatch(/^RET-\d{6}-[A-F0-9]{6}$/);
  });

  // =========================================================================
  // 15. DUPLICATE RAPID SUBMISSION HANDLING
  // =========================================================================
  it('returns existing requestId on rapid identical replay within 60 seconds without creating duplicates', async () => {
    const payload = {
      orderId: deliveredOrderNumber,
      phone: '+919876543210',
      email: 'customer1@example.com',
      reason: 'SIZE_DOES_NOT_FIT',
    };

    const res1 = await request(app).post('/api/returns').send(payload);
    expect(res1.status).toBe(201);
    const firstRequestId = res1.body.data.requestId;

    // Immediate replay of exact same request
    const res2 = await request(app).post('/api/returns').send(payload);
    expect(res2.status).toBe(201);
    expect(res2.body.data.requestId).toBe(firstRequestId);

    // Confirm database contains exactly ONE record
    const countRes = await testPool.query(
      'SELECT COUNT(*)::int as count FROM return_requests WHERE customer_phone = $1',
      ['+919876543210']
    );
    expect(countRes.rows[0].count).toBe(1);
  });

  // =========================================================================
  // 16. THREE-FIELD MATCHING: CORRECT ORDER ID + INCORRECT PHONE + CORRECT EMAIL
  // =========================================================================
  it('does NOT match order when phone differs, setting is_order_matched=false and flag=CUSTOMER_INFO_MISMATCH', async () => {
    const payload = {
      orderId: deliveredOrderNumber,
      phone: '+919876543299', // Incorrect phone (not customer1's phone)
      email: 'customer1@example.com', // Correct email
      reason: 'SIZE_DOES_NOT_FIT',
    };

    const res = await request(app).post('/api/returns').send(payload);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.requestId).toBeDefined();

    const dbRes = await testPool.query(
      'SELECT * FROM return_requests WHERE request_number = $1',
      [res.body.data.requestId]
    );
    expect(dbRes.rows.length).toBe(1);
    const row = dbRes.rows[0];

    // Must not link order or use candidate order delivery date
    expect(row.is_order_matched).toBe(false);
    expect(row.matched_order_id).toBeNull();
    expect(row.delivery_date_recorded).toBeNull();
    expect(row.eligibility_flag).toBe('CUSTOMER_INFO_MISMATCH');
    expect(row.requires_delivery_review).toBe(true);
    expect(row.status).toBe('REQUEST_SUBMITTED');
  });

  // =========================================================================
  // 17. THREE-FIELD MATCHING: CORRECT ORDER ID + CORRECT PHONE + INCORRECT EMAIL
  // =========================================================================
  it('does NOT match order when email differs, setting is_order_matched=false and flag=CUSTOMER_INFO_MISMATCH', async () => {
    const payload = {
      orderId: deliveredOrderNumber,
      phone: '+919876543210', // Correct phone
      email: 'different.person@example.com', // Incorrect email
      reason: 'WRONG_PRODUCT_RECEIVED',
    };

    const res = await request(app).post('/api/returns').send(payload);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.requestId).toBeDefined();

    const dbRes = await testPool.query(
      'SELECT * FROM return_requests WHERE request_number = $1',
      [res.body.data.requestId]
    );
    expect(dbRes.rows.length).toBe(1);
    const row = dbRes.rows[0];

    // Must not link order
    expect(row.is_order_matched).toBe(false);
    expect(row.matched_order_id).toBeNull();
    expect(row.delivery_date_recorded).toBeNull();
    expect(row.eligibility_flag).toBe('CUSTOMER_INFO_MISMATCH');
    expect(row.requires_delivery_review).toBe(true);
    expect(row.status).toBe('REQUEST_SUBMITTED');
  });

  // =========================================================================
  // 18. THREE-FIELD MATCHING: CORRECT ORDER ID + INCORRECT PHONE + INCORRECT EMAIL
  // =========================================================================
  it('does NOT match order when both phone and email differ from the order record', async () => {
    const payload = {
      orderId: deliveredOrderNumber,
      phone: '+919876543299', // Incorrect phone
      email: 'stranger@example.com', // Incorrect email
      reason: 'CHANGED_MY_MIND',
    };

    const res = await request(app).post('/api/returns').send(payload);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.requestId).toBeDefined();

    const dbRes = await testPool.query(
      'SELECT * FROM return_requests WHERE request_number = $1',
      [res.body.data.requestId]
    );
    expect(dbRes.rows.length).toBe(1);
    const row = dbRes.rows[0];

    expect(row.is_order_matched).toBe(false);
    expect(row.matched_order_id).toBeNull();
    expect(row.delivery_date_recorded).toBeNull();
    expect(row.eligibility_flag).toBe('CUSTOMER_INFO_MISMATCH');
    expect(row.requires_delivery_review).toBe(true);
    expect(row.status).toBe('REQUEST_SUBMITTED');
  });

  // =========================================================================
  // 19. NORMALIZATION: EMAIL CASE DIFFERENCES AND SURROUNDING WHITESPACE
  // =========================================================================
  it('correctly matches order when email has uppercase letters and surrounding whitespace', async () => {
    const payload = {
      orderId: deliveredOrderNumber,
      phone: '+919876543210',
      email: '   CuStOmEr1@ExAmPlE.cOm   ',
      reason: 'SIZE_DOES_NOT_FIT',
    };

    const res = await request(app).post('/api/returns').send(payload);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');

    const dbRes = await testPool.query(
      'SELECT * FROM return_requests WHERE request_number = $1',
      [res.body.data.requestId]
    );
    expect(dbRes.rows.length).toBe(1);
    const row = dbRes.rows[0];

    // Evaluated against trimmed lowercase and successfully matched
    expect(row.is_order_matched).toBe(true);
    expect(row.matched_order_id).toBe(deliveredOrderId);
    expect(row.customer_email).toBe('customer1@example.com');
    expect(row.eligibility_flag).toBe('WITHIN_7_DAYS');
  });

  // =========================================================================
  // 20. MISMATCHED SUBMISSION NEVER USES CANDIDATE ORDER'S DELIVERY DATE
  // =========================================================================
  it('does NOT use candidate order delivery date for eligibility when customer details are mismatched', async () => {
    // expiredOrderId was delivered 10 days ago ('EXCEEDS_7_DAYS' if matched)
    const payload = {
      orderId: expiredOrderNumber,
      phone: '+919876543299', // Mismatched phone
      email: 'customer2@example.com',
      reason: 'CHANGED_MY_MIND',
    };

    const res = await request(app).post('/api/returns').send(payload);

    expect(res.status).toBe(201);

    const dbRes = await testPool.query(
      'SELECT * FROM return_requests WHERE request_number = $1',
      [res.body.data.requestId]
    );
    const row = dbRes.rows[0];

    // Must NOT flag EXCEEDS_7_DAYS from candidate order!
    expect(row.is_order_matched).toBe(false);
    expect(row.matched_order_id).toBeNull();
    expect(row.delivery_date_recorded).toBeNull();
    expect(row.eligibility_flag).toBe('CUSTOMER_INFO_MISMATCH');
    expect(row.requires_delivery_review).toBe(true);
    expect(row.status).toBe('REQUEST_SUBMITTED');
  });

  // =========================================================================
  // 21. PUBLIC RESPONSE NEUTRALITY (NO DISCLOSURE OF MATCHING OR MISMATCH STATUS)
  // =========================================================================
  it('returns identical public response structure for mismatched submission as matched submission', async () => {
    // 1. Mismatched request
    const mismatchRes = await request(app).post('/api/returns').send({
      orderId: deliveredOrderNumber,
      phone: '+919876543299',
      email: 'wrong@example.com',
      reason: 'OTHER',
    });

    // 2. Unknown order request
    const unknownRes = await request(app).post('/api/returns').send({
      orderId: 'AX-DOES-NOT-EXIST-999',
      phone: '+919876543299',
      email: 'wrong@example.com',
      reason: 'OTHER',
    });

    expect(mismatchRes.status).toBe(201);
    expect(unknownRes.status).toBe(201);

    // Both receive identical messages
    expect(mismatchRes.body.message).toBe(unknownRes.body.message);

    // Neither discloses matching or mismatch status
    const bodyStr = JSON.stringify(mismatchRes.body);
    expect(bodyStr).not.toContain('MISMATCH');
    expect(bodyStr).not.toContain('MATCH');
    expect(bodyStr).not.toContain('ORDER_UNMATCHED');
    expect(bodyStr).not.toContain('eligibility');
    expect(Object.keys(mismatchRes.body.data)).toEqual(['requestId']);
  });
});

