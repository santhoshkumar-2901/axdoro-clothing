import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middleware/adminAuth.js';
import { homepageHeroUpdateSchema } from '../../schemas/admin.js';
import {
  getHomepageHeroSetting,
  updateHomepageHeroSetting,
} from '../../services/site-settings.service.js';
import {
  isCloudinaryConfigured,
  generateUploadSignature,
} from '../../services/cloudinary.service.js';

export const adminHomepageRouter = Router();

adminHomepageRouter.use(requireAdmin);

// GET /api/admin/homepage/hero — Fetch current hero banner configuration
adminHomepageRouter.get('/hero', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const hero = await getHomepageHeroSetting();
    res.json({
      status: 'success',
      data: hero,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/homepage/hero/upload-signature — Generate Cloudinary upload signature for hero banner
adminHomepageRouter.post('/hero/upload-signature', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isCloudinaryConfigured()) {
      res.status(503).json({
        status: 'error',
        code: 'CLOUDINARY_NOT_CONFIGURED',
        error: 'Cloudinary credentials are not configured on this server',
        message:
          'Cloudinary credentials (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) must be set in server environment variables.',
      });
      return;
    }

    const config = generateUploadSignature({
      hero: true,
      folder: 'axdoro/hero',
    });

    res.json({
      status: 'success',
      data: config,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/homepage/hero — Update homepage hero image configuration
adminHomepageRouter.put('/hero', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = homepageHeroUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        status: 'error',
        error: 'Invalid hero image payload: ' + parseResult.error.errors.map((e) => e.message).join(', '),
        message: 'Invalid hero image payload: ' + parseResult.error.errors.map((e) => e.message).join(', '),
      });
      return;
    }

    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;

    const updated = await updateHomepageHeroSetting({
      imageUrl: parseResult.data.imageUrl,
      publicId: parseResult.data.publicId,
      adminId: req.admin!.id,
      adminEmail: req.admin!.email,
      ipAddress: clientIp,
    });

    res.json({
      status: 'success',
      data: updated,
    });
  } catch (err) {
    next(err);
  }
});
