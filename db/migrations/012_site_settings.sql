-- Migration: 012_site_settings.sql
-- Purpose: Schema for reusable site-wide settings and homepage hero configuration
-- Author: AXDORO Engineering
-- Target: Local development (axdoro_dev, axdoro_test) and Neon Production

-- 1. Create site_settings table
CREATE TABLE IF NOT EXISTS site_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Seed default homepage_hero setting
INSERT INTO site_settings (key, value)
VALUES ('homepage_hero', '{"imageUrl": null, "publicId": null}')
ON CONFLICT (key) DO NOTHING;

-- 3. Maintain least-privilege role permissions for axdoro_app role (SELECT, INSERT, UPDATE only - no DELETE)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'axdoro_app') THEN
        GRANT SELECT, INSERT, UPDATE ON site_settings TO axdoro_app;
    END IF;
END
$$;
