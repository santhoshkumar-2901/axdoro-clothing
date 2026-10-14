import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
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
import {
  signCloudinaryParameters,
  generateUploadSignature,
  isCloudinaryConfigured,
  deleteCloudinaryAsset,
} from '../services/cloudinary.service.js';
import { env } from '../config/env.js';
import { isValidProductImageUrl } from '../schemas/admin.js';

describe('Product Image Management & Cloudinary Integration Tests (axdoro_test)', () => {
  let adminToken: string;
  let categoryId: string;
  let productId: string;

  beforeAll(async () => {
    await initializeTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  beforeEach(async () => {
    await truncateTestAdmin();
    await truncateTestCatalogue();

    // Provision admin and log in
    await provisionAdmin({
      email: 'image-admin@axdoro.test',
      password: 'AdminPassword123!',
      fullName: 'Image Admin',
    });

    const loginRes = await loginAdmin({
      email: 'image-admin@axdoro.test',
      password: 'AdminPassword123!',
    });
    adminToken = loginRes.token;

    // Create a category
    const catRes = await testPool.query(
      `INSERT INTO categories (name, slug) VALUES ('T-Shirts', 't-shirts') RETURNING id;`
    );
    categoryId = catRes.rows[0].id;

    // Create a product
    const prodRes = await testPool.query(
      `INSERT INTO products (name, slug, category_id, status)
       VALUES ('Axdoro Minimal Tee', 'axdoro-minimal-tee', $1, 'published')
       RETURNING id;`,
      [categoryId]
    );
    productId = prodRes.rows[0].id;

    // Create at least one variant for product
    await testPool.query(
      `INSERT INTO product_variants (product_id, size, color, sku, price_paise, stock_quantity)
       VALUES ($1, 'M', 'Charcoal', 'AX-MIN-TEE-M-CH', 199900, 10);`,
      [productId]
    );
  });

  describe('Cloudinary Service Unit Logic', () => {
    it('signs parameters deterministically using Cloudinary SHA-1 algorithm', () => {
      const params = {
        folder: 'axdoro/products/test-prod',
        public_id: 'test_123',
        timestamp: 1700000000,
      };
      const secret = 'mock_api_secret';

      const sig1 = signCloudinaryParameters(params, secret);
      const sig2 = signCloudinaryParameters(params, secret);

      expect(sig1).toBe(sig2);
      expect(typeof sig1).toBe('string');
      expect(sig1.length).toBe(40); // 40-char SHA1 hex
    });

    it('handles deleteCloudinaryAsset safely when unconfigured or invalid', async () => {
      // Should not throw or crash
      const res = await deleteCloudinaryAsset('');
      expect(res).toBe(false);
    });

    it('rejects generateUploadSignature when credentials are not configured', () => {
      // In default test environment without CLOUDINARY_API_KEY, should throw
      if (!isCloudinaryConfigured()) {
        expect(() => generateUploadSignature({ productId: 'test-id' })).toThrow(
          'Cloudinary credentials are not configured'
        );
      }
    });

    it('generates valid upload signature without leaking API secret when mock credentials configured', () => {
      const originalName = env.CLOUDINARY_CLOUD_NAME;
      const originalKey = env.CLOUDINARY_API_KEY;
      const originalSecret = env.CLOUDINARY_API_SECRET;

      try {
        (env as any).CLOUDINARY_CLOUD_NAME = 'mock_cloud';
        (env as any).CLOUDINARY_API_KEY = 'mock_key_123';
        (env as any).CLOUDINARY_API_SECRET = 'mock_secret_abc';

        const config = generateUploadSignature({
          productId: 'test-product-uuid',
          timestamp: 1700000000,
          publicId: 'test-public-id',
        });

        expect(config.apiKey).toBe('mock_key_123');
        expect(config.cloudName).toBe('mock_cloud');
        expect(config.uploadUrl).toBe('https://api.cloudinary.com/v1_1/mock_cloud/image/upload');
        expect(config.folder).toBe('axdoro/products/test-product-uuid');
        expect(config.publicId).toBe('test-public-id');
        expect(typeof config.signature).toBe('string');
        expect(config.signature.length).toBe(40);
        // Explicit security assertion: API secret MUST NOT be present in config or JSON
        expect((config as any).apiSecret).toBeUndefined();
        expect(JSON.stringify(config)).not.toContain('mock_secret_abc');
      } finally {
        (env as any).CLOUDINARY_CLOUD_NAME = originalName;
        (env as any).CLOUDINARY_API_KEY = originalKey;
        (env as any).CLOUDINARY_API_SECRET = originalSecret;
      }
    });
  });

  describe('Database Partial Unique Index (Migration 007)', () => {
    it('allows multiple non-primary images for the same product', async () => {
      await testPool.query(
        `INSERT INTO product_images (product_id, image_url, display_order, is_primary)
         VALUES ($1, 'https://example.com/img1.jpg', 0, false);`,
        [productId]
      );
      await testPool.query(
        `INSERT INTO product_images (product_id, image_url, display_order, is_primary)
         VALUES ($1, 'https://example.com/img2.jpg', 1, false);`,
        [productId]
      );

      const rows = await testPool.query(`SELECT * FROM product_images WHERE product_id = $1;`, [productId]);
      expect(rows.rows.length).toBe(2);
    });

    it('enforces partial unique index: rejects two primary images for the same product', async () => {
      await testPool.query(
        `INSERT INTO product_images (product_id, image_url, display_order, is_primary)
         VALUES ($1, 'https://example.com/img1.jpg', 0, true);`,
        [productId]
      );

      // Second primary image should violate uq_product_images_single_primary
      await expect(
        testPool.query(
          `INSERT INTO product_images (product_id, image_url, display_order, is_primary)
           VALUES ($1, 'https://example.com/img2.jpg', 1, true);`,
          [productId]
        )
      ).rejects.toThrow(/uq_product_images_single_primary|duplicate key/);
    });
  });

  describe('Admin Product Image Endpoints & Security Controls', () => {
    it('protects image endpoints from unauthenticated access', async () => {
      const getRes = await request(app).post(`/api/admin/products/${productId}/images`).send({
        imageUrl: 'https://example.com/tee.jpg',
      });
      expect(getRes.status).toBe(401);
    });

    it('returns 503 CLOUDINARY_NOT_CONFIGURED when signature requested in unconfigured environment', async () => {
      const res = await request(app)
        .post(`/api/admin/products/${productId}/images/signature`)
        .set('Authorization', `Bearer ${adminToken}`);

      if (!isCloudinaryConfigured()) {
        expect(res.status).toBe(503);
        expect(res.body.code).toBe('CLOUDINARY_NOT_CONFIGURED');
        expect(res.body.error).toContain('Cloudinary credentials are not configured');
      }
    });

    it('rejects invalid image URLs and malformed payloads', async () => {
      // Not a valid URL
      const res1 = await request(app)
        .post(`/api/admin/products/${productId}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ imageUrl: 'not-a-url' });
      expect(res1.status).toBe(400);

      // Not an image file extension or Cloudinary resource
      const res2 = await request(app)
        .post(`/api/admin/products/${productId}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ imageUrl: 'https://example.com/not-an-image.pdf' });
      expect(res2.status).toBe(400);
    });

    it('returns 404 when product does not exist', async () => {
      const randomId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .post(`/api/admin/products/${randomId}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ imageUrl: 'https://example.com/test.jpg' });
      expect(res.status).toBe(404);
    });

    it('adds first image and automatically promotes it to primary', async () => {
      const res = await request(app)
        .post(`/api/admin/products/${productId}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          imageUrl: 'https://res.cloudinary.com/axdoro/image/upload/v1/tee1.webp',
          publicId: 'tee_primary_01',
          altText: 'Front angle of Minimal Tee',
          width: 1200,
          height: 1600,
          format: 'webp',
          bytes: 204800,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.isPrimary).toBe(true);
      expect(res.body.data.publicId).toBe('tee_primary_01');
      expect(res.body.data.format).toBe('webp');
      expect(res.body.data.width).toBe(1200);

      // Verify audit log
      const audit = await testPool.query(
        `SELECT * FROM admin_audit_logs WHERE action = 'PRODUCT_IMAGE_ADD' AND entity_id = $1;`,
        [productId]
      );
      expect(audit.rows.length).toBe(1);
    });

    it('adds second image with isPrimary: false, and third image with isPrimary: true atomically reassigns primary', async () => {
      // 1. First image (automatically primary)
      const res1 = await request(app)
        .post(`/api/admin/products/${productId}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          imageUrl: 'https://res.cloudinary.com/axdoro/image/upload/v1/img1.webp',
          publicId: 'img_01',
        });
      const img1Id = res1.body.data.id;
      expect(res1.body.data.isPrimary).toBe(true);

      // 2. Second image (not primary)
      const res2 = await request(app)
        .post(`/api/admin/products/${productId}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          imageUrl: 'https://res.cloudinary.com/axdoro/image/upload/v1/img2.webp',
          publicId: 'img_02',
          isPrimary: false,
        });
      const img2Id = res2.body.data.id;
      expect(res2.body.data.isPrimary).toBe(false);

      // 3. Third image with isPrimary: true
      const res3 = await request(app)
        .post(`/api/admin/products/${productId}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          imageUrl: 'https://res.cloudinary.com/axdoro/image/upload/v1/img3.webp',
          publicId: 'img_03',
          isPrimary: true,
        });
      const img3Id = res3.body.data.id;
      expect(res3.body.data.isPrimary).toBe(true);

      // Verify in DB that only img3Id is primary
      const primaryRows = await testPool.query(
        `SELECT id FROM product_images WHERE product_id = $1 AND is_primary = true;`,
        [productId]
      );
      expect(primaryRows.rows.length).toBe(1);
      expect(primaryRows.rows[0].id).toBe(img3Id);

      // 4. Test Set Primary endpoint on img2Id
      const setPrimaryRes = await request(app)
        .patch(`/api/admin/products/${productId}/images/${img2Id}/primary`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(setPrimaryRes.status).toBe(200);

      const afterSetPrimary = await testPool.query(
        `SELECT id FROM product_images WHERE product_id = $1 AND is_primary = true;`,
        [productId]
      );
      expect(afterSetPrimary.rows.length).toBe(1);
      expect(afterSetPrimary.rows[0].id).toBe(img2Id);
    });

    it('supports reordering images and reflects new display orders', async () => {
      // Add 2 images
      const res1 = await request(app)
        .post(`/api/admin/products/${productId}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ imageUrl: 'https://res.cloudinary.com/axdoro/image/upload/v1/a.webp' });
      const res2 = await request(app)
        .post(`/api/admin/products/${productId}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ imageUrl: 'https://res.cloudinary.com/axdoro/image/upload/v1/b.webp' });

      const reorderRes = await request(app)
        .put(`/api/admin/products/${productId}/images/reorder`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          images: [
            { id: res2.body.data.id, displayOrder: 0 },
            { id: res1.body.data.id, displayOrder: 1 },
          ],
        });
      expect(reorderRes.status).toBe(200);

      // Verify order via GET product
      const getProd = await request(app)
        .get(`/api/admin/products/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(getProd.body.product.images[0].id).toBe(res2.body.data.id);
      expect(getProd.body.product.images[1].id).toBe(res1.body.data.id);
    });

    it('safely deletes an image and promotes remaining image if deleted was primary', async () => {
      // Add primary image
      const res1 = await request(app)
        .post(`/api/admin/products/${productId}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          imageUrl: 'https://res.cloudinary.com/axdoro/image/upload/v1/first.webp',
          publicId: 'first_pub_id',
        });
      // Add secondary image
      const res2 = await request(app)
        .post(`/api/admin/products/${productId}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          imageUrl: 'https://res.cloudinary.com/axdoro/image/upload/v1/second.webp',
          publicId: 'second_pub_id',
        });

      // Delete the primary image
      const delRes = await request(app)
        .delete(`/api/admin/products/${productId}/images/${res1.body.data.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(delRes.status).toBe(200);
      expect(delRes.body.deletedPublicId).toBe('first_pub_id');

      // Check remaining image promoted to primary
      const remaining = await testPool.query(
        `SELECT id, is_primary FROM product_images WHERE product_id = $1;`,
        [productId]
      );
      expect(remaining.rows.length).toBe(1);
      expect(remaining.rows[0].id).toBe(res2.body.data.id);
      expect(remaining.rows[0].is_primary).toBe(true);

      // Audit log recorded
      const delAudit = await testPool.query(
        `SELECT * FROM admin_audit_logs WHERE action = 'PRODUCT_IMAGE_DELETE' AND entity_id = $1;`,
        [productId]
      );
      expect(delAudit.rows.length).toBe(1);
    }, 25000);
  });

  describe('Direct Product Image URL Validation & CDN Support (Phase 1)', () => {
    describe('Unit Validator: isValidProductImageUrl', () => {
      it('accepts valid Cloudinary image URLs', () => {
        expect(isValidProductImageUrl('https://res.cloudinary.com/axdoro/image/upload/v1/sample.webp').valid).toBe(true);
        expect(isValidProductImageUrl('https://res.cloudinary.com/demo/image/upload/sample').valid).toBe(true);
      });

      it('accepts extensionless Unsplash URLs with query parameters', () => {
        const url = 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800&auto=format&fit=crop&q=80';
        const res = isValidProductImageUrl(url);
        expect(res.valid).toBe(true);
      });

      it('accepts supported image extensions with query parameters', () => {
        expect(isValidProductImageUrl('https://example.com/item.jpg?v=2').valid).toBe(true);
        expect(isValidProductImageUrl('https://example.com/item.jpeg?size=lg').valid).toBe(true);
        expect(isValidProductImageUrl('https://example.com/item.png?cache=1').valid).toBe(true);
        expect(isValidProductImageUrl('https://example.com/item.webp?q=90').valid).toBe(true);
        expect(isValidProductImageUrl('https://example.com/item.avif').valid).toBe(true);
        expect(isValidProductImageUrl('https://example.com/item.svg#icon').valid).toBe(true);
        expect(isValidProductImageUrl('https://example.com/item.gif').valid).toBe(true);
      });

      it('rejects malformed URLs', () => {
        expect(isValidProductImageUrl('not-a-url').valid).toBe(false);
        expect(isValidProductImageUrl('http://').valid).toBe(false);
        expect(isValidProductImageUrl('').valid).toBe(false);
      });

      it('rejects javascript: and unsupported protocols', () => {
        const jsRes = isValidProductImageUrl("javascript:alert('xss')");
        expect(jsRes.valid).toBe(false);
        expect(jsRes.reason).toContain('Unsupported protocol');

        const dataRes = isValidProductImageUrl('data:image/png;base64,iVBORw0KGgo=');
        expect(dataRes.valid).toBe(false);
        expect(dataRes.reason).toContain('Unsupported protocol');
      });

      it('rejects credentials embedded in URLs', () => {
        const res = isValidProductImageUrl('https://admin:supersecret@images.unsplash.com/photo-1583743814966-8936f5b7be1a');
        expect(res.valid).toBe(false);
        expect(res.reason).toContain('embedded user credentials');
      });

      it('rejects obvious non-image URLs such as PDF and executable files', () => {
        const pdfRes = isValidProductImageUrl('https://example.com/catalogue.pdf');
        expect(pdfRes.valid).toBe(false);
        expect(pdfRes.reason).toContain('non-image file extension');

        const exeRes = isValidProductImageUrl('https://example.com/setup.exe?download=true');
        expect(exeRes.valid).toBe(false);
        expect(exeRes.reason).toContain('non-image file extension');
      });

      it('rejects extensionless URLs on unapproved domains', () => {
        const res = isValidProductImageUrl('https://example.com/some-page');
        expect(res.valid).toBe(false);
        expect(res.reason).toContain('recognized image extension');
      });
    });

    describe('API Endpoint Integration: POST /api/admin/products/:id/images', () => {
      it('successfully saves an extensionless Unsplash image URL with query parameters', async () => {
        const unsplashUrl = 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800&auto=format&fit=crop&q=80';
        const res = await request(app)
          .post(`/api/admin/products/${productId}/images`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            imageUrl: unsplashUrl,
            altText: 'Unsplash Crewneck Tee',
          });

        expect(res.status).toBe(201);
        expect(res.body.data.imageUrl).toBe(unsplashUrl);
        expect(res.body.data.altText).toBe('Unsplash Crewneck Tee');
        expect(res.body.data.isPrimary).toBe(true);

        // Verify in DB
        const dbRes = await testPool.query(`SELECT * FROM product_images WHERE id = $1;`, [res.body.data.id]);
        expect(dbRes.rows.length).toBe(1);
        expect(dbRes.rows[0].image_url).toBe(unsplashUrl);
      });

      it('successfully saves a direct image URL with query parameters and supported extension', async () => {
        const directUrl = 'https://example.com/images/tee-charcoal.png?v=1.2#preview';
        const res = await request(app)
          .post(`/api/admin/products/${productId}/images`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            imageUrl: directUrl,
            altText: 'Direct Charcoal Tee',
          });

        expect(res.status).toBe(201);
        expect(res.body.data.imageUrl).toBe(directUrl);
      });

      it('rejects PDF and executable files with detailed error message', async () => {
        const pdfRes = await request(app)
          .post(`/api/admin/products/${productId}/images`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ imageUrl: 'https://example.com/invoice.pdf' });

        expect(pdfRes.status).toBe(400);
        expect(pdfRes.body.error).toContain('non-image file extension');

        const exeRes = await request(app)
          .post(`/api/admin/products/${productId}/images`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ imageUrl: 'https://example.com/malicious.exe' });

        expect(exeRes.status).toBe(400);
        expect(exeRes.body.error).toContain('non-image file extension');
      });

      it('rejects embedded user credentials with detailed error message', async () => {
        const credRes = await request(app)
          .post(`/api/admin/products/${productId}/images`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ imageUrl: 'https://admin:secret@images.unsplash.com/photo-1583743814966' });

        expect(credRes.status).toBe(400);
        expect(credRes.body.error).toContain('embedded user credentials');
      });

      it('rejects unsupported javascript: protocol with detailed error message', async () => {
        const protoRes = await request(app)
          .post(`/api/admin/products/${productId}/images`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ imageUrl: "javascript:alert('pwned')" });

        expect(protoRes.status).toBe(400);
        expect(protoRes.body.error).toContain('Unsupported protocol');
      });
    });
  });
});
