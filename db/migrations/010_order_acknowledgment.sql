-- Migration: 010_order_acknowledgment.sql
-- Purpose: Add acknowledged_at timestamp column to orders table for admin notification tracking
-- Author: AXDORO Engineering
-- Target: Local development (axdoro_dev, axdoro_test) and Neon Production

-- 1. Add nullable acknowledged_at column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;

-- 2. Backfill existing orders: Mark all existing orders created prior to this migration as acknowledged
-- so historical orders do not incorrectly trigger "new unacknowledged order" alerts.
UPDATE orders
SET acknowledged_at = created_at
WHERE acknowledged_at IS NULL;

-- 3. Partial index for fast notification counting on unacknowledged orders
CREATE INDEX IF NOT EXISTS idx_orders_unacknowledged
ON orders (order_status)
WHERE acknowledged_at IS NULL;
