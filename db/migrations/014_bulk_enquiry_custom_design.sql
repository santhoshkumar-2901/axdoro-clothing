-- Migration: 014_bulk_enquiry_custom_design.sql
-- Purpose: Schema extension for optional bulk enquiry custom artwork/design uploads
-- Author: AXDORO Engineering
-- Target: Local development (axdoro_dev, axdoro_test) and Neon Production

-- 1. Extend enquiries table with nullable artwork metadata
ALTER TABLE enquiries
    ADD COLUMN IF NOT EXISTS design_file_url TEXT,
    ADD COLUMN IF NOT EXISTS design_file_public_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS design_file_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS design_file_format VARCHAR(20),
    ADD COLUMN IF NOT EXISTS design_file_bytes INTEGER;

-- 2. Index public_id for reconciliation and deletion lookups
CREATE INDEX IF NOT EXISTS idx_enquiries_design_public_id 
    ON enquiries(design_file_public_id) 
    WHERE design_file_public_id IS NOT NULL;
