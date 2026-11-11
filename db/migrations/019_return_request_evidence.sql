-- Migration: 019_return_request_evidence.sql
-- Purpose: Schema for customer return and exchange evidence photos with Cloudinary references
-- Author: AXDORO Engineering
-- Target: Local development (axdoro_dev, axdoro_test) and Neon Production

CREATE TABLE IF NOT EXISTS return_request_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_request_id UUID NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
    cloudinary_public_id VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(64) NOT NULL,
    file_size_bytes INT NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 4194304),
    format VARCHAR(16) NOT NULL CHECK (format IN ('jpg', 'jpeg', 'png', 'webp')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    deleted_by VARCHAR(128),
    CONSTRAINT uq_return_evidence_public_id UNIQUE (cloudinary_public_id)
);

-- Performance and lookup indexes
CREATE INDEX IF NOT EXISTS idx_re_evidence_request
    ON return_request_evidence(return_request_id);

CREATE INDEX IF NOT EXISTS idx_re_evidence_public_id
    ON return_request_evidence(cloudinary_public_id);

CREATE INDEX IF NOT EXISTS idx_re_evidence_created_at
    ON return_request_evidence(created_at DESC);

-- Least-privilege role permissions for axdoro_app role if it exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'axdoro_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON return_request_evidence TO axdoro_app;
    END IF;
END
$$;

