import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../middleware/adminAuth.js';
import {
  adminProductsQuerySchema,
  productCreateSchema,
  productUpdateSchema,
  productVariantSchema,
  productVariantUpdateSchema,
  productImageAddSchema,
  productImageUpdateSchema,
  productImageReorderSchema,
} from '../../schemas/admin.js';
import {
  adminGetProducts,
  adminGetProductById,
  adminCreateProduct,
  adminUpdateProduct,
  adminArchiveProduct,
  adminUnarchiveProduct,
  adminDeleteProduct,
  adminCreateVariant,
  adminUpdateVariant,
  adminAddProductImage,
  adminUpdateProductImage,
  adminSetPrimaryImage,
  adminReorderProductImages,
  adminDeleteProductImage,
} from '../../services/admin-catalogue.service.js';
import {
  generateUploadSignature,
  isCloudinaryConfigured,
} from '../../services/cloudinary.service.js';
import {
  createStagingSession,
  heartbeatStagingSession,
  abandonStagingSession,
  preRegisterStagedAsset,
} from '../../services/product-staging.service.js';

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
    if ((err as any)?.statusCode) {
      res.status((err as any).statusCode).json({
        status: 'error',
        error: msg,
        message: msg,
      });
      return;
    }
    if (
      msg.includes('staging session') ||
      msg.includes('claimed for deletion') ||
      msg.includes('does not belong to this staging session')
    ) {
      const statusCode = msg.includes('Access denied') ? 403 : msg.includes('expired') ? 410 : 400;
      res.status(statusCode).json({
        status: 'error',
        error: msg,
        message: msg,
      });
      return;
    }
    if (
      msg.includes('duplicate key value') ||
      msg.includes('chk_product_slug') ||
      msg.includes('product_variants_sku_key') ||
      msg.includes('sku')
    ) {
      const isSkuConflict = msg.includes('product_variants_sku_key') || msg.includes('sku');
      const conflictMsg = isSkuConflict
        ? 'A product variant with this SKU already exists in the catalogue. Please adjust the slug or color name to ensure uniqueness.'
        : 'A product with this slug already exists in the catalogue.';
      res.status(409).json({
        status: 'error',
        error: conflictMsg,
        message: conflictMsg,
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if ((err as any)?.statusCode) {
      res.status((err as any).statusCode).json({
        status: 'error',
        error: msg,
        message: msg,
      });
      return;
    }
    if (
      msg.includes('staging session') ||
      msg.includes('claimed for deletion') ||
      msg.includes('does not belong to this staging session')
    ) {
      const statusCode = msg.includes('Access denied') ? 403 : msg.includes('expired') ? 410 : 400;
      res.status(statusCode).json({
        status: 'error',
        error: msg,
        message: msg,
      });
      return;
    }
    if (
      msg.includes('duplicate key value') ||
      msg.includes('chk_product_slug') ||
      msg.includes('product_variants_sku_key') ||
      msg.includes('uq_product_variant_size_color')
    ) {
      const isSkuConflict = msg.includes('product_variants_sku_key');
      const isVariantComboConflict = msg.includes('uq_product_variant_size_color');
      const conflictMsg = isSkuConflict
        ? 'A product variant with this SKU already exists in the catalogue. Please adjust the slug or color name to ensure uniqueness.'
        : isVariantComboConflict
        ? 'A product variant with this size and color combination already exists for this product.'
        : 'A product with this slug already exists in the catalogue.';
      res.status(409).json({
        status: 'error',
        error: conflictMsg,
        message: conflictMsg,
      });
      return;
    }
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

// POST /api/admin/products/:id/unarchive
adminProductsRouter.post('/:id/unarchive', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await adminUnarchiveProduct(req.params.id, req.admin!);
    const updated = await adminGetProductById(req.params.id);
    res.json({
      status: 'success',
      message: 'Product unarchived successfully',
      data: updated,
      product: updated,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/products/:id
adminProductsRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await adminDeleteProduct(req.params.id, req.admin!);

    if (result.status === 'not_found') {
      res.status(404).json({
        status: 'error',
        error: 'Product not found',
        message: 'Product not found',
      });
      return;
    }

    if (result.status === 'conflict') {
      res.status(409).json({
        status: 'error',
        error: result.message || 'Product cannot be deleted because it is referenced by historical orders',
        message: result.message || 'Product cannot be deleted because it is referenced by historical orders',
        canArchive: true,
      });
      return;
    }

    res.json({
      status: 'success',
      message: 'Product permanently deleted successfully',
      deletedPublicIds: result.deletedPublicIds,
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
    if (msg.includes('Comparison price') || msg.includes('Insufficient stock') || msg.includes('negative')) {
      res.status(400).json({
        status: 'error',
        error: msg,
        message: msg,
      });
      return;
    }
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

// -------------------------------------------------------------
// Product Staging Session Routes
// -------------------------------------------------------------

// POST /api/admin/products/staging-sessions — Create a new active staging session
adminProductsRouter.post('/staging-sessions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await createStagingSession(req.admin!.id);
    res.status(201).json({
      status: 'success',
      data: {
        sessionId: result.id,
        expiresAt: result.expiresAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/products/staging-sessions/:id/heartbeat — Extend active staging session by 2 hours
adminProductsRouter.post('/staging-sessions/:id/heartbeat', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await heartbeatStagingSession(req.params.id, req.admin!.id);
    res.json({
      status: 'success',
      data: {
        sessionId: result.id,
        expiresAt: result.expiresAt,
      },
    });
  } catch (err: unknown) {
    const statusCode = (err as any)?.statusCode || 500;
    res.status(statusCode).json({
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// POST /api/admin/products/staging-sessions/:id/abandon — Mark session abandoned when user cancels
adminProductsRouter.post('/staging-sessions/:id/abandon', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await abandonStagingSession(req.params.id, req.admin!.id);
    res.json({
      status: 'success',
      message: 'Staging session marked abandoned',
    });
  } catch (err: unknown) {
    const statusCode = (err as any)?.statusCode || 500;
    res.status(statusCode).json({
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// -------------------------------------------------------------
// Product Image Management Routes
// -------------------------------------------------------------

// POST /api/admin/products/upload-signature — Staged Cloudinary upload params for new products
adminProductsRouter.post('/upload-signature', async (req: Request, res: Response, next: NextFunction) => {
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

    const sessionId = (req.body?.sessionId || req.query?.sessionId) as string | undefined;
    if (!sessionId) {
      res.status(400).json({
        status: 'error',
        error: 'Active staging session ID is required for product staged uploads',
        message: 'Active staging session ID is required for product staged uploads',
      });
      return;
    }

    const config = generateUploadSignature({
      folder: 'axdoro/products/staged',
    });

    // Pre-register publicId against active staging session before returning signature
    await preRegisterStagedAsset(sessionId, req.admin!.id, config.publicId);

    res.json({
      status: 'success',
      data: config,
      ...config,
    });
  } catch (err: unknown) {
    const statusCode = (err as any)?.statusCode || 500;
    res.status(statusCode).json({
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// POST /api/admin/products/:id/images/signature
adminProductsRouter.post('/:id/images/signature', async (req: Request, res: Response, next: NextFunction) => {
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
      productId: req.params.id,
    });

    res.json({
      status: 'success',
      data: config,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/products/:id/images
adminProductsRouter.post('/:id/images', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = productImageAddSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        status: 'error',
        error: 'Invalid image payload: ' + parseResult.error.errors.map((e) => e.message).join(', '),
        message: 'Invalid image payload',
        errors: parseResult.error.errors,
      });
      return;
    }

    const image = await adminAddProductImage(req.params.id, parseResult.data, req.admin!);
    res.status(201).json({
      status: 'success',
      data: image,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('PRODUCT_NOT_FOUND')) {
      res.status(404).json({
        status: 'error',
        error: 'Product not found',
        message: 'Product not found',
      });
      return;
    }
    if (msg.includes('INVALID_COLOR')) {
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

// PATCH /api/admin/products/:id/images/:imageId
adminProductsRouter.patch('/:id/images/:imageId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = productImageUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        status: 'error',
        error: 'Invalid image update payload: ' + parseResult.error.errors.map((e) => e.message).join(', '),
        message: 'Invalid image update payload',
        errors: parseResult.error.errors,
      });
      return;
    }

    const updated = await adminUpdateProductImage(req.params.id, req.params.imageId, parseResult.data, req.admin!);
    if (!updated) {
      res.status(404).json({
        status: 'error',
        error: 'Image not found for this product',
        message: 'Image not found for this product',
      });
      return;
    }

    res.json({
      status: 'success',
      data: updated,
      message: 'Product image updated successfully',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('INVALID_COLOR')) {
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

// PATCH /api/admin/products/:id/images/:imageId/primary
adminProductsRouter.patch('/:id/images/:imageId/primary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await adminSetPrimaryImage(req.params.id, req.params.imageId, req.admin!);
    if (!updated) {
      res.status(404).json({
        status: 'error',
        error: 'Image not found for this product',
        message: 'Image not found for this product',
      });
      return;
    }

    res.json({
      status: 'success',
      message: 'Primary image updated successfully',
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/products/:id/images/reorder
adminProductsRouter.put('/:id/images/reorder', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = productImageReorderSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        status: 'error',
        error: 'Invalid reorder payload: ' + parseResult.error.errors.map((e) => e.message).join(', '),
        message: 'Invalid reorder payload',
        errors: parseResult.error.errors,
      });
      return;
    }

    const updated = await adminReorderProductImages(req.params.id, parseResult.data.images, req.admin!);
    if (!updated) {
      res.status(404).json({
        status: 'error',
        error: 'Product not found',
        message: 'Product not found',
      });
      return;
    }

    res.json({
      status: 'success',
      message: 'Images reordered successfully',
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/products/:id/images/:imageId
adminProductsRouter.delete('/:id/images/:imageId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await adminDeleteProductImage(req.params.id, req.params.imageId, req.admin!);
    if (!result.success) {
      res.status(404).json({
        status: 'error',
        error: 'Image not found for this product',
        message: 'Image not found for this product',
      });
      return;
    }

    res.json({
      status: 'success',
      message: 'Image deleted successfully',
      deletedPublicId: result.deletedPublicId,
    });
  } catch (err) {
    next(err);
  }
});
