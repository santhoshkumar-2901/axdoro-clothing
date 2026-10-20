-- Migration: 008_product_image_color_variant.sql
-- Purpose: Schema extension for color variant association on product_images
-- Author: AXDORO Engineering
-- Target: Local development (axdoro_dev, axdoro_test) and Neon Production

-- 1. Add nullable color column to product_images
-- When color IS NULL, the image represents a shared/general product image.
-- When color is specified, the image represents that specific color variant.
ALTER TABLE product_images
    ADD COLUMN IF NOT EXISTS color VARCHAR(50);

-- 2. Index for filtering product images by product_id and color
CREATE INDEX IF NOT EXISTS idx_product_images_product_color
    ON product_images(product_id, color);

-- 3. Maintain least-privilege role permissions for axdoro_app role if it exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'axdoro_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON product_images TO axdoro_app;
    END IF;
END
$$;
