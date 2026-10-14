import { z } from 'zod';

export const adminLoginSchema = z.object({
  email: z.string().trim().email('Invalid email address format'),
  password: z.string().min(1, 'Password is required'),
});

export const categoryCreateSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug must be lower-case alphanumeric with hyphens'),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).optional(),
  displayOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const categoryUpdateSchema = categoryCreateSchema.partial();

export const baseProductVariantSchema = z.object({
  id: z.string().uuid().optional(),
  size: z.string().trim().min(1).max(20),
  color: z.string().trim().min(1).max(50).default('Standard'),
  colorHex: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$|^#[0-9A-Fa-f]{3}$/, 'Invalid HEX color code').optional(),
  sku: z.string().trim().min(1).max(100),
  pricePaise: z.coerce.number().int().min(0, 'Price in paise cannot be negative'),
  comparisonPricePaise: z.coerce.number().int().min(0).optional().nullable(),
  stockQuantity: z.coerce.number().int().min(0, 'Stock cannot be negative').default(0),
  isActive: z.boolean().default(true),
});

export const productVariantSchema = baseProductVariantSchema.refine(
  (data) => data.comparisonPricePaise == null || data.comparisonPricePaise >= data.pricePaise,
  {
    message: 'Comparison price cannot be lower than selling price',
    path: ['comparisonPricePaise'],
  }
);

export const productVariantUpdateSchema = baseProductVariantSchema.partial().refine(
  (data) =>
    data.comparisonPricePaise == null ||
    data.pricePaise == null ||
    data.comparisonPricePaise >= data.pricePaise,
  {
    message: 'Comparison price cannot be lower than selling price',
    path: ['comparisonPricePaise'],
  }
);

/**
 * Rigorously validates a product image URL using the standard WHATWG URL parser.
 *
 * Security & Integrity Guardrails:
 * 1. Must parse successfully using standard WHATWG URL parser (avoids regex ReDoS / substring evasion).
 * 2. Protocol must be strictly 'http:' or 'https:' (rejects 'javascript:', 'data:', 'file:', etc.).
 * 3. Must not contain embedded user credentials (RFC 3986 userinfo, e.g. 'https://user:pass@host/').
 * 4. Must not target forbidden executable or document extensions (.pdf, .exe, .bin, etc.).
 * 5. Must either possess a recognized image extension (.jpg, .jpeg, .png, .webp, .avif, .svg, .gif)
 *    OR originate from an approved image CDN (e.g., Cloudinary, Unsplash, Pexels) which serve
 *    dynamically formatted images without static path extensions.
 *
 * Note on Remote Content:
 * Syntactic and hostname validation cannot guarantee that the remote server will actually return
 * valid or accessible image bytes. The browser image element remains the ultimate renderer and
 * may fail to display broken, private, or inaccessible resources.
 */
export function isValidProductImageUrl(rawUrl: string): { valid: boolean; reason?: string } {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, reason: 'Image URL is required' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { valid: false, reason: 'Malformed or invalid URL format' };
  }

  // 1. Enforce HTTP/HTTPS protocol
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, reason: `Unsupported protocol '${parsed.protocol}'. URL must use http or https` };
  }

  // 2. Reject embedded credentials (RFC 3986 userinfo)
  if (parsed.username || parsed.password) {
    return { valid: false, reason: 'Image URL must not contain embedded user credentials' };
  }

  const pathname = parsed.pathname.toLowerCase();
  const hostname = parsed.hostname.toLowerCase();

  // 3. Reject clearly identifiable non-image file extensions
  const forbiddenExtRegex = /\.(pdf|exe|dmg|bin|zip|tar|gz|7z|doc|docx|xls|xlsx|ppt|pptx|txt|html|htm|js|css|json|xml|mp4|mp3|mov|avi|mkv|wasm)$/i;
  if (forbiddenExtRegex.test(pathname)) {
    return { valid: false, reason: 'URL targets a non-image file extension (.pdf, .exe, etc.)' };
  }

  // 4. Check for supported image file extensions
  const imageExtRegex = /\.(jpg|jpeg|png|webp|avif|svg|gif)$/i;
  const hasImageExt = imageExtRegex.test(pathname);

  // 5. Check for authorized image CDN domains
  const isCloudinary = hostname === 'res.cloudinary.com' || hostname.endsWith('.cloudinary.com');
  const isUnsplash = hostname === 'images.unsplash.com' || hostname.endsWith('.unsplash.com');
  const isPexels = hostname === 'images.pexels.com' || hostname.endsWith('.pexels.com');
  const isApprovedCdn = isCloudinary || isUnsplash || isPexels;

  if (!hasImageExt && !isApprovedCdn) {
    return {
      valid: false,
      reason:
        'Image URL must end in a recognized image extension (.jpg, .jpeg, .png, .webp, .avif, .svg, .gif) or be hosted on an approved image CDN (Cloudinary, Unsplash, Pexels)',
    };
  }

  return { valid: true };
}

