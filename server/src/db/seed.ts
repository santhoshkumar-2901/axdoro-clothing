import { env, isRemoteDatabase, isPooledNeonUrl, assertSecureTlsParameters } from '../config/env.js';

/**
 * Validates seed target connection URL based on environment, remote opt-in, and endpoint type.
 * Throws a safe, actionable error preventing unintentional data mutation in production or test.
 */
export function validateSeedTarget(
  targetUrl: string,
  nodeEnv: string = env.NODE_ENV,
  allowRemoteDev: boolean = env.ALLOW_REMOTE_DEV_DB
): void {
  if (!targetUrl) {
    throw new Error('SEED TARGET ERROR: No database connection URL provided.');
  }

  // Validate TLS parameters and reject insecure or malformed connection strings
  assertSecureTlsParameters(targetUrl);

  // 1. Strictly forbid seeding in production
  if (nodeEnv === 'production') {
    throw new Error(
      'PRODUCTION SAFETY GUARD: Seed script cannot and will not be executed in production environment.'
    );
  }

  // 2. Forbid seeding in test environment (tests seed their own data via test harness)
  if (nodeEnv === 'test') {
    throw new Error(
      'TEST ISOLATION GUARD: Seed script cannot be executed in test mode. Tests use dedicated test harness.'
    );
  }

  const isRemote = isRemoteDatabase(targetUrl);

  // 3. Forbid seeding remote database without explicit opt-in
  if (isRemote && !allowRemoteDev) {
    throw new Error(
      'STRICT LOCAL ISOLATION ABORT: Seed script targeting a remote database requires explicit ALLOW_REMOTE_DEV_DB=true in development.'
    );
  }

  // 4. Reject pooled endpoints
  if (isPooledNeonUrl(targetUrl)) {
    throw new Error(
      'UNSUPPORTED POOLED ENDPOINT: Seed operations cannot be executed against pooled connection endpoints (-pooler). ' +
        'Please configure MIGRATION_DATABASE_URL to use the Direct (non-pooled) Neon connection endpoint.'
    );
  }
}

/**
 * AXDORO Development Catalogue Seeder
 * Executes strictly against local development or explicitly authorized remote development databases.
 */
