import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middleware/adminAuth.js';
import { paymentQrUpdateSchema } from '../../schemas/admin.js';
import {
  getPaymentQrSetting,
  updatePaymentQrSetting,
} from '../../services/site-settings.service.js';
import {
  isCloudinaryConfigured,
  generateUploadSignature,
} from '../../services/cloudinary.service.js';

export const adminPaymentSettingsRouter = Router();

adminPaymentSettingsRouter.use(requireAdmin);

// GET /api/admin/payment-settings/qr — Fetch current payment QR configuration
adminPaymentSettingsRouter.get('/qr', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const setting = await getPaymentQrSetting();
    res.json({
      status: 'success',
      data: setting,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/payment-settings/qr/upload-signature — Generate Cloudinary upload signature
adminPaymentSettingsRouter.post('/qr/upload-signature', async (_req: Request, res: Response, next: NextFunction) => {
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
      folder: 'axdoro/payment',
    });

    res.json({
      status: 'success',
      data: config,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/payment-settings/qr — Update payment QR and UPI ID
adminPaymentSettingsRouter.put('/qr', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = paymentQrUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        status: 'error',
        error: 'Invalid payment QR payload: ' + parseResult.error.errors.map((e) => e.message).join(', '),
        message: 'Invalid payment QR payload: ' + parseResult.error.errors.map((e) => e.message).join(', '),
      });
      return;
    }

    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;

    const updated = await updatePaymentQrSetting({
      imageUrl: parseResult.data.imageUrl,
      publicId: parseResult.data.publicId,
      upiId: parseResult.data.upiId,
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
