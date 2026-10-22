import { query } from '../config/db.js';
import { ProductsQuery } from '../schemas/catalogue.js';

export interface CategoryDTO {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  displayOrder: number;
  imageUrl?: string | null;
}

export interface ProductSummaryDTO {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: {
    slug: string;
    name: string;
  };
  fabricSpec?: string;
  pricePaise: number;
  originalPricePaise?: number;
  min_price_paise?: number;
  min_comparison_price_paise?: number;
  price: number; // in INR rupees
  originalPrice?: number; // in INR rupees
  images: string[];
  sizes: string[];
  colors: {
    name: string;
    hex: string;
  }[];
  stockStatus: 'in-stock' | 'low-stock' | 'out-of-stock';
  stockCount: number;
  isFeatured: boolean;
  isNewArrival: boolean;
  createdAt: string;
  allImages?: {
    id: string;
    url: string;
    altText?: string;
    displayOrder: number;
    isPrimary: boolean;
    color?: string | null;
  }[];
}

export interface ProductVariantDTO {
  id: string;
  size: string;
  color: string;
  colorHex?: string;
  sku: string;
  pricePaise: number;
  originalPricePaise?: number;
  price: number;
  originalPrice?: number;
  stock: number;
  isActive: boolean;
}

export interface ProductDetailDTO extends ProductSummaryDTO {
  variants: ProductVariantDTO[];
  allImages: {
    id: string;
    url: string;
    altText?: string;
    displayOrder: number;
    isPrimary: boolean;
    color?: string | null;
  }[];
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export async function getActiveCategories(): Promise<CategoryDTO[]> {
  const sql = `
    SELECT id, slug, name, description, display_order, image_url
    FROM categories
    WHERE is_active = true
    ORDER BY display_order ASC, name ASC;
  `;
  const result = await query<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    display_order: number;
    image_url: string | null;
  }>(sql);

  return result.rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    displayOrder: row.display_order,
    imageUrl: row.image_url || null,
  }));
}

export async function getCategoryBySlug(
  slug: string
): Promise<CategoryDTO | null> {
  const sql = `
    SELECT id, slug, name, description, display_order, image_url
    FROM categories
    WHERE slug = $1 AND is_active = true;
  `;
  const result = await query<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    display_order: number;
    image_url: string | null;
  }>(sql, [slug]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    displayOrder: row.display_order,
    imageUrl: row.image_url || null,
  };
}

