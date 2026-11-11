import { z } from 'zod';

const PHONE_REGEX = /^[+]?[0-9]{10,15}$/;

export const RETURN_REASONS = [
  'WRONG_PRODUCT_RECEIVED',
  'PRODUCT_DAMAGED_OR_DEFECTIVE',
  'SIZE_DOES_NOT_FIT',
  'CHANGED_MY_MIND',
  'PRODUCT_NOT_AS_EXPECTED',
  'OTHER',
] as const;

export type ReturnReason = (typeof RETURN_REASONS)[number];

export const returnCreateSchema = z.object({
  orderId: z
    .string({ required_error: 'Order ID is required' })
    .trim()
    .min(3, 'Order ID must be at least 3 characters')
    .max(64, 'Order ID cannot exceed 64 characters'),
  phone: z
    .string({ required_error: 'Phone number is required' })
    .trim()
    .regex(PHONE_REGEX, 'Phone must be a valid 10 to 15 digit number'),
  email: z
    .string({ required_error: 'Email address is required' })
    .trim()
    .email('Invalid email address')
    .max(255, 'Email cannot exceed 255 characters'),
  reason: z.enum(RETURN_REASONS, {
    errorMap: () => ({
      message:
        'Invalid return reason. Must be one of: ' + RETURN_REASONS.join(', '),
    }),
  }),
  description: z
    .string()
    .trim()
    .max(1000, 'Description cannot exceed 1000 characters')
    .optional()
    .nullable(),
});

export type ReturnCreateInput = z.infer<typeof returnCreateSchema>;

