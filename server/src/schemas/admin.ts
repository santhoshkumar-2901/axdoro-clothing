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

export const productImageSchema = z.object({
  id: z.string().uuid().optional(),
  imageUrl: z
    .string()
    .trim()
    .url('Invalid image URL')
    .refine((url) => url.startsWith('http://') || url.startsWith('https://'), 'URL must use http or https scheme'),
  altText: z.string().trim().max(255).optional(),
  displayOrder: z.coerce.number().int().default(0),
  isPrimary: z.boolean().default(false),
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
  fabricSpec: z.string().trim().max(50).optional(),
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
