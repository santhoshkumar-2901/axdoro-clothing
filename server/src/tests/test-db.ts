import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { env, isLocalDatabase, isRemoteDatabase } from '../config/env.js';
import { runMigrations } from '../db/migration-runner.js';

const { Pool } = pg;

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../db/migrations'
);

/**
 * Validates that a connection URL targets ONLY the dedicated local test database.
 * Rejects remote databases, axdoro_dev, and any non-test database name.
 */
export function validateTestDatabaseTarget(connectionString: string): void {
  if (!connectionString) {
    throw new Error('Test database error: No connection string provided');
  }

  if (isRemoteDatabase(connectionString)) {
    throw new Error('STRICT LOCAL ISOLATION ERROR: Remote database URL rejected for tests');
  }

  try {
    const parsed = new URL(connectionString);
    const dbName = parsed.pathname.replace(/^\//, '').toLowerCase();

    if (dbName !== 'axdoro_test') {
      throw new Error(
        `TEST DB SAFETY GUARD: Test database connection must strictly target 'axdoro_test', got '${dbName}'. Operation aborted.`
      );
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('TEST DB SAFETY GUARD')) {
      throw err;
    }
    throw new Error(`Failed to validate test database URL: ${String(err)}`);
  }
}

const testConnectionString =
  env.TEST_DATABASE_URL ||
  (env.MIGRATION_DATABASE_URL
    ? env.MIGRATION_DATABASE_URL.replace(/\/axdoro_dev(\?.*)?$/, '/axdoro_test$1')
    : 'postgresql://axdoro_migrator:axdoro_local_migrator_pw@localhost:5432/axdoro_test');

validateTestDatabaseTarget(testConnectionString);

export const testPool = new Pool({
  connectionString: testConnectionString,
  ssl: false,
  max: 5,
});

/**
 * Ensures test database has all schema migrations applied and starts clean.
 */
export async function initializeTestDatabase(): Promise<void> {
  validateTestDatabaseTarget(testConnectionString);
  // Apply any pending migrations to axdoro_test
  await runMigrations({
    connectionString: testConnectionString,
    migrationsDir,
  });

  // Ensure axdoro_app has permissions on axdoro_test
  const client = await testPool.connect();
  try {
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'axdoro_app') THEN
          GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO axdoro_app;
          GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO axdoro_app;
          ALTER DEFAULT PRIVILEGES FOR ROLE axdoro_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO axdoro_app;
          ALTER DEFAULT PRIVILEGES FOR ROLE axdoro_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO axdoro_app;
          -- Explicitly enforce audit log append-only restriction
          REVOKE UPDATE, DELETE, TRUNCATE ON admin_audit_logs FROM axdoro_app;
          GRANT SELECT, INSERT ON admin_audit_logs TO axdoro_app;
        END IF;
      END
      $$;
    `);
  } finally {
    client.release();
  }
}

/**
 * Safely resets catalogue tables inside axdoro_test.
 */
export async function truncateTestCatalogue(): Promise<void> {
  validateTestDatabaseTarget(testConnectionString);
  const client = await testPool.connect();
  try {
    await client.query('TRUNCATE TABLE product_images, product_variants, products, categories CASCADE');
  } finally {
    client.release();
  }
}

/**
 * Safely resets homepage collections inside axdoro_test to default state.
 */
export async function truncateTestCollections(): Promise<void> {
  validateTestDatabaseTarget(testConnectionString);
  const client = await testPool.connect();
  try {
    await client.query('TRUNCATE TABLE homepage_collection_products CASCADE');
    await client.query(`
      INSERT INTO homepage_collections (slug, title, description, display_order, is_enabled)
      VALUES
        ('best-sellers', 'This Month''s Best Sellers', 'Curated top-performing luxury essentials of the season.', 1, true),
        ('signature-picks', 'Signature Picks', 'Hand-selected signature pieces defining contemporary elegance.', 2, true)
      ON CONFLICT (slug) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        is_enabled = EXCLUDED.is_enabled,
        display_order = EXCLUDED.display_order;
    `);
  } finally {
    client.release();
  }
}

/**
 * Safely resets admin tables inside axdoro_test.
 */
export async function truncateTestAdmin(): Promise<void> {
  validateTestDatabaseTarget(testConnectionString);
  const client = await testPool.connect();
  try {
    await client.query('TRUNCATE TABLE admin_sessions, admin_audit_logs, admin_users CASCADE');
  } finally {
    client.release();
  }
}

/**
 * Safely resets orders tables inside axdoro_test.
 */
export async function truncateTestOrders(): Promise<void> {
  validateTestDatabaseTarget(testConnectionString);
  const client = await testPool.connect();
  try {
    await client.query('TRUNCATE TABLE order_items, orders CASCADE');
  } finally {
    client.release();
  }
}

/**
 * Safely resets enquiries tables inside axdoro_test.
 */
export async function truncateTestEnquiries(): Promise<void> {
  validateTestDatabaseTarget(testConnectionString);
  const client = await testPool.connect();
  try {
    await client.query('TRUNCATE TABLE cloudinary_cleanup_jobs, drive_sync_jobs, enquiries CASCADE');
  } finally {
    client.release();
  }
}

export async function closeTestDatabase(): Promise<void> {
  await testPool.end();
}
