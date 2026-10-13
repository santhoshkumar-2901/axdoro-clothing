import { query, withTransaction } from '../config/db.js';
import { createAuditLog } from './audit-log.service.js';
import { AdminUserDTO } from './admin-auth.service.js';
import {
  productCreateSchema,
  productUpdateSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  productVariantSchema,
} from '../schemas/admin.js';
import { z } from 'zod';

export interface AdminCategoryRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
  productCount: number;
  createdAt: string;
}

export interface AdminProductSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  status: 'draft' | 'published' | 'archived';
  isFeatured: boolean;
  isNewArrival: boolean;
  fabricSpec?: string | null;
  minPricePaise: number;
  totalStock: number;
  variantCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminDashboardMetrics {
  totalProducts?: number;
  publishedProducts?: number;
  totalVariants?: number;
  lowStockVariants?: number;
  products: {
    total: number;
    published: number;
    draft: number;
    archived: number;
  };
  categories: {
    total: number;
    active: number;
    inactive: number;
  };
  variants: {
    total: number;
    active: number;
    totalStockUnits: number;
  };
  inventoryAlerts: {
    lowStockCount: number;
    outOfStockCount: number;
    criticalVariants: {
      variantId: string;
      productName: string;
      productSlug: string;
      sku: string;
      size: string;
      color: string;
      stockQuantity: number;
    }[];
  };
  auditLogsCount: number;
  enquiries: {
    available: boolean;
    message: string;
  };
  orders: {
    available: boolean;
    message: string;
  };
}

// -------------------------------------------------------------
// Category Management
// -------------------------------------------------------------

