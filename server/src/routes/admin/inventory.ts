import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middleware/adminAuth.js';
import { stockAdjustmentSchema } from '../../schemas/admin.js';
import { adminAdjustStock } from '../../services/admin-catalogue.service.js';

export const adminInventoryRouter = Router();

adminInventoryRouter.use(requireAdmin);

// POST /api/admin/inventory/variants/:variantId/stock
adminInventoryRouter.post(
  '/variants/:variantId/stock',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parseResult = stockAdjustmentSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          status: 'error',
          error: 'Invalid stock adjustment payload: ' + parseResult.error.errors.map((e) => e.message).join(', '),
          message: 'Invalid stock adjustment payload: ' + parseResult.error.errors.map((e) => e.message).join(', '),
        });
        return;
      }

      const { quantity, adjustment, reason } = parseResult.data;
      const result = await adminAdjustStock(req.params.variantId, { quantity, adjustment }, reason, req.admin!);

      res.json({
        status: 'success',
        message: 'Stock updated successfully',
        data: result,
        ...result,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'Variant not found') {
        res.status(404).json({
          status: 'error',
          error: 'Variant not found',
          message: 'Variant not found',
        });
        return;
      }
      if (
        msg.includes('insufficient stock') ||
        msg.includes('negative') ||
        msg.includes('non-negative') ||
        msg.includes('chk_variant_stock')
      ) {
        res.status(400).json({
          status: 'error',
          error: 'Insufficient stock: adjustment would result in negative quantity',
          message: 'Insufficient stock: adjustment would result in negative quantity',
        });
        return;
      }
      next(err);
    }
  }
);
