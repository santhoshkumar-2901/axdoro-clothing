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
import * as cloudinaryService from '../services/cloudinary.service.js';
import { env } from '../config/env.js';

describe('Admin-Managed Category Images Integration Tests (axdoro_test)', () => {
  let adminToken: string;

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
      email: 'category-admin@axdoro.test',
      password: 'AdminPassword123!',
      fullName: 'Category Admin',
    });

    const loginRes = await loginAdmin({
      email: 'category-admin@axdoro.test',
      password: 'AdminPassword123!',
    });
    adminToken = loginRes.token;
  });

  describe('1. Database Migration & Schema Verification', () => {
    it('proves categories table contains image_url and public_id columns', async () => {
      const colCheck = await testPool.query<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type 
         FROM information_schema.columns 
         WHERE table_name = 'categories' AND column_name IN ('image_url', 'public_id')
         ORDER BY column_name;`
      );

      expect(colCheck.rows).toHaveLength(2);
      expect(colCheck.rows[0].column_name).toBe('image_url');
      expect(colCheck.rows[1].column_name).toBe('public_id');
    });

    it('proves idx_categories_public_id index exists', async () => {
      const idxCheck = await testPool.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes WHERE tablename = 'categories' AND indexname = 'idx_categories_public_id';`
      );
      expect(idxCheck.rows).toHaveLength(1);
    });
  });

  describe('2. Category Image Creation & Retrieval via Admin APIs', () => {
    it('creates category with image_url and public_id, returning them in admin and public endpoints', async () => {
      const imageUrl = 'https://res.cloudinary.com/axdoro/image/upload/v1/shirts-hero.webp';
      const publicId = 'axdoro/categories/cat_shirts_123';

      const createRes = await request(app)
        .post('/api/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Formal Shirts',
          slug: 'formal-shirts',
          description: 'Tailored luxury weaves',
          displayOrder: 1,
          isActive: true,
          imageUrl,
          publicId,
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.category.name).toBe('Formal Shirts');
      expect(createRes.body.category.imageUrl).toBe(imageUrl);
      expect(createRes.body.category.publicId).toBe(publicId);

      // Verify GET /api/admin/categories
      const adminListRes = await request(app)
        .get('/api/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(adminListRes.status).toBe(200);
      const created = adminListRes.body.categories.find((c: any) => c.slug === 'formal-shirts');
      expect(created).toBeDefined();
      expect(created.imageUrl).toBe(imageUrl);
      expect(created.publicId).toBe(publicId);

      // Verify Public GET /api/categories
      const publicListRes = await request(app).get('/api/categories');
      expect(publicListRes.status).toBe(200);
      const publicCat = publicListRes.body.data.find((c: any) => c.slug === 'formal-shirts');
      expect(publicCat).toBeDefined();
      expect(publicCat.imageUrl).toBe(imageUrl);

      // Verify Public GET /api/categories/:slug
      const publicSlugRes = await request(app).get('/api/categories/formal-shirts');
      expect(publicSlugRes.status).toBe(200);
      expect(publicSlugRes.body.data.imageUrl).toBe(imageUrl);
    });

    it('rejects invalid image URLs during category creation', async () => {
      // 1. Unsupported protocol
      const resProt = await request(app)
        .post('/api/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Bad Protocol Category',
          slug: 'bad-proto',
          imageUrl: 'javascript:alert(1)',
        });
      expect(resProt.status).toBe(400);

      // 2. Embedded credentials
      const resCred = await request(app)
        .post('/api/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Cred Category',
          slug: 'cred-cat',
          imageUrl: 'https://user:pass@example.com/image.jpg',
        });
      expect(resCred.status).toBe(400);

      // 3. Executable / document extension
      const resExe = await request(app)
        .post('/api/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Exe Category',
          slug: 'exe-cat',
          imageUrl: 'https://example.com/malicious.pdf',
        });
      expect(resExe.status).toBe(400);
    });
  });

  describe('3. Category Image Updates & Safe Asset Deletion', () => {
    it('updates category image URL and publicId, recording audit log', async () => {
      const createRes = await request(app)
        .post('/api/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'T-Shirts',
          slug: 't-shirts',
          imageUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800',
        });
      const categoryId = createRes.body.category.id;

      // Update image
      const newImageUrl = 'https://res.cloudinary.com/axdoro/image/upload/v2/new-tshirt.webp';
      const newPublicId = 'axdoro/categories/cat_tshirts_new';

      const updateRes = await request(app)
        .put(`/api/admin/categories/${categoryId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          imageUrl: newImageUrl,
          publicId: newPublicId,
        });

      expect(updateRes.status).toBe(200);

      // Verify in DB
      const dbRes = await testPool.query<{ image_url: string; public_id: string }>(
        `SELECT image_url, public_id FROM categories WHERE id = $1;`,
        [categoryId]
      );
      expect(dbRes.rows[0].image_url).toBe(newImageUrl);
      expect(dbRes.rows[0].public_id).toBe(newPublicId);

      // Verify audit log
      const auditRes = await testPool.query<{ action: string; details: any }>(
        `SELECT action, details FROM admin_audit_logs WHERE entity_id = $1 ORDER BY created_at DESC LIMIT 1;`,
        [categoryId]
      );
      expect(auditRes.rows[0].action).toBe('CATEGORY_UPDATE');
      expect(auditRes.rows[0].details.imageUrl).toBe(newImageUrl);
      expect(auditRes.rows[0].details.publicId).toBe(newPublicId);
    });

    it('triggers deleteCloudinaryAsset safely post-commit when a previous hosted asset is replaced', async () => {
      const initialPublicId = 'axdoro/categories/old_asset_123';
      const createRes = await request(app)
        .post('/api/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Polo Shirts',
          slug: 'polo-shirts',
          imageUrl: 'https://res.cloudinary.com/axdoro/image/upload/v1/old.jpg',
          publicId: initialPublicId,
        });
      const categoryId = createRes.body.category.id;

      // Spy on deleteCloudinaryAsset
      const deleteSpy = vi.spyOn(cloudinaryService, 'deleteCloudinaryAsset').mockResolvedValue(true);

      const replacementPublicId = 'axdoro/categories/new_asset_456';
      const updateRes = await request(app)
        .put(`/api/admin/categories/${categoryId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          imageUrl: 'https://res.cloudinary.com/axdoro/image/upload/v2/new.jpg',
          publicId: replacementPublicId,
        });

      expect(updateRes.status).toBe(200);
      expect(deleteSpy).toHaveBeenCalledWith(initialPublicId);

      deleteSpy.mockRestore();
    });

    it('allows clearing category image by setting imageUrl and publicId to null', async () => {
      const createRes = await request(app)
        .post('/api/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Outerwear',
          slug: 'outerwear',
          imageUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800',
        });
      const categoryId = createRes.body.category.id;

      const clearRes = await request(app)
        .put(`/api/admin/categories/${categoryId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          imageUrl: null,
          publicId: null,
        });

      expect(clearRes.status).toBe(200);

      const dbRes = await testPool.query<{ image_url: string | null; public_id: string | null }>(
        `SELECT image_url, public_id FROM categories WHERE id = $1;`,
        [categoryId]
      );
      expect(dbRes.rows[0].image_url).toBeNull();
      expect(dbRes.rows[0].public_id).toBeNull();
    });
  });

  describe('4. Cloudinary Upload Signature Endpoints for Categories', () => {
    it('generates signed upload config for categories with valid credentials', async () => {
      const originalName = env.CLOUDINARY_CLOUD_NAME;
      const originalKey = env.CLOUDINARY_API_KEY;
      const originalSecret = env.CLOUDINARY_API_SECRET;

      try {
        (env as any).CLOUDINARY_CLOUD_NAME = 'mock_cloud';
        (env as any).CLOUDINARY_API_KEY = 'mock_key_123';
        (env as any).CLOUDINARY_API_SECRET = 'mock_secret_abc';

        // 1. General category upload signature: POST /api/admin/categories/upload-signature
        const resGen = await request(app)
          .post('/api/admin/categories/upload-signature')
          .set('Authorization', `Bearer ${adminToken}`)
          .send();

        expect(resGen.status).toBe(200);
        expect(resGen.body.status).toBe('success');
        expect(resGen.body.data.apiKey).toBe('mock_key_123');
        expect(resGen.body.data.folder).toBe('axdoro/categories');
        expect(resGen.body.data.signature).toBeDefined();

        // 2. Category-specific upload signature: POST /api/admin/categories/:id/images/signature
        const resCat = await request(app)
          .post('/api/admin/categories/test-cat-id/images/signature')
          .set('Authorization', `Bearer ${adminToken}`)
          .send();

        expect(resCat.status).toBe(200);
        expect(resCat.body.status).toBe('success');
        expect(resCat.body.data.publicId).toContain('cat_test-cat-id');
        expect(resCat.body.data.folder).toBe('axdoro/categories');
      } finally {
        (env as any).CLOUDINARY_CLOUD_NAME = originalName;
        (env as any).CLOUDINARY_API_KEY = originalKey;
        (env as any).CLOUDINARY_API_SECRET = originalSecret;
      }
    });

    it('rejects unauthenticated signature requests with 401', async () => {
      const res = await request(app).post('/api/admin/categories/upload-signature');
      expect(res.status).toBe(401);
    });
  });
});
