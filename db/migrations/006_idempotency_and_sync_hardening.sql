-- Migration: 006_idempotency_and_sync_hardening.sql
-- Purpose: Schema hardening for order idempotency fingerprints and Google Drive sync atomic claiming
-- Author: AXDORO Engineering
-- Target: Local development (axdoro_dev, axdoro_test) and Neon Production

-- 1. Orders table: canonical request fingerprint for secure idempotency verification
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS request_hash VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_orders_request_hash ON orders(request_hash);

-- 2. Drive sync jobs: atomic claiming, per-job claim token, and lease recovery
ALTER TABLE drive_sync_jobs
    ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS claim_token VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_drive_sync_jobs_claim
    ON drive_sync_jobs(status, next_attempt_at, claimed_at);

-- 3. Maintain permissions for axdoro_app role if it exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'axdoro_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON orders, drive_sync_jobs TO axdoro_app;
        -- Enforce admin_audit_logs append-only hardening
        REVOKE UPDATE, DELETE, TRUNCATE ON admin_audit_logs FROM axdoro_app;
        GRANT SELECT, INSERT ON admin_audit_logs TO axdoro_app;
    END IF;
END
$$;
