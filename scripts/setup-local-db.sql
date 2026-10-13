-- AXDORO Local Development PostgreSQL Provisioning Script
-- Target: Local development machine (Ubuntu)
-- Purpose: Creates isolated development and test databases with non-superuser roles
-- Usage: sudo -u postgres psql -f scripts/setup-local-db.sql

-- 1. Create application runtime role (least-privilege for Express runtime)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'axdoro_app') THEN
        CREATE ROLE axdoro_app WITH LOGIN PASSWORD 'axdoro_local_app_pw';
        RAISE NOTICE 'Role axdoro_app created';
    ELSE
        RAISE NOTICE 'Role axdoro_app already exists';
    END IF;
END
$$;

-- 2. Create migrator role (used for DDL / migrations / test suite)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'axdoro_migrator') THEN
        CREATE ROLE axdoro_migrator WITH LOGIN PASSWORD 'axdoro_local_migrator_pw';
        RAISE NOTICE 'Role axdoro_migrator created';
    ELSE
        RAISE NOTICE 'Role axdoro_migrator already exists';
    END IF;
END
$$;

-- 3. Create development database
SELECT 'CREATE DATABASE axdoro_dev OWNER axdoro_migrator'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'axdoro_dev')\gexec

-- 4. Create automated testing database
SELECT 'CREATE DATABASE axdoro_test OWNER axdoro_migrator'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'axdoro_test')\gexec

-- 5. Grant permissions on axdoro_dev
GRANT ALL PRIVILEGES ON DATABASE axdoro_dev TO axdoro_migrator;
\connect axdoro_dev
GRANT ALL ON SCHEMA public TO axdoro_migrator;
GRANT USAGE ON SCHEMA public TO axdoro_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO axdoro_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO axdoro_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO axdoro_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO axdoro_app;

-- 6. Grant permissions on axdoro_test
GRANT ALL PRIVILEGES ON DATABASE axdoro_test TO axdoro_migrator;
\connect axdoro_test
GRANT ALL ON SCHEMA public TO axdoro_migrator;
GRANT USAGE ON SCHEMA public TO axdoro_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO axdoro_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO axdoro_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO axdoro_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO axdoro_app;
