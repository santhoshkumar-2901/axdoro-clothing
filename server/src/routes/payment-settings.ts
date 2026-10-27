import { Router, Request, Response, NextFunction } from 'express';
import { getPaymentQrSetting } from '../services/site-settings.service.js';

export const paymentSettingsRouter = Router();

// GET /api/payment-settings/qr — Return current active payment QR configuration (public)
paymentSettingsRouter.get('/qr', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const setting = await getPaymentQrSetting();
    res.json({
      status: 'success',
      data: {
        imageUrl: setting.imageUrl,
        upiId: setting.upiId,
      },
    });
  } catch (err) {
    next(err);
  }
});
