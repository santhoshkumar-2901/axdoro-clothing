-- Migration: 017_category_sections.sql
-- Purpose: Admin-managed homepage category sections with cards, posters, and product display limits
-- Author: AXDORO Engineering
-- Target: Local development (axdoro_dev, axdoro_test) and Neon Production

-- 1. Category Sections Table
CREATE TABLE IF NOT EXISTS category_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL UNIQUE REFERENCES categories(id) ON DELETE CASCADE,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    heading VARCHAR(150) NOT NULL,
    subtitle TEXT,
    category_cards JSONB NOT NULL DEFAULT '[]'::jsonb,
    poster_image_url TEXT,
    poster_heading VARCHAR(150),
    poster_subtitle TEXT,
    poster_destination_url TEXT,
    product_limit INTEGER NOT NULL DEFAULT 4,
    view_all_label VARCHAR(50) NOT NULL DEFAULT 'View All',
    view_all_destination VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Trigger for updated_at
DROP TRIGGER IF EXISTS trg_category_sections_updated_at ON category_sections;
CREATE TRIGGER trg_category_sections_updated_at
    BEFORE UPDATE ON category_sections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 3. Indexes for Category Sections
CREATE INDEX IF NOT EXISTS idx_category_sections_category_id ON category_sections(category_id);
CREATE INDEX IF NOT EXISTS idx_category_sections_enabled_order 
    ON category_sections(display_order ASC) WHERE is_enabled = true;

-- 4. Maintain least-privilege role permissions for axdoro_app role if it exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'axdoro_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON category_sections TO axdoro_app;
    END IF;
END
$$;

-- 5. Seed Initial Sections for Existing Pants, Shirts, and T-Shirts Categories
-- Safe against repeated execution (ON CONFLICT DO NOTHING) and missing categories (WHERE c.slug = ...)

-- 5.1 Pants Section
INSERT INTO category_sections (
    category_id,
    is_enabled,
    display_order,
    heading,
    subtitle,
    category_cards,
    poster_image_url,
    poster_heading,
    poster_subtitle,
    poster_destination_url,
    product_limit,
    view_all_label,
    view_all_destination
)
SELECT
    c.id,
    true,
    1,
    'Pants & Trousers',
    'Relaxed, pleated, and contemporary cuts engineered for all-day comfort',
    '[
        {"id":"pants-bootcut","label":"Bootcut","sublabel":"Pants","imageUrl":"https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=600&auto=format&fit=crop&q=80","destinationType":"query","query":"Bootcut"},
        {"id":"pants-korean","label":"Korean","sublabel":"Trousers","imageUrl":"https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=600&auto=format&fit=crop&q=80","destinationType":"query","query":"Korean"},
        {"id":"pants-gurkha","label":"Gurkha","sublabel":"Pants","imageUrl":"https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=600&auto=format&fit=crop&q=80","destinationType":"query","query":"Gurkha"},
        {"id":"pants-pleated","label":"Pleated","sublabel":"Pants","imageUrl":"https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=600&auto=format&fit=crop&q=80","destinationType":"query","query":"Pleated"},
        {"id":"pants-baggy-jeans","label":"Baggy","sublabel":"Jeans","imageUrl":"https://images.unsplash.com/photo-1604176354204-9268737828e4?w=600&auto=format&fit=crop&q=80","destinationType":"query","query":"Baggy"},
        {"id":"pants-relaxed-loose","label":"Relaxed","sublabel":"Loose Fit","imageUrl":"https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=600&auto=format&fit=crop&q=80","destinationType":"query","query":"Relaxed"},
        {"id":"pants-wide-leg","label":"Wide Leg","sublabel":"Trousers","imageUrl":"https://images.unsplash.com/photo-1509631179647-0177331693ae?w=600&auto=format&fit=crop&q=80","destinationType":"query","query":"Wide Leg"},
        {"id":"pants-straight-fit","label":"Straight Fit","sublabel":"Pants","imageUrl":"https://images.unsplash.com/photo-1479064555552-3ef4979f8908?w=600&auto=format&fit=crop&q=80","destinationType":"query","query":"Straight Fit"}
    ]'::jsonb,
    'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=1600&auto=format&fit=crop&q=80',
    'Loose Fit Pleated Pants',
    'Architectural drape cut from tailored cotton-blend foundations',
    '/category/pants',
    4,
    'View All',
    '/category/pants'
