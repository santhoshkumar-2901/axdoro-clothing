import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import {
  initializeTestDatabase,
  truncateTestAdmin,
  closeTestDatabase,
  testPool,
} from './test-db.js';
import { provisionAdmin, loginAdmin } from '../services/admin-auth.service.js';
import { generateCsrfToken } from '../middleware/csrf.js';

describe('Admin Payment QR Settings Integration Tests (axdoro_test)', () => {
  let adminToken: string;
  let csrfToken: string;
  let adminCookies: string[];

  beforeAll(async () => {
    await initializeTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  beforeEach(async () => {
    await truncateTestAdmin();

    // Reset site_settings table for payment_qr
    await testPool.query(`
      INSERT INTO site_settings (key, value, updated_at)
      VALUES ('payment_qr', '{"imageUrl": "/upi-qr.png", "publicId": null, "upiId": "janavvagj-1@okicici"}', CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE
      SET value = '{"imageUrl": "/upi-qr.png", "publicId": null, "upiId": "janavvagj-1@okicici"}', updated_at = CURRENT_TIMESTAMP;
    `);

    // Provision admin and log in
    await provisionAdmin({
      email: 'payment-admin@axdoro.test',
      password: 'AdminPassword123!',
      fullName: 'Payment Admin',
    });

    const loginRes = await loginAdmin({
      email: 'payment-admin@axdoro.test',
      password: 'AdminPassword123!',
    });
    adminToken = loginRes.token;
    csrfToken = generateCsrfToken(adminToken);
    adminCookies = [
      `axdoro_admin_session=${adminToken}`,
      `axdoro_csrf_token=${csrfToken}`,
    ];
  });

  describe('1. Public Endpoint Behavior', () => {
    it('GET /api/payment-settings/qr returns 200 with active QR imageUrl and upiId', async () => {
      const res = await request(app).get('/api/payment-settings/qr');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.imageUrl).toBe('/upi-qr.png');
      expect(res.body.data.upiId).toBe('janavvagj-1@okicici');
    });
  });

  describe('2. Admin Authentication & Authorization Protection', () => {
    it('GET /api/admin/payment-settings/qr rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/admin/payment-settings/qr');
      expect(res.status).toBe(401);
    });

    it('PUT /api/admin/payment-settings/qr rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .put('/api/admin/payment-settings/qr')
        .send({ imageUrl: '/upi-qr.png', upiId: 'store@upi' });
      expect(res.status).toBe(401);
    });

    it('PUT /api/admin/payment-settings/qr rejects requests missing CSRF token with 403', async () => {
      const res = await request(app)
        .put('/api/admin/payment-settings/qr')
        .set('Cookie', [`axdoro_admin_session=${adminToken}`])
        .send({ imageUrl: '/upi-qr.png', upiId: 'store@upi' });
      expect(res.status).toBe(403);
    });
  });

  describe('3. Admin Update & Persistence', () => {
    it('GET /api/admin/payment-settings/qr returns current active settings for authenticated admin', async () => {
      const res = await request(app)
        .get('/api/admin/payment-settings/qr')
        .set('Cookie', adminCookies);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.imageUrl).toBe('/upi-qr.png');
      expect(res.body.data.upiId).toBe('janavvagj-1@okicici');
    });

    it('PUT /api/admin/payment-settings/qr updates QR image and UPI ID, persisting in database', async () => {
      const updatePayload = {
        imageUrl: 'https://images.unsplash.com/photo-1556742049-0a67c5574f73',
        publicId: 'test_qr_public_id',
        upiId: 'axdoro.store@okhdfcbank',
      };

      const res = await request(app)
        .put('/api/admin/payment-settings/qr')
        .set('Cookie', adminCookies)
        .set('x-csrf-token', csrfToken)
        .send(updatePayload);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.imageUrl).toBe(updatePayload.imageUrl);
      expect(res.body.data.upiId).toBe(updatePayload.upiId);

      // Verify persistence via public endpoint
      const pubRes = await request(app).get('/api/payment-settings/qr');
      expect(pubRes.status).toBe(200);
      expect(pubRes.body.data.imageUrl).toBe(updatePayload.imageUrl);
      expect(pubRes.body.data.upiId).toBe(updatePayload.upiId);
    });

    it('PUT /api/admin/payment-settings/qr validates upiId and rejects empty or invalid string', async () => {
      const res = await request(app)
        .put('/api/admin/payment-settings/qr')
        .set('Cookie', adminCookies)
        .set('x-csrf-token', csrfToken)
        .send({
          imageUrl: '/upi-qr.png',
          upiId: '',
        });

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
    });

    it('POST /api/admin/payment-settings/qr/upload-signature generates signed params for admin upload', async () => {
      const res = await request(app)
        .post('/api/admin/payment-settings/qr/upload-signature')
        .set('Cookie', adminCookies)
        .set('x-csrf-token', csrfToken)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('signature');
      expect(res.body.data).toHaveProperty('timestamp');
      expect(res.body.data).toHaveProperty('apiKey');
      expect(res.body.data).toHaveProperty('publicId');
      expect(typeof res.body.data.publicId).toBe('string');
      expect(res.body.data).toHaveProperty('uploadUrl');
      expect(res.body.data.uploadUrl).toContain('image/upload');
      expect(res.body.data.folder).toBe('axdoro/payment');
    });
  });
});
