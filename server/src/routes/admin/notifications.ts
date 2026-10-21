import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middleware/adminAuth.js';
import { getUnacknowledgedOrdersCount } from '../../services/order.service.js';
import { getDistinctLowStockProductsCount } from '../../services/admin-catalogue.service.js';

export const adminNotificationsRouter = Router();

adminNotificationsRouter.use(requireAdmin);

/**
 * GET /api/admin/notifications/badge-counts
 * Lightweight endpoint returning counts for sidebar notification badges.
 * - Orders: unacknowledged orders (acknowledged_at IS NULL and not cancelled/delivered).
 * - Inventory & Stock: distinct published products with at least one active variant with stock < 10.
 */
const handleGetBadgeCounts = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [unacknowledgedOrders, lowStockProducts] = await Promise.all([
      getUnacknowledgedOrdersCount(),
      getDistinctLowStockProductsCount(10),
    ]);

    res.json({
      status: 'success',
      data: {
        orders: {
          unacknowledgedCount: unacknowledgedOrders,
        },
        inventory: {
          lowStockProductCount: lowStockProducts,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

adminNotificationsRouter.get('/badge-counts', handleGetBadgeCounts);
adminNotificationsRouter.get('/', handleGetBadgeCounts);