FROM categories c
WHERE c.slug = 'pants'
ON CONFLICT (category_id) DO NOTHING;

-- 5.2 Shirts Section
INSERT INTO category_sections (
    category_id,
    is_enabled,
    display_order,
    heading,
    subtitle,
    category_cards,
    poster_image_url,
    poster_heading,
    poster_subtitle,
    poster_destination_url,
    product_limit,
    view_all_label,
    view_all_destination
)
SELECT
    c.id,
    true,
    2,
    'Topwear & Shirts',
    'Pinpoint Oxford, Cuban camp collar, and breathable linen silhouettes',
    '[
        {"id":"shirts-oxford","label":"Oxford","sublabel":"Button-Down","imageUrl":"https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=600&auto=format&fit=crop&q=80","destinationType":"query","query":"Oxford"},
        {"id":"shirts-cuban","label":"Cuban Collar","sublabel":"Resort Shirt","imageUrl":"https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80","destinationType":"query","query":"Cuban"},
        {"id":"shirts-linen","label":"Linen Blend","sublabel":"Overshirt","imageUrl":"https://images.unsplash.com/photo-1598033129183-c4f50c736f10?w=600&auto=format&fit=crop&q=80","destinationType":"query","query":"Linen"},
        {"id":"shirts-overshirt","label":"Overshirt","sublabel":"Contemporary","imageUrl":"https://images.unsplash.com/photo-1603252109303-2751441dd157?w=600&auto=format&fit=crop&q=80","destinationType":"query","query":"Overshirt"}
    ]'::jsonb,
    'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=1600&auto=format&fit=crop&q=80',
    'Curated Topwear',
    'Tailored button-downs and resort collars',
    '/category/shirts',
    4,
    'View All',
    '/category/shirts'
FROM categories c
WHERE c.slug = 'shirts'
ON CONFLICT (category_id) DO NOTHING;

-- 5.3 T-Shirts Section
INSERT INTO category_sections (
    category_id,
    is_enabled,
    display_order,
    heading,
    subtitle,
    category_cards,
    poster_image_url,
    poster_heading,
    poster_subtitle,
    poster_destination_url,
    product_limit,
    view_all_label,
    view_all_destination
)
SELECT
    c.id,
    true,
    3,
    'T-Shirts & Essentials',
    'Combed breathable cotton tees cut in tailored regular and relaxed profiles',
    '[
        {"id":"tshirts-140gsm","label":"140 GSM","sublabel":"Combed Cotton","imageUrl":"https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=600&auto=format&fit=crop&q=80","destinationType":"query","query":"140 GSM"},
        {"id":"tshirts-crewneck","label":"Crewneck","sublabel":"Classic Tee","imageUrl":"https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=600&auto=format&fit=crop&q=80","destinationType":"query","query":"Crewneck"},
        {"id":"tshirts-pocket","label":"Pocket Tee","sublabel":"Minimalist","imageUrl":"https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=600&auto=format&fit=crop&q=80","destinationType":"query","query":"Pocket"},
        {"id":"tshirts-heavyweight","label":"Heavyweight","sublabel":"Relaxed Tee","imageUrl":"https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=600&auto=format&fit=crop&q=80","destinationType":"query","query":"Heavyweight"}
    ]'::jsonb,
    'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=1600&auto=format&fit=crop&q=80',
    '140 GSM Combed Cotton Essentials',
    'Breathable everyday foundations engineered for all-day comfort and bespoke branding',
    '/category/t-shirts',
    4,
    'View All',
    '/category/t-shirts'
FROM categories c
WHERE c.slug = 't-shirts'
ON CONFLICT (category_id) DO NOTHING;