export async function adminGetCategories(): Promise<AdminCategoryRow[]> {
  const sql = `
    SELECT
      c.id,
      c.slug,
      c.name,
      c.description,
      c.display_order,
      c.is_active,
      c.created_at,
      COUNT(p.id)::int AS product_count
    FROM categories c
    LEFT JOIN products p ON p.category_id = c.id
    GROUP BY c.id
    ORDER BY c.display_order ASC, c.name ASC;
  `;
  const res = await query<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    display_order: number;
    is_active: boolean;
    created_at: Date;
    product_count: number;
  }>(sql);

  return res.rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    displayOrder: row.display_order,
    isActive: row.is_active,
    productCount: row.product_count,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function adminCreateCategory(
  data: z.infer<typeof categoryCreateSchema>,
  actor: AdminUserDTO
): Promise<{
  id: string;
  name: string;
  slug: string;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
}> {
  return await withTransaction(async (client) => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO categories (slug, name, description, display_order, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id;`,
      [data.slug, data.name, data.description || null, data.displayOrder, data.isActive]
    );

    const categoryId = res.rows[0].id;

    await createAuditLog({
      adminId: actor.id,
      adminEmail: actor.email,
      action: 'CATEGORY_CREATE',
      entityType: 'category',
      entityId: categoryId,
      details: { name: data.name, slug: data.slug },
      client,
    });

    return {
      id: categoryId,
      name: data.name,
      slug: data.slug,
      description: data.description || null,
      displayOrder: data.displayOrder,
      isActive: data.isActive,
    };
  });
}

export async function adminUpdateCategory(
  id: string,
  data: z.infer<typeof categoryUpdateSchema>,
  actor: AdminUserDTO
): Promise<void> {
  const setClauses: string[] = [];
  const params: unknown[] = [id];

  if (data.name !== undefined) {
    params.push(data.name);
    setClauses.push(`name = $${params.length}`);
  }
  if (data.slug !== undefined) {
    params.push(data.slug);
    setClauses.push(`slug = $${params.length}`);
  }
  if (data.description !== undefined) {
    params.push(data.description || null);
    setClauses.push(`description = $${params.length}`);
  }
  if (data.displayOrder !== undefined) {
    params.push(data.displayOrder);
    setClauses.push(`display_order = $${params.length}`);
  }
  if (data.isActive !== undefined) {
    params.push(data.isActive);
    setClauses.push(`is_active = $${params.length}`);
  }

  if (setClauses.length === 0) return;

  return await withTransaction(async (client) => {
    const sql = `UPDATE categories SET ${setClauses.join(', ')} WHERE id = $1;`;
    await client.query(sql, params);

    await createAuditLog({
      adminId: actor.id,
      adminEmail: actor.email,
      action: 'CATEGORY_UPDATE',
      entityType: 'category',
      entityId: id,
      details: data,
      client,
    });
  });
}

// -------------------------------------------------------------
// Product Management
// -------------------------------------------------------------

export async function adminGetProducts(params: {
  page?: number;
  limit?: number;
  status?: string;
  categoryId?: string;
  search?: string;
}): Promise<{ products: AdminProductSummary[]; totalCount: number; totalPages: number }> {
  const page = Math.max(params.page || 1, 1);
  const limit = Math.min(Math.max(params.limit || 20, 1), 100);
  const offset = (page - 1) * limit;

  const whereClauses: string[] = [];
  const queryParams: unknown[] = [];

  if (params.status && params.status !== 'all') {
    queryParams.push(params.status);
    whereClauses.push(`p.status = $${queryParams.length}`);
  }

  if (params.categoryId) {
    queryParams.push(params.categoryId);
    whereClauses.push(`p.category_id = $${queryParams.length}`);
  }

  if (params.search && params.search.trim()) {
    queryParams.push(`%${params.search.trim()}%`);
    const idx = queryParams.length;
    whereClauses.push(`(p.name ILIKE $${idx} OR p.slug ILIKE $${idx} OR p.description ILIKE $${idx})`);
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const countRes = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM products p ${whereSql};`,
    queryParams
  );
  const totalCount = parseInt(countRes.rows[0]?.count || '0', 10);
  const totalPages = Math.ceil(totalCount / limit) || 1;

  const dataParams = [...queryParams, limit, offset];
  const listSql = `
    SELECT
      p.id,
      p.slug,
      p.name,
      p.description,
      p.category_id,
      c.name AS category_name,
      c.slug AS category_slug,
      p.status,
      p.is_featured,
      p.is_new_arrival,
      p.fabric_spec,
      COALESCE(MIN(pv.price_paise), 0) AS min_price_paise,
      COALESCE(SUM(pv.stock_quantity), 0) AS total_stock,
      COUNT(pv.id)::int AS variant_count,
      p.created_at,
      p.updated_at
    FROM products p
    JOIN categories c ON p.category_id = c.id
    LEFT JOIN product_variants pv ON pv.product_id = p.id
    ${whereSql}
    GROUP BY p.id, c.name, c.slug
    ORDER BY p.created_at DESC
    LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length};
  `;

  const listRes = await query<{
    id: string;
    slug: string;
    name: string;
    description: string;
    category_id: string;
    category_name: string;
    category_slug: string;
    status: 'draft' | 'published' | 'archived';
    is_featured: boolean;
    is_new_arrival: boolean;
    fabric_spec: string | null;
    min_price_paise: number;
    total_stock: number;
    variant_count: number;
    created_at: Date;
    updated_at: Date;
  }>(listSql, dataParams);

  const products: AdminProductSummary[] = listRes.rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categorySlug: row.category_slug,
    status: row.status,
    isFeatured: row.is_featured,
    isNewArrival: row.is_new_arrival,
    fabricSpec: row.fabric_spec,
    minPricePaise: Number(row.min_price_paise),
    totalStock: Number(row.total_stock),
    variantCount: row.variant_count,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }));

  return { products, totalCount, totalPages };
}

