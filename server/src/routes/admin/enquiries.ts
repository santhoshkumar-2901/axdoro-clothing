import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middleware/adminAuth.js';
import { enquiryQuerySchema, UUID_REGEX } from '../../schemas/enquiries.js';
import { listEnquiries, exportEnquiriesCsv, adminDeleteEnquiry, getEnquiryById } from '../../services/enquiry.service.js';
import {
  getDriveSyncStatus,
  backfillPendingEnquiries,
  processDriveSyncQueue,
} from '../../services/google-sheets.service.js';
import { fetchAuthenticatedArtworkBuffer } from '../../services/cloudinary.service.js';
import {
  getCleanupJobsStatus,
  retryCleanupJobs,
  processCloudinaryCleanupQueue,
} from '../../services/cloudinary-cleanup.service.js';
import { createAuditLog } from '../../services/audit-log.service.js';

export const adminEnquiriesRouter = Router();

adminEnquiriesRouter.use(requireAdmin);

// GET /api/admin/enquiries - List enquiries with filters and pagination
adminEnquiriesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = enquiryQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({
        status: 'error',
        error: 'Invalid query parameters: ' + parseResult.error.errors.map((e) => e.message).join(', '),
        message: 'Invalid query parameters',
        errors: parseResult.error.errors,
      });
      return;
    }

    const result = await listEnquiries(parseResult.data);

    res.json({
      status: 'success',
      data: result.enquiries,
      enquiries: result.enquiries,
      pagination: {
        page: parseResult.data.page,
        limit: parseResult.data.limit,
        totalCount: result.totalCount,
        totalPages: result.totalPages,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/enquiries/export.csv - Formula-safe CSV export
adminEnquiriesRouter.get('/export.csv', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = enquiryQuerySchema.safeParse(req.query);
    const filter = parseResult.success ? parseResult.data : {};

    const csvData = await exportEnquiriesCsv(filter);
    const today = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="axdoro-enquiries-${today}.csv"`);
    res.send(csvData);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/enquiries/sync-status - Google Drive sync aggregate status
adminEnquiriesRouter.get('/sync-status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await getDriveSyncStatus();
    res.json({
      status: 'success',
      data: status,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/enquiries/sync - Manually trigger backfill, Drive queue, and Cloudinary cleanup
adminEnquiriesRouter.post('/sync', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const backfilled = await backfillPendingEnquiries();
    const driveResult = await processDriveSyncQueue();
    const cleanupResult = await processCloudinaryCleanupQueue();

    res.json({
      status: 'success',
      message: `Enquiry synchronization complete: ${driveResult.synced} synced, ${driveResult.failed} failed (${backfilled} backfilled). Cloudinary cleanup: ${cleanupResult.completed} completed, ${cleanupResult.failed} failed.`,
      data: {
        backfilled,
        drive: driveResult,
        cleanup: cleanupResult,
      },
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/enquiries/:id - Permanently delete an enquiry from PostgreSQL
adminEnquiriesRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    if (!UUID_REGEX.test(id)) {
      res.status(400).json({
        status: 'error',
        error: 'Invalid enquiry ID format. Expected a valid UUID.',
        message: 'Invalid enquiry ID format. Expected a valid UUID.',
      });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress || undefined;
    const result = await adminDeleteEnquiry(id, req.admin!, ipAddress);

    if (result.status === 'not_found') {
      res.status(404).json({
        status: 'error',
        error: result.message || 'Enquiry not found',
        message: result.message || 'Enquiry not found',
      });
      return;
    }

    if (result.status === 'conflict') {
      res.status(409).json({
        status: 'error',
        error: result.message || 'Enquiry cannot be deleted due to an active synchronization conflict',
        message: result.message || 'Enquiry cannot be deleted due to an active synchronization conflict',
      });
      return;
    }

    res.json({
      status: 'success',
      message: result.message || 'Enquiry permanently deleted successfully',
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/enquiries/:id/artwork - Securely stream or download authenticated artwork attachment
adminEnquiriesRouter.get('/:id/artwork', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    if (!UUID_REGEX.test(id)) {
      res.status(400).json({
        status: 'error',
        error: 'Invalid enquiry ID format. Expected a valid UUID.',
      });
      return;
    }

    const enquiry = await getEnquiryById(id);
    if (!enquiry) {
      res.status(404).json({
        status: 'error',
        error: 'Enquiry not found.',
      });
      return;
    }

    if (!enquiry.hasArtwork || !enquiry.designFilePublicId) {
      res.status(404).json({
        status: 'error',
        error: 'No custom artwork attachment found for this enquiry.',
      });
      return;
    }

    const format = (enquiry.designFileFormat || 'png').toLowerCase();
    const artworkData = await fetchAuthenticatedArtworkBuffer(enquiry.designFilePublicId, format);

    if (!artworkData) {
      res.status(502).json({
        status: 'error',
        error: 'Unable to retrieve artwork from storage service.',
      });
      return;
    }

    const filename = enquiry.designFileName || `artwork-${enquiry.id}.${format}`;
    res.setHeader('Content-Type', artworkData.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.send(artworkData.buffer);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/enquiries/cleanup-status - Discoverable cleanup queue status without PII
adminEnquiriesRouter.get('/cleanup-status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await getCleanupJobsStatus();
    res.json({
      status: 'success',
      data: status,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/enquiries/cleanup-retry - Controlled recovery for failed cleanup jobs with audit logging
adminEnquiriesRouter.post('/cleanup-retry', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const jobId = typeof req.body?.jobId === 'string' ? req.body.jobId : undefined;
    const ipAddress = req.ip || req.socket.remoteAddress || undefined;

    const retriedCount = await retryCleanupJobs(jobId);

    // Record immutable audit log entry
    await createAuditLog({
      adminId: req.admin!.id,
      adminEmail: req.admin!.email,
      action: 'CLEANUP_JOB_RETRY',
      entityType: 'cloudinary_cleanup',
      entityId: jobId || null,
      details: {
        jobId: jobId || 'ALL_FAILED',
        retriedCount,
        triggeredAt: new Date().toISOString(),
      },
      ipAddress,
    });

    // Immediately trigger queue execution
    const processResult = await processCloudinaryCleanupQueue();

    res.json({
      status: 'success',
      message: `Retried ${retriedCount} cleanup jobs. Processed: ${processResult.processed}, Completed: ${processResult.completed}, Failed: ${processResult.failed}.`,
      data: {
        retriedCount,
        processResult,
      },
    });
  } catch (err) {
    next(err);
  }
});
