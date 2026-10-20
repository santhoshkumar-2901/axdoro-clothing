import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middleware/adminAuth.js';
import {
  homepageCollectionUpdateSchema,
  collectionProductsUpdateSchema,
} from '../../schemas/admin.js';
import {
  adminGetHomepageCollections,
  adminUpdateHomepageCollection,
  adminUpdateCollectionProducts,
} from '../../services/admin-catalogue.service.js';

export const adminCollectionsRouter = Router();

// Protect all collection routes with requireAdmin middleware
adminCollectionsRouter.use(requireAdmin);

// GET /api/admin/collections — Retrieve all collections with ordered products
adminCollectionsRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const collections = await adminGetHomepageCollections();
    res.json({
      status: 'success',
      data: collections,
      collections,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/collections/:id — Update collection metadata (title, isEnabled, description, displayOrder)
adminCollectionsRouter.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = homepageCollectionUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        status: 'error',
        error: 'Invalid collection update payload: ' + parseResult.error.errors.map((e) => e.message).join(', '),
        message: 'Invalid collection update payload: ' + parseResult.error.errors.map((e) => e.message).join(', '),
      });
      return;
    }

    const updated = await adminUpdateHomepageCollection(req.params.id, parseResult.data, req.admin!);
    res.json({
      status: 'success',
      data: updated,
      collection: updated,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Collection not found')) {
      res.status(404).json({
        status: 'error',
        error: 'Collection not found',
        message: 'Collection not found',
      });
      return;
    }
    next(err);
  }
});

// PUT /api/admin/collections/:id/products — Update products and ordering in collection
adminCollectionsRouter.put('/:id/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = collectionProductsUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        status: 'error',
        error: 'Invalid products payload: ' + parseResult.error.errors.map((e) => e.message).join(', '),
        message: 'Invalid products payload: ' + parseResult.error.errors.map((e) => e.message).join(', '),
      });
      return;
    }

    const updated = await adminUpdateCollectionProducts(
      req.params.id,
      parseResult.data.productIds,
      req.admin!
    );
    res.json({
      status: 'success',
      data: updated,
      collection: updated,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Collection not found')) {
      res.status(404).json({
        status: 'error',
        error: 'Collection not found',
        message: 'Collection not found',
      });
      return;
    }
    if (msg.includes('One or more product IDs do not exist')) {
      res.status(400).json({
        status: 'error',
        error: msg,
        message: msg,
      });
      return;
    }
    next(err);
  }
});