export async function getPublishedProducts(
  params: ProductsQuery
): Promise<PaginatedResult<ProductSummaryDTO>> {
  const { page, limit, category, search, sort } = params;
  const offset = (page - 1) * limit;

  const whereClauses: string[] = ["p.status = 'published'", "c.is_active = true"];
  const queryParams: unknown[] = [];

  if (category && category !== 'all') {
    queryParams.push(category);
    whereClauses.push(`c.slug = $${queryParams.length}`);
  }

  if (search && search.trim()) {
    queryParams.push(`%${search.trim()}%`);
    const searchIdx = queryParams.length;
    whereClauses.push(`(
      p.name ILIKE $${searchIdx} OR
      p.description ILIKE $${searchIdx} OR
      p.fabric_spec ILIKE $${searchIdx}
    )`);
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // 1. Total count query
  const countSql = `
    SELECT COUNT(DISTINCT p.id) as total
    FROM products p
    JOIN categories c ON p.category_id = c.id
    ${whereSql};
  `;
  const countRes = await query<{ total: string }>(countSql, queryParams);
  const totalCount = parseInt(countRes.rows[0]?.total || '0', 10);
  const totalPages = Math.ceil(totalCount / limit) || 1;

  if (totalCount === 0) {
    return {
      data: [],
      pagination: {
        page,
        limit,
        totalCount: 0,
        totalPages: 1,
        hasMore: false,
      },
    };
  }

  // 2. Determine sort clause
  let sortSql = 'p.is_featured DESC, p.created_at DESC';
  if (sort === 'newest') {
    sortSql = 'p.created_at DESC';
  } else if (sort === 'price-asc') {
    sortSql = 'min_price_paise ASC, p.created_at DESC';
  } else if (sort === 'price-desc') {
    sortSql = 'min_price_paise DESC, p.created_at DESC';
  }

  // 3. Paginated listing query with variant price aggregates
  const dataParams = [...queryParams, limit, offset];
  const limitParamIdx = dataParams.length - 1;
  const offsetParamIdx = dataParams.length;

  const listSql = `
    SELECT
      p.id,
      p.slug,
      p.name,
      p.description,
      p.fabric_spec,
      p.is_featured,
      p.is_new_arrival,
      p.created_at,
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
          SELECT pv_min.comparison_price_paise
          FROM product_variants pv_min
          WHERE pv_min.product_id = p.id AND pv_min.is_active = true
          ORDER BY pv_min.price_paise ASC, pv_min.created_at ASC
          LIMIT 1
        ),
        0
      ) AS min_comparison_price_paise,
      COALESCE(SUM(pv.stock_quantity), 0) AS total_stock,
      COALESCE(
        json_agg(DISTINCT pv.size) FILTER (WHERE pv.size IS NOT NULL),
        '[]'::json
      ) AS available_sizes,
      COALESCE(
        (
          SELECT json_agg(json_build_object('name', col.color, 'hex', COALESCE(col.color_hex, '#ffffff')))
          FROM (
            SELECT DISTINCT color, color_hex
            FROM product_variants
            WHERE product_id = p.id AND is_active = true
          ) col
        ),
        '[]'::json
      ) AS available_colors,
      COALESCE(
        (
          SELECT json_agg(img.image_url ORDER BY img.display_order ASC)
          FROM product_images img
          WHERE img.product_id = p.id
        ),
        '[]'::json
      ) AS images,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', img.id,
              'url', img.image_url,
              'altText', img.alt_text,
              'displayOrder', img.display_order,
              'isPrimary', img.is_primary,
              'color', img.color
            ) ORDER BY img.display_order ASC
          )
          FROM product_images img
          WHERE img.product_id = p.id
        ),
        '[]'::json
      ) AS all_images
    FROM products p
    JOIN categories c ON p.category_id = c.id
    LEFT JOIN product_variants pv ON pv.product_id = p.id AND pv.is_active = true
    ${whereSql}
    GROUP BY p.id, c.slug, c.name
    ORDER BY ${sortSql}
    LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx};
  `;

  const listRes = await query<{
    id: string;
    slug: string;
    name: string;
    description: string;
    fabric_spec: string | null;
    is_featured: boolean;
    is_new_arrival: boolean;
    created_at: Date;
    category_slug: string;
    category_name: string;
    min_price_paise: number | string;
    min_comparison_price_paise: number | string;
    total_stock: number | string;
    available_sizes: string[];
    available_colors: { name: string; hex: string }[];
    images: string[];
    all_images: {
      id: string;
      url: string;
      altText?: string;
      displayOrder: number;
      isPrimary: boolean;
      color?: string | null;
    }[];
  }>(listSql, dataParams);

  const products: ProductSummaryDTO[] = listRes.rows.map((row) => {
    const minPricePaise = Number(row.min_price_paise);
    const minComparisonPaise = Number(row.min_comparison_price_paise);
    const totalStock = Number(row.total_stock);

    let stockStatus: 'in-stock' | 'low-stock' | 'out-of-stock' = 'in-stock';
    if (totalStock === 0) {
      stockStatus = 'out-of-stock';
    } else if (totalStock < 10) {
      stockStatus = 'low-stock';
    }

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      category: {
        slug: row.category_slug,
        name: row.category_name,
      },
      fabricSpec: row.fabric_spec || undefined,
      pricePaise: minPricePaise,
      originalPricePaise: minComparisonPaise > minPricePaise ? minComparisonPaise : undefined,
      min_price_paise: minPricePaise,
      min_comparison_price_paise: minComparisonPaise,
      price: Math.round(minPricePaise / 100),
      originalPrice: minComparisonPaise > minPricePaise ? Math.round(minComparisonPaise / 100) : undefined,
      images: Array.isArray(row.images) ? row.images : [],
      sizes: Array.isArray(row.available_sizes) ? row.available_sizes : [],
      colors: Array.isArray(row.available_colors) ? row.available_colors : [],
      stockStatus,
      stockCount: totalStock,
      isFeatured: row.is_featured,
      isNewArrival: row.is_new_arrival,
      createdAt: row.created_at.toISOString(),
      allImages: Array.isArray(row.all_images) ? row.all_images : [],
    };
  });

  return {
    data: products,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages,
      hasMore: page < totalPages,
    },
  };
}

