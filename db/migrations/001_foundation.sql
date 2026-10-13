-- Migration: 001_foundation.sql
-- Purpose: Install foundation extensions and shared database utility triggers
-- Author: AXDORO Engineering Baseline
-- Target: Local development (axdoro_dev, axdoro_test) and Neon Production

-- 1. Enable UUID generator extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Create shared trigger function for updating updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