export const productImageSchema = z.object({
  id: z.string().uuid().optional(),
  imageUrl: z
    .string()
    .trim()
    .superRefine((val, ctx) => {
      const result = isValidProductImageUrl(val);
      if (!result.valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: result.reason || 'Invalid image URL',
        });
      }
    }),
  publicId: z.string().trim().max(255).optional().nullable(),
  altText: z.string().trim().max(255).optional().nullable(),
  displayOrder: z.coerce.number().int().default(0),
  isPrimary: z.boolean().default(false),
  width: z.coerce.number().int().positive().optional().nullable(),
  height: z.coerce.number().int().positive().optional().nullable(),
  format: z.string().trim().max(20).optional().nullable(),
  bytes: z.coerce.number().int().positive().optional().nullable(),
});

export const productImageAddSchema = z.object({
  imageUrl: z
    .string()
    .trim()
    .superRefine((val, ctx) => {
      const result = isValidProductImageUrl(val);
      if (!result.valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: result.reason || 'Invalid image URL',
        });
      }
    }),
  publicId: z.string().trim().max(255).optional(),
  altText: z.string().trim().max(255).optional(),
  displayOrder: z.coerce.number().int().default(0),
  isPrimary: z.boolean().default(false),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
  format: z.string().trim().max(20).optional(),
  bytes: z.coerce.number().int().positive().optional(),
});

export const productImageReorderSchema = z.object({
  images: z
    .array(
      z.object({
        id: z.string().uuid('Invalid image ID format'),
        displayOrder: z.coerce.number().int().min(0, 'displayOrder cannot be negative'),
      })
    )
    .min(1, 'At least one image is required for reordering'),
});


export const productCreateSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(150)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug must be lower-case alphanumeric with hyphens'),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().default(''),
  categoryId: z.string().uuid('Invalid category ID'),
  status: z.enum(['draft', 'published', 'archived']).default('published'),
  isFeatured: z.boolean().default(false),
  isNewArrival: z.boolean().default(false),
  fabricSpec: z.string().trim().max(50).optional().nullable(),
  variants: z.array(productVariantSchema).min(1, 'At least one variant is required'),
  images: z.array(productImageSchema).default([]),
});

export const productUpdateSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(150)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug must be lower-case alphanumeric with hyphens')
    .optional(),
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().optional(),
  categoryId: z.string().uuid('Invalid category ID').optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  isFeatured: z.boolean().optional(),
  isNewArrival: z.boolean().optional(),
  fabricSpec: z.string().trim().max(50).optional().nullable(),
});

export const stockAdjustmentSchema = z
  .object({
    quantity: z.coerce.number().int().min(0, 'Stock quantity must be non-negative').optional(),
    adjustment: z.coerce.number().int().optional(),
    reason: z.string().trim().min(3, 'Adjustment reason must be at least 3 characters').max(255),
  })
  .refine((data) => data.quantity !== undefined || data.adjustment !== undefined, {
    message: 'Either quantity or adjustment must be provided',
  });

export const adminProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['draft', 'published', 'archived', 'all']).default('all'),
  categoryId: z.string().uuid().optional(),
  search: z.string().trim().optional(),
});
