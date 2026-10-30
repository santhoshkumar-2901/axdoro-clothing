import { Router, Request, Response, NextFunction } from 'express';
import { getHomepageHeroSetting } from '../services/site-settings.service.js';

export const homepageRouter = Router();

// GET /api/homepage/hero — Return current homepage hero configuration (public)
homepageRouter.get('/hero', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const hero = await getHomepageHeroSetting();
    // Expose public slide fields only (strictly omit publicId and internal metadata)
    const publicSlides = hero.slides.map((s) => ({
      id: s.id,
      imageUrl: s.imageUrl,
      heading: s.heading,
      subtitle: s.subtitle,
      ctaLabel: s.ctaLabel,
      ctaLink: s.ctaLink,
      isEnabled: s.isEnabled,
    }));

    res.json({
      status: 'success',
      data: {
        imageUrl: hero.imageUrl,
        slides: publicSlides,
      },
    });
  } catch (err) {
    next(err);
  }
});
