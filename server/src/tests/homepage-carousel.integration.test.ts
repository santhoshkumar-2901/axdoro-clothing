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

describe('Admin-Managed 3-Slide Homepage Hero Carousel Backend Tests (axdoro_test)', () => {
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

    // Reset site_settings table to clean default
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

  describe('1. Legacy Format Conversion & Backward Compatibility', () => {
    it('converts legacy single-image record into 3 slides preserving existing image in Slot 1', async () => {
      // Simulate existing production/dev record with custom image
      const legacyUrl = 'https://res.cloudinary.com/axdoro/image/upload/v1/legacy-hero.webp';
      const legacyPublicId = 'axdoro/hero/legacy_123';
      await testPool.query(
        `UPDATE site_settings SET value = $1 WHERE key = 'homepage_hero'`,
        [JSON.stringify({ imageUrl: legacyUrl, publicId: legacyPublicId })]
      );

      // Public endpoint
      const pubRes = await request(app).get('/api/homepage/hero');
      expect(pubRes.status).toBe(200);
      expect(pubRes.body.status).toBe('success');
      expect(pubRes.body.data.imageUrl).toBe(legacyUrl);
      expect(pubRes.body.data.slides).toHaveLength(3);

      const [slide1, slide2, slide3] = pubRes.body.data.slides;
      expect(slide1.id).toBe(1);
      expect(slide1.imageUrl).toBe(legacyUrl);
      expect(slide1.isEnabled).toBe(true);
      expect(slide1.heading).toBe('AXDORO – Clothing Made for Every Occasion');
      // Public response must strictly omit publicId
      expect(slide1.publicId).toBeUndefined();

      expect(slide2.id).toBe(2);
      expect(slide2.imageUrl).toBeNull();
      expect(slide2.isEnabled).toBe(false);

      expect(slide3.id).toBe(3);
      expect(slide3.imageUrl).toBeNull();
      expect(slide3.isEnabled).toBe(false);

      // Admin endpoint includes publicId
      const adminRes = await request(app)
        .get('/api/admin/homepage/hero')
        .set('Cookie', adminCookies);
      expect(adminRes.status).toBe(200);
      expect(adminRes.body.data.slides[0].publicId).toBe(legacyPublicId);
    });

    it('supports legacy admin PUT payload { imageUrl, publicId } updating Slide 1', async () => {
      const newUrl = 'https://res.cloudinary.com/axdoro/image/upload/v1/updated-legacy.webp';
      const newPubId = 'axdoro/hero/updated_legacy';

      const res = await request(app)
        .put('/api/admin/homepage/hero')
        .set('Cookie', adminCookies)
        .set('x-csrf-token', csrfToken)
        .send({ imageUrl: newUrl, publicId: newPubId });

      expect(res.status).toBe(200);
      expect(res.body.data.imageUrl).toBe(newUrl);
      expect(res.body.data.slides).toHaveLength(3);
      expect(res.body.data.slides[0].imageUrl).toBe(newUrl);
      expect(res.body.data.slides[0].publicId).toBe(newPubId);
    });
  });

  describe('2. Three-Slide Configuration Retrieval & Persistence', () => {
    it('persists and retrieves all three configured slides with custom copy and CTAs', async () => {
      const validSlides = [
        {
          id: 1,
          imageUrl: 'https://res.cloudinary.com/axdoro/image/upload/v1/slide1.webp',
          publicId: 'axdoro/hero/slide_1',
          heading: 'Summer Minimal Luxury 2026',
          subtitle: 'Pure Linen & 140 GSM Combed Cotton Tailoring',
          ctaLabel: 'Shop Collection',
          ctaLink: '#category-showcase',
          isEnabled: true,
        },
        {
          id: 2,
          imageUrl: 'https://res.cloudinary.com/axdoro/image/upload/v1/slide2.webp',
          publicId: 'axdoro/hero/slide_2',
          heading: 'Tailored Oxford Shirts',
          subtitle: 'Designed for Effortless Daily Elegance',
          ctaLabel: 'Explore Shirts',
          ctaLink: '/category/shirts',
          isEnabled: true,
        },
        {
          id: 3,
          imageUrl: 'https://res.cloudinary.com/axdoro/image/upload/v1/slide3.webp',
          publicId: 'axdoro/hero/slide_3',
          heading: 'Bespoke Bulk Apparel Manufacturing',
          subtitle: 'Custom Embroidery, Screen Printing & Tiered Volume Pricing',
          ctaLabel: 'Submit Enquiry',
          ctaLink: 'bulk',
          isEnabled: true,
        },
      ];

      const saveRes = await request(app)
        .put('/api/admin/homepage/hero')
        .set('Cookie', adminCookies)
        .set('x-csrf-token', csrfToken)
        .send({ slides: validSlides });

      expect(saveRes.status).toBe(200);
      expect(saveRes.body.status).toBe('success');
      expect(saveRes.body.data.slides).toHaveLength(3);
      expect(saveRes.body.data.slides[0].heading).toBe('Summer Minimal Luxury 2026');
      expect(saveRes.body.data.slides[1].ctaLink).toBe('/category/shirts');
      expect(saveRes.body.data.slides[2].ctaLink).toBe('bulk');

      // Verify public endpoint reflects changes
      const pubRes = await request(app).get('/api/homepage/hero');
      expect(pubRes.status).toBe(200);
      expect(pubRes.body.data.slides).toHaveLength(3);
      expect(pubRes.body.data.slides[0].heading).toBe('Summer Minimal Luxury 2026');
      expect(pubRes.body.data.slides[1].subtitle).toBe('Designed for Effortless Daily Elegance');
      // Public response must not expose publicId
      expect(pubRes.body.data.slides[0].publicId).toBeUndefined();

      // Verify audit log
      const auditRes = await testPool.query<{ action: string; entity_type: string; details: any }>(
        `SELECT action, entity_type, details FROM admin_audit_logs WHERE action = 'HOMEPAGE_HERO_UPDATE' ORDER BY created_at DESC LIMIT 1;`
      );
      expect(auditRes.rows).toHaveLength(1);
      expect(auditRes.rows[0].details.new.slides).toHaveLength(3);
      expect(auditRes.rows[0].details.new.slides[0].heading).toBe('Summer Minimal Luxury 2026');
    });
  });

  describe('3. Validation Guardrails & Malformed Inputs', () => {
    it('rejects payloads with less or more than 3 slides', async () => {
      // 2 slides
      const res1 = await request(app)
        .put('/api/admin/homepage/hero')
        .set('Cookie', adminCookies)
        .set('x-csrf-token', csrfToken)
        .send({
          slides: [
            { id: 1, heading: 'H1', subtitle: 'S1', ctaLabel: 'C1', ctaLink: '#a', isEnabled: true },
            { id: 2, heading: 'H2', subtitle: 'S2', ctaLabel: 'C2', ctaLink: '#b', isEnabled: true },
          ],
        });
      expect(res1.status).toBe(400);
      expect(res1.body.error).toContain('Exactly three slides are required');

      // 4 slides
      const res2 = await request(app)
        .put('/api/admin/homepage/hero')
        .set('Cookie', adminCookies)
        .set('x-csrf-token', csrfToken)
        .send({
          slides: [
            { id: 1, heading: 'H1', subtitle: 'S1', ctaLabel: 'C1', ctaLink: '#a', isEnabled: true },
            { id: 2, heading: 'H2', subtitle: 'S2', ctaLabel: 'C2', ctaLink: '#b', isEnabled: true },
            { id: 3, heading: 'H3', subtitle: 'S3', ctaLabel: 'C3', ctaLink: '#c', isEnabled: true },
            { id: 4, heading: 'H4', subtitle: 'S4', ctaLabel: 'C4', ctaLink: '#d', isEnabled: true },
          ],
        });
      expect(res2.status).toBe(400);
      expect(res2.body.error).toContain('Exactly three slides are required');
    });

    it('rejects duplicate or non-sequential slide IDs', async () => {
      const res = await request(app)
        .put('/api/admin/homepage/hero')
        .set('Cookie', adminCookies)
        .set('x-csrf-token', csrfToken)
        .send({
          slides: [
            { id: 1, heading: 'H1', subtitle: 'S1', ctaLabel: 'C1', ctaLink: '#a', isEnabled: true },
            { id: 1, heading: 'H2', subtitle: 'S2', ctaLabel: 'C2', ctaLink: '#b', isEnabled: true },
            { id: 3, heading: 'H3', subtitle: 'S3', ctaLabel: 'C3', ctaLink: '#c', isEnabled: true },
          ],
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Slides must contain exactly slots 1, 2, and 3');
    });

    it('rejects missing or empty required text fields', async () => {
      const res = await request(app)
        .put('/api/admin/homepage/hero')
        .set('Cookie', adminCookies)
        .set('x-csrf-token', csrfToken)
        .send({
          slides: [
            { id: 1, heading: '', subtitle: 'S1', ctaLabel: 'C1', ctaLink: '#a', isEnabled: true },
            { id: 2, heading: 'H2', subtitle: '', ctaLabel: 'C2', ctaLink: '#b', isEnabled: true },
            { id: 3, heading: 'H3', subtitle: 'S3', ctaLabel: '', ctaLink: '#c', isEnabled: true },
          ],
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Heading is required');
    });

    it('rejects dangerous protocols in CTA destination', async () => {
      const dangerousDestinations = [
        'javascript:alert(1)',
        'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
        'vbscript:msgbox(1)',
        'file:///etc/passwd',
        '//evil-external-domain.com',
        'https://external-phishing.com/login',
        'not-a-valid-internal-path',
      ];

      for (const dest of dangerousDestinations) {
        const res = await request(app)
          .put('/api/admin/homepage/hero')
          .set('Cookie', adminCookies)
          .set('x-csrf-token', csrfToken)
          .send({
            slides: [
              { id: 1, heading: 'H1', subtitle: 'S1', ctaLabel: 'C1', ctaLink: dest, isEnabled: true },
              { id: 2, heading: 'H2', subtitle: 'S2', ctaLabel: 'C2', ctaLink: '#valid', isEnabled: true },
              { id: 3, heading: 'H3', subtitle: 'S3', ctaLabel: 'C3', ctaLink: 'bulk', isEnabled: true },
            ],
          });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Invalid hero image payload');
      }
    });

    it('accepts valid internal paths, anchors, and approved action keywords', async () => {
      const validDestinations = [
        '#category-showcase',
        '#best-sellers',
        '/category/t-shirts',
        '/category/shirts',
        '/products',
        'bulk',
        'explore',
      ];

      for (const dest of validDestinations) {
        const res = await request(app)
          .put('/api/admin/homepage/hero')
          .set('Cookie', adminCookies)
          .set('x-csrf-token', csrfToken)
          .send({
            slides: [
              { id: 1, heading: 'H1', subtitle: 'S1', ctaLabel: 'C1', ctaLink: dest, isEnabled: true },
              { id: 2, heading: 'H2', subtitle: 'S2', ctaLabel: 'C2', ctaLink: '#valid', isEnabled: true },
              { id: 3, heading: 'H3', subtitle: 'S3', ctaLabel: 'C3', ctaLink: 'bulk', isEnabled: true },
            ],
          });
        expect(res.status).toBe(200);
      }
    });
  });

  describe('4. Cloudinary Asset Safety & Data Preservation', () => {
    it('preserves Cloudinary assets without automatic deletion during slide updates and removals', async () => {
      const deleteSpy = vi.spyOn(cloudinaryService, 'deleteCloudinaryAsset').mockResolvedValue(true);

      try {
        // Initial state: slide 1 has asset_A, slide 2 has asset_B, slide 3 has asset_B (shared)
        await request(app)
          .put('/api/admin/homepage/hero')
          .set('Cookie', adminCookies)
          .set('x-csrf-token', csrfToken)
          .send({
            slides: [
              { id: 1, imageUrl: 'https://res.cloudinary.com/axdoro/imgA.webp', publicId: 'axdoro/hero/asset_A', heading: 'H1', subtitle: 'S1', ctaLabel: 'C1', ctaLink: '#a', isEnabled: true },
              { id: 2, imageUrl: 'https://res.cloudinary.com/axdoro/imgB.webp', publicId: 'axdoro/hero/asset_B', heading: 'H2', subtitle: 'S2', ctaLabel: 'C2', ctaLink: '#b', isEnabled: true },
              { id: 3, imageUrl: 'https://res.cloudinary.com/axdoro/imgB.webp', publicId: 'axdoro/hero/asset_B', heading: 'H3', subtitle: 'S3', ctaLabel: 'C3', ctaLink: '#c', isEnabled: true },
            ],
          });

        deleteSpy.mockClear();

        // Update 1: Replace Slide 1 with asset_C
        const res1 = await request(app)
          .put('/api/admin/homepage/hero')
          .set('Cookie', adminCookies)
          .set('x-csrf-token', csrfToken)
          .send({
            slides: [
              { id: 1, imageUrl: 'https://res.cloudinary.com/axdoro/imgC.webp', publicId: 'axdoro/hero/asset_C', heading: 'H1', subtitle: 'S1', ctaLabel: 'C1', ctaLink: '#a', isEnabled: true },
              { id: 2, imageUrl: 'https://res.cloudinary.com/axdoro/imgB.webp', publicId: 'axdoro/hero/asset_B', heading: 'H2', subtitle: 'S2', ctaLabel: 'C2', ctaLink: '#b', isEnabled: true },
              { id: 3, imageUrl: 'https://res.cloudinary.com/axdoro/imgB.webp', publicId: 'axdoro/hero/asset_B', heading: 'H3', subtitle: 'S3', ctaLabel: 'C3', ctaLink: '#c', isEnabled: true },
            ],
          });
        expect(res1.status).toBe(200);
        // Automatic Cloudinary deletion on hero updates is disabled to prevent data loss
        expect(deleteSpy).not.toHaveBeenCalled();

        // Update 2: Remove image on Slide 2 by setting imageUrl and publicId to null
        const res2 = await request(app)
          .put('/api/admin/homepage/hero')
          .set('Cookie', adminCookies)
          .set('x-csrf-token', csrfToken)
          .send({
            slides: [
              { id: 1, imageUrl: 'https://res.cloudinary.com/axdoro/imgC.webp', publicId: 'axdoro/hero/asset_C', heading: 'H1', subtitle: 'S1', ctaLabel: 'C1', ctaLink: '#a', isEnabled: true },
              { id: 2, imageUrl: null, publicId: null, heading: 'H2', subtitle: 'S2', ctaLabel: 'C2', ctaLink: '#b', isEnabled: false },
              { id: 3, imageUrl: 'https://res.cloudinary.com/axdoro/imgB.webp', publicId: 'axdoro/hero/asset_B', heading: 'H3', subtitle: 'S3', ctaLabel: 'C3', ctaLink: '#c', isEnabled: true },
            ],
          });
        expect(res2.status).toBe(200);
        // Removing slide image reference must NOT delete the asset
        expect(deleteSpy).not.toHaveBeenCalled();
      } finally {
        deleteSpy.mockRestore();
      }
    });
  });

  describe('5. Concurrency & Transactional Resilience', () => {
    it('handles concurrent updates atomically with row-level pessimistic lock (FOR UPDATE) without corrupting data', async () => {
      const updatePromise1 = request(app)
        .put('/api/admin/homepage/hero')
        .set('Cookie', adminCookies)
        .set('x-csrf-token', csrfToken)
        .send({
          slides: [
            { id: 1, heading: 'Concurrent Update A - Slot 1', subtitle: 'S1', ctaLabel: 'C1', ctaLink: '#a', isEnabled: true },
            { id: 2, heading: 'Concurrent Update A - Slot 2', subtitle: 'S2', ctaLabel: 'C2', ctaLink: '#b', isEnabled: true },
            { id: 3, heading: 'Concurrent Update A - Slot 3', subtitle: 'S3', ctaLabel: 'C3', ctaLink: '#c', isEnabled: true },
          ],
        });

      const updatePromise2 = request(app)
        .put('/api/admin/homepage/hero')
        .set('Cookie', adminCookies)
        .set('x-csrf-token', csrfToken)
        .send({
          slides: [
            { id: 1, heading: 'Concurrent Update B - Slot 1', subtitle: 'S1', ctaLabel: 'C1', ctaLink: '#a', isEnabled: true },
            { id: 2, heading: 'Concurrent Update B - Slot 2', subtitle: 'S2', ctaLabel: 'C2', ctaLink: '#b', isEnabled: true },
            { id: 3, heading: 'Concurrent Update B - Slot 3', subtitle: 'S3', ctaLabel: 'C3', ctaLink: '#c', isEnabled: true },
          ],
        });

      const [res1, res2] = await Promise.all([updatePromise1, updatePromise2]);
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      // Verify DB contains one valid complete update (no partial corruption)
      const pubRes = await request(app).get('/api/homepage/hero');
      expect(pubRes.status).toBe(200);
      expect(pubRes.body.data.slides).toHaveLength(3);
      const headingPrefix = pubRes.body.data.slides[0].heading.startsWith('Concurrent Update A')
        ? 'Concurrent Update A'
        : 'Concurrent Update B';
      expect(pubRes.body.data.slides[0].heading).toContain(headingPrefix);
      expect(pubRes.body.data.slides[1].heading).toContain(headingPrefix);
      expect(pubRes.body.data.slides[2].heading).toContain(headingPrefix);
    });
  });

  describe('6. Admin Authorization, CSRF & Slot Image Removal', () => {
    it('rejects PUT /api/admin/homepage/hero without admin authentication (401)', async () => {
      const res = await request(app)
        .put('/api/admin/homepage/hero')
        .send({
          slides: [
            { id: 1, heading: 'H1', subtitle: 'S1', ctaLabel: 'C1', ctaLink: '#a', isEnabled: true },
            { id: 2, heading: 'H2', subtitle: 'S2', ctaLabel: 'C2', ctaLink: '#b', isEnabled: true },
            { id: 3, heading: 'H3', subtitle: 'S3', ctaLabel: 'C3', ctaLink: '#c', isEnabled: true },
          ],
        });
      expect(res.status).toBe(401);
    });

    it('rejects PUT /api/admin/homepage/hero with missing or invalid CSRF token (403)', async () => {
      const res = await request(app)
        .put('/api/admin/homepage/hero')
        .set('Cookie', adminCookies)
        .set('x-csrf-token', 'invalid_csrf_token_value')
        .send({
          slides: [
            { id: 1, heading: 'H1', subtitle: 'S1', ctaLabel: 'C1', ctaLink: '#a', isEnabled: true },
            { id: 2, heading: 'H2', subtitle: 'S2', ctaLabel: 'C2', ctaLink: '#b', isEnabled: true },
            { id: 3, heading: 'H3', subtitle: 'S3', ctaLabel: 'C3', ctaLink: '#c', isEnabled: true },
          ],
        });
      expect(res.status).toBe(403);
    });

    it('permits removing image from a specific slot while preserving images on other slots', async () => {
      // First set images on slot 1 and slot 2
      await request(app)
        .put('/api/admin/homepage/hero')
        .set('Cookie', adminCookies)
        .set('x-csrf-token', csrfToken)
        .send({
          slides: [
            { id: 1, imageUrl: 'https://res.cloudinary.com/axdoro/img1.webp', publicId: 'axdoro/hero/img1', heading: 'H1', subtitle: 'S1', ctaLabel: 'C1', ctaLink: '#a', isEnabled: true },
            { id: 2, imageUrl: 'https://res.cloudinary.com/axdoro/img2.webp', publicId: 'axdoro/hero/img2', heading: 'H2', subtitle: 'S2', ctaLabel: 'C2', ctaLink: '#b', isEnabled: true },
            { id: 3, imageUrl: null, publicId: null, heading: 'H3', subtitle: 'S3', ctaLabel: 'C3', ctaLink: '#c', isEnabled: true },
          ],
        });

      // Now remove image on slot 1 by setting imageUrl: null
      const res = await request(app)
        .put('/api/admin/homepage/hero')
        .set('Cookie', adminCookies)
        .set('x-csrf-token', csrfToken)
        .send({
          slides: [
            { id: 1, imageUrl: null, publicId: null, heading: 'H1', subtitle: 'S1', ctaLabel: 'C1', ctaLink: '#a', isEnabled: true },
            { id: 2, imageUrl: 'https://res.cloudinary.com/axdoro/img2.webp', publicId: 'axdoro/hero/img2', heading: 'H2', subtitle: 'S2', ctaLabel: 'C2', ctaLink: '#b', isEnabled: true },
            { id: 3, imageUrl: null, publicId: null, heading: 'H3', subtitle: 'S3', ctaLabel: 'C3', ctaLink: '#c', isEnabled: true },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.slides[0].imageUrl).toBeNull();
      expect(res.body.data.slides[1].imageUrl).toBe('https://res.cloudinary.com/axdoro/img2.webp');
    });

    it('handles repeated identical submissions idempotently', async () => {
      const payload = {
        slides: [
          { id: 1, heading: 'Idempotent 1', subtitle: 'S1', ctaLabel: 'C1', ctaLink: '#a', isEnabled: true },
          { id: 2, heading: 'Idempotent 2', subtitle: 'S2', ctaLabel: 'C2', ctaLink: '#b', isEnabled: true },
          { id: 3, heading: 'Idempotent 3', subtitle: 'S3', ctaLabel: 'C3', ctaLink: '#c', isEnabled: true },
        ],
      };

      const res1 = await request(app)
        .put('/api/admin/homepage/hero')
        .set('Cookie', adminCookies)
        .set('x-csrf-token', csrfToken)
        .send(payload);
      expect(res1.status).toBe(200);

      const res2 = await request(app)
        .put('/api/admin/homepage/hero')
        .set('Cookie', adminCookies)
        .set('x-csrf-token', csrfToken)
        .send(payload);
      expect(res2.status).toBe(200);
      expect(res2.body.data.slides[0].heading).toBe('Idempotent 1');
    });
  });
});

