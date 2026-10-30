import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '../../config/env.js';
import { requireAdmin } from '../../middleware/adminAuth.js';
import {
  processCloudinaryCleanupQueue,
  reconcileCloudinaryPendingTags,
  reconcileStagedProductUploads,
} from '../../services/cloudinary-cleanup.service.js';

export const adminMaintenanceRouter = Router();

/**
 * Middleware that permits requests authenticated either via:
 * 1. Dedicated CRON_SECRET header (Authorization: Bearer <CRON_SECRET>)
 * 2. Authenticated Admin session cookie/header
 */
export async function requireCronOrAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const cronSecret = env.CRON_SECRET;

  if (cronSecret && authHeader) {
    const [scheme, token] = authHeader.split(' ');
    if (scheme?.toLowerCase() === 'bearer' && token) {
      try {
        const expectedBuf = Buffer.from(cronSecret);
        const actualBuf = Buffer.from(token.trim());
        if (expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf)) {
          return next();
        }
      } catch {
        // Fall through to admin check
      }
    }
  }

  // Fallback to standard admin authentication
  await requireAdmin(req, res, next);
}

// GET /api/admin/maintenance/cleanup - Scheduled Vercel Cron trigger
// POST /api/admin/maintenance/cleanup - Manual/programmatic trigger
const handleCleanup = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const queueResult = await processCloudinaryCleanupQueue(20);
    const reconcileResult = await reconcileCloudinaryPendingTags();
    const stagedProductResult = await reconcileStagedProductUploads();

    res.json({
      status: 'success',
      data: {
        queue: queueResult,
        reconciliation: reconcileResult,
        stagedProducts: stagedProductResult,
      },
    });
  } catch (err) {
    next(err);
  }
};

adminMaintenanceRouter.get('/cleanup', requireCronOrAdmin, handleCleanup);
adminMaintenanceRouter.post('/cleanup', requireCronOrAdmin, handleCleanup);
