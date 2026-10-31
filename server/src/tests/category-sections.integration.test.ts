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

describe('Homepage Category Sections Integration Tests (axdoro_test)', () => {
  let adminToken: string;
  let csrfToken: string;
  let adminCookies: string[];

  let pantsCategoryId: string;
  let shirtsCategoryId: string;
  let tshirtsCategoryId: string;

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

    // 1. Provision and log in test admin
    await provisionAdmin({
      email: 'sections-admin@axdoro.test',
      password: 'AdminPassword123!',
      fullName: 'Sections Admin',
    });

    const loginRes = await loginAdmin({
      email: 'sections-admin@axdoro.test',
      password: 'AdminPassword123!',
    });
    adminToken = loginRes.token;
    csrfToken = generateCsrfToken(adminToken);
    adminCookies = [
      `axdoro_admin_session=${adminToken}`,
      `axdoro_csrf_token=${csrfToken}`,
    ];

    // 2. Insert test categories
    const pantsRes = await testPool.query<{ id: string }>(`
      INSERT INTO categories (slug, name, description, display_order, is_active)
      VALUES ('pants', 'Pants', 'Pants & Trousers', 1, true)
      RETURNING id;
    `);
    pantsCategoryId = pantsRes.rows[0].id;

    const shirtsRes = await testPool.query<{ id: string }>(`
      INSERT INTO categories (slug, name, description, display_order, is_active)
      VALUES ('shirts', 'Shirts', 'Casual & Formal Shirts', 2, true)
      RETURNING id;
    `);
    shirtsCategoryId = shirtsRes.rows[0].id;

    const tshirtsRes = await testPool.query<{ id: string }>(`
      INSERT INTO categories (slug, name, description, display_order, is_active)
      VALUES ('t-shirts', 'T-Shirts', 'Tees and Essentials', 3, true)
      RETURNING id;
    `);
    tshirtsCategoryId = tshirtsRes.rows[0].id;

    // 3. Insert test product under pants to verify category deletion safety
    const productRes = await testPool.query<{ id: string }>(`
      INSERT INTO products (slug, name, description, category_id, status)
      VALUES ('classic-bootcut-pants', 'Classic Bootcut Pants', 'Premium fabric pants', $1, 'published')
      RETURNING id;
    `, [pantsCategoryId]);
    const productId = productRes.rows[0].id;

    await testPool.query(`
      INSERT INTO product_variants (product_id, size, color, sku, price_paise, stock_quantity, is_active)
      VALUES ($1, '32', 'Black', 'PANTS-BLK-32', 499900, 10, true);
    `, [productId]);

    // 4. Seed initial category sections
    await testPool.query(`
      INSERT INTO category_sections (
        category_id, is_enabled, display_order, heading, subtitle, category_cards,
        poster_image_url, poster_heading, poster_subtitle, poster_destination_url,
        product_limit, view_all_label, view_all_destination
      ) VALUES
      ($1, true, 1, 'Pants & Trousers', 'Relaxed and contemporary cuts', '[{"id":"bootcut","label":"Bootcut","imageUrl":"https://images.unsplash.com/photo-1541099649105-f69ad21f3246","destinationType":"query","query":"Bootcut"}]'::jsonb,
       'https://images.unsplash.com/photo-1507679799987-c73779587ccf', 'Pleated Pants', 'Loose Fit', '/category/pants', 4, 'View All', '/category/pants'),
      ($2, true, 2, 'Topwear & Shirts', 'Pinpoint Oxford and Cuban collar', '[]'::jsonb,
       'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf', 'Curated Topwear', 'Tailored shirts', '/category/shirts', 4, 'View All', '/category/shirts'),
      ($3, true, 3, 'T-Shirts & Essentials', 'Combed breathable cotton tees', '[]'::jsonb,
       'https://images.unsplash.com/photo-1521572267360-ee0c2909d518', 'Cotton Essentials', 'Everyday tees', '/category/t-shirts', 4, 'View All', '/category/t-shirts');
    `, [pantsCategoryId, shirtsCategoryId, tshirtsCategoryId]);
  });

  describe('1. Public Endpoint (GET /api/homepage/category-sections)', () => {
    it('returns all enabled sections for active categories in deterministic order', async () => {
      const res = await request(app).get('/api/homepage/category-sections');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(3);

      const [s1, s2, s3] = res.body.data;
      expect(s1.category.slug).toBe('pants');
      expect(s1.displayOrder).toBe(1);
      expect(s1.heading).toBe('Pants & Trousers');
      expect(s1.categoryCards).toHaveLength(1);
      expect(s1.categoryCards[0].label).toBe('Bootcut');
      expect(s1.viewAllDestination).toBe('/category/pants');

      expect(s2.category.slug).toBe('shirts');
      expect(s2.displayOrder).toBe(2);

      expect(s3.category.slug).toBe('t-shirts');
      expect(s3.displayOrder).toBe(3);
    });

    it('filtering: disabled sections are excluded publicly while config is preserved', async () => {
      // Disable shirts section
      await testPool.query(
        `UPDATE category_sections SET is_enabled = false WHERE category_id = $1;`,
        [shirtsCategoryId]
      );

      const res = await request(app).get('/api/homepage/category-sections');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      const slugs = res.body.data.map((s: { category: { slug: string } }) => s.category.slug);
      expect(slugs).toEqual(['pants', 't-shirts']);
      expect(slugs).not.toContain('shirts');

      // Verify DB configuration for shirts is still present
      const dbCheck = await testPool.query(
        `SELECT id, is_enabled FROM category_sections WHERE category_id = $1;`,
        [shirtsCategoryId]
      );
      expect(dbCheck.rows).toHaveLength(1);
      expect(dbCheck.rows[0].is_enabled).toBe(false);
    });

    it('filtering: deactivating a category excludes its section publicly without deleting config', async () => {
      // Deactivate pants category
      await testPool.query(
        `UPDATE categories SET is_active = false WHERE id = $1;`,
        [pantsCategoryId]
      );

      const res = await request(app).get('/api/homepage/category-sections');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      const slugs = res.body.data.map((s: { category: { slug: string } }) => s.category.slug);
      expect(slugs).toEqual(['shirts', 't-shirts']);
      expect(slugs).not.toContain('pants');

      // Verify DB section for pants is completely preserved
      const dbCheck = await testPool.query(
        `SELECT id, heading FROM category_sections WHERE category_id = $1;`,
        [pantsCategoryId]
      );
      expect(dbCheck.rows).toHaveLength(1);
      expect(dbCheck.rows[0].heading).toBe('Pants & Trousers');
    });

    it('returns empty array when all sections are disabled', async () => {
      await testPool.query(`UPDATE category_sections SET is_enabled = false;`);

      const res = await request(app).get('/api/homepage/category-sections');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toEqual([]);
    });
  });

  describe('2. Admin Authentication & CSRF Protection', () => {
    it('GET /api/admin/categories/:id/section rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get(`/api/admin/categories/${pantsCategoryId}/section`);
      expect(res.status).toBe(401);
    });

    it('PUT /api/admin/categories/:id/section rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .put(`/api/admin/categories/${pantsCategoryId}/section`)
        .send({ heading: 'Test Heading' });
      expect(res.status).toBe(401);
    });

    it('PUT /api/admin/categories/:id/section rejects cookie requests with missing CSRF token with 403', async () => {
      const res = await request(app)
        .put(`/api/admin/categories/${pantsCategoryId}/section`)
        .set('Cookie', adminCookies)
        .send({ heading: 'Test Heading' });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('CSRF token missing');
    });

    it('DELETE /api/admin/categories/:id/section rejects unauthenticated requests with 401', async () => {
      const res = await request(app).delete(`/api/admin/categories/${pantsCategoryId}/section`);
      expect(res.status).toBe(401);
    });

    it('DELETE /api/admin/categories/:id/section rejects missing CSRF with 403', async () => {
      const res = await request(app)
        .delete(`/api/admin/categories/${pantsCategoryId}/section`)
        .set('Cookie', adminCookies);
      expect(res.status).toBe(403);
    });

    it('PUT /api/admin/categories/sections/reorder rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .put('/api/admin/categories/sections/reorder')
        .send({ orderedSectionIds: [] });
      expect(res.status).toBe(401);
    });

    it('PUT /api/admin/categories/sections/reorder rejects missing CSRF with 403', async () => {
      const res = await request(app)
        .put('/api/admin/categories/sections/reorder')
        .set('Cookie', adminCookies)
        .send({ orderedSectionIds: [] });
      expect(res.status).toBe(403);
    });
  });

  describe('3. Validation & Security Guardrails', () => {
    it('rejects invalid UUID format for category ID with 400', async () => {
      const res = await request(app)
        .get('/api/admin/categories/not-a-uuid/section')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid category ID');
    });

    it('rejects empty heading with 400', async () => {
      const res = await request(app)
        .put(`/api/admin/categories/${pantsCategoryId}/section`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          heading: '',
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Heading is required');
    });

    it('rejects heading exceeding 150 characters with 400', async () => {
      const res = await request(app)
        .put(`/api/admin/categories/${pantsCategoryId}/section`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          heading: 'A'.repeat(151),
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Heading cannot exceed 150 characters');
    });

    it('rejects productLimit outside 1..20 safe range', async () => {
      const resZero = await request(app)
        .put(`/api/admin/categories/${pantsCategoryId}/section`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          heading: 'Valid Heading',
          productLimit: 0,
        });
      expect(resZero.status).toBe(400);
      expect(resZero.body.message).toContain('Product limit must be at least 1');

      const resHigh = await request(app)
        .put(`/api/admin/categories/${pantsCategoryId}/section`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          heading: 'Valid Heading',
          productLimit: 25,
        });
      expect(resHigh.status).toBe(400);
      expect(resHigh.body.message).toContain('Product limit cannot exceed 20');
    });

    it('rejects unsafe destination URLs (javascript:, data:, protocol-relative, malformed)', async () => {
      // 1. javascript:
      const resJs = await request(app)
        .put(`/api/admin/categories/${pantsCategoryId}/section`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          heading: 'Valid Heading',
          posterDestinationUrl: 'javascript:alert(document.cookie)',
        });
      expect(resJs.status).toBe(400);
      expect(resJs.body.message).toContain('Unsafe pseudo-protocol rejected');

      // 2. data:
      const resData = await request(app)
        .put(`/api/admin/categories/${pantsCategoryId}/section`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          heading: 'Valid Heading',
          posterDestinationUrl: 'data:text/html,<script>alert(1)</script>',
        });
      expect(resData.status).toBe(400);
      expect(resData.body.message).toContain('Unsafe pseudo-protocol rejected');

      // 3. protocol-relative //
      const resProtoRel = await request(app)
        .put(`/api/admin/categories/${pantsCategoryId}/section`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          heading: 'Valid Heading',
          posterDestinationUrl: '//attacker.com/exploit',
        });
      expect(resProtoRel.status).toBe(400);
      expect(resProtoRel.body.message).toContain('Protocol-relative URLs are not allowed');

      // 4. private IP address on external URL
      const resPrivateIp = await request(app)
        .put(`/api/admin/categories/${pantsCategoryId}/section`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          heading: 'Valid Heading',
          posterDestinationUrl: 'https://127.0.0.1/admin',
        });
      expect(resPrivateIp.status).toBe(400);
      expect(resPrivateIp.body.message).toContain('Private and loopback network destinations are not allowed');

      // 5. non-relative viewAllDestination
      const resViewAllExt = await request(app)
        .put(`/api/admin/categories/${pantsCategoryId}/section`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          heading: 'Valid Heading',
          viewAllDestination: 'https://external.com/page',
        });
      expect(resViewAllExt.status).toBe(400);
      expect(resViewAllExt.body.message).toContain('Destination must be an internal relative path starting with /');
    });

    it('rejects category card with invalid image URL format', async () => {
      const res = await request(app)
        .put(`/api/admin/categories/${pantsCategoryId}/section`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          heading: 'Valid Heading',
          categoryCards: [
            {
              id: 'card-1',
              label: 'Test Card',
              imageUrl: 'not-a-valid-url',
              destinationType: 'query',
            },
          ],
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Malformed or invalid URL format');
    });

    it('rejects category card referencing non-existent destinationCategorySlug', async () => {
      const res = await request(app)
        .put(`/api/admin/categories/${pantsCategoryId}/section`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          heading: 'Valid Heading',
          categoryCards: [
            {
              id: 'card-shoes',
              label: 'Shoes',
              imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff',
              destinationType: 'category',
              destinationCategorySlug: 'shoes-nonexistent',
            },
          ],
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Destination category referenced in card does not exist: shoes-nonexistent');
    });
  });

  describe('4. Section CRUD, Category Safety, & Audit Logging', () => {
    it('GET /api/admin/categories/:id/section returns configured section details', async () => {
      const res = await request(app)
        .get(`/api/admin/categories/${pantsCategoryId}/section`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.categoryId).toBe(pantsCategoryId);
      expect(res.body.data.categoryName).toBe('Pants');
      expect(res.body.data.heading).toBe('Pants & Trousers');
      expect(res.body.data.productLimit).toBe(4);
    });

    it('GET /api/admin/categories/:id/section returns 404 for category without section', async () => {
      // Create new category without section
      const newCatRes = await testPool.query<{ id: string }>(`
        INSERT INTO categories (slug, name, display_order)
        VALUES ('jackets', 'Jackets', 4)
        RETURNING id;
      `);
      const jacketCatId = newCatRes.rows[0].id;

      const res = await request(app)
        .get(`/api/admin/categories/${jacketCatId}/section`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Category section not found');
    });

    it('PUT /api/admin/categories/:id/section updates existing section and creates audit log', async () => {
      const updatePayload = {
        heading: 'Updated Pants Collection',
        subtitle: 'New season drops',
        isEnabled: false,
        displayOrder: 5,
        productLimit: 8,
        viewAllLabel: 'Explore All Pants',
        viewAllDestination: '/category/pants?fit=loose',
        categoryCards: [
          {
            id: 'card-1',
            label: 'Loose Fit',
            sublabel: 'Trending',
            imageUrl: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246',
            destinationType: 'query' as const,
            query: 'Loose',
          },
        ],
      };

      const res = await request(app)
        .put(`/api/admin/categories/${pantsCategoryId}/section`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updatePayload);

      expect(res.status).toBe(200);
      expect(res.body.data.heading).toBe('Updated Pants Collection');
      expect(res.body.data.isEnabled).toBe(false);
      expect(res.body.data.productLimit).toBe(8);
      expect(res.body.data.viewAllLabel).toBe('Explore All Pants');
      expect(res.body.data.categoryCards).toHaveLength(1);

      // Verify audit log
      const auditRes = await testPool.query<{ action: string; entity_type: string; details: any }>(`
        SELECT action, entity_type, details FROM admin_audit_logs
        WHERE entity_type = 'category_section' AND action = 'CATEGORY_SECTION_UPDATE'
        ORDER BY created_at DESC LIMIT 1;
      `);
      expect(auditRes.rows).toHaveLength(1);
      expect(auditRes.rows[0].details.heading).toBe('Updated Pants Collection');
    });

    it('DELETE /api/admin/categories/:id/section removes section without deleting category or products', async () => {
      const res = await request(app)
        .delete(`/api/admin/categories/${pantsCategoryId}/section`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deleted successfully');

      // Verify section is gone
      const sectionRes = await testPool.query(
        `SELECT id FROM category_sections WHERE category_id = $1;`,
        [pantsCategoryId]
      );
      expect(sectionRes.rows).toHaveLength(0);

      // VERIFY CRITICAL SAFETY RULE: Category still exists!
      const catRes = await testPool.query(
        `SELECT id, name, slug FROM categories WHERE id = $1;`,
        [pantsCategoryId]
      );
      expect(catRes.rows).toHaveLength(1);
      expect(catRes.rows[0].slug).toBe('pants');

      // VERIFY CRITICAL SAFETY RULE: Products still exist!
      const prodRes = await testPool.query(
        `SELECT id, name FROM products WHERE category_id = $1;`,
        [pantsCategoryId]
      );
      expect(prodRes.rows).toHaveLength(1);
      expect(prodRes.rows[0].name).toBe('Classic Bootcut Pants');

      // Verify audit log for deletion
      const auditRes = await testPool.query<{ action: string }>(`
        SELECT action FROM admin_audit_logs
        WHERE entity_type = 'category_section' AND action = 'CATEGORY_SECTION_DELETE'
        ORDER BY created_at DESC LIMIT 1;
      `);
      expect(auditRes.rows).toHaveLength(1);
    });
  });

  describe('5. Reordering & Transaction Integrity', () => {
    let sectionIds: string[];

    beforeEach(async () => {
      const res = await testPool.query<{ id: string }>(
        `SELECT id FROM category_sections ORDER BY display_order ASC;`
      );
      sectionIds = res.rows.map((r) => r.id);
      expect(sectionIds).toHaveLength(3);
    });

    it('reorders sections transactionally and normalizes displayOrder to 1..N', async () => {
      // Reverse existing order: [3, 2, 1]
      const reversedIds = [sectionIds[2], sectionIds[1], sectionIds[0]];

      const res = await request(app)
        .put('/api/admin/categories/sections/reorder')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          orderedSectionIds: reversedIds,
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');

      // Verify display_order normalized in database
      const dbRes = await testPool.query<{ id: string; display_order: number }>(
        `SELECT id, display_order FROM category_sections ORDER BY display_order ASC;`
      );
      expect(dbRes.rows).toHaveLength(3);
      expect(dbRes.rows[0].id).toBe(reversedIds[0]);
      expect(dbRes.rows[0].display_order).toBe(1);

      expect(dbRes.rows[1].id).toBe(reversedIds[1]);
      expect(dbRes.rows[1].display_order).toBe(2);

      expect(dbRes.rows[2].id).toBe(reversedIds[2]);
      expect(dbRes.rows[2].display_order).toBe(3);

      // Verify audit log
      const auditRes = await testPool.query<{ action: string; details: any }>(`
        SELECT action, details FROM admin_audit_logs
        WHERE entity_type = 'category_section' AND action = 'CATEGORY_SECTIONS_REORDER'
        ORDER BY created_at DESC LIMIT 1;
      `);
      expect(auditRes.rows).toHaveLength(1);
      expect(auditRes.rows[0].details.orderedSectionIds).toEqual(reversedIds);
    });

    it('rejects duplicate section IDs in reorder request with 400', async () => {
      const duplicateIds = [sectionIds[0], sectionIds[0], sectionIds[1]];

      const res = await request(app)
        .put('/api/admin/categories/sections/reorder')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          orderedSectionIds: duplicateIds,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Duplicate section IDs are not allowed');
    });

    it('rejects incomplete reorder requests with 400', async () => {
      // Send only 2 of the 3 sections
      const partialIds = [sectionIds[0], sectionIds[1]];

      const res = await request(app)
        .put('/api/admin/categories/sections/reorder')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          orderedSectionIds: partialIds,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('INCOMPLETE_REORDER_REQUEST');
    });

    it('rejects non-existent section IDs with 400 and preserves existing order', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000099';
      const invalidIds = [sectionIds[0], sectionIds[1], fakeId];

      const res = await request(app)
        .put('/api/admin/categories/sections/reorder')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          orderedSectionIds: invalidIds,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('INVALID_SECTION_IDS');

      // Verify no changes were committed
      const dbRes = await testPool.query<{ id: string; display_order: number }>(
        `SELECT id, display_order FROM category_sections WHERE id = $1;`,
        [sectionIds[0]]
      );
      expect(dbRes.rows[0].display_order).toBe(1);
    });
  });

  describe('6. Existing Category & Product APIs Preservation', () => {
    it('GET /api/categories returns active categories as expected', async () => {
      const res = await request(app).get('/api/categories');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveLength(3);
    });

    it('GET /api/admin/categories includes augmented section info', async () => {
      const res = await request(app)
        .get('/api/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveLength(3);

      const pantsCategory = res.body.data.find((c: any) => c.slug === 'pants');
      expect(pantsCategory).toBeDefined();
      expect(pantsCategory.section).toBeDefined();
      expect(pantsCategory.section.isEnabled).toBe(true);
      expect(pantsCategory.section.heading).toBe('Pants & Trousers');
      expect(pantsCategory.productCount).toBe(1);
    });
  });
});
