import crypto from 'crypto';
import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { query } from '../config/db.js';

export interface StagingSessionRow {
  id: string;
  admin_id: string | null;
  status: 'ACTIVE' | 'COMMITTED' | 'EXPIRED' | 'ABANDONED';
  last_heartbeat_at: Date;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface StagedAssetRow {
  id: string;
  session_id: string;
  public_id: string;
  claim_status: 'UNCLAIMED' | 'CLAIMED_FOR_DELETION' | 'DELETED';
  claimed_at: Date | null;
  claim_token: string | null;
  created_at: Date;
  updated_at: Date;
}

async function execQuery<R extends QueryResultRow = any>(
  clientOrPool: Pool | PoolClient | null | undefined,
  sql: string,
  params?: any[]
): Promise<QueryResult<R>> {
  if (clientOrPool) {
    return clientOrPool.query<R>(sql, params);
  }
  return query<R>(sql, params);
}

/**
 * Creates a new active product staging session for an authenticated admin.
 * Default expiration is 2 hours from creation.
 */
export async function createStagingSession(adminId: string): Promise<{ id: string; expiresAt: string }> {
  const sql = `
    INSERT INTO product_staging_sessions (admin_id, status, expires_at)
    VALUES ($1, 'ACTIVE', CURRENT_TIMESTAMP + INTERVAL '2 hours')
    RETURNING id, expires_at;
  `;
  const res = await query<{ id: string; expires_at: Date }>(sql, [adminId]);
  return {
    id: res.rows[0].id,
    expiresAt: res.rows[0].expires_at.toISOString(),
  };
}

/**
 * Extends the expiration of an active staging session by 2 hours.
 * Enforces ownership: only the admin who created the session can extend it.
 * Rejects expired, abandoned, committed, or non-existent sessions.
 */
export async function heartbeatStagingSession(
  sessionId: string,
  adminId: string
): Promise<{ id: string; expiresAt: string }> {
  // Check existence and ownership first for precise error reporting
  const checkSql = `SELECT id, admin_id, status, expires_at FROM product_staging_sessions WHERE id = $1;`;
  const checkRes = await query<StagingSessionRow>(checkSql, [sessionId]);

  if (checkRes.rows.length === 0) {
    const err = new Error('Staging session not found');
    (err as any).statusCode = 404;
    throw err;
  }

  const session = checkRes.rows[0];
  if (session.admin_id && session.admin_id !== adminId) {
    const err = new Error('Access denied: Staging session belongs to another administrator');
    (err as any).statusCode = 403;
    throw err;
  }

  if (session.status !== 'ACTIVE') {
    const err = new Error(`Cannot heartbeat staging session with status '${session.status}'`);
    (err as any).statusCode = 409;
    throw err;
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    const err = new Error('Staging session has expired. Please reload the modal to start a new session.');
    (err as any).statusCode = 410;
    throw err;
  }

  const updateSql = `
    UPDATE product_staging_sessions
    SET last_heartbeat_at = CURRENT_TIMESTAMP,
        expires_at = CURRENT_TIMESTAMP + INTERVAL '2 hours',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND admin_id = $2 AND status = 'ACTIVE' AND expires_at > CURRENT_TIMESTAMP
    RETURNING id, expires_at;
  `;
  const res = await query<{ id: string; expires_at: Date }>(updateSql, [sessionId, adminId]);
  if (res.rows.length === 0) {
    const err = new Error('Failed to extend staging session heartbeat');
    (err as any).statusCode = 409;
    throw err;
  }

  return {
    id: res.rows[0].id,
    expiresAt: res.rows[0].expires_at.toISOString(),
  };
}

/**
 * Marks a staging session as ABANDONED (e.g. user cancelled product creation).
 * Enforces ownership. Does not immediately delete assets; background reconciliation handles them safely.
 */
export async function abandonStagingSession(sessionId: string, adminId: string): Promise<boolean> {
  const checkSql = `SELECT id, admin_id, status FROM product_staging_sessions WHERE id = $1;`;
  const checkRes = await query<StagingSessionRow>(checkSql, [sessionId]);

  if (checkRes.rows.length === 0) return false;

  const session = checkRes.rows[0];
  if (session.admin_id && session.admin_id !== adminId) {
    const err = new Error('Access denied: Staging session belongs to another administrator');
    (err as any).statusCode = 403;
    throw err;
  }

  if (session.status !== 'ACTIVE') return false;

  const updateSql = `
    UPDATE product_staging_sessions
    SET status = 'ABANDONED', updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND admin_id = $2 AND status = 'ACTIVE';
  `;
  const res = await query(updateSql, [sessionId, adminId]);
  return (res.rowCount || 0) > 0;
}

/**
 * Pre-registers a generated Cloudinary public ID against an active staging session.
 *
 * Requirements:
 * 1. Session must belong to admin, must be ACTIVE, and must not be expired.
 * 2. Cross-session public ID registration is strictly rejected.
 * 3. Duplicate public ID registration within the same session is an idempotent no-op.
 */
export async function preRegisterStagedAsset(
  sessionId: string,
  adminId: string,
  publicId: string,
  clientOrPool?: Pool | PoolClient | null
): Promise<void> {
  // 1. Verify session exists, belongs to admin, and is ACTIVE
  const sessionRes = await execQuery<StagingSessionRow>(
    clientOrPool,
    `SELECT id, admin_id, status, expires_at FROM product_staging_sessions WHERE id = $1;`,
    [sessionId]
  );

  if (sessionRes.rows.length === 0) {
    const err = new Error('Staging session not found');
    (err as any).statusCode = 404;
    throw err;
  }

  const session = sessionRes.rows[0];
  if (session.admin_id && session.admin_id !== adminId) {
    const err = new Error('Access denied: Staging session belongs to another administrator');
    (err as any).statusCode = 403;
    throw err;
  }

  if (session.status !== 'ACTIVE') {
    const err = new Error(`Cannot register assets to staging session with status '${session.status}'`);
    (err as any).statusCode = 409;
    throw err;
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    const err = new Error('Staging session has expired');
    (err as any).statusCode = 410;
    throw err;
  }

  // 2. Check existing public_id registration to guard against cross-session collisions
  const existingAssetRes = await execQuery<StagedAssetRow>(
    clientOrPool,
    `SELECT id, session_id, public_id FROM product_staged_assets WHERE public_id = $1;`,
    [publicId]
  );

  if (existingAssetRes.rows.length > 0) {
    const existing = existingAssetRes.rows[0];
    if (existing.session_id !== sessionId) {
      const err = new Error(`Asset registration conflict: public_id '${publicId}' is already registered to another session`);
      (err as any).statusCode = 409;
      throw err;
    }
    // Same session retry: idempotent success
    return;
  }

  // 3. Pre-register asset with UNCLAIMED claim_status
  await execQuery(
    clientOrPool,
    `INSERT INTO product_staged_assets (session_id, public_id, claim_status)
     VALUES ($1, $2, 'UNCLAIMED')
     ON CONFLICT (public_id) DO NOTHING;`,
    [sessionId, publicId]
  );
}

/**
 * Checks whether an asset belongs to an active, unexpired staging session.
 */
export async function isAssetInActiveStagingSession(
  publicId: string,
  clientOrPool?: Pool | PoolClient | null
): Promise<boolean> {
  const sql = `
    SELECT 1 FROM product_staged_assets a
    JOIN product_staging_sessions s ON s.id = a.session_id
    WHERE a.public_id = $1 
      AND s.status = 'ACTIVE' 
      AND s.expires_at > CURRENT_TIMESTAMP
    LIMIT 1;
  `;
  const res = await execQuery(clientOrPool, sql, [publicId]);
  return res.rows.length > 0;
}

export interface ClaimResult {
  claimed: boolean;
  claimToken?: string;
  reason?: string;
}

/**
 * Atomically claims a staged asset for deletion.
 *
 * Invariants strictly enforced:
 * 1. Asset must NOT be referenced by product_images, categories, or enquiries.
 * 2. Asset must NOT belong to an active, unexpired staging session.
 * 3. Asset must be UNCLAIMED or have an expired claim lease (>15 minutes old).
 * 4. Claim is atomic: two concurrent workers cannot claim the same asset.
 * 5. Returns a unique claim token; subsequent release/deletion requires this token.
 */
export async function claimStagedAssetForDeletion(
  publicId: string,
  clientOrPool?: Pool | PoolClient | null
): Promise<ClaimResult> {
  const claimToken = crypto.randomBytes(16).toString('hex');

  // First check if asset is recorded in product_staged_assets
  const existingRes = await execQuery<StagedAssetRow>(
    clientOrPool,
    `SELECT id, session_id, claim_status, claimed_at FROM product_staged_assets WHERE public_id = $1;`,
    [publicId]
  );

  if (existingRes.rows.length > 0) {
    // Row exists in product_staged_assets: execute atomic claim with lease renewal
    const claimSql = `
      UPDATE product_staged_assets a
      SET claim_status = 'CLAIMED_FOR_DELETION',
          claimed_at = CURRENT_TIMESTAMP,
          claim_token = $1,
          updated_at = CURRENT_TIMESTAMP
      FROM product_staging_sessions s
      WHERE a.session_id = s.id
        AND a.public_id = $2
        AND (
          a.claim_status = 'UNCLAIMED'
          OR (a.claim_status = 'CLAIMED_FOR_DELETION' AND a.claimed_at < CURRENT_TIMESTAMP - INTERVAL '15 minutes')
        )
        AND (
          s.status IN ('EXPIRED', 'ABANDONED')
          OR (s.status = 'ACTIVE' AND s.expires_at <= CURRENT_TIMESTAMP)
        )
        AND NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.public_id = a.public_id)
        AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.public_id = a.public_id)
        AND NOT EXISTS (SELECT 1 FROM enquiries e WHERE e.design_file_public_id = a.public_id)
      RETURNING a.id, a.public_id;
    `;
    const res = await execQuery(clientOrPool, claimSql, [claimToken, publicId]);
    if ((res.rowCount || 0) > 0) {
      return { claimed: true, claimToken };
    }
    return { claimed: false, reason: 'Asset is active, referenced, or currently claimed by another worker' };
  }

  // If asset is NOT in product_staged_assets (e.g. uploaded via legacy flow or before migration 016),
  // verify catalogue reference guards unconditionally before permitting claim
  const refSql = `
    SELECT 1 FROM product_images WHERE public_id = $1
    UNION ALL
    SELECT 1 FROM categories WHERE public_id = $1
    UNION ALL
    SELECT 1 FROM enquiries WHERE design_file_public_id = $1;
  `;
  const refRes = await execQuery(clientOrPool, refSql, [publicId]);
  if (refRes.rows.length > 0) {
    return { claimed: false, reason: 'Asset referenced in catalogue or enquiries' };
  }

  // Pre-legacy orphan: safe to claim with generated token
  return { claimed: true, claimToken };
}

/**
 * Marks a claimed staged asset as permanently deleted after Cloudinary deletion succeeds.
 */
export async function markStagedAssetDeleted(
  publicId: string,
  claimToken: string,
  clientOrPool?: Pool | PoolClient | null
): Promise<void> {
  await execQuery(
    clientOrPool,
    `UPDATE product_staged_assets
     SET claim_status = 'DELETED',
         updated_at = CURRENT_TIMESTAMP
     WHERE public_id = $1 AND claim_token = $2;`,
    [publicId, claimToken]
  );
}

/**
 * Releases a deletion claim if Cloudinary deletion fails or errors out, allowing safe future retry.
 */
export async function releaseStagedAssetClaim(
  publicId: string,
  claimToken: string,
  clientOrPool?: Pool | PoolClient | null
): Promise<void> {
  await execQuery(
    clientOrPool,
    `UPDATE product_staged_assets
     SET claim_status = 'UNCLAIMED',
         claim_token = NULL,
         claimed_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE public_id = $1 AND claim_token = $2;`,
    [publicId, claimToken]
  );
}
