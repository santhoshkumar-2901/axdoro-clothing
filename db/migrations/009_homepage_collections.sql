-- Migration: 009_homepage_collections.sql
-- Purpose: Admin-managed homepage curated collections and product association mapping
-- Author: AXDORO Engineering
-- Target: Local development (axdoro_dev, axdoro_test) and Neon Production

-- 1. Homepage Collections Table
CREATE TABLE IF NOT EXISTS homepage_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(50) NOT NULL UNIQUE CONSTRAINT chk_homepage_collection_slug CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    title VARCHAR(150) NOT NULL,
    description TEXT,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Trigger for homepage_collections updated_at
DROP TRIGGER IF EXISTS trg_homepage_collections_updated_at ON homepage_collections;
CREATE TRIGGER trg_homepage_collections_updated_at
    BEFORE UPDATE ON homepage_collections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Indexes for homepage_collections
CREATE INDEX IF NOT EXISTS idx_homepage_collections_slug ON homepage_collections(slug);
CREATE INDEX IF NOT EXISTS idx_homepage_collections_active ON homepage_collections(display_order) WHERE is_enabled = true;

-- 2. Homepage Collection Products (Join Table with Custom Ordering)
CREATE TABLE IF NOT EXISTS homepage_collection_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id UUID NOT NULL REFERENCES homepage_collections(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_collection_product UNIQUE (collection_id, product_id)
);

-- Indexes for homepage_collection_products
CREATE INDEX IF NOT EXISTS idx_homepage_collection_products_order
    ON homepage_collection_products(collection_id, display_order ASC);
CREATE INDEX IF NOT EXISTS idx_homepage_collection_products_product
    ON homepage_collection_products(product_id);

-- 3. Seed Default Collections (best-sellers, signature-picks)
INSERT INTO homepage_collections (slug, title, description, display_order, is_enabled)
VALUES
    ('best-sellers', 'This Month''s Best Sellers', 'Curated top-performing luxury essentials of the season.', 1, true),
    ('signature-picks', 'Signature Picks', 'Hand-selected signature pieces defining contemporary elegance.', 2, true)
ON CONFLICT (slug) DO NOTHING;

-- 4. Maintain least-privilege role permissions for axdoro_app role if it exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'axdoro_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON homepage_collections TO axdoro_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON homepage_collection_products TO axdoro_app;
    END IF;
END
$$;
