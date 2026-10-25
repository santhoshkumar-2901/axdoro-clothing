import { z } from 'zod';

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE_REGEX = /^[+]?[0-9]{10,15}$/;

export const enquiryCreateSchema = z
  .object({
    enquiryType: z.enum(['GENERAL', 'BULK']).default('GENERAL'),
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
    email: z.string().trim().email('Invalid email address').max(255),
    phone: z.string().trim().regex(PHONE_REGEX, 'Phone must be a valid 10 to 15 digit number'),
    message: z.string().trim().min(5, 'Message must be at least 5 characters').max(2000),
    productId: z.string().regex(UUID_REGEX, 'Invalid product ID format').optional().nullable(),
    quantity: z
      .preprocess(
        (val) => (val === '' || val === null || val === undefined ? null : Number(val)),
        z.number().int().min(1, 'Quantity must be at least 1').max(100000).optional().nullable()
      ),
    sizeBreakdown: z.string().trim().max(255).optional().nullable(),
    targetDate: z.string().trim().max(50).optional().nullable(),
    organization: z.string().trim().max(100).optional().nullable(),
    source: z.enum(['WEBSITE', 'INSTAGRAM', 'WHATSAPP', 'GOOGLE', 'OTHER']).default('WEBSITE'),
    // Anti-spam honeypot field: bots fill this hidden field; valid humans leave it blank
    website_hp: z.string().max(0, 'Spam submission detected').optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.enquiryType === 'BULK') {
        return typeof data.quantity === 'number' && data.quantity > 0;
      }
      return true;
    },
    {
      message: 'Quantity is required for bulk order enquiries and must be greater than 0',
      path: ['quantity'],
    }
  );

export type EnquiryCreateInput = z.infer<typeof enquiryCreateSchema>;

export interface ArtworkMetadataInput {
  designFileUrl?: string | null;
  designFilePublicId?: string | null;
  designFileName?: string | null;
  designFileFormat?: string | null;
  designFileBytes?: number | null;
}

export const enquiryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  enquiryType: z.enum(['GENERAL', 'BULK']).optional(),
  source: z.enum(['WEBSITE', 'INSTAGRAM', 'WHATSAPP', 'GOOGLE', 'OTHER']).optional(),
  syncStatus: z.enum(['PENDING', 'SYNCED', 'FAILED']).optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
});

export type EnquiryQueryInput = z.infer<typeof enquiryQuerySchema>;
