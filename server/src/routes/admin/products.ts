import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middleware/adminAuth.js';
import {
  adminProductsQuerySchema,
  productCreateSchema,
  productUpdateSchema,
  productVariantSchema,
  productVariantUpdateSchema,
} from '../../schemas/admin.js';
import {
  adminGetProducts,
  adminGetProductById,
  adminCreateProduct,
  adminUpdateProduct,
  adminArchiveProduct,
  adminCreateVariant,
  adminUpdateVariant,
} from '../../services/admin-catalogue.service.js';

export const adminProductsRouter = Router();

// Protect all routes with requireAdmin
adminProductsRouter.use(requireAdmin);

// GET /api/admin/products
adminProductsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = adminProductsQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({
        status: 'error',
        error: 'Invalid query parameters',
        message: 'Invalid query parameters',
        errors: parseResult.error.errors,
      });
      return;
    }

    const result = await adminGetProducts(parseResult.data);
    res.json({
      status: 'success',
      data: result.products,
      products: result.products,
      pagination: {
        page: parseResult.data.page,
        limit: parseResult.data.limit,
        totalCount: result.totalCount,
        totalPages: result.totalPages,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/products/:id
adminProductsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await adminGetProductById(req.params.id);
    if (!product) {
      res.status(404).json({
        status: 'error',
        error: 'Product not found',
        message: 'Product not found',
      });
      return;
    }
    res.json({
      status: 'success',
      data: product,
      product,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/products
adminProductsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = productCreateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        status: 'error',
        error: 'Invalid product data: ' + parseResult.error.errors.map((e) => e.message).join(', '),
        message: 'Invalid product data: ' + parseResult.error.errors.map((e) => e.message).join(', '),
      });
      return;
    }

    const created = await adminCreateProduct(parseResult.data, req.admin!);
    res.status(201).json({
      status: 'success',
      data: created,
      product: created,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('duplicate key value') || msg.includes('chk_product_slug')) {
      res.status(409).json({
        status: 'error',
        error: 'A product with this slug or SKU already exists',
        message: 'A product with this slug or SKU already exists',
      });
      return;
    }
    next(err);
  }
});

// PUT /api/admin/products/:id
adminProductsRouter.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = productUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        status: 'error',
        error: 'Invalid update payload',
        message: 'Invalid update payload',
        errors: parseResult.error.errors,
      });
      return;
    }

    await adminUpdateProduct(req.params.id, parseResult.data, req.admin!);
    const updated = await adminGetProductById(req.params.id);
    res.json({
      status: 'success',
      message: 'Product updated successfully',
      data: updated,
      product: updated,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/products/:id/archive
adminProductsRouter.post('/:id/archive', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await adminArchiveProduct(req.params.id, req.admin!);
    const updated = await adminGetProductById(req.params.id);
    res.json({
      status: 'success',
      message: 'Product archived successfully',
      data: updated,
      product: updated,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/products/:id/variants
adminProductsRouter.post('/:id/variants', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = productVariantSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        status: 'error',
        error: 'Invalid variant payload: ' + parseResult.error.errors.map((e) => e.message).join(', '),
        message: 'Invalid variant payload: ' + parseResult.error.errors.map((e) => e.message).join(', '),
        errors: parseResult.error.errors,
      });
      return;
    }

    const result = await adminCreateVariant(req.params.id, parseResult.data, req.admin!);
    res.status(201).json({
      status: 'success',
      data: result,
      variant: result,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('duplicate key value') || msg.includes('chk_variant_sku') || msg.includes('uq_product_variant')) {
      if (msg.includes('product_variants_sku_key') || msg.includes('sku')) {
        res.status(409).json({
          status: 'error',
          error: 'A variant with this SKU already exists',
          message: 'A variant with this SKU already exists',
        });
      } else {
        res.status(409).json({
          status: 'error',
          error: `A variant with size '${req.body.size}' and color '${req.body.color}' already exists for this product`,
          message: `A variant with size '${req.body.size}' and color '${req.body.color}' already exists for this product`,
        });
      }
      return;
    }
    next(err);
  }
});

// PUT /api/admin/products/:id/variants/:variantId
adminProductsRouter.put('/:id/variants/:variantId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = productVariantUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        status: 'error',
        error: 'Invalid variant update payload: ' + parseResult.error.errors.map((e) => e.message).join(', '),
        message: 'Invalid variant update payload',
        errors: parseResult.error.errors,
      });
      return;
    }

    const updated = await adminUpdateVariant(
      req.params.id,
      req.params.variantId,
      parseResult.data,
      req.admin!
    );

    if (!updated) {
      res.status(404).json({
        status: 'error',
        error: 'Variant not found for the specified product',
        message: 'Variant not found for the specified product',
      });
      return;
    }

    res.json({
      status: 'success',
      message: 'Variant updated successfully',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('duplicate key value') || msg.includes('chk_variant_sku') || msg.includes('uq_product_variant')) {
      if (msg.includes('product_variants_sku_key') || msg.includes('sku')) {
        res.status(409).json({
          status: 'error',
          error: 'A variant with this SKU already exists',
          message: 'A variant with this SKU already exists',
        });
      } else {
        res.status(409).json({
          status: 'error',
          error: 'A variant with this size and color already exists for this product',
          message: 'A variant with this size and color already exists for this product',
        });
      }
      return;
    }
    next(err);
  }
});
