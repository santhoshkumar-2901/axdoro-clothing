import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import {
  initializeTestDatabase,
  truncateTestCatalogue,
  closeTestDatabase,
  testPool,
  validateTestDatabaseTarget,
} from './test-db.js';

describe('Real PostgreSQL Catalogue Integration Tests (axdoro_test)', () => {
  let categoryTshirtsId: string;
  let categoryShirtsId: string;
  let publishedTeeId: string;
  let publishedShirtId: string;
  let draftProductId: string;

  beforeAll(async () => {
    await initializeTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  beforeEach(async () => {
    await truncateTestCatalogue();

    const client = await testPool.connect();
    try {
      // 1. Insert Categories
      const cat1 = await client.query<{ id: string }>(
        `INSERT INTO categories (slug, name, description, display_order, is_active)
         VALUES ('t-shirts', 'T-Shirts', 'Combed tees including 140 GSM lightweight fabric', 1, true)
         RETURNING id`
      );
      categoryTshirtsId = cat1.rows[0].id;

      const cat2 = await client.query<{ id: string }>(
        `INSERT INTO categories (slug, name, description, display_order, is_active)
         VALUES ('shirts', 'Shirts', 'Tailored shirts across weaves', 2, true)
         RETURNING id`
      );
      categoryShirtsId = cat2.rows[0].id;

      // 2. Insert Published T-Shirt
      const p1 = await client.query<{ id: string }>(
        `INSERT INTO products (slug, name, description, category_id, status, is_featured, is_new_arrival, fabric_spec)
         VALUES ('axdoro-classic-140gsm-tee', 'Classic 140 GSM Tee', 'Everyday combed foundation tee', $1, 'published', true, false, '140 GSM')
         RETURNING id`,
        [categoryTshirtsId]
      );
      publishedTeeId = p1.rows[0].id;

      // Variants for p1
      await client.query(
        `INSERT INTO product_variants (product_id, size, color, color_hex, sku, price_paise, comparison_price_paise, stock_quantity, is_active)
         VALUES
         ($1, 'M', 'Pitch Black', '#0f0f14', 'AX-TEE-M-BLK', 69900, 89900, 20, true),
         ($1, 'L', 'Pitch Black', '#0f0f14', 'AX-TEE-L-BLK', 69900, 89900, 15, true)`,
        [publishedTeeId]
      );

      // Image for p1
      await client.query(
        `INSERT INTO product_images (product_id, image_url, alt_text, display_order, is_primary)
         VALUES ($1, 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518', 'Classic Tee Front', 0, true)`,
        [publishedTeeId]
      );

      // 3. Insert Published Shirt
      const p2 = await client.query<{ id: string }>(
        `INSERT INTO products (slug, name, description, category_id, status, is_featured, is_new_arrival)
         VALUES ('axdoro-oxford-shirt', 'Oxford Button Down', 'Crisp cotton weave for smart casual', $1, 'published', false, true)
         RETURNING id`,
        [categoryShirtsId]
      );
      publishedShirtId = p2.rows[0].id;

      await client.query(
        `INSERT INTO product_variants (product_id, size, color, color_hex, sku, price_paise, comparison_price_paise, stock_quantity, is_active)
         VALUES
         ($1, '40 (M)', 'Ice White', '#faf6fc', 'AX-SHT-40-WHT', 129900, 159900, 25, true)`,
        [publishedShirtId]
      );

      await client.query(
        `INSERT INTO product_images (product_id, image_url, alt_text, display_order, is_primary)
         VALUES ($1, 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c', 'Oxford Shirt Front', 0, true)`,
        [publishedShirtId]
      );

      // 4. Insert Draft Product (Should NOT be visible publicly)
      const p3 = await client.query<{ id: string }>(
        `INSERT INTO products (slug, name, description, category_id, status, is_featured)
         VALUES ('axdoro-secret-prototype', 'Unreleased Prototype', 'Internal testing only', $1, 'draft', false)
         RETURNING id`,
        [categoryTshirtsId]
      );
      draftProductId = p3.rows[0].id;

      await client.query(
        `INSERT INTO product_variants (product_id, size, color, sku, price_paise, stock_quantity, is_active)
         VALUES ($1, 'M', 'Black', 'AX-PROTO-M', 99900, 1, true)`,
        [draftProductId]
      );
    } finally {
      client.release();
    }
  });

  describe('Database Schema Constraints & Integrity', () => {
    it('fails when inserting duplicate product slug', async () => {
      const client = await testPool.connect();
      try {
        await expect(
          client.query(
            `INSERT INTO products (slug, name, category_id, status)
             VALUES ('axdoro-classic-140gsm-tee', 'Duplicate Slug Tee', $1, 'published')`,
            [categoryTshirtsId]
          )
        ).rejects.toThrow();
      } finally {
        client.release();
      }
    });

    it('fails when inserting duplicate variant SKU', async () => {
      const client = await testPool.connect();
      try {
        await expect(
          client.query(
            `INSERT INTO product_variants (product_id, size, color, sku, price_paise, stock_quantity)
             VALUES ($1, 'XL', 'Pitch Black', 'AX-TEE-M-BLK', 69900, 5)`,
            [publishedTeeId]
          )
        ).rejects.toThrow();
      } finally {
        client.release();
      }
    });

    it('fails when inserting duplicate variant size and color for the same product', async () => {
      const client = await testPool.connect();
      try {
        await expect(
          client.query(
            `INSERT INTO product_variants (product_id, size, color, sku, price_paise, stock_quantity)
             VALUES ($1, 'M', 'Pitch Black', 'AX-TEE-M-BLK-2', 69900, 5)`,
            [publishedTeeId]
          )
        ).rejects.toThrow();
      } finally {
        client.release();
      }
    });

    it('enforces non-negative price_paise constraint', async () => {
      const client = await testPool.connect();
      try {
        await expect(
          client.query(
            `INSERT INTO product_variants (product_id, size, color, sku, price_paise, stock_quantity)
             VALUES ($1, 'S', 'Black', 'AX-NEG-PRICE', -100, 5)`,
            [publishedTeeId]
          )
        ).rejects.toThrow();
      } finally {
        client.release();
      }
    });

    it('enforces comparison price >= price constraint', async () => {
      const client = await testPool.connect();
      try {
        await expect(
          client.query(
            `INSERT INTO product_variants (product_id, size, color, sku, price_paise, comparison_price_paise, stock_quantity)
             VALUES ($1, 'S', 'Black', 'AX-BAD-COMP', 100000, 50000, 5)`,
            [publishedTeeId]
          )
        ).rejects.toThrow();
      } finally {
        client.release();
      }
    });

    it('enforces non-negative stock_quantity constraint', async () => {
      const client = await testPool.connect();
      try {
        await expect(
          client.query(
            `INSERT INTO product_variants (product_id, size, color, sku, price_paise, stock_quantity)
             VALUES ($1, 'S', 'Black', 'AX-NEG-STOCK', 69900, -5)`,
            [publishedTeeId]
          )
        ).rejects.toThrow();
      } finally {
        client.release();
      }
    });

    it('cascades deletion of variants and images when product is deleted', async () => {
      const client = await testPool.connect();
      try {
        await client.query('DELETE FROM products WHERE id = $1', [publishedShirtId]);
        const variants = await client.query('SELECT * FROM product_variants WHERE product_id = $1', [publishedShirtId]);
        const images = await client.query('SELECT * FROM product_images WHERE product_id = $1', [publishedShirtId]);
        expect(variants.rows.length).toBe(0);
        expect(images.rows.length).toBe(0);
      } finally {
        client.release();
      }
    });
  });

  describe('Public Categories API: GET /api/categories', () => {
    it('returns all active categories ordered by display_order', async () => {
      const res = await request(app).get('/api/categories');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.length).toBe(2);
      expect(res.body.data[0].slug).toBe('t-shirts');
      expect(res.body.data[1].slug).toBe('shirts');
    });
  });

  describe('Public Products Listing API: GET /api/products', () => {
    it('returns published products with pagination metadata and excludes drafts', async () => {
      const res = await request(app).get('/api/products');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.length).toBe(2);
      expect(res.body.pagination.totalCount).toBe(2);
      expect(res.body.pagination.page).toBe(1);

      // Verify draft product is NOT included
      const slugs = res.body.data.map((p: { slug: string }) => p.slug);
      expect(slugs).toContain('axdoro-classic-140gsm-tee');
      expect(slugs).toContain('axdoro-oxford-shirt');
      expect(slugs).not.toContain('axdoro-secret-prototype');
    });

    it('filters products by category slug', async () => {
      const res = await request(app).get('/api/products?category=t-shirts');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].slug).toBe('axdoro-classic-140gsm-tee');
      expect(res.body.data[0].fabricSpec).toBe('140 GSM');
    });

    it('searches products by keyword in name, description, or fabric spec', async () => {
      const res1 = await request(app).get('/api/products?search=140%20GSM');
      expect(res1.status).toBe(200);
      expect(res1.body.data.length).toBe(1);
      expect(res1.body.data[0].slug).toBe('axdoro-classic-140gsm-tee');

      const res2 = await request(app).get('/api/products?search=oxford');
      expect(res2.status).toBe(200);
      expect(res2.body.data.length).toBe(1);
      expect(res2.body.data[0].slug).toBe('axdoro-oxford-shirt');
    });

    it('sorts products by price ascending and descending', async () => {
      const resAsc = await request(app).get('/api/products?sort=price-asc');
      expect(resAsc.status).toBe(200);
      expect(resAsc.body.data[0].slug).toBe('axdoro-classic-140gsm-tee'); // ₹699
      expect(resAsc.body.data[1].slug).toBe('axdoro-oxford-shirt'); // ₹1299

      const resDesc = await request(app).get('/api/products?sort=price-desc');
      expect(resDesc.status).toBe(200);
      expect(resDesc.body.data[0].slug).toBe('axdoro-oxford-shirt'); // ₹1299
      expect(resDesc.body.data[1].slug).toBe('axdoro-classic-140gsm-tee'); // ₹699
    });

    it('handles pagination boundaries properly', async () => {
      const resPage2 = await request(app).get('/api/products?page=2&limit=1');
      expect(resPage2.status).toBe(200);
      expect(resPage2.body.data.length).toBe(1);
      expect(resPage2.body.pagination.page).toBe(2);
      expect(resPage2.body.pagination.totalPages).toBe(2);
      expect(resPage2.body.pagination.hasMore).toBe(false);

      const resPage3 = await request(app).get('/api/products?page=3&limit=1');
      expect(resPage3.status).toBe(200);
      expect(resPage3.body.data.length).toBe(0);
    });

    it('rejects invalid sort option with 400 Bad Request', async () => {
      const res = await request(app).get('/api/products?sort=DROP_TABLE');
      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toContain('sort');
    });

    it('rejects invalid page parameters with 400 Bad Request', async () => {
      const res = await request(app).get('/api/products?page=0');
      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
    });
  });

  describe('Public Product Detail API: GET /api/products/:slug', () => {
    it('returns full product details including variants and gallery images', async () => {
      const res = await request(app).get('/api/products/axdoro-classic-140gsm-tee');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      const p = res.body.data;
      expect(p.name).toBe('Classic 140 GSM Tee');
      expect(p.fabricSpec).toBe('140 GSM');
      expect(p.pricePaise).toBe(69900);
      expect(p.price).toBe(699);
      expect(p.originalPricePaise).toBe(89900);
      expect(p.originalPrice).toBe(899);
      expect(p.variants.length).toBe(2);
      expect(p.sizes).toEqual(expect.arrayContaining(['M', 'L']));
      expect(p.images.length).toBe(1);
      expect(p.allImages[0].isPrimary).toBe(true);
    });

    it('returns 404 Not Found for non-existent product slug', async () => {
      const res = await request(app).get('/api/products/unknown-clothing-item');
      expect(res.status).toBe(404);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toBe('Product not found');
    });

    it('returns 404 Not Found for unpublished draft product', async () => {
      const res = await request(app).get('/api/products/axdoro-secret-prototype');
      expect(res.status).toBe(404);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toBe('Product not found');
    });

    it('returns 400 Bad Request for malformed slug parameter', async () => {
      const res = await request(app).get('/api/products/INVALID_SLUG_WITH_UPPERCASE');
      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
    });
  });

  describe('Test Database Isolation Safety Guard', () => {
    it('strictly refuses connection strings targeting non-test databases', () => {
      expect(() =>
        validateTestDatabaseTarget('postgresql://user:pass@localhost:5432/axdoro_dev')
      ).toThrow('TEST DB SAFETY GUARD');
    });

    it('strictly refuses connection strings targeting remote databases', () => {
      expect(() =>
        validateTestDatabaseTarget('postgresql://user:pass@ep-cool.ap-southeast-1.aws.neon.tech/axdoro_test')
      ).toThrow('STRICT LOCAL ISOLATION ERROR');
    });
  });
});
