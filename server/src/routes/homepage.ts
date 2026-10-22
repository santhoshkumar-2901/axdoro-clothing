import { Router, Request, Response, NextFunction } from 'express';
import { getHomepageHeroSetting } from '../services/site-settings.service.js';

export const homepageRouter = Router();

// GET /api/homepage/hero — Return current homepage hero configuration (public)
homepageRouter.get('/hero', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const hero = await getHomepageHeroSetting();
    res.json({
      status: 'success',
      data: {
        imageUrl: hero.imageUrl,
      },
    });
  } catch (err) {
    next(err);
  }
});
