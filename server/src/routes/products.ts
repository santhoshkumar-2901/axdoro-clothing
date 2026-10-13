import { Router, Request, Response, NextFunction } from 'express';
import { productsQuerySchema, productSlugSchema } from '../schemas/catalogue.js';
import {
  getPublishedProducts,
  getPublishedProductBySlug,
} from '../services/catalogue.service.js';

export const productsRouter = Router();

// GET /api/products - paginated, searchable, category-filtered, sortable listing
productsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = productsQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      const errorMessage = parseResult.error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      res.status(400).json({
        status: 'error',
        message: `Invalid query parameters: ${errorMessage}`,
      });
      return;
    }

    const result = await getPublishedProducts(parseResult.data);
    res.json({
      status: 'success',
      data: result.data,
      products: result.data,
      pagination: result.pagination,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/products/:slug - product detail with variants and gallery
productsRouter.get('/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = productSlugSchema.safeParse(req.params);
    if (!parseResult.success) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid product slug parameter',
      });
      return;
    }

    const product = await getPublishedProductBySlug(parseResult.data.slug);
    if (!product) {
      res.status(404).json({
        status: 'error',
        message: 'Product not found',
      });
      return;
    }

    res.json({
      status: 'success',
      data: product,
    });
  } catch (err) {
    next(err);
  }
});
