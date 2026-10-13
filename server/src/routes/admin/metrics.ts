import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middleware/adminAuth.js';
import { adminGetDashboardMetrics } from '../../services/admin-catalogue.service.js';

export const adminMetricsRouter = Router();

adminMetricsRouter.use(requireAdmin);

// GET /api/admin/metrics - Dashboard operational overview
adminMetricsRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const metrics = await adminGetDashboardMetrics();
    res.json({
      status: 'success',
      data: metrics,
      ...metrics,
    });
  } catch (err) {
    next(err);
  }
});
