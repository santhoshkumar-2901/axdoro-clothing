import pg from 'pg';
import { env, isRemoteDatabase } from './env.js';

const { Pool } = pg;

const connectionString =
  env.NODE_ENV === 'test' && env.TEST_DATABASE_URL
    ? env.TEST_DATABASE_URL
    : env.DATABASE_URL;

const isRemote = isRemoteDatabase(connectionString);

/**
 * Validates that non-production environments connect strictly to local PostgreSQL instances.
 * Throws a safe, actionable error without exposing sensitive credentials.
 */
export function validateRuntimeDbTarget(targetUrl: string, nodeEnv: string): void {
  if (nodeEnv !== 'production' && isRemoteDatabase(targetUrl)) {
    throw new Error(
      'STRICT LOCAL DATABASE ISOLATION ERROR: Remote database detected in non-production environment. ' +
        'Local development and testing must connect strictly to a local PostgreSQL instance (localhost / 127.0.0.1). ' +
        'Remote cloud databases are rejected.'
    );
  }
}

// Fail closed: enforce local isolation before allocating pool resources
validateRuntimeDbTarget(connectionString, env.NODE_ENV);

export const pool = new Pool({
  connectionString,
  ssl: isRemote ? { rejectUnauthorized: true } : false,
  max: 20, // Max concurrent clients
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  // Unexpected error on idle client in pool
  console.error('[DB Pool Error] Unexpected idle client error:', err.message);
});

/**
 * Execute a single parameterized query safely against the pool
 */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  try {
    const res = await pool.query<T>(text, params);
    if (env.NODE_ENV === 'development') {
      const duration = Date.now() - start;
      // Log query name/preview without logging sensitive parameter values
      console.log(`[DB Query] executed in ${duration}ms, rows: ${res.rowCount}`);
    }
    return res;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[DB Query Error] Query failed: ${message}`);
    throw err;
  }
}

/**
 * Transaction helper ensuring a single dedicated client is used,
 * committed on success, and rolled back on error.
 */
export async function withTransaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Health check helper for pinging database
 */
export async function checkDbHealth(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, latencyMs: Date.now() - start, error: message };
  }
}

/**
 * Graceful shutdown
 */
export async function closePool(): Promise<void> {
  await pool.end();
}
