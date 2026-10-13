import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middleware/adminAuth.js';
import { categoryCreateSchema, categoryUpdateSchema } from '../../schemas/admin.js';
import {
  adminGetCategories,
  adminCreateCategory,
  adminUpdateCategory,
} from '../../services/admin-catalogue.service.js';

export const adminCategoriesRouter = Router();

adminCategoriesRouter.use(requireAdmin);

// GET /api/admin/categories
adminCategoriesRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await adminGetCategories();
    res.json({
      status: 'success',
      data: categories,
      categories,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/categories
adminCategoriesRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = categoryCreateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        status: 'error',
        error: 'Invalid category data: ' + parseResult.error.errors.map((e) => e.message).join(', '),
        message: 'Invalid category data: ' + parseResult.error.errors.map((e) => e.message).join(', '),
      });
      return;
    }

    const created = await adminCreateCategory(parseResult.data, req.admin!);
    res.status(201).json({
      status: 'success',
      data: created,
      category: created,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('duplicate key value') || msg.includes('chk_category_slug')) {
      res.status(409).json({
        status: 'error',
        error: 'A category with this slug already exists',
        message: 'A category with this slug already exists',
      });
      return;
    }
    next(err);
  }
});

// PUT /api/admin/categories/:id
adminCategoriesRouter.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = categoryUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        status: 'error',
        error: 'Invalid category update payload',
        message: 'Invalid category update payload',
        errors: parseResult.error.errors,
      });
      return;
    }

    await adminUpdateCategory(req.params.id, parseResult.data, req.admin!);
    res.json({
      status: 'success',
      message: 'Category updated successfully',
    });
  } catch (err) {
    next(err);
  }
});
