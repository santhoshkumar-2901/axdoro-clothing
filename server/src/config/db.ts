import pg from 'pg';
import { env, isRemoteDatabase, assertSecureTlsParameters } from './env.js';

const { Pool } = pg;

const connectionString =
  env.NODE_ENV === 'test' && env.TEST_DATABASE_URL
    ? env.TEST_DATABASE_URL
    : env.DATABASE_URL;

const isRemote = isRemoteDatabase(connectionString);

/**
 * Validates database connection target based on environment and remote development opt-in.
 * Throws a safe, actionable error without exposing sensitive credentials.
 */
export function validateRuntimeDbTarget(
  targetUrl: string,
  nodeEnv: string = env.NODE_ENV,
  allowRemoteDev: boolean = env.ALLOW_REMOTE_DEV_DB
): void {
  // Validate TLS parameters and reject insecure or malformed connection strings
  assertSecureTlsParameters(targetUrl);

  const isRemote = isRemoteDatabase(targetUrl);

  // 1. Test environment must NEVER connect to a remote database regardless of opt-in
  if (nodeEnv === 'test' && isRemote) {
    throw new Error(
      'STRICT LOCAL DATABASE ISOLATION ERROR: Remote database detected in test environment. ' +
        'Automated test suites must run strictly against the dedicated local test database (axdoro_test).'
    );
  }

  // 2. Development environment permits remote database ONLY with explicit opt-in
  if (nodeEnv === 'development' && isRemote && !allowRemoteDev) {
    throw new Error(
      'STRICT LOCAL DATABASE ISOLATION ERROR: Remote database detected in development without explicit opt-in. ' +
        'To permit an authorized remote development database, set ALLOW_REMOTE_DEV_DB=true in your environment. ' +
        'Otherwise, connect strictly to a local PostgreSQL instance (localhost / 127.0.0.1).'
    );
  }

  // 3. Other non-production environments reject remote databases unconditionally
  if (nodeEnv !== 'production' && nodeEnv !== 'development' && nodeEnv !== 'test' && isRemote) {
    throw new Error(
      `STRICT LOCAL DATABASE ISOLATION ERROR: Remote database detected in non-production environment '${nodeEnv}'.`
    );
  }
}

// Fail closed: enforce local isolation before allocating pool resources
validateRuntimeDbTarget(connectionString, env.NODE_ENV, env.ALLOW_REMOTE_DEV_DB);

export const pool = new Pool({
  connectionString,
  ssl: isRemote ? { rejectUnauthorized: true } : false,
  max: process.env.VERCEL === '1' ? 3 : 20, // Reduced pool size in serverless to prevent connection exhaustion
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
