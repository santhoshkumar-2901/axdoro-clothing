import { z } from 'zod';

export const adminReturnListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(['ALL', 'REQUEST_SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED'])
    .default('ALL'),
  search: z.string().trim().max(100).optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
});

export type AdminReturnListQuery = z.infer<typeof adminReturnListQuerySchema>;

export const adminReturnStatusUpdateSchema = z
  .object({
    status: z.enum(['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED']),
    adminNotes: z.string().trim().max(2000).optional(),
    rejectionReason: z.string().trim().max(1000).optional(),
  })
  .refine(
    (data) => {
      if (data.status === 'REJECTED') {
        return Boolean(data.rejectionReason && data.rejectionReason.length >= 5);
      }
      return true;
    },
    {
      message: 'Rejection reason of at least 5 characters is mandatory when rejecting a return request.',
      path: ['rejectionReason'],
    }
  );

export type AdminReturnStatusUpdatePayload = z.infer<typeof adminReturnStatusUpdateSchema>;

export const adminReturnShippingUpdateSchema = z.object({
  shippingInstructions: z.string().trim().max(2000).optional().nullable(),
  returnCourierName: z.string().trim().max(64).optional().nullable(),
  returnTrackingNumber: z.string().trim().max(128).optional().nullable(),
  customerShippedAt: z.string().datetime().optional().nullable(),
  productReceivedAt: z.string().datetime().optional().nullable(),
});

export type AdminReturnShippingPayload = z.infer<typeof adminReturnShippingUpdateSchema>;

export const adminReturnInspectionUpdateSchema = z.object({
  inspectionResult: z.enum(['PENDING', 'PASS', 'FAIL', 'PARTIAL']),
  inspectionNotes: z.string().trim().min(3).max(2000),
  productReceivedAt: z.string().datetime().optional().nullable(),
});

export type AdminReturnInspectionPayload = z.infer<typeof adminReturnInspectionUpdateSchema>;

export const adminReturnRefundUpdateSchema = z
  .object({
    refundStatus: z.enum(['NOT_APPLICABLE', 'PENDING', 'INITIATED', 'COMPLETED', 'REJECTED']),
    refundAmountPaise: z.number().int().min(0).optional().nullable(),
    refundMethod: z
      .enum(['ORIGINAL_PAYMENT', 'BANK_TRANSFER', 'UPI', 'STORE_CREDIT'])
      .optional()
      .nullable(),
    refundReference: z.string().trim().max(128).optional().nullable(),
    refundNotes: z.string().trim().max(1000).optional().nullable(),
    refundCompletedAt: z.string().datetime().optional().nullable(),
    allowExcessRefund: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.refundStatus === 'COMPLETED') {
        const hasRef = Boolean(data.refundReference && data.refundReference.length > 0);
        const hasAmount = typeof data.refundAmountPaise === 'number' && data.refundAmountPaise > 0;
        const hasMethod = Boolean(data.refundMethod);
        return hasRef && hasAmount && hasMethod;
      }
      return true;
    },
    {
      message: 'A valid refundMethod, non-empty refundReference, and positive refundAmountPaise are required when marking refund as COMPLETED.',
      path: ['refundReference'],
    }
  )
  .refine(
    (data) => {
      if (data.refundStatus === 'REJECTED') {
        return Boolean(data.refundNotes && data.refundNotes.trim().length >= 5);
      }
      return true;
    },
    {
      message: 'Refund notes explaining the reason for rejection (at least 5 characters) are mandatory when marking refund as REJECTED.',
      path: ['refundNotes'],
    }
  );

export type AdminReturnRefundPayload = z.infer<typeof adminReturnRefundUpdateSchema>;

