-- Migration: 007_product_image_management.sql
-- Purpose: Schema extension for Cloudinary public_id, metadata, and single primary image constraint
-- Author: AXDORO Engineering
-- Target: Local development (axdoro_dev, axdoro_test) and Neon Production

-- 1. Extend product_images with Cloudinary identifier and media metadata
ALTER TABLE product_images
    ADD COLUMN IF NOT EXISTS public_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS width INTEGER,
    ADD COLUMN IF NOT EXISTS height INTEGER,
    ADD COLUMN IF NOT EXISTS format VARCHAR(20),
    ADD COLUMN IF NOT EXISTS bytes INTEGER;

-- 2. Index Cloudinary public_id for lookup and deletion safety
CREATE INDEX IF NOT EXISTS idx_product_images_public_id ON product_images(public_id);

-- 3. Partial unique index: strictly enforce at most one primary image per product
-- If multiple images exist for a product, at most one may have is_primary = true
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_images_single_primary
    ON product_images(product_id)
    WHERE is_primary = true;

-- 4. Maintain least-privilege role permissions for axdoro_app role if it exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'axdoro_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON product_images TO axdoro_app;
    END IF;
END
$$;