export async function getPublishedProductBySlug(
  slug: string
): Promise<ProductDetailDTO | null> {
  const productSql = `
    SELECT
      p.id,
      p.slug,
      p.name,
      p.description,
      p.fabric_spec,
      p.is_featured,
      p.is_new_arrival,
      p.created_at,
      c.slug AS category_slug,
      c.name AS category_name
    FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE p.slug = $1 AND p.status = 'published' AND c.is_active = true;
  `;

  const productRes = await query<{
    id: string;
    slug: string;
    name: string;
    description: string;
    fabric_spec: string | null;
    is_featured: boolean;
    is_new_arrival: boolean;
    created_at: Date;
    category_slug: string;
    category_name: string;
  }>(productSql, [slug]);

  if (productRes.rows.length === 0) {
    return null;
  }

  const p = productRes.rows[0];

  // Fetch images
  const imagesSql = `
    SELECT id, image_url, alt_text, display_order, is_primary, color
    FROM product_images
    WHERE product_id = $1
    ORDER BY display_order ASC;
  `;
  const imagesRes = await query<{
    id: string;
    image_url: string;
    alt_text: string | null;
    display_order: number;
    is_primary: boolean;
    color: string | null;
  }>(imagesSql, [p.id]);

  // Fetch variants
  const variantsSql = `
    SELECT id, size, color, color_hex, sku, price_paise, comparison_price_paise, stock_quantity, is_active
    FROM product_variants
    WHERE product_id = $1 AND is_active = true
    ORDER BY price_paise ASC, size ASC;
  `;
  const variantsRes = await query<{
    id: string;
    size: string;
    color: string;
    color_hex: string | null;
    sku: string;
    price_paise: number;
    comparison_price_paise: number | null;
    stock_quantity: number;
    is_active: boolean;
  }>(variantsSql, [p.id]);

  const variants: ProductVariantDTO[] = variantsRes.rows.map((v) => ({
    id: v.id,
    size: v.size,
    color: v.color,
    colorHex: v.color_hex || undefined,
    sku: v.sku,
    pricePaise: v.price_paise,
    originalPricePaise: v.comparison_price_paise || undefined,
    price: Math.round(v.price_paise / 100),
    originalPrice: v.comparison_price_paise ? Math.round(v.comparison_price_paise / 100) : undefined,
    stock: v.stock_quantity,
    isActive: v.is_active,
  }));

  const allImages = imagesRes.rows.map((img) => ({
    id: img.id,
    url: img.image_url,
    altText: img.alt_text || undefined,
    displayOrder: img.display_order,
    isPrimary: img.is_primary,
    color: img.color || undefined,
  }));

  const imageUrls = allImages.map((img) => img.url);

  // Compute aggregated sizes & unique colors
  const sizes = Array.from(new Set(variants.map((v) => v.size)));
  const colorsMap = new Map<string, string>();
  for (const v of variants) {
    if (!colorsMap.has(v.color)) {
      colorsMap.set(v.color, v.colorHex || '#ffffff');
    }
  }
  const colors = Array.from(colorsMap.entries()).map(([name, hex]) => ({ name, hex }));

  const totalStock = variants.reduce((acc, v) => acc + v.stock, 0);
  let stockStatus: 'in-stock' | 'low-stock' | 'out-of-stock' = 'in-stock';
  if (totalStock === 0) {
    stockStatus = 'out-of-stock';
  } else if (totalStock < 10) {
    stockStatus = 'low-stock';
  }

  const minPricePaise = variants.length > 0 ? Math.min(...variants.map((v) => v.pricePaise)) : 0;
  const originalPricePaise =
    variants.length > 0 && variants[0]?.originalPricePaise
      ? variants[0].originalPricePaise
      : undefined;

  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    category: {
      slug: p.category_slug,
      name: p.category_name,
    },
    fabricSpec: p.fabric_spec || undefined,
    pricePaise: minPricePaise,
    originalPricePaise,
    price: Math.round(minPricePaise / 100),
    originalPrice: originalPricePaise ? Math.round(originalPricePaise / 100) : undefined,
    images: imageUrls,
    sizes,
    colors,
    stockStatus,
    stockCount: totalStock,
    isFeatured: p.is_featured,
    isNewArrival: p.is_new_arrival,
    createdAt: p.created_at.toISOString(),
    variants,
    allImages,
  };
}

export interface HomepageCollectionDTO {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  displayOrder: number;
  products: ProductSummaryDTO[];
}

