import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middleware/adminAuth.js';
import {
  adminReturnListQuerySchema,
  adminReturnStatusUpdateSchema,
  adminReturnShippingUpdateSchema,
  adminReturnInspectionUpdateSchema,
  adminReturnRefundUpdateSchema,
} from '../../schemas/admin-returns.js';
import {
  listAdminReturns,
  getAdminReturnMetrics,
  getAdminReturnById,
  updateReturnStatus,
  updateReturnShipping,
  updateReturnInspection,
  updateReturnRefund,
  deleteReturnEvidence,
} from '../../services/return.service.js';
import { fetchAuthenticatedArtworkBuffer } from '../../services/cloudinary.service.js';
import { query } from '../../config/db.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const adminReturnsRouter = Router();

// Enforce admin authentication across all return routes
adminReturnsRouter.use(requireAdmin);

// GET /api/admin/returns/metrics - Triage counts & badges
adminReturnsRouter.get('/metrics', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const metrics = await getAdminReturnMetrics();
    res.json({
      status: 'success',
      data: metrics,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/returns - List returns with pagination & filters
adminReturnsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = adminReturnListQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({
        status: 'error',
        message: parseResult.error.errors.map((e) => e.message).join(', '),
        errors: parseResult.error.errors,
      });
      return;
    }
    const result = await listAdminReturns(parseResult.data);

    res.json({
      status: 'success',
      data: result.items,
      pagination: result.pagination,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/returns/:id - Get request details
adminReturnsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!UUID_REGEX.test(id)) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid return request ID format. Expected a valid UUID.',
      });
      return;
    }

    const detail = await getAdminReturnById(id);
    if (!detail) {
      res.status(404).json({
        status: 'error',
        message: 'Return request not found.',
      });
      return;
    }

    res.json({
      status: 'success',
      data: detail,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/returns/:id/status - Update review status
adminReturnsRouter.patch('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!UUID_REGEX.test(id)) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid return request ID format.',
      });
      return;
    }

    const parseResult = adminReturnStatusUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        status: 'error',
        message: parseResult.error.errors.map((e) => e.message).join(', '),
        errors: parseResult.error.errors,
      });
      return;
    }

    const adminUser = req.admin || { id: null, email: 'system@axdoro.com', role: 'ADMIN' };
    const updated = await updateReturnStatus(id, parseResult.data, adminUser, req.ip);

    res.json({
      status: 'success',
      message: 'Return request status updated successfully.',
      data: updated,
    });
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err.message.includes('Invalid status transition') ||
        err.message.includes('Cannot complete return request') ||
        err.message.includes('Cannot mark return request'))
    ) {
      res.status(400).json({
        status: 'error',
        message: err.message,
      });
      return;
    }
    if (err instanceof Error && err.message.includes('not found')) {
      res.status(404).json({
        status: 'error',
        message: err.message,
      });
      return;
    }
    next(err);
  }
});

