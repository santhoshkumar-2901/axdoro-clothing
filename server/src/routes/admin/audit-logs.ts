import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middleware/adminAuth.js';
import { getAuditLogs } from '../../services/audit-log.service.js';

export const adminAuditLogsRouter = Router();

adminAuditLogsRouter.use(requireAdmin);

// GET /api/admin/audit-logs
adminAuditLogsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const action = req.query.action as string | undefined;
    const entityType = req.query.entityType as string | undefined;

    const result = await getAuditLogs({ page, limit, action, entityType });
    res.json({
      status: 'success',
      data: result.logs,
      logs: result.logs,
      pagination: {
        page,
        limit,
        totalCount: result.totalCount,
        totalPages: result.totalPages,
      },
    });
  } catch (err) {
    next(err);
  }
});