export async function getPublicHomepageCollections(): Promise<HomepageCollectionDTO[]> {
  const colRes = await query<{
    id: string;
    slug: string;
    title: string;
    description: string | null;
    display_order: number;
  }>(`
    SELECT id, slug, title, description, display_order
    FROM homepage_collections
    WHERE is_enabled = true
    ORDER BY display_order ASC, created_at ASC;
  `);

  if (colRes.rows.length === 0) {
    return [];
  }

  const prodRes = await query<{
    collection_id: string;
    id: string;
    slug: string;
    name: string;
    description: string;
    fabric_spec: string | null;
    is_featured: boolean;
    is_new_arrival: boolean;
    created_at: Date;
    category_slug: string;
    category_name: string;
    min_price_paise: number | string;
    min_comparison_price_paise: number | string;
    total_stock: number | string;
    available_sizes: string[];
    available_colors: { name: string; hex: string }[];
    images: string[];
    all_images: {
      id: string;
      url: string;
      altText?: string;
      displayOrder: number;
      isPrimary: boolean;
      color?: string | null;
    }[];
  }>(`
    SELECT
      hcp.collection_id,
      p.id,
      p.slug,
      p.name,
      p.description,
      p.fabric_spec,
      p.is_featured,
      p.is_new_arrival,
      p.created_at,
      c.slug AS category_slug,
      c.name AS category_name,
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
          SELECT pv_min.comparison_price_paise
          FROM product_variants pv_min
          WHERE pv_min.product_id = p.id AND pv_min.is_active = true
          ORDER BY pv_min.price_paise ASC, pv_min.created_at ASC
          LIMIT 1
        ),
        0
      ) AS min_comparison_price_paise,
      COALESCE(SUM(pv.stock_quantity), 0) AS total_stock,
      COALESCE(
        json_agg(DISTINCT pv.size) FILTER (WHERE pv.size IS NOT NULL),
        '[]'::json
      ) AS available_sizes,
      COALESCE(
        (
          SELECT json_agg(json_build_object('name', col.color, 'hex', COALESCE(col.color_hex, '#ffffff')))
          FROM (
            SELECT DISTINCT color, color_hex
            FROM product_variants
            WHERE product_id = p.id AND is_active = true
          ) col
        ),
        '[]'::json
      ) AS available_colors,
      COALESCE(
        (
          SELECT json_agg(img.image_url ORDER BY img.is_primary DESC, img.display_order ASC)
          FROM product_images img
          WHERE img.product_id = p.id
        ),
        '[]'::json
      ) AS images,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', img.id,
              'url', img.image_url,
              'altText', img.alt_text,
              'displayOrder', img.display_order,
              'isPrimary', img.is_primary,
              'color', img.color
            ) ORDER BY img.is_primary DESC, img.display_order ASC
          )
          FROM product_images img
          WHERE img.product_id = p.id
        ),
        '[]'::json
      ) AS all_images
    FROM homepage_collection_products hcp
    JOIN homepage_collections hc ON hcp.collection_id = hc.id
    JOIN products p ON hcp.product_id = p.id
    JOIN categories c ON p.category_id = c.id
    LEFT JOIN product_variants pv ON pv.product_id = p.id AND pv.is_active = true
    WHERE hc.is_enabled = true
      AND p.status = 'published'
      AND c.is_active = true
    GROUP BY hcp.collection_id, p.id, c.slug, c.name, hcp.display_order
    ORDER BY hcp.collection_id, hcp.display_order ASC;
  `);

  const productsByCollection = new Map<string, ProductSummaryDTO[]>();

  for (const row of prodRes.rows) {
    const minPricePaise = Number(row.min_price_paise);
    const minComparisonPaise = Number(row.min_comparison_price_paise);
    const totalStock = Number(row.total_stock);

    let stockStatus: 'in-stock' | 'low-stock' | 'out-of-stock' = 'in-stock';
    if (totalStock === 0) {
      stockStatus = 'out-of-stock';
    } else if (totalStock < 10) {
      stockStatus = 'low-stock';
    }

    const product: ProductSummaryDTO = {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      category: {
        slug: row.category_slug,
        name: row.category_name,
      },
      fabricSpec: row.fabric_spec || undefined,
      pricePaise: minPricePaise,
      originalPricePaise: minComparisonPaise > minPricePaise ? minComparisonPaise : undefined,
      min_price_paise: minPricePaise,
      min_comparison_price_paise: minComparisonPaise,
      price: Math.round(minPricePaise / 100),
      originalPrice: minComparisonPaise > minPricePaise ? Math.round(minComparisonPaise / 100) : undefined,
      images: Array.isArray(row.images) ? row.images : [],
      sizes: Array.isArray(row.available_sizes) ? row.available_sizes : [],
      colors: Array.isArray(row.available_colors) ? row.available_colors : [],
      stockStatus,
      stockCount: totalStock,
      isFeatured: row.is_featured,
      isNewArrival: row.is_new_arrival,
      createdAt: row.created_at.toISOString(),
      allImages: Array.isArray(row.all_images) ? row.all_images : [],
    };

    const list = productsByCollection.get(row.collection_id) || [];
    list.push(product);
    productsByCollection.set(row.collection_id, list);
  }

  const activeCollections: HomepageCollectionDTO[] = [];
  for (const col of colRes.rows) {
    const products = productsByCollection.get(col.id) || [];
    if (products.length > 0) {
      activeCollections.push({
        id: col.id,
        slug: col.slug,
        title: col.title,
        description: col.description,
        displayOrder: col.display_order,
        products,
      });
    }
  }

  return activeCollections;
}

export async function getPublicHomepageCollectionBySlug(slug: string): Promise<HomepageCollectionDTO | null> {
  const all = await getPublicHomepageCollections();
  return all.find((c) => c.slug === slug) || null;
}
