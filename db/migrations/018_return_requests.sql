-- Migration: 018_return_requests.sql
-- Purpose: Schema for customer return requests, delivery eligibility review flags, and audit history
-- Author: AXDORO Engineering
-- Target: Local development (axdoro_dev, axdoro_test) and Neon Production

-- 1. Create Enums idempotently
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'return_request_status') THEN
        CREATE TYPE return_request_status AS ENUM (
            'REQUEST_SUBMITTED',
            'UNDER_REVIEW',
            'APPROVED',
            'REJECTED'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'return_reason_type') THEN
        CREATE TYPE return_reason_type AS ENUM (
            'WRONG_PRODUCT_RECEIVED',
            'PRODUCT_DAMAGED_OR_DEFECTIVE',
            'SIZE_DOES_NOT_FIT',
            'CHANGED_MY_MIND',
            'PRODUCT_NOT_AS_EXPECTED',
            'OTHER'
        );
    END IF;
END
$$;

-- 2. Return Requests Table
CREATE TABLE IF NOT EXISTS return_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_number VARCHAR(32) NOT NULL UNIQUE,
    submitted_order_id VARCHAR(64) NOT NULL,
    customer_phone VARCHAR(32) NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    reason return_reason_type NOT NULL,
    description TEXT,
    
    -- Backend Order Reference Linkage (Null if unmatched)
    matched_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    is_order_matched BOOLEAN NOT NULL DEFAULT false,
    delivery_date_recorded TIMESTAMPTZ,
    requires_delivery_review BOOLEAN NOT NULL DEFAULT true,
    eligibility_flag VARCHAR(40) NOT NULL DEFAULT 'PENDING_REVIEW',
    
    -- Request Status and Admin Triage
    status return_request_status NOT NULL DEFAULT 'REQUEST_SUBMITTED',
    admin_notes TEXT,
    rejection_reason TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Return Request Status History (Audit Trail)
CREATE TABLE IF NOT EXISTS return_request_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_request_id UUID NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
    previous_status return_request_status,
    new_status return_request_status NOT NULL,
    actor_type VARCHAR(16) NOT NULL CHECK (actor_type IN ('CUSTOMER', 'ADMIN', 'SYSTEM')),
    actor_id VARCHAR(128),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Trigger for updated_at
DROP TRIGGER IF EXISTS trg_return_requests_updated_at ON return_requests;
CREATE TRIGGER trg_return_requests_updated_at
    BEFORE UPDATE ON return_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 5. Indexes for Performance and Admin Triage
CREATE INDEX IF NOT EXISTS idx_return_requests_status ON return_requests(status);
CREATE INDEX IF NOT EXISTS idx_return_requests_number ON return_requests(request_number);
CREATE INDEX IF NOT EXISTS idx_return_requests_submitted_order ON return_requests(submitted_order_id);
CREATE INDEX IF NOT EXISTS idx_return_requests_matched_order ON return_requests(matched_order_id);
CREATE INDEX IF NOT EXISTS idx_return_requests_created_at ON return_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_return_history_request_id ON return_request_history(return_request_id);

-- 6. Maintain least-privilege role permissions for axdoro_app role if it exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'axdoro_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON return_requests TO axdoro_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON return_request_history TO axdoro_app;
    END IF;
END
$$;

