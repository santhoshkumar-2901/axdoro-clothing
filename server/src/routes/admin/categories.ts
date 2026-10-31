import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../middleware/adminAuth.js';
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  categorySectionUpsertSchema,
  categorySectionReorderSchema,
} from '../../schemas/admin.js';
import {
  adminGetCategories,
  adminCreateCategory,
  adminUpdateCategory,
  adminGetCategorySection,
  adminUpsertCategorySection,
  adminDeleteCategorySection,
  adminReorderCategorySections,
} from '../../services/admin-catalogue.service.js';
import {
  isCloudinaryConfigured,
  generateUploadSignature,
} from '../../services/cloudinary.service.js';

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

// PUT /api/admin/categories/sections/reorder — Must be mounted before /:id routes
adminCategoriesRouter.put('/sections/reorder', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = categorySectionReorderSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        status: 'error',
        error: 'Invalid section reorder payload',
        message: 'Invalid section reorder payload: ' + parseResult.error.errors.map((e) => e.message).join(', '),
        errors: parseResult.error.errors,
      });
      return;
    }

    await adminReorderCategorySections(parseResult.data.orderedSectionIds, req.admin!);
    res.json({
      status: 'success',
      message: 'Category sections reordered successfully',
      data: { orderedSectionIds: parseResult.data.orderedSectionIds },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith('INCOMPLETE_REORDER_REQUEST') || msg.startsWith('INVALID_SECTION_IDS')) {
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

// GET /api/admin/categories/:id/section
adminCategoriesRouter.get('/:id/section', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!z.string().uuid().safeParse(id).success) {
      res.status(400).json({
        status: 'error',
        error: 'Invalid category ID format',
        message: 'Invalid category ID format',
      });
      return;
    }

    const section = await adminGetCategorySection(id);
    if (!section) {
      const categories = await adminGetCategories();
      const categoryExists = categories.some((c) => c.id === id);
      if (!categoryExists) {
        res.status(404).json({
          status: 'error',
          error: 'Category not found',
          message: 'Category not found',
        });
        return;
      }

      res.status(404).json({
        status: 'error',
        error: 'Category section not found',
        message: 'Category section not found for this category',
      });
      return;
    }

    res.json({
      status: 'success',
      data: section,
      section,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/categories/:id/section
adminCategoriesRouter.put('/:id/section', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!z.string().uuid().safeParse(id).success) {
      res.status(400).json({
        status: 'error',
        error: 'Invalid category ID format',
        message: 'Invalid category ID format',
      });
      return;
    }

    const parseResult = categorySectionUpsertSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        status: 'error',
        error: 'Invalid category section payload',
        message: 'Invalid category section payload: ' + parseResult.error.errors.map((e) => e.message).join(', '),
        errors: parseResult.error.errors,
      });
      return;
    }

    const section = await adminUpsertCategorySection(id, parseResult.data, req.admin!);
    res.json({
      status: 'success',
      message: 'Category section saved successfully',
      data: section,
      section,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'CATEGORY_NOT_FOUND') {
      res.status(404).json({
        status: 'error',
        error: 'Category not found',
        message: 'Category not found',
      });
      return;
    }
    if (msg.startsWith('REFERENCED_CATEGORY_NOT_FOUND')) {
      const slug = msg.split(':')[1];
      res.status(400).json({
        status: 'error',
        error: msg,
        message: `Destination category referenced in card does not exist: ${slug}`,
      });
      return;
    }
    next(err);
  }
});

// DELETE /api/admin/categories/:id/section
adminCategoriesRouter.delete('/:id/section', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!z.string().uuid().safeParse(id).success) {
      res.status(400).json({
        status: 'error',
        error: 'Invalid category ID format',
        message: 'Invalid category ID format',
      });
      return;
    }

    await adminDeleteCategorySection(id, req.admin!);
    res.json({
      status: 'success',
      message: 'Category section deleted successfully',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'CATEGORY_NOT_FOUND') {
      res.status(404).json({
        status: 'error',
        error: 'Category not found',
        message: 'Category not found',
      });
      return;
    }
    if (msg === 'CATEGORY_SECTION_NOT_FOUND') {
      res.status(404).json({
        status: 'error',
        error: 'Category section not found',
        message: 'Category section not found for this category',
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

// POST /api/admin/categories/upload-signature — Signed Cloudinary upload params for categories
adminCategoriesRouter.post('/upload-signature', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isCloudinaryConfigured()) {
      res.status(503).json({
        status: 'error',
        code: 'CLOUDINARY_NOT_CONFIGURED',
        error: 'Cloudinary credentials are not configured on this server',
        message: 'Cloudinary credentials (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) must be set in server environment variables.',
      });
      return;
    }

    const config = generateUploadSignature({
      folder: 'axdoro/categories',
    });

    res.json({
      status: 'success',
      data: config,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/categories/:id/images/signature — Category-specific signed Cloudinary upload params
adminCategoriesRouter.post('/:id/images/signature', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isCloudinaryConfigured()) {
      res.status(503).json({
        status: 'error',
        code: 'CLOUDINARY_NOT_CONFIGURED',
        error: 'Cloudinary credentials are not configured on this server',
        message: 'Cloudinary credentials (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) must be set in server environment variables.',
      });
      return;
    }

    const config = generateUploadSignature({
      categoryId: req.params.id,
      folder: 'axdoro/categories',
    });

    res.json({
      status: 'success',
      data: config,
    });
  } catch (err) {
    next(err);
  }
});
