-- Migration: 013_harden_site_settings_permissions.sql
-- Purpose: Restrict runtime permissions on site_settings.
-- Author: AXDORO Engineering

DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'axdoro_app') THEN
        REVOKE DELETE, TRUNCATE ON site_settings FROM axdoro_app;
        GRANT SELECT, INSERT, UPDATE ON site_settings TO axdoro_app;
    END IF;
END
$$;
