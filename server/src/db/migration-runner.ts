import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { env, isRemoteDatabase } from '../config/env.js';

const { Pool } = pg;

// Unique 64-bit integer advisory lock key for AXDORO migrations
const ADVISORY_LOCK_KEY = 19842026;

export interface MigrationFile {
  filename: string;
  filepath: string;
  checksum: string;
  sqlContent: string;
}

export interface AppliedMigration {
  id: number;
  filename: string;
  checksum: string;
  applied_at: Date;
}

/**
 * Calculates SHA-256 checksum of a file's content
 */
export function calculateChecksum(content: string): string {
  return crypto.createHash('sha256').update(content.trim()).digest('hex');
}

/**
 * Reads and sorts all .sql migration files sequentially from the migrations directory
 */
export function getMigrationFiles(migrationsDir: string): MigrationFile[] {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found at: ${migrationsDir}`);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // Sequential deterministic order (001_..., 002_...)

  return files.map((filename) => {
    const filepath = path.join(migrationsDir, filename);
    const sqlContent = fs.readFileSync(filepath, 'utf8');
    const checksum = calculateChecksum(sqlContent);
    return {
      filename,
      filepath,
      checksum,
      sqlContent,
    };
  });
}

/**
 * Ensures schema_migrations tracking table exists
 */
export async function ensureMigrationTable(client: pg.PoolClient): Promise<void> {
  const query = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await client.query(query);
}

/**
 * Retrieves applied migrations from database
 */
export async function getAppliedMigrations(client: pg.PoolClient): Promise<AppliedMigration[]> {
  await ensureMigrationTable(client);
  const res = await client.query<AppliedMigration>(
    'SELECT id, filename, checksum, applied_at FROM schema_migrations ORDER BY id ASC'
  );
  return res.rows;
}

/**
 * Main migration execution function
 */
export async function runMigrations(options: {
  connectionString?: string;
  migrationsDir?: string;
}): Promise<{ applied: string[]; alreadyUpToDate: boolean }> {
  const targetUrl =
    options.connectionString ||
    env.MIGRATION_DATABASE_URL ||
    env.DATABASE_URL;

  // Strict local database isolation: reject any remote target unconditionally
  if (isRemoteDatabase(targetUrl)) {
    throw new Error(
      'STRICT LOCAL ISOLATION ABORT: Target database appears to be a remote or cloud instance. ' +
        'Local migration tooling is strictly forbidden from connecting to or executing against remote databases.'
    );
  }

  const defaultMigrationsDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../db/migrations'
  );
  const migrationsDir = options.migrationsDir || defaultMigrationsDir;

  const pool = new Pool({
    connectionString: targetUrl,
    ssl: false,
    connectionTimeoutMillis: 10000,
  });

  const client = await pool.connect();
  let lockAcquired = false;

  try {
    // 1. Acquire PostgreSQL Advisory Lock
    const lockRes = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock($1) as locked',
      [ADVISORY_LOCK_KEY]
    );

    if (!lockRes.rows[0]?.locked) {
      throw new Error(
        'Concurrent migration in progress: could not acquire PostgreSQL advisory lock.'
      );
    }
    lockAcquired = true;

    // 2. Fetch applied migrations and disk files
    const applied = await getAppliedMigrations(client);
    const availableFiles = getMigrationFiles(migrationsDir);

    // 3. Verify checksums of already applied migrations
    for (const appliedMigration of applied) {
      const matchingFile = availableFiles.find((f) => f.filename === appliedMigration.filename);
      if (!matchingFile) {
        throw new Error(
          `Historical migration integrity error: ${appliedMigration.filename} was applied to database but is missing from disk!`
        );
      }
      if (matchingFile.checksum !== appliedMigration.checksum) {
        throw new Error(
          `Historical migration modified! File ${matchingFile.filename} checksum (${matchingFile.checksum}) ` +
            `does not match recorded database checksum (${appliedMigration.checksum}). ` +
            `Applied migrations must never be edited in-place.`
        );
      }
    }

    // 4. Identify pending migrations
    const appliedFilenames = new Set(applied.map((a) => a.filename));
    const pending = availableFiles.filter((f) => !appliedFilenames.has(f.filename));

    if (pending.length === 0) {
      return { applied: [], alreadyUpToDate: true };
    }

    const appliedResults: string[] = [];

    // 5. Run each pending migration inside its own transaction
    for (const migration of pending) {
      console.log(`[Migration] Applying: ${migration.filename}...`);
      try {
        await client.query('BEGIN');
        await client.query(migration.sqlContent);
        await client.query(
          'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
          [migration.filename, migration.checksum]
        );
        await client.query('COMMIT');
        appliedResults.push(migration.filename);
        console.log(`[Migration] Applied successfully: ${migration.filename}`);
      } catch (migrationError: unknown) {
        await client.query('ROLLBACK');
        const errMessage =
          migrationError instanceof Error ? migrationError.message : String(migrationError);
        throw new Error(`Failed to apply migration ${migration.filename}: ${errMessage}`);
      }
    }

    return { applied: appliedResults, alreadyUpToDate: false };
  } finally {
    if (lockAcquired) {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
    }
    client.release();
    await pool.end();
  }
}

/**
 * Migration status command
 */
export async function getMigrationStatus(options?: {
  connectionString?: string;
  migrationsDir?: string;
}): Promise<{
  applied: AppliedMigration[];
  pending: MigrationFile[];
}> {
  const targetUrl =
    options?.connectionString ||
    env.MIGRATION_DATABASE_URL ||
    env.DATABASE_URL;

  // Strict local database isolation: reject remote target unconditionally before connecting
  if (isRemoteDatabase(targetUrl)) {
    throw new Error(
      'STRICT LOCAL ISOLATION ABORT: Target database appears to be a remote or cloud instance. ' +
        'Migration status inspection is strictly forbidden from connecting to remote databases.'
    );
  }

  const defaultMigrationsDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../db/migrations'
  );
  const migrationsDir = options?.migrationsDir || defaultMigrationsDir;

  const pool = new Pool({
    connectionString: targetUrl,
    ssl: false,
    connectionTimeoutMillis: 5000,
  });

  const client = await pool.connect();
  try {
    const applied = await getAppliedMigrations(client);
    const availableFiles = getMigrationFiles(migrationsDir);
    const appliedFilenames = new Set(applied.map((a) => a.filename));
    const pending = availableFiles.filter((f) => !appliedFilenames.has(f.filename));

    return { applied, pending };
  } finally {
    client.release();
    await pool.end();
  }
}

// CLI runner when executed directly
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const command = process.argv[2] || 'migrate';

  if (command === 'migrate') {
    runMigrations({})
      .then((res) => {
        if (res.alreadyUpToDate) {
          console.log('[Migration] Database is already up to date. No pending migrations.');
        } else {
          console.log(`[Migration] Done. Successfully applied ${res.applied.length} migration(s).`);
        }
        process.exit(0);
      })
      .catch((err) => {
        console.error('[Migration Error]', err.message);
        process.exit(1);
      });
  } else if (command === 'status') {
    getMigrationStatus()
      .then((status) => {
        console.log('\n--- AXDORO MIGRATION STATUS ---');
        console.log(`Applied migrations (${status.applied.length}):`);
        status.applied.forEach((m) => {
          console.log(`  ✓ ${m.filename} (checksum: ${m.checksum.substring(0, 10)}..., applied: ${m.applied_at.toISOString()})`);
        });
        console.log(`Pending migrations (${status.pending.length}):`);
        status.pending.forEach((m) => {
          console.log(`  ⏳ ${m.filename} (checksum: ${m.checksum.substring(0, 10)}...)`);
        });
        console.log('-------------------------------\n');
        process.exit(0);
      })
      .catch((err) => {
        console.error('[Migration Status Error]', err.message);
        process.exit(1);
      });
  } else {
    console.error(`Unknown command: ${command}. Use 'migrate' or 'status'.`);
    process.exit(1);
  }
}