export async function adminCreateProduct(
  data: z.infer<typeof productCreateSchema>,
  actor: AdminUserDTO
): Promise<{ id: string; slug: string }> {
  return await withTransaction(async (client) => {
    // 1. Insert product
    const prodRes = await client.query<{ id: string }>(
      `INSERT INTO products (
        slug, name, description, category_id, status, is_featured, is_new_arrival, fabric_spec
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id;`,
      [
        data.slug,
        data.name,
        data.description,
        data.categoryId,
        data.status,
        data.isFeatured,
        data.isNewArrival,
        data.fabricSpec || null,
      ]
    );

    const productId = prodRes.rows[0].id;

    // 2. Insert variants
    for (const v of data.variants) {
      if (v.comparisonPricePaise && v.comparisonPricePaise < v.pricePaise) {
        throw new Error(`Comparison price (${v.comparisonPricePaise}) cannot be less than selling price (${v.pricePaise})`);
      }
      await client.query(
        `INSERT INTO product_variants (
          product_id, size, color, color_hex, sku, price_paise, comparison_price_paise, stock_quantity, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
        [
          productId,
          v.size,
          v.color,
          v.colorHex || null,
          v.sku,
          v.pricePaise,
          v.comparisonPricePaise || null,
          v.stockQuantity,
          v.isActive,
        ]
      );
    }

    // 3. Insert images
    for (const img of data.images) {
      await client.query(
        `INSERT INTO product_images (product_id, image_url, alt_text, display_order, is_primary)
         VALUES ($1, $2, $3, $4, $5);`,
        [productId, img.imageUrl, img.altText || null, img.displayOrder, img.isPrimary]
      );
    }

    // 4. Audit log
    await createAuditLog({
      adminId: actor.id,
      adminEmail: actor.email,
      action: 'PRODUCT_CREATE',
      entityType: 'product',
      entityId: productId,
      details: { slug: data.slug, name: data.name, status: data.status, variantCount: data.variants.length },
      client,
    });

    const createdProduct = await adminGetProductById(productId, client);
    return createdProduct || { id: productId, slug: data.slug, status: data.status };
  });
}

export async function adminGetProductById(id: string, client?: any): Promise<any | null> {
  const runner = client ? client.query.bind(client) : query;
  const prodRes = await runner(
    `SELECT p.*, c.name as category_name, c.slug as category_slug
     FROM products p
     JOIN categories c ON p.category_id = c.id
     WHERE p.id = $1;`,
    [id]
  );
  if (prodRes.rows.length === 0) return null;
  const product = prodRes.rows[0];

  const varRes = await runner(
    `SELECT * FROM product_variants WHERE product_id = $1 ORDER BY size ASC;`,
    [id]
  );
  product.variants = varRes.rows.map((v: any) => ({
    id: v.id,
    productId: v.product_id,
    size: v.size,
    color: v.color,
    colorHex: v.color_hex,
    sku: v.sku,
    pricePaise: v.price_paise,
    comparisonPricePaise: v.comparison_price_paise,
    stockQuantity: v.stock_quantity,
    isActive: v.is_active,
  }));

  const imgRes = await runner(
    `SELECT * FROM product_images WHERE product_id = $1 ORDER BY display_order ASC;`,
    [id]
  );
  product.images = imgRes.rows.map((i: any) => ({
    id: i.id,
    productId: i.product_id,
    imageUrl: i.image_url,
    altText: i.alt_text,
    displayOrder: i.display_order,
    isPrimary: i.is_primary,
  }));

  return product;
}

export async function adminUpdateProduct(
  id: string,
  data: z.infer<typeof productUpdateSchema>,
  actor: AdminUserDTO
): Promise<void> {
  const setClauses: string[] = [];
  const params: unknown[] = [id];

  if (data.name !== undefined) {
    params.push(data.name);
    setClauses.push(`name = $${params.length}`);
  }
  if (data.slug !== undefined) {
    params.push(data.slug);
    setClauses.push(`slug = $${params.length}`);
  }
  if (data.description !== undefined) {
    params.push(data.description);
    setClauses.push(`description = $${params.length}`);
  }
  if (data.categoryId !== undefined) {
    params.push(data.categoryId);
    setClauses.push(`category_id = $${params.length}`);
  }
  if (data.status !== undefined) {
    params.push(data.status);
    setClauses.push(`status = $${params.length}`);
  }
  if (data.isFeatured !== undefined) {
    params.push(data.isFeatured);
    setClauses.push(`is_featured = $${params.length}`);
  }
  if (data.isNewArrival !== undefined) {
    params.push(data.isNewArrival);
    setClauses.push(`is_new_arrival = $${params.length}`);
  }
  if (data.fabricSpec !== undefined) {
    params.push(data.fabricSpec || null);
    setClauses.push(`fabric_spec = $${params.length}`);
  }

  if (setClauses.length === 0) return;

  return await withTransaction(async (client) => {
    const sql = `UPDATE products SET ${setClauses.join(', ')} WHERE id = $1;`;
    await client.query(sql, params);

    await createAuditLog({
      adminId: actor.id,
      adminEmail: actor.email,
      action: 'PRODUCT_UPDATE',
      entityType: 'product',
      entityId: id,
      details: data,
      client,
    });
  });
}

export async function adminArchiveProduct(id: string, actor: AdminUserDTO): Promise<void> {
  return await withTransaction(async (client) => {
    const res = await client.query<{ slug: string }>(
      `UPDATE products SET status = 'archived' WHERE id = $1 RETURNING slug;`,
      [id]
    );

    if (res.rows.length === 0) {
      throw new Error('Product not found');
    }

    await createAuditLog({
      adminId: actor.id,
      adminEmail: actor.email,
      action: 'PRODUCT_ARCHIVE',
      entityType: 'product',
      entityId: id,
      details: { slug: res.rows[0].slug },
      client,
    });
  });
}

// -------------------------------------------------------------
// Variant & Inventory Management
// -------------------------------------------------------------

export async function adminCreateVariant(
  productId: string,
  data: z.infer<typeof productVariantSchema>,
  actor: AdminUserDTO
): Promise<{ id: string }> {
  if (data.comparisonPricePaise && data.comparisonPricePaise < data.pricePaise) {
    throw new Error('Comparison price cannot be less than selling price');
  }

  return await withTransaction(async (client) => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO product_variants (
        product_id, size, color, color_hex, sku, price_paise, comparison_price_paise, stock_quantity, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id;`,
      [
        productId,
        data.size,
        data.color,
        data.colorHex || null,
        data.sku,
        data.pricePaise,
        data.comparisonPricePaise || null,
        data.stockQuantity,
        data.isActive,
      ]
    );

    const variantId = res.rows[0].id;

    await createAuditLog({
      adminId: actor.id,
      adminEmail: actor.email,
      action: 'VARIANT_CREATE',
      entityType: 'variant',
      entityId: variantId,
      details: { productId, sku: data.sku, pricePaise: data.pricePaise, stock: data.stockQuantity },
      client,
    });

    return { id: variantId };
  });
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function adminUpdateVariant(
  productId: string,
  variantId: string,
  data: Partial<z.infer<typeof productVariantSchema>>,
  actor: AdminUserDTO
): Promise<boolean> {
  // Validate UUID formats to safely reject malformed identifiers
  if (!UUID_REGEX.test(productId) || !UUID_REGEX.test(variantId)) {
    return false;
  }

  if (
    data.comparisonPricePaise !== undefined &&
    data.pricePaise !== undefined &&
    data.comparisonPricePaise !== null &&
    data.comparisonPricePaise < data.pricePaise
  ) {
    throw new Error('Comparison price cannot be less than selling price');
  }

  const setClauses: string[] = [];
  const params: unknown[] = [variantId, productId];

  if (data.size !== undefined) {
    params.push(data.size);
    setClauses.push(`size = $${params.length}`);
  }
  if (data.color !== undefined) {
    params.push(data.color);
    setClauses.push(`color = $${params.length}`);
  }
  if (data.colorHex !== undefined) {
    params.push(data.colorHex || null);
    setClauses.push(`color_hex = $${params.length}`);
  }
  if (data.sku !== undefined) {
    params.push(data.sku);
    setClauses.push(`sku = $${params.length}`);
  }
  if (data.pricePaise !== undefined) {
    params.push(data.pricePaise);
    setClauses.push(`price_paise = $${params.length}`);
  }
  if (data.comparisonPricePaise !== undefined) {
    params.push(data.comparisonPricePaise || null);
    setClauses.push(`comparison_price_paise = $${params.length}`);
  }
  if (data.isActive !== undefined) {
    params.push(data.isActive);
    setClauses.push(`is_active = $${params.length}`);
  }

  return await withTransaction(async (client) => {
    if (setClauses.length === 0) {
      // If no fields to update, verify that the variant exists under this product
      const checkRes = await client.query<{ id: string }>(
        `SELECT id FROM product_variants WHERE id = $1 AND product_id = $2;`,
        [variantId, productId]
      );
      return checkRes.rows.length > 0;
    }

    const sql = `UPDATE product_variants SET ${setClauses.join(', ')} WHERE id = $1 AND product_id = $2 RETURNING id;`;
    const res = await client.query<{ id: string }>(sql, params);

    if ((res.rowCount ?? 0) === 0 || res.rows.length === 0) {
      return false;
    }

    await createAuditLog({
      adminId: actor.id,
      adminEmail: actor.email,
      action: 'VARIANT_UPDATE',
      entityType: 'variant',
      entityId: variantId,
      details: { productId, ...data },
      client,
    });

    return true;
  });
}

/**
 * Adjusts inventory atomically and records previous quantity, new quantity, and adjustment reason.
 */
export async function adminAdjustStock(
  variantId: string,
  target: number | { quantity?: number; adjustment?: number },
  reason: string,
  actor: AdminUserDTO
): Promise<{ previousQuantity: number; newQuantity: number; previousStock: number; stockQuantity: number }> {
  return await withTransaction(async (client) => {
    // 1. Lock row for update
    const prevRes = await client.query<{ stock_quantity: number; sku: string; product_id: string }>(
      `SELECT stock_quantity, sku, product_id FROM product_variants WHERE id = $1 FOR UPDATE;`,
      [variantId]
    );

    if (prevRes.rows.length === 0) {
      throw new Error('Variant not found');
    }

    const previousQuantity = prevRes.rows[0].stock_quantity;
    const sku = prevRes.rows[0].sku;
    const productId = prevRes.rows[0].product_id;

    let newQuantity: number;
    if (typeof target === 'number') {
      newQuantity = target;
    } else if (target.adjustment !== undefined) {
      newQuantity = previousQuantity + target.adjustment;
    } else if (target.quantity !== undefined) {
      newQuantity = target.quantity;
    } else {
      throw new Error('Either quantity or adjustment must be provided');
    }

    if (newQuantity < 0) {
      throw new Error('Insufficient stock: adjustment would result in negative quantity');
    }

    // 2. Update stock
    await client.query(`UPDATE product_variants SET stock_quantity = $1 WHERE id = $2;`, [
      newQuantity,
      variantId,
    ]);

    // 3. Log stock adjustment audit trail
    await createAuditLog({
      adminId: actor.id,
      adminEmail: actor.email,
      action: 'STOCK_ADJUSTMENT',
      entityType: 'variant',
      entityId: variantId,
      details: {
        productId,
        sku,
        previousQuantity,
        newQuantity,
        delta: newQuantity - previousQuantity,
        reason,
      },
      client,
    });

    return {
      previousQuantity,
      newQuantity,
      previousStock: previousQuantity,
      stockQuantity: newQuantity,
    };
  });
}

// -------------------------------------------------------------
// Dashboard Metrics
// -------------------------------------------------------------

export async function adminGetDashboardMetrics(): Promise<AdminDashboardMetrics> {
  // Products breakdown
  const prodRes = await query<{
    total: string;
    published: string;
    draft: string;
    archived: string;
  }>(`
    SELECT
      COUNT(*)::text as total,
      COUNT(*) FILTER (WHERE status = 'published')::text as published,
      COUNT(*) FILTER (WHERE status = 'draft')::text as draft,
      COUNT(*) FILTER (WHERE status = 'archived')::text as archived
    FROM products;
  `);
  const p = prodRes.rows[0];

  // Categories breakdown
  const catRes = await query<{
    total: string;
    active: string;
    inactive: string;
  }>(`
    SELECT
      COUNT(*)::text as total,
      COUNT(*) FILTER (WHERE is_active = true)::text as active,
      COUNT(*) FILTER (WHERE is_active = false)::text as inactive
    FROM categories;
  `);
  const c = catRes.rows[0];

  // Variants breakdown
  const varRes = await query<{
    total: string;
    active: string;
    total_stock_units: string;
  }>(`
    SELECT
      COUNT(*)::text as total,
      COUNT(*) FILTER (WHERE is_active = true)::text as active,
      COALESCE(SUM(stock_quantity), 0)::text as total_stock_units
    FROM product_variants;
  `);
  const v = varRes.rows[0];

  // Inventory alerts: low stock (< 10) & out of stock (= 0)
  const lowStockRes = await query<{
    variant_id: string;
    product_name: string;
    product_slug: string;
    sku: string;
    size: string;
    color: string;
    stock_quantity: number;
  }>(`
    SELECT
      pv.id AS variant_id,
      p.name AS product_name,
      p.slug AS product_slug,
      pv.sku,
      pv.size,
      pv.color,
      pv.stock_quantity
    FROM product_variants pv
    JOIN products p ON pv.product_id = p.id
    WHERE pv.stock_quantity < 10 AND pv.is_active = true AND p.status = 'published'
    ORDER BY pv.stock_quantity ASC, p.name ASC
    LIMIT 10;
  `);

  const alertsRes = await query<{
    low_stock_count: string;
    out_of_stock_count: string;
  }>(`
    SELECT
      COUNT(*) FILTER (WHERE pv.stock_quantity < 10 AND pv.stock_quantity > 0 AND pv.is_active = true)::text as low_stock_count,
      COUNT(*) FILTER (WHERE pv.stock_quantity = 0 AND pv.is_active = true)::text as out_of_stock_count
    FROM product_variants pv;
  `);
  const a = alertsRes.rows[0];

  // Audit logs count
  const auditRes = await query<{ count: string }>(`SELECT COUNT(*)::text as count FROM admin_audit_logs;`);

  return {
    totalProducts: parseInt(p?.total || '0', 10),
    publishedProducts: parseInt(p?.published || '0', 10),
    totalVariants: parseInt(v?.total || '0', 10),
    lowStockVariants: parseInt(a?.low_stock_count || '0', 10),
    products: {
      total: parseInt(p?.total || '0', 10),
      published: parseInt(p?.published || '0', 10),
      draft: parseInt(p?.draft || '0', 10),
      archived: parseInt(p?.archived || '0', 10),
    },
    categories: {
      total: parseInt(c?.total || '0', 10),
      active: parseInt(c?.active || '0', 10),
      inactive: parseInt(c?.inactive || '0', 10),
    },
    variants: {
      total: parseInt(v?.total || '0', 10),
      active: parseInt(v?.active || '0', 10),
      totalStockUnits: parseInt(v?.total_stock_units || '0', 10),
    },
    inventoryAlerts: {
      lowStockCount: parseInt(a?.low_stock_count || '0', 10),
      outOfStockCount: parseInt(a?.out_of_stock_count || '0', 10),
      criticalVariants: lowStockRes.rows.map((row) => ({
        variantId: row.variant_id,
        productName: row.product_name,
        productSlug: row.product_slug,
        sku: row.sku,
        size: row.size,
        color: row.color,
        stockQuantity: row.stock_quantity,
      })),
    },
    auditLogsCount: parseInt(auditRes.rows[0]?.count || '0', 10),
    enquiries: {
      available: false,
      message: 'Enquiries persistence and admin review scheduled for Phase 4',
    },
    orders: {
      available: false,
      message: 'Order management scheduled for Phase 5',
    },
  };
}
