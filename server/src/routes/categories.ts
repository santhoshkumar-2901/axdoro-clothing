import { Router, Request, Response, NextFunction } from 'express';
import { getActiveCategories, getCategoryBySlug } from '../services/catalogue.service.js';

export const categoriesRouter = Router();

categoriesRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await getActiveCategories();
    res.json({
      status: 'success',
      data: categories,
    });
  } catch (err) {
    next(err);
  }
});

categoriesRouter.get('/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug } = req.params;
    const category = await getCategoryBySlug(slug);
    if (!category) {
      res.status(404).json({
        status: 'error',
        message: 'Category not found',
      });
      return;
    }

    res.json({
      status: 'success',
      data: category,
      category,
    });
  } catch (err) {
    next(err);
  }
});
