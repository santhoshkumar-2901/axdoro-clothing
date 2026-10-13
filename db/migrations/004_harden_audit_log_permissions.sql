-- Migration: 004_harden_audit_log_permissions.sql
-- Purpose: Restrict runtime role axdoro_app to append-only and read access (INSERT, SELECT) on admin_audit_logs
-- Author: AXDORO Engineering
-- Target: Local development (axdoro_dev, axdoro_test) and Neon Production

DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'axdoro_app') THEN
        -- 1. Revoke mutating and destructive privileges on admin_audit_logs
        REVOKE UPDATE, DELETE, TRUNCATE ON admin_audit_logs FROM axdoro_app;

        -- 2. Explicitly ensure only SELECT and INSERT remain granted
        GRANT SELECT, INSERT ON admin_audit_logs TO axdoro_app;
    END IF;
END
$$;
