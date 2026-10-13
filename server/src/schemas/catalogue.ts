import { z } from 'zod';

export const sortOptions = ['featured', 'newest', 'price-asc', 'price-desc'] as const;
export type SortOptionValue = (typeof sortOptions)[number];

export const productsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  category: z.string().trim().min(1).max(50).optional(),
  search: z.string().trim().max(100).optional(),
  sort: z.enum(sortOptions).default('featured'),
});

export type ProductsQuery = z.infer<typeof productsQuerySchema>;

export const productSlugSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(150)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Invalid product slug format'),
});
