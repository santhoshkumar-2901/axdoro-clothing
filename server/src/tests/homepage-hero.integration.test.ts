import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
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
import * as cloudinaryService from '../services/cloudinary.service.js';
import { env } from '../config/env.js';

describe('Admin-Managed Homepage Hero Image Integration Tests (axdoro_test)', () => {
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
    await truncateTestCatalogue();
    await truncateTestCollections();

    // Reset site_settings table for homepage_hero
    await testPool.query(`
      INSERT INTO site_settings (key, value, updated_at)
      VALUES ('homepage_hero', '{"imageUrl": null, "publicId": null}', CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE
      SET value = '{"imageUrl": null, "publicId": null}', updated_at = CURRENT_TIMESTAMP;
    `);

    // Provision admin and log in
    await provisionAdmin({
      email: 'hero-admin@axdoro.test',
      password: 'AdminPassword123!',
      fullName: 'Hero Admin',
    });

    const loginRes = await loginAdmin({
      email: 'hero-admin@axdoro.test',
      password: 'AdminPassword123!',
    });
    adminToken = loginRes.token;
    csrfToken = generateCsrfToken(adminToken);
    adminCookies = [
      `axdoro_admin_session=${adminToken}`,
      `axdoro_csrf_token=${csrfToken}`,
    ];
  });

  describe('1. Database Migration & Table Verification', () => {
    it('proves site_settings table exists and contains homepage_hero record', async () => {
      const res = await testPool.query<{ key: string; value: { imageUrl: string | null } }>(
        `SELECT key, value FROM site_settings WHERE key = 'homepage_hero';`
      );
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0].key).toBe('homepage_hero');
      expect(res.rows[0].value.imageUrl).toBeNull();
    });
  });

  describe('2. Public Endpoint & Default Fallback Behavior', () => {
    it('GET /api/homepage/hero returns 200 with null imageUrl when default', async () => {
      const res = await request(app).get('/api/homepage/hero');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.imageUrl).toBeNull();
      expect(Array.isArray(res.body.data.slides)).toBe(true);
      expect(res.body.data.slides).toHaveLength(3);
    });
  });

  describe('3. Admin Authentication & CSRF Protection', () => {
    it('PUT /api/admin/homepage/hero rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .put('/api/admin/homepage/hero')
        .send({ imageUrl: 'https://images.unsplash.com/photo-test' });
      expect(res.status).toBe(401);
    });

    it('PUT /api/admin/homepage/hero rejects cookie-authenticated requests with missing or invalid CSRF token with 403', async () => {
      // Missing CSRF header
      const res1 = await request(app)
        .put('/api/admin/homepage/hero')
        .set('Cookie', adminCookies)
        .send({ imageUrl: 'https://images.unsplash.com/photo-test' });
      expect(res1.status).toBe(403);
      expect(res1.body.error).toContain('CSRF token missing');

      // Invalid CSRF header
      const res2 = await request(app)
        .put('/api/admin/homepage/hero')
        .set('Cookie', adminCookies)
        .set('x-csrf-token', 'bad-csrf-token-1234567890abcdef1234567890abcdef')
        .send({ imageUrl: 'https://images.unsplash.com/photo-test' });
      expect(res2.status).toBe(403);
      expect(res2.body.error).toContain('CSRF');
    });

    it('allows programmatic Bearer token authentication without cookies', async () => {
      const validUrl = 'https://res.cloudinary.com/axdoro/image/upload/v1/hero-bearer.webp';
      const res = await request(app)
        .put('/api/admin/homepage/hero')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ imageUrl: validUrl, publicId: 'axdoro/hero/hero_bearer' });

      expect(res.status).toBe(200);
      expect(res.body.data.imageUrl).toBe(validUrl);
    });
  });

  describe('4. Input Validation & Invalid URLs', () => {
    it('rejects malformed and non-HTTP/HTTPS URLs with 400', async () => {
      const invalidUrls = [
        'javascript:alert(1)',
        'not-a-valid-url',
        'ftp://evil-server.com/hero.jpg',
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
      ];

      for (const badUrl of invalidUrls) {
        const res = await request(app)
          .put('/api/admin/homepage/hero')
          .set('Cookie', adminCookies)
          .set('x-csrf-token', csrfToken)
          .send({ imageUrl: badUrl });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Invalid hero image payload');
      }
    });

    it('accepts valid HTTPS image URLs', async () => {
      const validUrl = 'https://res.cloudinary.com/axdoro/image/upload/v1/hero-banner.webp';
      const res = await request(app)
        .put('/api/admin/homepage/hero')
        .set('Cookie', adminCookies)
        .set('x-csrf-token', csrfToken)
        .send({ imageUrl: validUrl, publicId: 'axdoro/hero/hero_123' });

      expect(res.status).toBe(200);
      expect(res.body.data.imageUrl).toBe(validUrl);
      expect(res.body.data.publicId).toBe('axdoro/hero/hero_123');
    });
  });

  describe('5. Upload Signature Endpoint', () => {
    it('returns signed Cloudinary upload parameters targeting axdoro/hero folder', async () => {
      const origCloudName = env.CLOUDINARY_CLOUD_NAME;
      const origKey = env.CLOUDINARY_API_KEY;
      const origSecret = env.CLOUDINARY_API_SECRET;

      env.CLOUDINARY_CLOUD_NAME = 'axdoro-test-cloud';
      env.CLOUDINARY_API_KEY = 'test-api-key';
      env.CLOUDINARY_API_SECRET = 'test-api-secret-123456';

      try {
        const res = await request(app)
          .post('/api/admin/homepage/hero/upload-signature')
          .set('Cookie', adminCookies)
          .set('x-csrf-token', csrfToken);

        expect(res.status).toBe(200);
        expect(res.body.data.cloudName).toBe('axdoro-test-cloud');
        expect(res.body.data.apiKey).toBe('test-api-key');
        expect(res.body.data.folder).toBe('axdoro/hero');
        expect(res.body.data.publicId).toMatch(/^hero_\d+_[a-f0-9]+$/);
        expect(res.body.data.uploadUrl).toBe('https://api.cloudinary.com/v1_1/axdoro-test-cloud/image/upload');
      } finally {
        env.CLOUDINARY_CLOUD_NAME = origCloudName;
        env.CLOUDINARY_API_KEY = origKey;
        env.CLOUDINARY_API_SECRET = origSecret;
      }
    });

    it('returns 503 when Cloudinary credentials are not configured', async () => {
      const origCloudName = env.CLOUDINARY_CLOUD_NAME;
      env.CLOUDINARY_CLOUD_NAME = undefined;

      try {
        const res = await request(app)
          .post('/api/admin/homepage/hero/upload-signature')
          .set('Cookie', adminCookies)
          .set('x-csrf-token', csrfToken);

        expect(res.status).toBe(503);
        expect(res.body.code).toBe('CLOUDINARY_NOT_CONFIGURED');
      } finally {
        env.CLOUDINARY_CLOUD_NAME = origCloudName;
      }
    });
  });

  describe('6. Save, Replace, and Reset Lifecycles with Audit Logging', () => {
    it('persists hero image in site_settings and writes immutable audit log entry', async () => {
      const newUrl = 'https://res.cloudinary.com/axdoro/image/upload/v1/campaign-hero.webp';
      const newPublicId = 'axdoro/hero/hero_camp_1';

      const saveRes = await request(app)
        .put('/api/admin/homepage/hero')
        .set('Cookie', adminCookies)
        .set('x-csrf-token', csrfToken)
        .send({ imageUrl: newUrl, publicId: newPublicId });

      expect(saveRes.status).toBe(200);
      expect(saveRes.body.data.imageUrl).toBe(newUrl);

      // Verify public endpoint immediately reflects the saved image
      const pubRes = await request(app).get('/api/homepage/hero');
      expect(pubRes.status).toBe(200);
      expect(pubRes.body.data.imageUrl).toBe(newUrl);

      // Verify audit log
      const auditRes = await testPool.query<{ action: string; entity_type: string; details: any }>(
        `SELECT action, entity_type, details FROM admin_audit_logs WHERE action = 'HOMEPAGE_HERO_UPDATE' ORDER BY created_at DESC LIMIT 1;`
      );
      expect(auditRes.rows).toHaveLength(1);
      expect(auditRes.rows[0].action).toBe('HOMEPAGE_HERO_UPDATE');
      expect(auditRes.rows[0].entity_type).toBe('site_settings');
      expect(auditRes.rows[0].details.new.imageUrl).toBe(newUrl);
    });

    it('allows clearing hero image (reset to default) by sending null', async () => {
      // First save an image
      await request(app)
        .put('/api/admin/homepage/hero')
        .set('Cookie', adminCookies)
        .set('x-csrf-token', csrfToken)
        .send({ imageUrl: 'https://images.unsplash.com/test-hero', publicId: 'hero_test_1' });

      // Then clear image
      const resetRes = await request(app)
        .put('/api/admin/homepage/hero')
        .set('Cookie', adminCookies)
        .set('x-csrf-token', csrfToken)
        .send({ imageUrl: null, publicId: null });

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.data.imageUrl).toBeNull();

      const pubRes = await request(app).get('/api/homepage/hero');
      expect(pubRes.body.data.imageUrl).toBeNull();
    });
  });

  describe('7. Post-Commit Cloudinary Asset Safety & Data Preservation', () => {
    it('preserves Cloudinary assets without deletion when hero image is replaced', async () => {
      const deleteSpy = vi.spyOn(cloudinaryService, 'deleteCloudinaryAsset').mockResolvedValue(true);

      try {
        // Initial image
        await request(app)
          .put('/api/admin/homepage/hero')
          .set('Cookie', adminCookies)
          .set('x-csrf-token', csrfToken)
          .send({ imageUrl: 'https://res.cloudinary.com/old-hero.jpg', publicId: 'axdoro/hero/old_asset' });

        deleteSpy.mockClear();

        // Replace with new image
        const replaceRes = await request(app)
          .put('/api/admin/homepage/hero')
          .set('Cookie', adminCookies)
          .set('x-csrf-token', csrfToken)
          .send({ imageUrl: 'https://res.cloudinary.com/new-hero.jpg', publicId: 'axdoro/hero/new_asset' });

        expect(replaceRes.status).toBe(200);
        // Automatic Cloudinary asset deletion is disabled to prevent accidental cross-feature data loss
        expect(deleteSpy).not.toHaveBeenCalled();
      } finally {
        deleteSpy.mockRestore();
      }
    });

    it('preserves Cloudinary assets without deletion when hero image is cleared (reset to default)', async () => {
      const deleteSpy = vi.spyOn(cloudinaryService, 'deleteCloudinaryAsset').mockResolvedValue(true);

      try {
        // Initial image
        await request(app)
          .put('/api/admin/homepage/hero')
          .set('Cookie', adminCookies)
          .set('x-csrf-token', csrfToken)
          .send({ imageUrl: 'https://res.cloudinary.com/old-hero2.jpg', publicId: 'axdoro/hero/old_asset2' });

        deleteSpy.mockClear();

        // Clear image (reset to default)
        const resetRes = await request(app)
          .put('/api/admin/homepage/hero')
          .set('Cookie', adminCookies)
          .set('x-csrf-token', csrfToken)
          .send({ imageUrl: null, publicId: null });

        expect(resetRes.status).toBe(200);
        expect(resetRes.body.data.imageUrl).toBeNull();
        expect(deleteSpy).not.toHaveBeenCalled();
      } finally {
        deleteSpy.mockRestore();
      }
    });
  });

  describe('8. Existing Homepage Collections Regression Protection', () => {
    it('verifies public and admin collections endpoints are unchanged and unaffected', async () => {
      const pubRes = await request(app).get('/api/collections');
      expect(pubRes.status).toBe(200);
      expect(Array.isArray(pubRes.body.data)).toBe(true);

      const adminRes = await request(app)
        .get('/api/admin/collections')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminRes.status).toBe(200);
      expect(Array.isArray(adminRes.body.data)).toBe(true);
      expect(adminRes.body.data.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('9. Category Marquee Configuration & Persistence', () => {
    it('exposes default marquee settings in public GET /api/homepage/hero', async () => {
      const res = await request(app).get('/api/homepage/hero');
      expect(res.status).toBe(200);
      expect(res.body.data.isCategoryMarqueeEnabled).toBe(true);
      expect(typeof res.body.data.marqueeCategoryImages).toBe('object');
    });

    it('updates isCategoryMarqueeEnabled and marqueeCategoryImages while preserving slides and audit logging', async () => {
      const updateRes = await request(app)
        .put('/api/admin/homepage/hero')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          isCategoryMarqueeEnabled: false,
          marqueeCategoryImages: {
            shirts: 'https://images.unsplash.com/photo-custom-shirts.jpg',
            pants: '/categories/custom-pants.png',
          },
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.isCategoryMarqueeEnabled).toBe(false);
      expect(updateRes.body.data.marqueeCategoryImages.shirts).toBe(
        'https://images.unsplash.com/photo-custom-shirts.jpg'
      );
      expect(updateRes.body.data.marqueeCategoryImages.pants).toBe(
        '/categories/custom-pants.png'
      );

      // Verify public GET reflects updated settings
      const pubRes = await request(app).get('/api/homepage/hero');
      expect(pubRes.status).toBe(200);
      expect(pubRes.body.data.isCategoryMarqueeEnabled).toBe(false);
      expect(pubRes.body.data.marqueeCategoryImages.shirts).toBe(
        'https://images.unsplash.com/photo-custom-shirts.jpg'
      );
      expect(pubRes.body.data.slides).toHaveLength(3);

      // Verify audit log
      const auditRes = await testPool.query<{ action: string; details: any }>(
        `SELECT action, details FROM admin_audit_logs WHERE action = 'HOMEPAGE_HERO_UPDATE' ORDER BY created_at DESC LIMIT 1;`
      );
      expect(auditRes.rows).toHaveLength(1);
      expect(auditRes.rows[0].details.new.isCategoryMarqueeEnabled).toBe(false);
      expect(auditRes.rows[0].details.new.marqueeCategoryImages.shirts).toBe(
        'https://images.unsplash.com/photo-custom-shirts.jpg'
      );
    });

    it('clears specific category marquee image when passing null', async () => {
      // First set custom images for shirts and pants
      await request(app)
        .put('/api/admin/homepage/hero')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          marqueeCategoryImages: {
            shirts: 'https://images.unsplash.com/photo-custom-shirts.jpg',
            pants: '/categories/custom-pants.png',
          },
        });

      // Then clear shirts by passing null
      const resetRes = await request(app)
        .put('/api/admin/homepage/hero')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          marqueeCategoryImages: {
            shirts: null,
          },
        });

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.data.marqueeCategoryImages.shirts).toBeUndefined();
      expect(resetRes.body.data.marqueeCategoryImages.pants).toBe('/categories/custom-pants.png');
      expect(resetRes.body.data.isCategoryMarqueeEnabled).toBe(true); // Default preserved
    });

    it('rejects invalid marquee image URLs with 400', async () => {
      const res = await request(app)
        .put('/api/admin/homepage/hero')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          marqueeCategoryImages: {
            shirts: 'javascript:alert(1)',
          },
        });

      expect(res.status).toBe(400);
    });
  });

  describe('9. 2D Focal Point Positioning (imagePositionX & imagePosition)', () => {
    it('saves and exposes imagePositionX and imagePosition in public and admin endpoints', async () => {
      const putRes = await request(app)
        .put('/api/admin/homepage/hero')
        .set('Cookie', adminCookies)
        .set('x-csrf-token', csrfToken)
        .send({
          slides: [
            {
              id: 1,
              heading: 'Slide 1 Custom Focal',
              subtitle: 'Precision Tailoring',
              ctaLabel: 'Explore',
              ctaLink: '#collection-tabs',
              isEnabled: true,
              imagePosition: 25,
              imagePositionX: 75,
            },
            {
              id: 2,
              heading: 'Slide 2 Center Focal',
              subtitle: 'Comfort Cotton',
              ctaLabel: 'Shop',
              ctaLink: '/category/t-shirts',
              isEnabled: false,
              imagePosition: 50,
              imagePositionX: 50,
            },
            {
              id: 3,
              heading: 'Slide 3 Bottom Left Focal',
              subtitle: 'Bulk Enquiries',
              ctaLabel: 'Bulk',
              ctaLink: 'bulk',
              isEnabled: false,
              imagePosition: 100,
              imagePositionX: 0,
            },
          ],
        });

      expect(putRes.status).toBe(200);
      expect(putRes.body.data.slides[0].imagePosition).toBe(25);
      expect(putRes.body.data.slides[0].imagePositionX).toBe(75);
      expect(putRes.body.data.slides[2].imagePosition).toBe(100);
      expect(putRes.body.data.slides[2].imagePositionX).toBe(0);

      // Verify public endpoint returns imagePosition and imagePositionX
      const pubRes = await request(app).get('/api/homepage/hero');
      expect(pubRes.status).toBe(200);
      expect(pubRes.body.data.slides[0].imagePosition).toBe(25);
      expect(pubRes.body.data.slides[0].imagePositionX).toBe(75);
      expect(pubRes.body.data.slides[2].imagePosition).toBe(100);
      expect(pubRes.body.data.slides[2].imagePositionX).toBe(0);
    });

    it('defaults imagePositionX and imagePosition to 50 when omitted or null', async () => {
      const putRes = await request(app)
        .put('/api/admin/homepage/hero')
        .set('Cookie', adminCookies)
        .set('x-csrf-token', csrfToken)
        .send({
          slides: [
            {
              id: 1,
              heading: 'Slide 1 Without Focal',
              subtitle: 'Precision Tailoring',
              ctaLabel: 'Explore',
              ctaLink: '#collection-tabs',
              isEnabled: true,
            },
            {
              id: 2,
              heading: 'Slide 2 Without Focal',
              subtitle: 'Comfort Cotton',
              ctaLabel: 'Shop',
              ctaLink: '/category/t-shirts',
              isEnabled: false,
            },
            {
              id: 3,
              heading: 'Slide 3 Without Focal',
              subtitle: 'Bulk Enquiries',
              ctaLabel: 'Bulk',
              ctaLink: 'bulk',
              isEnabled: false,
            },
          ],
        });

      expect(putRes.status).toBe(200);
      expect(putRes.body.data.slides[0].imagePosition).toBe(50);
      expect(putRes.body.data.slides[0].imagePositionX).toBe(50);
    });
  });
});
