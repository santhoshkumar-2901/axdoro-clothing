-- Migration: 011_category_images.sql
-- Purpose: Schema extension for category images and Cloudinary asset identifiers
-- Author: AXDORO Engineering
-- Target: Local development (axdoro_dev, axdoro_test) and Neon Production

-- 1. Extend categories with image_url and Cloudinary public_id
ALTER TABLE categories
    ADD COLUMN IF NOT EXISTS image_url TEXT,
    ADD COLUMN IF NOT EXISTS public_id VARCHAR(255);

-- 2. Index public_id for lookup and deletion safety
CREATE INDEX IF NOT EXISTS idx_categories_public_id ON categories(public_id);

-- 3. Maintain least-privilege role permissions for axdoro_app role if it exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'axdoro_app') THEN
        GRANT SELECT, INSERT, UPDATE ON categories TO axdoro_app;
    END IF;
END
$$;
