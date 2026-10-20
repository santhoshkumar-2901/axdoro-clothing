import { Router, Request, Response, NextFunction } from 'express';
import {
  getPublicHomepageCollections,
  getPublicHomepageCollectionBySlug,
} from '../services/catalogue.service.js';

export const collectionsRouter = Router();

// GET /api/collections — Return all enabled collections containing eligible published products
collectionsRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const collections = await getPublicHomepageCollections();
    res.json({
      status: 'success',
      data: collections,
      collections,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/collections/:slug — Return a single enabled collection by slug
collectionsRouter.get('/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const collection = await getPublicHomepageCollectionBySlug(req.params.slug);
    if (!collection) {
      res.status(404).json({
        status: 'error',
        error: 'Collection not found or inactive',
        message: 'Collection not found or inactive',
      });
      return;
    }

    res.json({
      status: 'success',
      data: collection,
      collection,
    });
  } catch (err) {
    next(err);
  }
});
