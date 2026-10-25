-- Migration: 015_cloudinary_cleanup_jobs.sql
-- Purpose: Durable outbox queue for Cloudinary asset cleanup, deletion, and orphan reconciliation
-- Author: AXDORO Engineering
-- Target: Local development (axdoro_dev, axdoro_test) and Neon Production

-- 1. Create durable Cloudinary cleanup jobs table
CREATE TABLE IF NOT EXISTS cloudinary_cleanup_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_id VARCHAR(255) NOT NULL,
    asset_type VARCHAR(50) NOT NULL DEFAULT 'authenticated',
    resource_type VARCHAR(50) NOT NULL DEFAULT 'image',
    reason VARCHAR(50) NOT NULL CHECK (reason IN ('ENQUIRY_DELETION', 'ORPHANED_UPLOAD', 'COMPENSATING_FAILURE')),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'ABORTED')),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    claimed_at TIMESTAMPTZ,
    claim_token VARCHAR(64),
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Trigger for updated_at tracking
DROP TRIGGER IF EXISTS trg_cloudinary_cleanup_jobs_updated_at ON cloudinary_cleanup_jobs;
CREATE TRIGGER trg_cloudinary_cleanup_jobs_updated_at
    BEFORE UPDATE ON cloudinary_cleanup_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 3. Indexes for atomic claiming and public ID lookups
CREATE INDEX IF NOT EXISTS idx_cloudinary_cleanup_claim
    ON cloudinary_cleanup_jobs(status, next_attempt_at, claimed_at);

CREATE INDEX IF NOT EXISTS idx_cloudinary_cleanup_public_id
    ON cloudinary_cleanup_jobs(public_id);

-- 4. Grant least-privilege permissions to application role if present
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'axdoro_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON cloudinary_cleanup_jobs TO axdoro_app;
    END IF;
END
$$;
