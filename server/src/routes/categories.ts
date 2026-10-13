import { Router, Request, Response, NextFunction } from 'express';
import { getActiveCategories } from '../services/catalogue.service.js';

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