// PATCH /api/admin/returns/:id/shipping - Update shipping instructions & tracking
adminReturnsRouter.patch('/:id/shipping', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!UUID_REGEX.test(id)) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid return request ID format.',
      });
      return;
    }

    const parseResult = adminReturnShippingUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        status: 'error',
        message: parseResult.error.errors.map((e) => e.message).join(', '),
        errors: parseResult.error.errors,
      });
      return;
    }

    const adminUser = req.admin || { id: null, email: 'system@axdoro.com', role: 'ADMIN' };
    const updated = await updateReturnShipping(id, parseResult.data, adminUser, req.ip);

    res.json({
      status: 'success',
      message: 'Shipping information updated successfully.',
      data: updated,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/returns/:id/inspection - Record physical inspection
adminReturnsRouter.patch('/:id/inspection', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!UUID_REGEX.test(id)) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid return request ID format.',
      });
      return;
    }

    const parseResult = adminReturnInspectionUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        status: 'error',
        message: parseResult.error.errors.map((e) => e.message).join(', '),
        errors: parseResult.error.errors,
      });
      return;
    }

    const adminUser = req.admin || { id: null, email: 'system@axdoro.com', role: 'ADMIN' };
    const updated = await updateReturnInspection(id, parseResult.data, adminUser, req.ip);

    res.json({
      status: 'success',
      message: 'Inspection record updated successfully.',
      data: updated,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/returns/:id/refund - Update manual refund tracking ledger
adminReturnsRouter.patch('/:id/refund', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!UUID_REGEX.test(id)) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid return request ID format.',
      });
      return;
    }

    const parseResult = adminReturnRefundUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        status: 'error',
        message: parseResult.error.errors.map((e) => e.message).join(', '),
        errors: parseResult.error.errors,
      });
      return;
    }

    const adminUser = req.admin || { id: null, email: 'system@axdoro.com', role: 'ADMIN' };
    const updated = await updateReturnRefund(id, parseResult.data, adminUser, req.ip);

    res.json({
      status: 'success',
      message: 'Refund record updated successfully.',
      data: updated,
    });
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err.message.includes('Invalid') ||
        err.message.includes('exceeds') ||
        err.message.includes('already') ||
        err.message.includes('required') ||
        err.message.includes('A valid') ||
        err.message.includes('A positive') ||
        err.message.includes('A non-empty'))
    ) {
      res.status(400).json({
        status: 'error',
        message: err.message,
      });
      return;
    }
    if (err instanceof Error && err.message.includes('not found')) {
      res.status(404).json({
        status: 'error',
        message: err.message,
      });
      return;
    }
    next(err);
  }
});

// GET /api/admin/returns/:id/evidence/:evidenceId - Stream private evidence image securely
adminReturnsRouter.get(
  '/:id/evidence/:evidenceId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, evidenceId } = req.params;
      if (!UUID_REGEX.test(id) || !UUID_REGEX.test(evidenceId)) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid ID format. Expected valid UUIDs.',
        });
        return;
      }

      // Check existence and parent linkage to prevent IDOR
      const evRes = await query<{
        cloudinary_public_id: string;
        format: string;
        original_filename: string;
        mime_type: string;
      }>(
        `SELECT cloudinary_public_id, format, original_filename, mime_type
         FROM return_request_evidence
         WHERE id = $1 AND return_request_id = $2 AND deleted_at IS NULL`,
        [evidenceId, id]
      );

      if (evRes.rows.length === 0) {
        res.status(404).json({
          status: 'error',
          message: 'Evidence image not found or no longer available.',
        });
        return;
      }

      const ev = evRes.rows[0];
      const assetData = await fetchAuthenticatedArtworkBuffer(ev.cloudinary_public_id, ev.format);

      if (!assetData) {
        res.status(502).json({
          status: 'error',
          message: 'Unable to retrieve evidence image from secure storage.',
        });
        return;
      }

      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
      const contentType = allowedMimes.includes(ev.mime_type) ? ev.mime_type : 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(ev.original_filename)}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      res.setHeader('Cache-Control', 'private, no-store');

      res.send(assetData.buffer);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/admin/returns/:id/evidence/:evidenceId - Explicit evidence deletion
adminReturnsRouter.delete(
  '/:id/evidence/:evidenceId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, evidenceId } = req.params;
      if (!UUID_REGEX.test(id) || !UUID_REGEX.test(evidenceId)) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid ID format.',
        });
        return;
      }

      const adminUser = req.admin || { id: null, email: 'system@axdoro.com', role: 'ADMIN' };
      const result = await deleteReturnEvidence(id, evidenceId, adminUser, req.ip);

      res.json({
        status: 'success',
        message: 'Evidence deleted successfully and queued for permanent storage cleanup.',
        data: result,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('not found')) {
        res.status(404).json({
          status: 'error',
          message: err.message,
        });
        return;
      }
      next(err);
    }
  }
);
