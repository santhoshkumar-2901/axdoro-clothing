import { query, withTransaction } from '../config/db.js';
import { createAuditLog } from './audit-log.service.js';
import { AdminUserDTO } from './admin-auth.service.js';
import {
  productCreateSchema,
  productUpdateSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  productVariantSchema,
  productImageAddSchema,
  productImageUpdateSchema,
  productImageReorderSchema,
  homepageCollectionUpdateSchema,
} from '../schemas/admin.js';
import { deleteCloudinaryAsset } from './cloudinary.service.js';
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
  imageUrl?: string | null;
  publicId?: string | null;
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
  minComparisonPricePaise?: number | null;
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
      c.image_url,
      c.public_id,
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
    image_url: string | null;
    public_id: string | null;
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
    imageUrl: row.image_url || null,
    publicId: row.public_id || null,
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
  imageUrl?: string | null;
  publicId?: string | null;
}> {
  return await withTransaction(async (client) => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO categories (slug, name, description, display_order, is_active, image_url, public_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id;`,
      [
        data.slug,
        data.name,
        data.description || null,
        data.displayOrder,
        data.isActive,
        data.imageUrl || null,
        data.publicId || null,
      ]
    );

    const categoryId = res.rows[0].id;

    await createAuditLog({
      adminId: actor.id,
      adminEmail: actor.email,
      action: 'CATEGORY_CREATE',
      entityType: 'category',
      entityId: categoryId,
      details: { name: data.name, slug: data.slug, imageUrl: data.imageUrl, publicId: data.publicId },
      client,
    });

    return {
      id: categoryId,
      name: data.name,
      slug: data.slug,
      description: data.description || null,
      displayOrder: data.displayOrder,
      isActive: data.isActive,
      imageUrl: data.imageUrl || null,
      publicId: data.publicId || null,
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
  if (data.imageUrl !== undefined) {
    params.push(data.imageUrl || null);
    setClauses.push(`image_url = $${params.length}`);
  }
  if (data.publicId !== undefined) {
    params.push(data.publicId || null);
    setClauses.push(`public_id = $${params.length}`);
  }

  if (setClauses.length === 0) return;

  let oldPublicId: string | null = null;

  await withTransaction(async (client) => {
    // 1. Lock existing category row and capture previous publicId for safe post-commit cleanup
    const existingRes = await client.query<{ public_id: string | null }>(
      `SELECT public_id FROM categories WHERE id = $1 FOR UPDATE;`,
      [id]
    );
    if (existingRes.rows.length > 0) {
      oldPublicId = existingRes.rows[0].public_id;
    }

    // 2. Perform atomic update
    const sql = `UPDATE categories SET ${setClauses.join(', ')} WHERE id = $1;`;
    await client.query(sql, params);

    // 3. Record audit log
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

  // 4. Safe post-commit Cloudinary deletion if a previous hosted asset was replaced
  if (
    oldPublicId &&
    data.publicId !== undefined &&
    data.publicId !== oldPublicId
  ) {
    try {
      await deleteCloudinaryAsset(oldPublicId);
    } catch (err: unknown) {
      console.warn(`[Cloudinary] Asset deletion warning for category asset '${oldPublicId}':`, err);
    }
  }
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
      COALESCE(
        (
          SELECT pv_min.comparison_price_paise
          FROM product_variants pv_min
          WHERE pv_min.product_id = p.id
          ORDER BY pv_min.price_paise ASC, pv_min.created_at ASC
          LIMIT 1
        ),
        0
      ) AS min_comparison_price_paise,
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
    min_comparison_price_paise: number;
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
    minComparisonPricePaise: row.min_comparison_price_paise ? Number(row.min_comparison_price_paise) : null,
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
        `INSERT INTO product_images (product_id, image_url, alt_text, display_order, is_primary, public_id, width, height, format, bytes, color)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);`,
        [
          productId,
          img.imageUrl,
          img.altText || null,
          img.displayOrder,
          img.isPrimary,
          img.publicId || null,
          img.width || null,
          img.height || null,
          img.format || null,
          img.bytes || null,
          img.color || null,
        ]
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
    `SELECT * FROM product_images WHERE product_id = $1 ORDER BY display_order ASC, created_at ASC;`,
    [id]
  );
  product.images = imgRes.rows.map((i: any) => ({
    id: i.id,
    productId: i.product_id,
    imageUrl: i.image_url,
    altText: i.alt_text,
    displayOrder: i.display_order,
    isPrimary: i.is_primary,
    publicId: i.public_id,
    width: i.width,
    height: i.height,
    format: i.format,
    bytes: i.bytes,
    color: i.color || null,
    createdAt: i.created_at,
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

export async function adminUnarchiveProduct(id: string, actor: AdminUserDTO): Promise<void> {
  return await withTransaction(async (client) => {
    const res = await client.query<{ slug: string }>(
      `UPDATE products SET status = 'published' WHERE id = $1 RETURNING slug;`,
      [id]
    );

    if (res.rows.length === 0) {
      throw new Error('Product not found');
    }

    await createAuditLog({
      adminId: actor.id,
      adminEmail: actor.email,
      action: 'PRODUCT_UNARCHIVE',
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
    // 1. Lock and fetch current variant row to verify existence and protect against concurrent stock mutations
    const prevRes = await client.query<{
      id: string;
      stock_quantity: number;
      sku: string;
      price_paise: number;
      comparison_price_paise: number | null;
    }>(
      `SELECT id, stock_quantity, sku, price_paise, comparison_price_paise FROM product_variants WHERE id = $1 AND product_id = $2 FOR UPDATE;`,
      [variantId, productId]
    );

    if (prevRes.rows.length === 0) {
      return false;
    }

    const currentVariant = prevRes.rows[0];

    // Check cross-price comparison if either selling or comparison price was updated individually
    const effectivePrice = data.pricePaise !== undefined ? data.pricePaise : currentVariant.price_paise;
    const effectiveCompPrice =
      data.comparisonPricePaise !== undefined ? data.comparisonPricePaise : currentVariant.comparison_price_paise;
    if (effectiveCompPrice !== null && effectiveCompPrice !== undefined && effectiveCompPrice < effectivePrice) {
      throw new Error('Comparison price cannot be less than selling price');
    }

    let stockChanged = false;
    const previousStock = currentVariant.stock_quantity;
    let newStock = previousStock;

    if (data.stockQuantity !== undefined) {
      if (data.stockQuantity < 0) {
        throw new Error('Insufficient stock: adjustment would result in negative quantity');
      }
      newStock = data.stockQuantity;
      if (newStock !== previousStock) {
        stockChanged = true;
        params.push(newStock);
        setClauses.push(`stock_quantity = $${params.length}`);
      }
    }

    if (setClauses.length > 0) {
      const sql = `UPDATE product_variants SET ${setClauses.join(', ')} WHERE id = $1 AND product_id = $2 RETURNING id;`;
      const res = await client.query<{ id: string }>(sql, params);

      if ((res.rowCount ?? 0) === 0 || res.rows.length === 0) {
        return false;
      }
    }

    // Record stock adjustment audit log if stock quantity changed
    if (stockChanged) {
      await createAuditLog({
        adminId: actor.id,
        adminEmail: actor.email,
        action: 'STOCK_ADJUSTMENT',
        entityType: 'variant',
        entityId: variantId,
        details: {
          productId,
          sku: data.sku || currentVariant.sku,
          previousQuantity: previousStock,
          newQuantity: newStock,
          delta: newStock - previousStock,
          reason: 'Stock updated during variant edit',
        },
        client,
      });
    }

    // Record variant update audit log if any variant attributes were supplied
    if (setClauses.length > 0) {
      await createAuditLog({
        adminId: actor.id,
        adminEmail: actor.email,
        action: 'VARIANT_UPDATE',
        entityType: 'variant',
        entityId: variantId,
        details: { productId, ...data },
        client,
      });
    }

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

/**
 * Returns count of distinct published products having at least one active variant with stock_quantity < threshold.
 * Excludes archived and draft products.
 */
export async function getDistinctLowStockProductsCount(threshold = 10): Promise<number> {
  const res = await query<{ count: string }>(
    `SELECT COUNT(DISTINCT p.id)::text as count
     FROM products p
     JOIN product_variants pv ON pv.product_id = p.id
     WHERE pv.stock_quantity < $1
       AND pv.is_active = true
       AND p.status = 'published';`,
    [threshold]
  );
  return parseInt(res.rows[0]?.count || '0', 10);
}

// -------------------------------------------------------------
// Product Image Management
// -------------------------------------------------------------

export interface ProductImageDTO {
  id: string;
  productId: string;
  imageUrl: string;
  altText: string | null;
  displayOrder: number;
  isPrimary: boolean;
  publicId: string | null;
  width: number | null;
  height: number | null;
  format: string | null;
  bytes: number | null;
  color: string | null;
  createdAt: string;
}

export async function adminAddProductImage(
  productId: string,
  data: z.infer<typeof productImageAddSchema>,
  actor: AdminUserDTO
): Promise<ProductImageDTO> {
  return withTransaction(async (client) => {
    // 1. Verify product exists
    const prodCheck = await client.query(`SELECT id, name FROM products WHERE id = $1;`, [productId]);
    if (prodCheck.rows.length === 0) {
      throw new Error(`PRODUCT_NOT_FOUND: Product with ID '${productId}' not found`);
    }

    // 1b. If color specified, validate it corresponds to an active variant color of this product
    if (data.color && data.color.trim()) {
      const varColorCheck = await client.query(
        `SELECT id FROM product_variants WHERE product_id = $1 AND LOWER(color) = LOWER($2) AND is_active = true LIMIT 1;`,
        [productId, data.color.trim()]
      );
      if (varColorCheck.rows.length === 0) {
        throw new Error(`INVALID_COLOR: Color '${data.color}' is not an active variant color for this product`);
      }
    }

    const assignedColor = data.color && data.color.trim() ? data.color.trim() : null;

    // 2. Determine display order if not specified or 0
    let displayOrder = data.displayOrder;
    if (!displayOrder) {
      const orderRes = await client.query(
        `SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order FROM product_images WHERE product_id = $1;`,
        [productId]
      );
      displayOrder = orderRes.rows[0].next_order;
    }

    // 3. Determine is_primary status
    const countRes = await client.query(
      `SELECT COUNT(*)::int AS count FROM product_images WHERE product_id = $1;`,
      [productId]
    );
    const existingCount = countRes.rows[0].count;
    let isPrimary = data.isPrimary;
    if (existingCount === 0) {
      // First image is always primary
      isPrimary = true;
    } else if (isPrimary) {
      // If marking as primary, clear primary from other images first to satisfy partial unique index
      await client.query(
        `UPDATE product_images SET is_primary = false WHERE product_id = $1;`,
        [productId]
      );
    }

    // 4. Insert image record
    const insertRes = await client.query(
      `INSERT INTO product_images (
         product_id, image_url, alt_text, display_order, is_primary,
         public_id, width, height, format, bytes, color
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *;`,
      [
        productId,
        data.imageUrl,
        data.altText || null,
        displayOrder,
        isPrimary,
        data.publicId || null,
        data.width || null,
        data.height || null,
        data.format || null,
        data.bytes || null,
        assignedColor,
      ]
    );
    const row = insertRes.rows[0];

    // 5. Audit log
    await createAuditLog({
      adminId: actor.id,
      adminEmail: actor.email,
      action: 'PRODUCT_IMAGE_ADD',
      entityType: 'product',
      entityId: productId,
      details: {
        imageId: row.id,
        imageUrl: data.imageUrl,
        publicId: data.publicId || null,
        isPrimary: row.is_primary,
        displayOrder: row.display_order,
        color: assignedColor,
      },
      client,
    });

    return {
      id: row.id,
      productId: row.product_id,
      imageUrl: row.image_url,
      altText: row.alt_text,
      displayOrder: row.display_order,
      isPrimary: row.is_primary,
      publicId: row.public_id,
      width: row.width,
      height: row.height,
      format: row.format,
      bytes: row.bytes,
      color: row.color || null,
      createdAt: row.created_at.toISOString(),
    };
  });
}

export async function adminUpdateProductImage(
  productId: string,
  imageId: string,
  data: z.infer<typeof productImageUpdateSchema>,
  actor: AdminUserDTO
): Promise<ProductImageDTO | null> {
  return withTransaction(async (client) => {
    // 1. Verify image exists for this product
    const imgCheck = await client.query(
      `SELECT * FROM product_images WHERE id = $1 AND product_id = $2;`,
      [imageId, productId]
    );
    if (imgCheck.rows.length === 0) {
      return null;
    }

    // 2. If color specified, validate it corresponds to an active variant color of this product
    if (data.color && data.color.trim()) {
      const varColorCheck = await client.query(
        `SELECT id FROM product_variants WHERE product_id = $1 AND LOWER(color) = LOWER($2) AND is_active = true LIMIT 1;`,
        [productId, data.color.trim()]
      );
      if (varColorCheck.rows.length === 0) {
        throw new Error(`INVALID_COLOR: Color '${data.color}' is not an active variant color for this product`);
      }
    }

    const assignedColor = data.color && data.color.trim() ? data.color.trim() : null;

    const updateRes = await client.query(
      `UPDATE product_images
       SET color = $1,
           alt_text = CASE WHEN $2::text IS NOT NULL THEN $2 ELSE alt_text END
       WHERE id = $3 AND product_id = $4
       RETURNING *;`,
      [assignedColor, data.altText !== undefined ? data.altText : null, imageId, productId]
    );

    const row = updateRes.rows[0];

    await createAuditLog({
      adminId: actor.id,
      adminEmail: actor.email,
      action: 'PRODUCT_IMAGE_UPDATE',
      entityType: 'product',
      entityId: productId,
      details: {
        imageId,
        color: assignedColor,
        altText: row.alt_text,
      },
      client,
    });

    return {
      id: row.id,
      productId: row.product_id,
      imageUrl: row.image_url,
      altText: row.alt_text,
      displayOrder: row.display_order,
      isPrimary: row.is_primary,
      publicId: row.public_id,
      width: row.width,
      height: row.height,
      format: row.format,
      bytes: row.bytes,
      color: row.color || null,
      createdAt: row.created_at.toISOString(),
    };
  });
}

export async function adminSetPrimaryImage(
  productId: string,
  imageId: string,
  actor: AdminUserDTO
): Promise<boolean> {
  return withTransaction(async (client) => {
    // 1. Verify image exists for product
    const checkRes = await client.query(
      `SELECT id, is_primary FROM product_images WHERE id = $1 AND product_id = $2;`,
      [imageId, productId]
    );
    if (checkRes.rows.length === 0) {
      return false;
    }

    if (checkRes.rows[0].is_primary) {
      return true; // Already primary
    }

    // 2. Unset all primary for this product
    await client.query(`UPDATE product_images SET is_primary = false WHERE product_id = $1;`, [productId]);

    // 3. Set the target image as primary
    await client.query(`UPDATE product_images SET is_primary = true WHERE id = $1 AND product_id = $2;`, [
      imageId,
      productId,
    ]);

    // 4. Audit log
    await createAuditLog({
      adminId: actor.id,
      adminEmail: actor.email,
      action: 'PRODUCT_IMAGE_SET_PRIMARY',
      entityType: 'product',
      entityId: productId,
      details: { imageId },
      client,
    });

    return true;
  });
}

export async function adminReorderProductImages(
  productId: string,
  imageOrders: { id: string; displayOrder: number }[],
  actor: AdminUserDTO
): Promise<boolean> {
  return withTransaction(async (client) => {
    // 1. Verify product exists
    const prodCheck = await client.query(`SELECT id FROM products WHERE id = $1;`, [productId]);
    if (prodCheck.rows.length === 0) {
      return false;
    }

    // 2. Update display order for each image
    for (const item of imageOrders) {
      await client.query(
        `UPDATE product_images SET display_order = $1 WHERE id = $2 AND product_id = $3;`,
        [item.displayOrder, item.id, productId]
      );
    }

    // 3. Audit log
    await createAuditLog({
      adminId: actor.id,
      adminEmail: actor.email,
      action: 'PRODUCT_IMAGES_REORDER',
      entityType: 'product',
      entityId: productId,
      details: { reorderedCount: imageOrders.length },
      client,
    });

    return true;
  });
}

export async function adminDeleteProductImage(
  productId: string,
  imageId: string,
  actor: AdminUserDTO
): Promise<{ success: boolean; deletedPublicId?: string | null }> {
  let publicIdToDelete: string | null = null;

  const result = await withTransaction(async (client) => {
    // 1. Fetch image to verify ownership and grab public_id
    const imgRes = await client.query(
      `SELECT * FROM product_images WHERE id = $1 AND product_id = $2;`,
      [imageId, productId]
    );
    if (imgRes.rows.length === 0) {
      return { success: false };
    }

    const img = imgRes.rows[0];
    publicIdToDelete = img.public_id;
    const wasPrimary = img.is_primary;

    // 2. Delete database row
    await client.query(`DELETE FROM product_images WHERE id = $1 AND product_id = $2;`, [imageId, productId]);

    // 3. If deleted image was primary, promote lowest display_order image if any remain
    if (wasPrimary) {
      const remainingRes = await client.query(
        `SELECT id FROM product_images WHERE product_id = $1 ORDER BY display_order ASC, created_at ASC LIMIT 1;`,
        [productId]
      );
      if (remainingRes.rows.length > 0) {
        await client.query(
          `UPDATE product_images SET is_primary = true WHERE id = $1;`,
          [remainingRes.rows[0].id]
        );
      }
    }

    // 4. Audit log
    await createAuditLog({
      adminId: actor.id,
      adminEmail: actor.email,
      action: 'PRODUCT_IMAGE_DELETE',
      entityType: 'product',
      entityId: productId,
      details: { imageId, publicId: img.public_id, wasPrimary },
      client,
    });

    return { success: true, deletedPublicId: publicIdToDelete };
  });

  if (result.success && publicIdToDelete) {
    // Safe Cloudinary deletion occurs after database transaction commits cleanly
    try {
      await deleteCloudinaryAsset(publicIdToDelete);
    } catch (err: unknown) {
      console.warn(`[Cloudinary] Asset deletion warning for '${publicIdToDelete}':`, err);
    }
  }

  return result;
}

export interface DeleteProductResult {
  status: 'deleted' | 'not_found' | 'conflict';
  message?: string;
  deletedPublicIds?: string[];
}

/**
 * Permanently deletes a product if and only if it is not referenced by any historical orders or enquiries.
 * Child images and variants are removed inside an atomic transaction with audit logging.
 * Remote Cloudinary cleanup is executed strictly post-commit.
 */
export async function adminDeleteProduct(
  id: string,
  actor: AdminUserDTO
): Promise<DeleteProductResult> {
  if (!UUID_REGEX.test(id)) {
    return { status: 'not_found', message: 'Product not found' };
  }

  let publicIdsToClean: string[] = [];

  const txResult = await withTransaction(async (client) => {
    // 1. Lock all associated variants first in deterministic ID order to align with createOrder lock ordering
    await client.query(
      `SELECT id FROM product_variants WHERE product_id = $1 ORDER BY id ASC FOR UPDATE;`,
      [id]
    );

    // 2. Lock product row to prevent concurrent modifications
    const prodRes = await client.query<{ id: string; name: string; slug: string }>(
      `SELECT id, name, slug FROM products WHERE id = $1 FOR UPDATE;`,
      [id]
    );

    if (prodRes.rows.length === 0) {
      return { status: 'not_found' as const, message: 'Product not found' };
    }

    const product = prodRes.rows[0];

    // 3. Check for protected order items referencing the product or its variants
    const orderCheckRes = await client.query(
      `SELECT 1 FROM order_items oi
       LEFT JOIN product_variants pv ON oi.variant_id = pv.id
       WHERE oi.product_id = $1 OR pv.product_id = $1
       LIMIT 1;`,
      [id]
    );

    if (orderCheckRes.rows.length > 0) {
      return {
        status: 'conflict' as const,
        message:
          'Product cannot be deleted because it is referenced by historical customer orders. Please archive the product instead to preserve order integrity.',
      };
    }

    // 4. Check for protected customer enquiry references
    const enquiryCheckRes = await client.query(
      `SELECT 1 FROM enquiries WHERE product_id = $1 LIMIT 1;`,
      [id]
    );

    if (enquiryCheckRes.rows.length > 0) {
      return {
        status: 'conflict' as const,
        message:
          'Product cannot be deleted because it is referenced by customer enquiries. Please archive the product instead.',
      };
    }

    // 5. Fetch all Cloudinary public_ids for associated images before deletion
    const imgRes = await client.query<{ public_id: string }>(
      `SELECT public_id FROM product_images WHERE product_id = $1 AND public_id IS NOT NULL;`,
      [id]
    );
    publicIdsToClean = imgRes.rows.map((r) => r.public_id).filter(Boolean);

    // 6. Delete dependent child records
    const imgDelRes = await client.query(
      `DELETE FROM product_images WHERE product_id = $1;`,
      [id]
    );
    const varDelRes = await client.query(
      `DELETE FROM product_variants WHERE product_id = $1;`,
      [id]
    );
    await client.query(
      `DELETE FROM products WHERE id = $1;`,
      [id]
    );

    // 7. Write immutable admin audit log
    await createAuditLog({
      adminId: actor.id,
      adminEmail: actor.email,
      action: 'PRODUCT_DELETE',
      entityType: 'product',
      entityId: id,
      details: {
        name: product.name,
        slug: product.slug,
        deletedVariantCount: varDelRes.rowCount ?? 0,
        deletedImageCount: imgDelRes.rowCount ?? 0,
        deletedPublicIds: publicIdsToClean,
      },
      client,
    });

    return {
      status: 'deleted' as const,
      message: 'Product permanently deleted successfully',
      deletedPublicIds: publicIdsToClean,
    };
  });

  // 8. Remote Cloudinary asset deletion occurs strictly AFTER transaction commits cleanly
  if (txResult.status === 'deleted' && publicIdsToClean.length > 0) {
    for (const pubId of publicIdsToClean) {
      try {
        await deleteCloudinaryAsset(pubId);
      } catch (err: unknown) {
        console.warn(`[Cloudinary] Asset cleanup warning for orphaned public_id '${pubId}':`, err);
      }
    }
  }

  return txResult;
}

export interface AdminHomepageCollectionProduct {
  id: string;
  slug: string;
  name: string;
  status: 'draft' | 'published' | 'archived';
  displayOrder: number;
  categoryName: string;
  categorySlug: string;
  minPricePaise: number;
  price: number;
  totalStock: number;
  imageUrl?: string;
}

export interface AdminHomepageCollection {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  isEnabled: boolean;
  displayOrder: number;
  products: AdminHomepageCollectionProduct[];
  createdAt: string;
  updatedAt: string;
}

export async function adminGetHomepageCollections(): Promise<AdminHomepageCollection[]> {
  const colRes = await query<{
    id: string;
    slug: string;
    title: string;
    description: string | null;
    is_enabled: boolean;
    display_order: number;
    created_at: Date;
    updated_at: Date;
  }>(`
    SELECT id, slug, title, description, is_enabled, display_order, created_at, updated_at
    FROM homepage_collections
    ORDER BY display_order ASC, created_at ASC;
  `);

  if (colRes.rows.length === 0) {
    return [];
  }

  const prodRes = await query<{
    collection_id: string;
    product_id: string;
    product_slug: string;
    product_name: string;
    status: 'draft' | 'published' | 'archived';
    display_order: number;
    category_name: string;
    category_slug: string;
    min_price_paise: number | string;
    total_stock: number | string;
    image_url: string | null;
  }>(`
    SELECT
      hcp.collection_id,
      p.id AS product_id,
      p.slug AS product_slug,
      p.name AS product_name,
      p.status,
      hcp.display_order,
      c.name AS category_name,
      c.slug AS category_slug,
      COALESCE(
        (
          SELECT pv_min.price_paise
          FROM product_variants pv_min
          WHERE pv_min.product_id = p.id AND pv_min.is_active = true
          ORDER BY pv_min.price_paise ASC, pv_min.created_at ASC
          LIMIT 1
        ),
        0
      ) AS min_price_paise,
      COALESCE(
        (
          SELECT SUM(pv.stock_quantity)
          FROM product_variants pv
          WHERE pv.product_id = p.id AND pv.is_active = true
        ),
        0
      ) AS total_stock,
      (
        SELECT img.image_url
        FROM product_images img
        WHERE img.product_id = p.id
        ORDER BY img.is_primary DESC, img.display_order ASC
        LIMIT 1
      ) AS image_url
    FROM homepage_collection_products hcp
    JOIN products p ON hcp.product_id = p.id
    JOIN categories c ON p.category_id = c.id
    ORDER BY hcp.collection_id, hcp.display_order ASC, hcp.created_at ASC;
  `);

  const productsByCollectionId = new Map<string, AdminHomepageCollectionProduct[]>();
  for (const row of prodRes.rows) {
    const list = productsByCollectionId.get(row.collection_id) || [];
    const minPaise = Number(row.min_price_paise);
    list.push({
      id: row.product_id,
      slug: row.product_slug,
      name: row.product_name,
      status: row.status,
      displayOrder: row.display_order,
      categoryName: row.category_name,
      categorySlug: row.category_slug,
      minPricePaise: minPaise,
      price: Math.round(minPaise / 100),
      totalStock: Number(row.total_stock),
      imageUrl: row.image_url || undefined,
    });
    productsByCollectionId.set(row.collection_id, list);
  }

  return colRes.rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    isEnabled: row.is_enabled,
    displayOrder: row.display_order,
    products: productsByCollectionId.get(row.id) || [],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }));
}

export async function adminUpdateHomepageCollection(
  id: string,
  data: z.infer<typeof homepageCollectionUpdateSchema>,
  actor: AdminUserDTO
): Promise<AdminHomepageCollection> {
  const existing = await query<{ id: string; slug: string; title: string }>(
    `SELECT id, slug, title FROM homepage_collections WHERE id = $1;`,
    [id]
  );
  if (existing.rows.length === 0) {
    throw new Error('Collection not found');
  }

  const setClauses: string[] = [];
  const params: unknown[] = [id];

  if (data.title !== undefined) {
    params.push(data.title);
    setClauses.push(`title = $${params.length}`);
  }
  if (data.description !== undefined) {
    params.push(data.description);
    setClauses.push(`description = $${params.length}`);
  }
  if (data.isEnabled !== undefined) {
    params.push(data.isEnabled);
    setClauses.push(`is_enabled = $${params.length}`);
  }
  if (data.displayOrder !== undefined) {
    params.push(data.displayOrder);
    setClauses.push(`display_order = $${params.length}`);
  }

  await withTransaction(async (client) => {
    if (setClauses.length > 0) {
      const sql = `UPDATE homepage_collections SET ${setClauses.join(', ')} WHERE id = $1;`;
      await client.query(sql, params);
    }

    await createAuditLog({
      adminId: actor.id,
      adminEmail: actor.email,
      action: 'COLLECTION_UPDATE',
      entityType: 'collection',
      entityId: id,
      details: { slug: existing.rows[0].slug, ...data },
      client,
    });
  });

  const collections = await adminGetHomepageCollections();
  const updated = collections.find((c) => c.id === id);
  if (!updated) {
    throw new Error('Collection not found after update');
  }
  return updated;
}

export async function adminUpdateCollectionProducts(
  collectionId: string,
  productIds: string[],
  actor: AdminUserDTO
): Promise<AdminHomepageCollection> {
  await withTransaction(async (client) => {
    const colRes = await client.query<{ id: string; slug: string; title: string }>(
      `SELECT id, slug, title FROM homepage_collections WHERE id = $1;`,
      [collectionId]
    );
    if (colRes.rows.length === 0) {
      throw new Error('Collection not found');
    }

    const deduplicatedProductIds = [...new Set(productIds)];

    // Verify all productIds exist if any provided
    if (deduplicatedProductIds.length > 0) {
      const prodCheck = await client.query<{ id: string }>(
        `SELECT id FROM products WHERE id = ANY($1::uuid[]);`,
        [deduplicatedProductIds]
      );
      if (prodCheck.rows.length !== deduplicatedProductIds.length) {
        const foundSet = new Set(prodCheck.rows.map((r) => r.id));
        const missing = deduplicatedProductIds.filter((pid) => !foundSet.has(pid));
        throw new Error(`One or more product IDs do not exist: ${missing.join(', ')}`);
      }
    }

    // Delete existing associations
    await client.query(
      `DELETE FROM homepage_collection_products WHERE collection_id = $1;`,
      [collectionId]
    );

    // Insert updated associations with sequential display_order
    for (let i = 0; i < deduplicatedProductIds.length; i++) {
      await client.query(
        `INSERT INTO homepage_collection_products (collection_id, product_id, display_order)
         VALUES ($1, $2, $3);`,
        [collectionId, deduplicatedProductIds[i], i + 1]
      );
    }

    await createAuditLog({
      adminId: actor.id,
      adminEmail: actor.email,
      action: 'COLLECTION_PRODUCTS_UPDATE',
      entityType: 'collection',
      entityId: collectionId,
      details: {
        slug: colRes.rows[0].slug,
        productIds: deduplicatedProductIds,
        count: deduplicatedProductIds.length,
      },
      client,
    });
  });

  const collections = await adminGetHomepageCollections();
  const updated = collections.find((c) => c.id === collectionId);
  if (!updated) {
    throw new Error('Collection not found after products update');
  }
  return updated;
}