export async function seedLocalCatalogue(): Promise<void> {
  const targetUrl = env.MIGRATION_DATABASE_URL || env.DATABASE_URL;

  validateSeedTarget(targetUrl, env.NODE_ENV, env.ALLOW_REMOTE_DEV_DB);

  console.log('[Seed] Seeding development database catalogue...');

  const isRemote = isRemoteDatabase(targetUrl);
  const { Pool } = await import('pg');
  const seedPool = new Pool({
    connectionString: targetUrl,
    ssl: isRemote ? { rejectUnauthorized: true } : false,
    connectionTimeoutMillis: 10000,
  });

  const client = await seedPool.connect();
  try {
    await client.query('BEGIN');

    // Ensure axdoro_app has full access to tables created by axdoro_migrator
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'axdoro_app') THEN
          GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO axdoro_app;
          GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO axdoro_app;
          ALTER DEFAULT PRIVILEGES FOR ROLE axdoro_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO axdoro_app;
          ALTER DEFAULT PRIVILEGES FOR ROLE axdoro_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO axdoro_app;
          -- Explicitly enforce audit log append-only restriction
          REVOKE UPDATE, DELETE, TRUNCATE ON admin_audit_logs FROM axdoro_app;
          GRANT SELECT, INSERT ON admin_audit_logs TO axdoro_app;
        END IF;
      END
      $$;
    `);
    // 1. Seed Categories (T-Shirts and Shirts)
    const categoryRows = [
      {
        slug: 't-shirts',
        name: 'T-Shirts',
        description: 'Lightweight combed cotton tees including 140 GSM everyday foundations.',
        display_order: 1,
      },
      {
        slug: 'shirts',
        name: 'Shirts',
        description: 'Contemporary tailored weaves across Oxford, Linen, and Twill structures.',
        display_order: 2,
      },
    ];

    const categoryMap = new Map<string, string>();

    for (const cat of categoryRows) {
      const res = await client.query<{ id: string }>(
        `INSERT INTO categories (slug, name, description, display_order, is_active)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (slug) DO UPDATE
         SET name = EXCLUDED.name, description = EXCLUDED.description, display_order = EXCLUDED.display_order
         RETURNING id`,
        [cat.slug, cat.name, cat.description, cat.display_order]
      );
      categoryMap.set(cat.slug, res.rows[0].id);
    }

    // 2. Sample Products Data (Paise pricing: INR ₹1 = 100 paise)
    const sampleProducts = [
      {
        slug: 'axdoro-classic-crewneck-tee-140gsm',
        name: 'AXDORO Classic Crewneck T-Shirt',
        categorySlug: 't-shirts',
        description:
          'Engineered from combed breathable cotton for all-day comfort. Cut in a tailored regular silhouette that balances drape and structure. Ideal for everyday rotation and bulk team branding.',
        fabricSpec: '140 GSM',
        pricePaise: 69900, // ₹699
        originalPricePaise: 89900, // ₹899
        isFeatured: true,
        isNewArrival: false,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800&auto=format&fit=crop&q=80',
            alt: 'AXDORO Classic Crewneck T-Shirt Front View',
            isPrimary: true,
          },
          {
            url: 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800&auto=format&fit=crop&q=80',
            alt: 'AXDORO Classic Crewneck T-Shirt Detail View',
            isPrimary: false,
          },
          {
            url: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=800&auto=format&fit=crop&q=80',
            alt: 'AXDORO Classic Crewneck T-Shirt Back Profile',
            isPrimary: false,
          },
        ],
        variants: [
          { size: 'S', color: 'Pitch Black', hex: '#0f0f14', stock: 25 },
          { size: 'M', color: 'Pitch Black', hex: '#0f0f14', stock: 35 },
          { size: 'L', color: 'Pitch Black', hex: '#0f0f14', stock: 30 },
          { size: 'XL', color: 'Pitch Black', hex: '#0f0f14', stock: 20 },
          { size: 'XXL', color: 'Pitch Black', hex: '#0f0f14', stock: 10 },
          { size: 'M', color: 'Ice White', hex: '#faf6fc', stock: 20 },
          { size: 'L', color: 'Ice White', hex: '#faf6fc', stock: 20 },
          { size: 'M', color: 'Charcoal', hex: '#373543', stock: 15 },
        ],
      },
      {
        slug: 'axdoro-everyday-essential-tee-140gsm',
        name: 'Everyday Essential 140 GSM Tee',
        categorySlug: 't-shirts',
        description:
          'Ultra-soft single jersey knit with reinforced ribbed collar and double-stitched hems. Specifically optimized for comfortable daily wear with shape retention wash after wash.',
        fabricSpec: '140 GSM',
        pricePaise: 59900,
        originalPricePaise: 79900,
        isFeatured: false,
        isNewArrival: true,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=800&auto=format&fit=crop&q=80',
            alt: 'Everyday Essential 140 GSM Tee Front View',
            isPrimary: true,
          },
          {
            url: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800&auto=format&fit=crop&q=80',
            alt: 'Everyday Essential 140 GSM Tee Side Angle',
            isPrimary: false,
          },
        ],
        variants: [
          { size: 'S', color: 'Navy Blue', hex: '#1b2438', stock: 20 },
          { size: 'M', color: 'Navy Blue', hex: '#1b2438', stock: 25 },
          { size: 'L', color: 'Navy Blue', hex: '#1b2438', stock: 25 },
          { size: 'XL', color: 'Navy Blue', hex: '#1b2438', stock: 15 },
          { size: 'M', color: 'Ice White', hex: '#faf6fc', stock: 20 },
          { size: 'L', color: 'Olive Drab', hex: '#3e4a3b', stock: 15 },
        ],
      },
      {
        slug: 'axdoro-oversized-heavy-tee',
        name: 'AXDORO Heavyweight Relaxed Tee',
        categorySlug: 't-shirts',
        description:
          'Boxy drop-shoulder aesthetic tailored for contemporary streetwear styling. Denser hand-feel with a clean drape that maintains an architectural profile throughout the day.',
        pricePaise: 89900,
        originalPricePaise: 109900,
        isFeatured: true,
        isNewArrival: true,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=800&auto=format&fit=crop&q=80',
            alt: 'AXDORO Heavyweight Relaxed Tee Front',
            isPrimary: true,
          },
          {
            url: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800&auto=format&fit=crop&q=80',
            alt: 'AXDORO Heavyweight Relaxed Tee Fit',
            isPrimary: false,
          },
        ],
        variants: [
          { size: 'M', color: 'Lilac Mist', hex: '#8a6fa6', stock: 3 },
          { size: 'L', color: 'Lilac Mist', hex: '#8a6fa6', stock: 3 },
          { size: 'XL', color: 'Pitch Black', hex: '#0f0f14', stock: 2 },
        ],
      },
      {
        slug: 'axdoro-minimalist-pocket-tee-140gsm',
        name: 'AXDORO Minimalist Pocket Tee',
        categorySlug: 't-shirts',
        description:
          'Understated chest-pocket detailing on a breathable 140 GSM jersey foundation. Clean lines designed for layering under overshirts or wearing solo.',
        fabricSpec: '140 GSM',
        pricePaise: 64900,
        originalPricePaise: 79900,
        isFeatured: false,
        isNewArrival: false,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800&auto=format&fit=crop&q=80',
            alt: 'AXDORO Minimalist Pocket Tee Front',
            isPrimary: true,
          },
        ],
        variants: [
          { size: 'S', color: 'Pitch Black', hex: '#0f0f14', stock: 15 },
          { size: 'M', color: 'Pitch Black', hex: '#0f0f14', stock: 25 },
          { size: 'L', color: 'Pitch Black', hex: '#0f0f14', stock: 20 },
          { size: 'XL', color: 'Pitch Black', hex: '#0f0f14', stock: 10 },
        ],
      },
      {
        slug: 'axdoro-structured-oxford-shirt',
        name: 'Structured Oxford Button-Down',
        categorySlug: 'shirts',
        description:
          'Crafted from resilient pinpoint Oxford cloth featuring a crisp button-down collar and mother-of-pearl finish buttons. Pairs effortlessly with tailored trousers or denim.',
        pricePaise: 129900,
        originalPricePaise: 159900,
        isFeatured: true,
        isNewArrival: false,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800&auto=format&fit=crop&q=80',
            alt: 'Structured Oxford Button-Down Studio Shot',
            isPrimary: true,
          },
          {
            url: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=800&auto=format&fit=crop&q=80',
            alt: 'Structured Oxford Button-Down Collar Detail',
            isPrimary: false,
          },
        ],
        variants: [
          { size: '38 (S)', color: 'Ice White', hex: '#faf6fc', stock: 20 },
          { size: '40 (M)', color: 'Ice White', hex: '#faf6fc', stock: 30 },
          { size: '42 (L)', color: 'Ice White', hex: '#faf6fc', stock: 25 },
          { size: '44 (XL)', color: 'Ice White', hex: '#faf6fc', stock: 15 },
          { size: '40 (M)', color: 'Light Blue', hex: '#7a9ec2', stock: 20 },
          { size: '42 (L)', color: 'Light Blue', hex: '#7a9ec2', stock: 20 },
        ],
      },
      {
        slug: 'axdoro-modern-cuban-collar-shirt',
        name: 'AXDORO Relaxed Cuban Collar Shirt',
        categorySlug: 'shirts',
        description:
          'Camp collar resort silhouette in lightweight linen-cotton blend. Straight-hem finish with subtle side vents allows an unconstrained, elegant warm-weather drape.',
        pricePaise: 119900,
        originalPricePaise: 149900,
        isFeatured: false,
        isNewArrival: true,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=800&auto=format&fit=crop&q=80',
            alt: 'AXDORO Relaxed Cuban Collar Shirt',
            isPrimary: true,
          },
          {
            url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800&auto=format&fit=crop&q=80',
            alt: 'AXDORO Relaxed Cuban Collar Side Profile',
            isPrimary: false,
          },
        ],
        variants: [
          { size: '38 (S)', color: 'Midnight Navy', hex: '#1e1e2f', stock: 12 },
          { size: '40 (M)', color: 'Midnight Navy', hex: '#1e1e2f', stock: 18 },
          { size: '42 (L)', color: 'Midnight Navy', hex: '#1e1e2f', stock: 15 },
          { size: '40 (M)', color: 'Sage Green', hex: '#637563', stock: 10 },
        ],
      },
      {
        slug: 'axdoro-fine-twill-formal-shirt',
        name: 'Precision Fine Twill Formal Shirt',
        categorySlug: 'shirts',
        description:
          'Lustrous 80s two-ply twill weave tailored with a spread collar and convertible cuffs. Engineered for pristine shape retention throughout formal engagements.',
        pricePaise: 149900,
        originalPricePaise: 189900,
        isFeatured: true,
        isNewArrival: false,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1620012253295-c15c429f66bf?w=800&auto=format&fit=crop&q=80',
            alt: 'Precision Fine Twill Formal Shirt Front',
            isPrimary: true,
          },
          {
            url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800&auto=format&fit=crop&q=80',
            alt: 'Precision Fine Twill Cuff Detail',
            isPrimary: false,
          },
        ],
        variants: [
          { size: '38 (S)', color: 'Ice White', hex: '#faf6fc', stock: 15 },
          { size: '40 (M)', color: 'Ice White', hex: '#faf6fc', stock: 25 },
          { size: '42 (L)', color: 'Ice White', hex: '#faf6fc', stock: 20 },
          { size: '44 (XL)', color: 'Ice White', hex: '#faf6fc', stock: 10 },
          { size: '40 (M)', color: 'Silver Grey', hex: '#9e9eab', stock: 15 },
        ],
      },
      {
        slug: 'axdoro-casual-linen-overshirt',
        name: 'Contemporary Linen Blend Overshirt',
        categorySlug: 'shirts',
        description:
          'Substantial yet breathable linen-cotton hybrid overshirt with dual patch pockets. Layer over our 140 GSM tees for structured transitional outfits.',
        pricePaise: 139900,
        originalPricePaise: 169900,
        isFeatured: false,
        isNewArrival: true,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1598033129183-c4f50c736f10?w=800&auto=format&fit=crop&q=80',
            alt: 'Contemporary Linen Blend Overshirt Front',
            isPrimary: true,
          },
        ],
        variants: [
          { size: '38 (S)', color: 'Dark Olive', hex: '#2c3328', stock: 10 },
          { size: '40 (M)', color: 'Dark Olive', hex: '#2c3328', stock: 16 },
          { size: '42 (L)', color: 'Dark Olive', hex: '#2c3328', stock: 14 },
          { size: '40 (M)', color: 'Pitch Black', hex: '#0f0f14', stock: 12 },
        ],
      },
    ];

    for (const p of sampleProducts) {
      const categoryId = categoryMap.get(p.categorySlug);
      if (!categoryId) {
        throw new Error(`Category not found for slug: ${p.categorySlug}`);
      }

      // Upsert product
      const productRes = await client.query<{ id: string }>(
        `INSERT INTO products (slug, name, description, category_id, status, is_featured, is_new_arrival, fabric_spec)
         VALUES ($1, $2, $3, $4, 'published', $5, $6, $7)
         ON CONFLICT (slug) DO UPDATE
         SET name = EXCLUDED.name,
             description = EXCLUDED.description,
             category_id = EXCLUDED.category_id,
             status = 'published',
             is_featured = EXCLUDED.is_featured,
             is_new_arrival = EXCLUDED.is_new_arrival,
             fabric_spec = EXCLUDED.fabric_spec
         RETURNING id`,
        [p.slug, p.name, p.description, categoryId, p.isFeatured, p.isNewArrival, p.fabricSpec || null]
      );

      const productId = productRes.rows[0].id;

      // Clean existing variants and images for fresh idempotent re-seeding
      await client.query('DELETE FROM product_variants WHERE product_id = $1', [productId]);
      await client.query('DELETE FROM product_images WHERE product_id = $1', [productId]);

      // Insert variants
      for (const v of p.variants) {
        const sku = `${p.slug.toUpperCase().substring(0, 15)}-${v.size.replace(/[^A-Za-z0-9]/g, '')}-${v.color.replace(/[^A-Za-z0-9]/g, '').substring(0, 4)}`.toUpperCase();
        await client.query(
          `INSERT INTO product_variants
           (product_id, size, color, color_hex, sku, price_paise, comparison_price_paise, stock_quantity, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
          [productId, v.size, v.color, v.hex, sku, p.pricePaise, p.originalPricePaise || null, v.stock]
        );
      }

      // Insert images
      for (let idx = 0; idx < p.images.length; idx++) {
        const img = p.images[idx];
        await client.query(
          `INSERT INTO product_images
           (product_id, image_url, alt_text, display_order, is_primary)
           VALUES ($1, $2, $3, $4, $5)`,
          [productId, img.url, img.alt, idx, img.isPrimary]
        );
      }
    }
    await client.query('COMMIT');
    console.log('[Seed] Seeding completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await seedPool.end();
  }
}

// Direct execution from CLI
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() || '')) {
  seedLocalCatalogue()
    .then(() => {
      console.log('[Seed] Done.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Seed Error]', err.message);
      process.exit(1);
    });
}
