import { z } from 'zod';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PINCODE_REGEX = /^[1-9][0-9]{5}$/;
const PHONE_REGEX = /^[+]?[0-9]{10,15}$/;

export const orderItemInputSchema = z.object({
  variantId: z.string().regex(UUID_REGEX, 'Invalid variant ID format'),
  quantity: z
    .number()
    .int('Quantity must be an integer')
    .min(1, 'Quantity must be at least 1')
    .max(20, 'Quantity cannot exceed 20 units per item'),
});

export const orderCreateSchema = z.object({
  customerName: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  customerEmail: z.string().trim().email('Invalid email address').max(255),
  customerPhone: z.string().trim().regex(PHONE_REGEX, 'Phone must be a valid 10 to 15 digit number'),
  shippingAddressLine1: z.string().trim().min(5, 'Address line 1 must be at least 5 characters').max(255),
  shippingAddressLine2: z.string().trim().max(255).optional().nullable(),
  shippingCity: z.string().trim().min(2, 'City is required').max(100),
  shippingState: z.string().trim().min(2, 'State is required').max(100),
  shippingPincode: z.string().trim().regex(PINCODE_REGEX, 'Pincode must be a valid 6-digit Indian PIN code'),
  items: z
    .array(orderItemInputSchema)
    .min(1, 'Order must contain at least one item')
    .max(20, 'Maximum 20 items per order')
    .refine(
      (items) => {
        const variantIds = items.map((i) => i.variantId.toLowerCase());
        return new Set(variantIds).size === variantIds.length;
      },
      {
        message: 'Duplicate product variant IDs in order items are not permitted; consolidate quantities into a single item',
      }
    ),
  paymentMethod: z.literal('COD', {
    errorMap: () => ({ message: 'Only Cash on Delivery (COD) is supported in this phase' }),
  }),
  idempotencyKey: z
    .string()
    .trim()
    .min(8, 'Idempotency key must be at least 8 characters')
    .max(64, 'Idempotency key must not exceed 64 characters')
    .regex(
      /^[A-Za-z0-9_-]+$/,
      'Idempotency key may only contain alphanumeric characters, hyphens, and underscores'
    )
    .optional(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export type OrderCreateInput = z.infer<typeof orderCreateSchema>;

export const orderStatusUpdateSchema = z.object({
  status: z.enum(['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
  reason: z.string().trim().max(255).optional(),
});

export type OrderStatusUpdateInput = z.infer<typeof orderStatusUpdateSchema>;
