-- Migration: 020_return_management_workflow.sql
-- Purpose: Schema extensions for Return & Exchange admin workflow, shipping, inspection, and manual refund tracking
-- Author: AXDORO Engineering
-- Target: Local development (axdoro_dev, axdoro_test) and Neon Production

-- 1. Extend return_request_status enum with COMPLETED idempotently
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumtypid = 'return_request_status'::regtype 
        AND enumlabel = 'COMPLETED'
    ) THEN
        ALTER TYPE return_request_status ADD VALUE 'COMPLETED';
    END IF;
END
$$;

-- 2. Add shipping workflow columns
ALTER TABLE return_requests
    ADD COLUMN IF NOT EXISTS shipping_instructions TEXT,
    ADD COLUMN IF NOT EXISTS return_courier_name VARCHAR(64),
    ADD COLUMN IF NOT EXISTS return_tracking_number VARCHAR(128),
    ADD COLUMN IF NOT EXISTS customer_shipped_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS product_received_at TIMESTAMPTZ;

-- 3. Add product inspection columns
ALTER TABLE return_requests
    ADD COLUMN IF NOT EXISTS inspection_result VARCHAR(32) CHECK (inspection_result IN ('PENDING', 'PASS', 'FAIL', 'PARTIAL')),
    ADD COLUMN IF NOT EXISTS inspection_notes TEXT,
    ADD COLUMN IF NOT EXISTS inspected_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS inspected_by VARCHAR(128);

-- 4. Add manual refund tracking columns
ALTER TABLE return_requests
    ADD COLUMN IF NOT EXISTS refund_status VARCHAR(32) NOT NULL DEFAULT 'NOT_APPLICABLE' 
        CHECK (refund_status IN ('NOT_APPLICABLE', 'PENDING', 'INITIATED', 'COMPLETED', 'REJECTED')),
    ADD COLUMN IF NOT EXISTS refund_amount_paise INTEGER CHECK (refund_amount_paise >= 0),
    ADD COLUMN IF NOT EXISTS refund_method VARCHAR(32) 
        CHECK (refund_method IN ('ORIGINAL_PAYMENT', 'BANK_TRANSFER', 'UPI', 'STORE_CREDIT')),
    ADD COLUMN IF NOT EXISTS refund_reference VARCHAR(128),
    ADD COLUMN IF NOT EXISTS refund_initiated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS refund_completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS refund_notes TEXT;

-- 5. Indexes for workflow triage and reporting
CREATE INDEX IF NOT EXISTS idx_return_requests_refund_status ON return_requests(refund_status);
CREATE INDEX IF NOT EXISTS idx_return_requests_product_received ON return_requests(product_received_at);

-- 6. Maintain least-privilege role permissions for axdoro_app role if it exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'axdoro_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON return_requests TO axdoro_app;
    END IF;
END
$$;

