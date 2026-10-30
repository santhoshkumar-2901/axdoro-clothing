-- Migration: 016_product_staging_sessions.sql
-- Purpose: Track active admin product creation sessions, pre-register staged uploads, and manage atomic deletion claims
-- Author: AXDORO Engineering
-- Target: Local development (axdoro_dev, axdoro_test) and Neon Production

-- 1. Create product staging sessions table
CREATE TABLE IF NOT EXISTS product_staging_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' 
        CONSTRAINT chk_staging_session_status CHECK (status IN ('ACTIVE', 'COMMITTED', 'EXPIRED', 'ABANDONED')),
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '2 hours'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create product staged assets table with atomic deletion-claim tracking
CREATE TABLE IF NOT EXISTS product_staged_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES product_staging_sessions(id) ON DELETE CASCADE,
    public_id VARCHAR(255) NOT NULL CONSTRAINT uq_product_staged_assets_public_id UNIQUE,
    claim_status VARCHAR(30) NOT NULL DEFAULT 'UNCLAIMED' 
        CONSTRAINT chk_staged_asset_claim CHECK (claim_status IN ('UNCLAIMED', 'CLAIMED_FOR_DELETION', 'DELETED')),
    claimed_at TIMESTAMPTZ,
    claim_token VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Triggers for updated_at tracking
DROP TRIGGER IF EXISTS trg_product_staging_sessions_updated_at ON product_staging_sessions;
CREATE TRIGGER trg_product_staging_sessions_updated_at
    BEFORE UPDATE ON product_staging_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_product_staged_assets_updated_at ON product_staged_assets;
CREATE TRIGGER trg_product_staged_assets_updated_at
    BEFORE UPDATE ON product_staged_assets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 4. Performance & concurrency indexes
CREATE INDEX IF NOT EXISTS idx_staging_sessions_status_expires 
    ON product_staging_sessions(status, expires_at);

CREATE INDEX IF NOT EXISTS idx_staging_sessions_admin 
    ON product_staging_sessions(admin_id, status);

CREATE INDEX IF NOT EXISTS idx_staged_assets_session_id 
    ON product_staged_assets(session_id);

CREATE INDEX IF NOT EXISTS idx_staged_assets_claim 
    ON product_staged_assets(claim_status, claimed_at);

-- 5. Grant least-privilege permissions to application role if present
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'axdoro_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON product_staging_sessions TO axdoro_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON product_staged_assets TO axdoro_app;
    END IF;
END
$$;
