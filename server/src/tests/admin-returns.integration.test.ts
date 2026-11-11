import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import {
  initializeTestDatabase,
  truncateTestAdmin,
  truncateTestCatalogue,
  truncateTestEnquiries,
  closeTestDatabase,
  testPool,
} from './test-db.js';
import { provisionAdmin, loginAdmin } from '../services/admin-auth.service.js';
import * as cloudinaryService from '../services/cloudinary.service.js';
import { createReturnRequest } from '../services/return.service.js';

describe('AXDORO Phase 4: Admin Returns & Exchanges Management Integration Tests', () => {
  let adminToken: string;
  let adminEmail: string;
  let adminId: string;

  beforeAll(async () => {
    await initializeTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await truncateTestAdmin();
    await testPool.query('DELETE FROM return_requests CASCADE;');
    await testPool.query('DELETE FROM orders CASCADE;');
    await testPool.query('DELETE FROM cloudinary_cleanup_jobs;');
    await testPool.query('DELETE FROM admin_audit_logs;');

    adminEmail = 'returns-admin@axdoro.test';
    const provisionResult = await provisionAdmin({
      email: adminEmail,
      password: 'AdminPassword123!',
      fullName: 'Returns Administrator',
    });
    const loginResult = await loginAdmin({
      email: adminEmail,
      password: 'AdminPassword123!',
    });

    adminToken = loginResult.token;
    adminId = loginResult.admin.id;
  });

  // Helper to create test order
  async function createTestOrder(orderNumber = 'AXD-ORD-2026-901', deliveredAt?: Date) {
    const res = await testPool.query<{ id: string; order_number: string }>(
      `INSERT INTO orders (
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
         payment_method,
         payment_status,
         order_status,
         customer_order_token,
         delivered_at
       ) VALUES (
         $1, 'Arjun Verma', 'arjun@example.com', '+919876543210',
         '123 MG Road', 'Bengaluru', 'Karnataka', '560001',
         249900, 249900, 'COD', 'PAID', 'DELIVERED',
         $2, $3
       ) RETURNING id, order_number`,
      [orderNumber, `tok_${Date.now()}_${Math.random()}`, deliveredAt || new Date()]
    );

    const orderId = res.rows[0].id;

    // Add order item
    await testPool.query(
      `INSERT INTO order_items (
         order_id,
         product_name,
         product_slug,
         variant_sku,
         variant_size,
         variant_color,
         unit_price_paise,
         quantity,
         line_total_paise
       ) VALUES (
         $1, 'Classic Oversized Hoodie', 'classic-oversized-hoodie',
         'HOOD-BLK-L', 'L', 'Black',
         249900, 1, 249900
       )`,
      [orderId]
    );

    return orderId;
  }

  // -------------------------------------------------------------------------
  // 1. Authorization & Security
  // -------------------------------------------------------------------------
  describe('1. Admin Authorization & Security', () => {
    it('rejects unauthenticated requests to list returns with 401', async () => {
      const res = await request(app).get('/api/admin/returns');
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated requests to get return details with 401', async () => {
      const res = await request(app).get('/api/admin/returns/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated requests to stream evidence with 401', async () => {
      const res = await request(app).get(
        '/api/admin/returns/00000000-0000-0000-0000-000000000000/evidence/00000000-0000-0000-0000-000000000001'
      );
      expect(res.status).toBe(401);
    });

    it('rejects mutating requests without valid CSRF header when authenticated via cookie with 403 Forbidden', async () => {
      const res = await request(app)
        .patch('/api/admin/returns/00000000-0000-0000-0000-000000000000/status')
        .set('Cookie', [`axdoro_admin_session=${adminToken}`])
        .send({ status: 'UNDER_REVIEW' });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('CSRF token missing');
    });
  });

  // -------------------------------------------------------------------------
  // 2. Dashboard, Metrics & Listing
  // -------------------------------------------------------------------------
  describe('2. Dashboard, Metrics & Listing', () => {
    it('returns metrics for dashboard triage counts', async () => {
      const orderId = await createTestOrder('ORD-METRICS-01');
      await createReturnRequest({
        orderId: 'ORD-METRICS-01',
        phone: '+919876543210',
        email: 'arjun@example.com',
        reason: 'PRODUCT_DAMAGED_OR_DEFECTIVE',
        description: 'Torn seam on left sleeve',
      });

      const res = await request(app)
        .get('/api/admin/returns/metrics')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.pendingReview).toBeGreaterThanOrEqual(1);
      expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    });

    it('lists returns with server-side pagination, search, and status filter', async () => {
      const orderId = await createTestOrder('ORD-LIST-01');
      const submission = await createReturnRequest({
        orderId: 'ORD-LIST-01',
        phone: '+919876543210',
        email: 'arjun@example.com',
        reason: 'SIZE_DOES_NOT_FIT',
        description: 'Size L is too loose',
      });

      // Filter by status=REQUEST_SUBMITTED
      const res = await request(app)
        .get('/api/admin/returns?status=REQUEST_SUBMITTED&limit=10&page=1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination.totalCount).toBe(1);
      expect(res.body.data[0].requestNumber).toBe(submission.requestId);
      expect(res.body.data[0].customerName).toBe('Arjun Verma');

      // Search by order number
      const searchRes = await request(app)
        .get('/api/admin/returns?search=ORD-LIST-01')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(searchRes.status).toBe(200);
      expect(searchRes.body.data.length).toBe(1);
      expect(searchRes.body.data[0].submittedOrderId).toBe('ORD-LIST-01');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Request Details
  // -------------------------------------------------------------------------
  describe('3. Request Details', () => {
    it('returns full return request details, matched order info, and items', async () => {
      const orderId = await createTestOrder('ORD-DETAIL-01');
      const submission = await createReturnRequest({
        orderId: 'ORD-DETAIL-01',
        phone: '+919876543210',
        email: 'arjun@example.com',
        reason: 'PRODUCT_DAMAGED_OR_DEFECTIVE',
        description: 'Color faded on collar',
      });

      const listRes = await request(app)
        .get(`/api/admin/returns?search=${submission.requestId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      const returnId = listRes.body.data[0].id;

      const detailRes = await request(app)
        .get(`/api/admin/returns/${returnId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.status).toBe('success');
      const data = detailRes.body.data;
      expect(data.id).toBe(returnId);
      expect(data.requestNumber).toBe(submission.requestId);
      expect(data.isOrderMatched).toBe(true);
      expect(data.matchedOrder).not.toBeNull();
      expect(data.matchedOrder.customerName).toBe('Arjun Verma');
      expect(data.matchedOrder.items.length).toBe(1);
      expect(data.matchedOrder.items[0].productName).toBe('Classic Oversized Hoodie');
      expect(data.history.length).toBeGreaterThanOrEqual(1);
    });

    it('returns 404 for nonexistent return request UUID', async () => {
      const res = await request(app)
        .get('/api/admin/returns/11111111-1111-1111-1111-111111111111')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });

    it('returns 400 for malformed non-UUID id parameter', async () => {
      const res = await request(app)
        .get('/api/admin/returns/not-a-valid-uuid')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Status Workflow & Business Transitions
  // -------------------------------------------------------------------------
  describe('4. Status Workflow & Valid Transitions', () => {
    it('transitions status from REQUEST_SUBMITTED to UNDER_REVIEW, APPROVED, and COMPLETED', async () => {
      const orderId = await createTestOrder('ORD-WORKFLOW-01');
      const submission = await createReturnRequest({
        orderId: 'ORD-WORKFLOW-01',
        phone: '+919876543210',
        email: 'arjun@example.com',
        reason: 'PRODUCT_DAMAGED_OR_DEFECTIVE',
        description: 'Torn collar',
      });

      const listRes = await request(app)
        .get(`/api/admin/returns?search=${submission.requestId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      const returnId = listRes.body.data[0].id;

      // 1. REQUEST_SUBMITTED -> UNDER_REVIEW
      const underReviewRes = await request(app)
        .patch(`/api/admin/returns/${returnId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'UNDER_REVIEW', adminNotes: 'Checking customer report' });

      expect(underReviewRes.status).toBe(200);
      expect(underReviewRes.body.data.status).toBe('UNDER_REVIEW');
      expect(underReviewRes.body.data.adminNotes).toBe('Checking customer report');

      // 2. UNDER_REVIEW -> APPROVED
      const approvedRes = await request(app)
        .patch(`/api/admin/returns/${returnId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'APPROVED', adminNotes: 'Approved for customer return shipment' });

      expect(approvedRes.status).toBe(200);
      expect(approvedRes.body.data.status).toBe('APPROVED');

      // 3. APPROVED -> COMPLETED
      const completedRes = await request(app)
        .patch(`/api/admin/returns/${returnId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'COMPLETED', adminNotes: 'Return package received and verified' });

      expect(completedRes.status).toBe(200);
      expect(completedRes.body.data.status).toBe('COMPLETED');

      // Verify history and audit log were created
      const historyRows = await testPool.query(
        'SELECT * FROM return_request_history WHERE return_request_id = $1 ORDER BY created_at ASC',
        [returnId]
      );
      expect(historyRows.rows.length).toBe(4); // initial + 3 transitions

      const auditRows = await testPool.query(
        "SELECT * FROM admin_audit_logs WHERE entity_type = 'RETURN_REQUEST' AND entity_id = $1",
        [returnId]
      );
      expect(auditRows.rows.length).toBe(3);
      expect(auditRows.rows[0].admin_email).toBe(adminEmail);
    });

    it('rejects status transition to REJECTED if rejectionReason is missing or too short', async () => {
      const orderId = await createTestOrder('ORD-REJECT-01');
      const submission = await createReturnRequest({
        orderId: 'ORD-REJECT-01',
        phone: '+919876543210',
        email: 'arjun@example.com',
        reason: 'CHANGED_MY_MIND',
      });

      const listRes = await request(app)
        .get(`/api/admin/returns?search=${submission.requestId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      const returnId = listRes.body.data[0].id;

      const res = await request(app)
        .patch(`/api/admin/returns/${returnId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'REJECTED', rejectionReason: '' });

      expect(res.status).toBe(400);

      // Rejection with valid reason succeeds
      const validRejectRes = await request(app)
        .patch(`/api/admin/returns/${returnId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'REJECTED',
          rejectionReason: 'Request submitted past policy return window and item tags removed.',
        });

      expect(validRejectRes.status).toBe(200);
      expect(validRejectRes.body.data.status).toBe('REJECTED');
      expect(validRejectRes.body.data.rejectionReason).toContain('policy return window');
    });

    it('rejects invalid status transitions (e.g. from terminal COMPLETED state)', async () => {
      const orderId = await createTestOrder('ORD-INVALID-TRANS-01');
      const submission = await createReturnRequest({
        orderId: 'ORD-INVALID-TRANS-01',
        phone: '+919876543210',
        email: 'arjun@example.com',
        reason: 'PRODUCT_DAMAGED_OR_DEFECTIVE',
      });

      const listRes = await request(app)
        .get(`/api/admin/returns?search=${submission.requestId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      const returnId = listRes.body.data[0].id;

      // Move directly to APPROVED then COMPLETED
      await request(app)
        .patch(`/api/admin/returns/${returnId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'APPROVED' });
      await request(app)
        .patch(`/api/admin/returns/${returnId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'COMPLETED' });

      // Attempt to move from COMPLETED back to APPROVED
      const res = await request(app)
        .patch(`/api/admin/returns/${returnId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'APPROVED' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid status transition');
    });

    it('rejects completing return request directly from REQUEST_SUBMITTED or when inspection is FAIL', async () => {
      const orderId = await createTestOrder('ORD-FAIL-INSPECT-01');
      const submission = await createReturnRequest({
        orderId: 'ORD-FAIL-INSPECT-01',
        phone: '+919876543210',
        email: 'arjun@example.com',
        reason: 'PRODUCT_DAMAGED_OR_DEFECTIVE',
      });

      const listRes = await request(app)
        .get(`/api/admin/returns?search=${submission.requestId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      const returnId = listRes.body.data[0].id;

      // 1. Direct transition from REQUEST_SUBMITTED to COMPLETED is rejected
      const directCompleteRes = await request(app)
        .patch(`/api/admin/returns/${returnId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'COMPLETED' });

      expect(directCompleteRes.status).toBe(400);

      // 2. Approve request first
      await request(app)
        .patch(`/api/admin/returns/${returnId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'APPROVED' });

      // 3. Inspection records FAIL
      await request(app)
        .patch(`/api/admin/returns/${returnId}/inspection`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          inspectionResult: 'FAIL',
          inspectionNotes: 'Garment damaged by customer, brand tags missing.',
        });

      // 4. Attempting to complete request with failed inspection is rejected
      const failedInspectCompleteRes = await request(app)
        .patch(`/api/admin/returns/${returnId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'COMPLETED' });

      expect(failedInspectCompleteRes.status).toBe(400);
      expect(failedInspectCompleteRes.body.message).toContain('inspection result is FAIL');
    });
  });

  // -------------------------------------------------------------------------
  // 5. Shipping & Inspection Management
  // -------------------------------------------------------------------------
  describe('5. Shipping & Inspection Workflow', () => {
    it('records shipping instructions and customer courier tracking details', async () => {
      const orderId = await createTestOrder('ORD-SHIP-01');
      const submission = await createReturnRequest({
        orderId: 'ORD-SHIP-01',
        phone: '+919876543210',
        email: 'arjun@example.com',
        reason: 'PRODUCT_DAMAGED_OR_DEFECTIVE',
      });

      const listRes = await request(app)
        .get(`/api/admin/returns?search=${submission.requestId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      const returnId = listRes.body.data[0].id;

      const res = await request(app)
        .patch(`/api/admin/returns/${returnId}/shipping`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          shippingInstructions: 'Ship to AXDORO Returns Hub, Sector 4, Bengaluru - 560001',
          returnCourierName: 'Bluedart Express',
          returnTrackingNumber: 'BLUEDART-88992211',
          customerShippedAt: new Date().toISOString(),
          productReceivedAt: new Date().toISOString(),
        });

      expect(res.status).toBe(200);
      expect(res.body.data.shipping.returnCourierName).toBe('Bluedart Express');
      expect(res.body.data.shipping.returnTrackingNumber).toBe('BLUEDART-88992211');
      expect(res.body.data.shipping.shippingInstructions).toContain('AXDORO Returns Hub');

      // Verify audit log
      const auditRes = await testPool.query(
        "SELECT * FROM admin_audit_logs WHERE action = 'RETURN_SHIPPING_UPDATE' AND entity_id = $1",
        [returnId]
      );
      expect(auditRes.rows.length).toBe(1);
    });

    it('records product inspection verdict and notes', async () => {
      const orderId = await createTestOrder('ORD-INSPECT-01');
      const submission = await createReturnRequest({
        orderId: 'ORD-INSPECT-01',
        phone: '+919876543210',
        email: 'arjun@example.com',
        reason: 'PRODUCT_DAMAGED_OR_DEFECTIVE',
      });

      const listRes = await request(app)
        .get(`/api/admin/returns?search=${submission.requestId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      const returnId = listRes.body.data[0].id;

      const res = await request(app)
        .patch(`/api/admin/returns/${returnId}/inspection`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          inspectionResult: 'PASS',
          inspectionNotes: 'Garment examined. Original defect verified; all manufacturer tags present.',
          productReceivedAt: new Date().toISOString(),
        });

      expect(res.status).toBe(200);
      expect(res.body.data.inspection.inspectionResult).toBe('PASS');
      expect(res.body.data.inspection.inspectedBy).toBe(adminEmail);
      expect(res.body.data.inspection.inspectedAt).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 6. Manual Refund Tracking
  // -------------------------------------------------------------------------
  describe('6. Manual Refund Tracking Ledger', () => {
    it('records manual refund details and requires reference and positive amount for COMPLETED status', async () => {
      const orderId = await createTestOrder('ORD-REFUND-01');
      const submission = await createReturnRequest({
        orderId: 'ORD-REFUND-01',
        phone: '+919876543210',
        email: 'arjun@example.com',
        reason: 'PRODUCT_DAMAGED_OR_DEFECTIVE',
      });

      const listRes = await request(app)
        .get(`/api/admin/returns?search=${submission.requestId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      const returnId = listRes.body.data[0].id;

      // 1. Marking COMPLETED without reference or amount fails with 400
      const invalidRes = await request(app)
        .patch(`/api/admin/returns/${returnId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          refundStatus: 'COMPLETED',
          refundAmountPaise: 0,
        });

      expect(invalidRes.status).toBe(400);

      // 2. Marking INITIATED succeeds
      const initRes = await request(app)
        .patch(`/api/admin/returns/${returnId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          refundStatus: 'INITIATED',
          refundAmountPaise: 249900,
          refundMethod: 'BANK_TRANSFER',
          refundNotes: 'Initiated NEFT refund via corporate bank portal',
        });

      expect(initRes.status).toBe(200);
      expect(initRes.body.data.refund.refundStatus).toBe('INITIATED');
      expect(initRes.body.data.refund.refundAmountPaise).toBe(249900);

      // 3. Completing with valid UTR reference succeeds
      const completeRes = await request(app)
        .patch(`/api/admin/returns/${returnId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          refundStatus: 'COMPLETED',
          refundAmountPaise: 249900,
          refundMethod: 'BANK_TRANSFER',
          refundReference: 'UTR20261111998822',
          refundNotes: 'NEFT credit confirmed by bank',
        });

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.data.refund.refundStatus).toBe('COMPLETED');
      expect(completeRes.body.data.refund.refundReference).toBe('UTR20261111998822');
      expect(completeRes.body.data.refund.refundCompletedAt).not.toBeNull();
    });

    it('rejects invalid non-canonical refund status values', async () => {
      const orderId = await createTestOrder('ORD-REFUND-CANON-01');
      const submission = await createReturnRequest({
        orderId: 'ORD-REFUND-CANON-01',
        phone: '+919876543210',
        email: 'arjun@example.com',
        reason: 'PRODUCT_DAMAGED_OR_DEFECTIVE',
      });

      const listRes = await request(app)
        .get(`/api/admin/returns?search=${submission.requestId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      const returnId = listRes.body.data[0].id;

      // PROCESSED is non-canonical (must be COMPLETED)
      const resProcessed = await request(app)
        .patch(`/api/admin/returns/${returnId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ refundStatus: 'PROCESSED' });
      expect(resProcessed.status).toBe(400);

      // FAILED is non-canonical (must be REJECTED)
      const resFailed = await request(app)
        .patch(`/api/admin/returns/${returnId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ refundStatus: 'FAILED' });
      expect(resFailed.status).toBe(400);
    });

    it('supports partial refund amounts lower than verified order value', async () => {
      const orderId = await createTestOrder('ORD-REFUND-PARTIAL-01');
      const submission = await createReturnRequest({
        orderId: 'ORD-REFUND-PARTIAL-01',
        phone: '+919876543210',
        email: 'arjun@example.com',
        reason: 'PRODUCT_DAMAGED_OR_DEFECTIVE',
      });

      const listRes = await request(app)
        .get(`/api/admin/returns?search=${submission.requestId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      const returnId = listRes.body.data[0].id;

      // Order total is 249900 paise (₹2,499.00). Partial refund is 100000 paise (₹1,000.00).
      const res = await request(app)
        .patch(`/api/admin/returns/${returnId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          refundStatus: 'INITIATED',
          refundAmountPaise: 100000,
          refundMethod: 'UPI',
          refundNotes: 'Partial refund approved for minor collar imperfection.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.refund.refundStatus).toBe('INITIATED');
      expect(res.body.data.refund.refundAmountPaise).toBe(100000);
    });

    it('requires explanatory notes when marking refund status as REJECTED', async () => {
      const orderId = await createTestOrder('ORD-REFUND-REJECT-01');
      const submission = await createReturnRequest({
        orderId: 'ORD-REFUND-REJECT-01',
        phone: '+919876543210',
        email: 'arjun@example.com',
        reason: 'PRODUCT_DAMAGED_OR_DEFECTIVE',
      });

      const listRes = await request(app)
        .get(`/api/admin/returns?search=${submission.requestId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      const returnId = listRes.body.data[0].id;

      // 1. REJECTED without notes fails with 400
      const failRes = await request(app)
        .patch(`/api/admin/returns/${returnId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          refundStatus: 'REJECTED',
          refundNotes: '',
        });
      expect(failRes.status).toBe(400);

      // 2. REJECTED with valid explanation succeeds
      const successRes = await request(app)
        .patch(`/api/admin/returns/${returnId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          refundStatus: 'REJECTED',
          refundNotes: 'Physical return not received within 30 days of approval.',
        });
      expect(successRes.status).toBe(200);
      expect(successRes.body.data.refund.refundStatus).toBe('REJECTED');
    });

    it('rejects excess refund amounts without explicit administrator review and confirmation', async () => {
      const orderId = await createTestOrder('ORD-REFUND-EXCESS-01');
      const submission = await createReturnRequest({
        orderId: 'ORD-REFUND-EXCESS-01',
        phone: '+919876543210',
        email: 'arjun@example.com',
        reason: 'PRODUCT_DAMAGED_OR_DEFECTIVE',
      });

      const listRes = await request(app)
        .get(`/api/admin/returns?search=${submission.requestId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      const returnId = listRes.body.data[0].id;

      // 1. Attempting refund of 350000 paise (₹3,500.00) on 249900 paise order without confirmation fails
      const excessRes = await request(app)
        .patch(`/api/admin/returns/${returnId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          refundStatus: 'INITIATED',
          refundAmountPaise: 350000,
          refundMethod: 'BANK_TRANSFER',
          refundNotes: 'Excess amount attempted',
        });

      expect(excessRes.status).toBe(400);
      expect(excessRes.body.message).toContain('exceeds verified order total');

      // 2. Supplying allowExcessRefund: true and detailed notes succeeds
      const confirmedExcessRes = await request(app)
        .patch(`/api/admin/returns/${returnId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          refundStatus: 'INITIATED',
          refundAmountPaise: 350000,
          refundMethod: 'BANK_TRANSFER',
          allowExcessRefund: true,
          refundNotes: 'Authorized return courier shipping charge compensation of Rs 1001 added.',
        });

      expect(confirmedExcessRes.status).toBe(200);
      expect(confirmedExcessRes.body.data.refund.refundAmountPaise).toBe(350000);
    });

    it('enforces terminal COMPLETED refund state and allows idempotent duplicate completion', async () => {
      const orderId = await createTestOrder('ORD-REFUND-IDEMP-01');
      const submission = await createReturnRequest({
        orderId: 'ORD-REFUND-IDEMP-01',
        phone: '+919876543210',
        email: 'arjun@example.com',
        reason: 'PRODUCT_DAMAGED_OR_DEFECTIVE',
      });

      const listRes = await request(app)
        .get(`/api/admin/returns?search=${submission.requestId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      const returnId = listRes.body.data[0].id;

      // 1. Complete refund
      const completeRes = await request(app)
        .patch(`/api/admin/returns/${returnId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          refundStatus: 'COMPLETED',
          refundAmountPaise: 249900,
          refundMethod: 'UPI',
          refundReference: 'UPI-REF-99887766',
          refundNotes: 'Instant UPI reversal completed',
        });
      expect(completeRes.status).toBe(200);

      // 2. Idempotent identical completion replay succeeds without error
      const replayRes = await request(app)
        .patch(`/api/admin/returns/${returnId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          refundStatus: 'COMPLETED',
          refundAmountPaise: 249900,
          refundMethod: 'UPI',
          refundReference: 'UPI-REF-99887766',
          refundNotes: 'Instant UPI reversal completed',
        });
      expect(replayRes.status).toBe(200);

      // 3. Attempting to modify completed refund with different reference fails with 400
      const modifyRes = await request(app)
        .patch(`/api/admin/returns/${returnId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          refundStatus: 'COMPLETED',
          refundAmountPaise: 249900,
          refundMethod: 'UPI',
          refundReference: 'DIFFERENT-REF-0000',
        });
      expect(modifyRes.status).toBe(400);
      expect(modifyRes.body.message).toContain('Completed refunds cannot be modified');

      // 4. Attempting to transition from COMPLETED back to PENDING fails with 400
      const revertRes = await request(app)
        .patch(`/api/admin/returns/${returnId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          refundStatus: 'PENDING',
        });
      expect(revertRes.status).toBe(400);
      expect(revertRes.body.message).toContain('already marked COMPLETED');
    });
  });

  // -------------------------------------------------------------------------
  // 7. Evidence Streaming & IDOR Protection
  // -------------------------------------------------------------------------
  describe('7. Secure Evidence Streaming & IDOR Protection', () => {
    it('streams authenticated evidence image with strict security headers', async () => {
      const orderId = await createTestOrder('ORD-EV-STREAM-01');
      const evidencePublicId = 'axdoro/returns/evidence/stream_test_01';

      await createReturnRequest(
        {
          orderId: 'ORD-EV-STREAM-01',
          phone: '+919876543210',
          email: 'arjun@example.com',
          reason: 'PRODUCT_DAMAGED_OR_DEFECTIVE',
        },
        [
          {
            cloudinaryPublicId: evidencePublicId,
            originalFilename: 'collar_tear.jpg',
            mimeType: 'image/jpeg',
            fileSizeBytes: 1024,
            format: 'jpg',
          },
        ]
      );

      const listRes = await request(app)
        .get('/api/admin/returns?search=ORD-EV-STREAM-01')
        .set('Authorization', `Bearer ${adminToken}`);
      const returnId = listRes.body.data[0].id;

      const detailRes = await request(app)
        .get(`/api/admin/returns/${returnId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      const evidenceId = detailRes.body.data.evidence[0].id;

      // Mock Cloudinary buffer fetch
      const dummyBuffer = Buffer.from('FAKE_JPEG_IMAGE_BYTES');
      vi.spyOn(cloudinaryService, 'fetchAuthenticatedArtworkBuffer').mockResolvedValue({
        buffer: dummyBuffer,
        contentType: 'image/jpeg',
      });

      const streamRes = await request(app)
        .get(`/api/admin/returns/${returnId}/evidence/${evidenceId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(streamRes.status).toBe(200);
      expect(streamRes.headers['content-type']).toContain('image/jpeg');
      expect(streamRes.headers['x-content-type-options']).toBe('nosniff');
      expect(streamRes.headers['content-security-policy']).toContain("default-src 'none'");
      expect(streamRes.headers['cache-control']).toBe('private, no-store');
      expect(streamRes.body).toEqual(dummyBuffer);
    });

    it('prevents IDOR: accessing evidence ID under a different return request returns 404', async () => {
      const orderId1 = await createTestOrder('ORD-IDOR-01');
      const orderId2 = await createTestOrder('ORD-IDOR-02');

      // Request 1 with evidence
      await createReturnRequest(
        {
          orderId: 'ORD-IDOR-01',
          phone: '+919876543210',
          email: 'arjun@example.com',
          reason: 'PRODUCT_DAMAGED_OR_DEFECTIVE',
        },
        [
          {
            cloudinaryPublicId: 'axdoro/returns/evidence/idor_item_01',
            originalFilename: 'defect.jpg',
            mimeType: 'image/jpeg',
            fileSizeBytes: 1024,
            format: 'jpg',
          },
        ]
      );

      // Request 2 without evidence
      await createReturnRequest({
        orderId: 'ORD-IDOR-02',
        phone: '+919876543210',
        email: 'arjun@example.com',
        reason: 'SIZE_DOES_NOT_FIT',
      });

      const list1 = await request(app)
        .get('/api/admin/returns?search=ORD-IDOR-01')
        .set('Authorization', `Bearer ${adminToken}`);
      const returnId1 = list1.body.data[0].id;

      const detail1 = await request(app)
        .get(`/api/admin/returns/${returnId1}`)
        .set('Authorization', `Bearer ${adminToken}`);
      const evidenceId1 = detail1.body.data.evidence[0].id;

      const list2 = await request(app)
        .get('/api/admin/returns?search=ORD-IDOR-02')
        .set('Authorization', `Bearer ${adminToken}`);
      const returnId2 = list2.body.data[0].id;

      // Request evidenceId1 using returnId2 path -> IDOR attempt
      const idorRes = await request(app)
        .get(`/api/admin/returns/${returnId2}/evidence/${evidenceId1}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(idorRes.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // 8. Explicit Evidence Deletion & Cleanup Queue
  // -------------------------------------------------------------------------
  describe('8. Explicit Evidence Deletion & Durable Cleanup Outbox', () => {
    it('soft deletes evidence record, logs audit event, and enqueues Cloudinary cleanup job', async () => {
      const orderId = await createTestOrder('ORD-EV-DEL-01');
      const publicId = 'axdoro/returns/evidence/to_be_deleted_ev_01';

      await createReturnRequest(
        {
          orderId: 'ORD-EV-DEL-01',
          phone: '+919876543210',
          email: 'arjun@example.com',
          reason: 'PRODUCT_DAMAGED_OR_DEFECTIVE',
        },
        [
          {
            cloudinaryPublicId: publicId,
            originalFilename: 'damage_photo.jpg',
            mimeType: 'image/jpeg',
            fileSizeBytes: 2048,
            format: 'jpg',
          },
        ]
      );

      const listRes = await request(app)
        .get('/api/admin/returns?search=ORD-EV-DEL-01')
        .set('Authorization', `Bearer ${adminToken}`);
      const returnId = listRes.body.data[0].id;

      const detailRes = await request(app)
        .get(`/api/admin/returns/${returnId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      const evidenceId = detailRes.body.data.evidence[0].id;

      // Mock Cloudinary deletion
      const deleteSpy = vi.spyOn(cloudinaryService, 'deleteCloudinaryAsset').mockResolvedValue(true);

      const delRes = await request(app)
        .delete(`/api/admin/returns/${returnId}/evidence/${evidenceId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.status).toBe('success');

      // 1. Verify PostgreSQL soft delete
      const dbCheck = await testPool.query(
        'SELECT deleted_at, deleted_by FROM return_request_evidence WHERE id = $1',
        [evidenceId]
      );
      expect(dbCheck.rows[0].deleted_at).not.toBeNull();
      expect(dbCheck.rows[0].deleted_by).toBe(adminEmail);

      // 2. Verify admin audit log
      const auditCheck = await testPool.query(
        "SELECT * FROM admin_audit_logs WHERE action = 'RETURN_EVIDENCE_DELETE' AND entity_id = $1",
        [evidenceId]
      );
      expect(auditCheck.rows.length).toBe(1);
      expect(auditCheck.rows[0].admin_email).toBe(adminEmail);

      // 3. Verify Cloudinary cleanup job enqueued
      const queueCheck = await testPool.query(
        'SELECT * FROM cloudinary_cleanup_jobs WHERE public_id = $1',
        [publicId]
      );
      expect(queueCheck.rows.length).toBe(1);

      // 4. Subsequent streaming request returns 404
      const retryStreamRes = await request(app)
        .get(`/api/admin/returns/${returnId}/evidence/${evidenceId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(retryStreamRes.status).toBe(404);
    });
  });
});
