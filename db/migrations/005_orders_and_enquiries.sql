-- Migration: 005_orders_and_enquiries.sql
-- Purpose: Schema for COD orders, order items, public/bulk enquiries, and Google Drive sync jobs
-- Author: AXDORO Engineering
-- Target: Local development (axdoro_dev, axdoro_test) and Neon Production

-- 1. Orders Table
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(32) NOT NULL UNIQUE,
    customer_name VARCHAR(100) NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    shipping_address_line1 VARCHAR(255) NOT NULL,
    shipping_address_line2 VARCHAR(255),
    shipping_city VARCHAR(100) NOT NULL,
    shipping_state VARCHAR(100) NOT NULL,
    shipping_pincode VARCHAR(10) NOT NULL,
    subtotal_paise INTEGER NOT NULL CHECK (subtotal_paise >= 0),
    discount_paise INTEGER NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
    shipping_fee_paise INTEGER NOT NULL DEFAULT 0 CHECK (shipping_fee_paise >= 0),
    total_paise INTEGER NOT NULL CHECK (total_paise >= 0),
    payment_method VARCHAR(20) NOT NULL DEFAULT 'COD' CHECK (payment_method IN ('COD', 'RAZORPAY')),
    payment_status VARCHAR(20) NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'PENDING', 'PAID', 'REFUNDED', 'FAILED')),
    order_status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (order_status IN ('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED')),
    idempotency_key VARCHAR(64) UNIQUE,
    customer_order_token VARCHAR(64) NOT NULL UNIQUE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cancelled_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ
);

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_customer_token ON orders(customer_order_token);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_order_status ON orders(order_status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);

-- 2. Order Items Table (Immutable snapshot of purchased catalogue items)
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    product_name VARCHAR(255) NOT NULL,
    product_slug VARCHAR(255) NOT NULL,
    variant_sku VARCHAR(100) NOT NULL,
    variant_size VARCHAR(20) NOT NULL,
    variant_color VARCHAR(50) NOT NULL,
    unit_price_paise INTEGER NOT NULL CHECK (unit_price_paise >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 100),
    line_total_paise INTEGER NOT NULL CHECK (line_total_paise >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_variant_id ON order_items(variant_id);

-- 3. Enquiries Table (Single-table design supporting GENERAL and BULK enquiries)
CREATE TABLE IF NOT EXISTS enquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enquiry_type VARCHAR(20) NOT NULL DEFAULT 'GENERAL' CHECK (enquiry_type IN ('GENERAL', 'BULK')),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    product_name VARCHAR(255),
    -- Bulk-specific fields validated when enquiry_type = 'BULK'
    quantity INTEGER CHECK (enquiry_type != 'BULK' OR (quantity IS NOT NULL AND quantity > 0)),
    size_breakdown VARCHAR(255),
    target_date VARCHAR(50),
    organization VARCHAR(100),
    source VARCHAR(50) NOT NULL DEFAULT 'WEBSITE' CHECK (source IN ('WEBSITE', 'INSTAGRAM', 'WHATSAPP', 'GOOGLE', 'OTHER')),
    drive_sync_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (drive_sync_status IN ('PENDING', 'SYNCED', 'FAILED')),
    drive_synced_at TIMESTAMPTZ,
    drive_sync_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS trg_enquiries_updated_at ON enquiries;
CREATE TRIGGER trg_enquiries_updated_at
    BEFORE UPDATE ON enquiries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_enquiries_created_at ON enquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enquiries_source ON enquiries(source);
CREATE INDEX IF NOT EXISTS idx_enquiries_type ON enquiries(enquiry_type);
CREATE INDEX IF NOT EXISTS idx_enquiries_sync_status ON enquiries(drive_sync_status);

-- 4. Drive Sync Jobs Table (Outbox queue for durable Google Drive/Sheets synchronization)
CREATE TABLE IF NOT EXISTS drive_sync_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enquiry_id UUID NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'SYNCED', 'FAILED')),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_error TEXT,
    idempotency_key VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS trg_drive_sync_jobs_updated_at ON drive_sync_jobs;
CREATE TRIGGER trg_drive_sync_jobs_updated_at
    BEFORE UPDATE ON drive_sync_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_drive_sync_jobs_status_next ON drive_sync_jobs(status, next_attempt_at) WHERE status IN ('PENDING', 'FAILED');
CREATE INDEX IF NOT EXISTS idx_drive_sync_jobs_enquiry_id ON drive_sync_jobs(enquiry_id);

-- 5. Grant runtime permissions to axdoro_app role if it exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'axdoro_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON orders, order_items, enquiries, drive_sync_jobs TO axdoro_app;
        -- Maintain admin_audit_logs append-only hardening (no update/delete/truncate)
        REVOKE UPDATE, DELETE, TRUNCATE ON admin_audit_logs FROM axdoro_app;
        GRANT SELECT, INSERT ON admin_audit_logs TO axdoro_app;
    END IF;
END
$$;
