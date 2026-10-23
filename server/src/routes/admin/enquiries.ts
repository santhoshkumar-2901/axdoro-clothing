import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middleware/adminAuth.js';
import { enquiryQuerySchema, UUID_REGEX } from '../../schemas/enquiries.js';
import { listEnquiries, exportEnquiriesCsv, adminDeleteEnquiry } from '../../services/enquiry.service.js';
import {
  getDriveSyncStatus,
  backfillPendingEnquiries,
  processDriveSyncQueue,
} from '../../services/google-sheets.service.js';

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

// POST /api/admin/enquiries/sync - Manually trigger backfill and queue processing
adminEnquiriesRouter.post('/sync', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const backfilled = await backfillPendingEnquiries();
    const result = await processDriveSyncQueue();

    res.json({
      status: 'success',
      message: `Enquiry synchronization complete: ${result.synced} synced, ${result.failed} failed (${backfilled} backfilled).`,
      data: {
        backfilled,
        ...result,
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

    const ipAddress = req.ip || req.socket.remoteAddress || null;
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
