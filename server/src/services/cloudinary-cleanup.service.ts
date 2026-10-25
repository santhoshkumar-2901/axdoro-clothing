import crypto from 'crypto';
import type { Pool, PoolClient } from 'pg';
import { query, withTransaction } from '../config/db.js';
import {
  deleteCloudinaryAsset,
  tagCloudinaryAsset,
  listCloudinaryResourcesByTag,
} from './cloudinary.service.js';

export interface CleanupJobRow {
  id: string;
  public_id: string;
  asset_type: string;
  resource_type: string;
  reason: 'ENQUIRY_DELETION' | 'ORPHANED_UPLOAD' | 'COMPENSATING_FAILURE';
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'ABORTED';
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: Date;
  claimed_at: Date | null;
  claim_token: string | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface EnqueueCleanupParams {
  publicId: string;
  assetType?: 'authenticated' | 'upload';
  resourceType?: string;
  reason: 'ENQUIRY_DELETION' | 'ORPHANED_UPLOAD' | 'COMPENSATING_FAILURE';
}

/**
 * Persists a durable Cloudinary cleanup job into PostgreSQL outbox.
 * Can be executed within an existing transaction client or using the default pool.
 */
export async function enqueueCleanupJob(
  clientOrPool: Pool | PoolClient | null,
  params: EnqueueCleanupParams
): Promise<string> {
  const assetType = params.assetType || 'authenticated';
  const resourceType = params.resourceType || 'image';

  const sql = `
    INSERT INTO cloudinary_cleanup_jobs (
      public_id,
      asset_type,
      resource_type,
      reason,
      status
    )
    VALUES ($1, $2, $3, $4, 'PENDING')
    RETURNING id;
  `;
  const values = [params.publicId, assetType, resourceType, params.reason];

  if (clientOrPool) {
    const res = await clientOrPool.query<{ id: string }>(sql, values);
    return res.rows[0].id;
  }
  const res = await query<{ id: string }>(sql, values);
  return res.rows[0].id;
}

/**
 * Checks whether an asset's public_id is actively referenced by any existing enquiry.
 * Prevents retries from ever deleting artwork belonging to an active customer enquiry.
 */
export async function isAssetReferencedByActiveEnquiry(
  publicId: string,
  clientOrPool?: Pool | PoolClient | null
): Promise<boolean> {
  const sql = `SELECT id FROM enquiries WHERE design_file_public_id = $1 LIMIT 1;`;
  const res = clientOrPool
    ? await clientOrPool.query(sql, [publicId])
    : await query(sql, [publicId]);
  return res.rows.length > 0;
}

/**
 * Immediately attempts to process a single cleanup job post-commit.
 *
 * Requirements strictly enforced:
 * 1. A cleanup job is claimed in a short database transaction.
 * 2. The transaction commits before calling Cloudinary.
 * 3. Cloudinary deletion occurs OUTSIDE database transactions.
 * 4. The result is recorded in a separate short transaction.
 * 5. Every state update validates both job ID and the current claim_token.
 * 6. A stale worker cannot overwrite a newer worker's state.
 * 7. Active enquiry artwork cannot be deleted by cleanup or orphan reconciliation.
 */
export async function processSingleCleanupJob(jobId: string): Promise<{
  success: boolean;
  status: 'COMPLETED' | 'PENDING' | 'FAILED' | 'ABORTED';
  error?: string;
}> {
  try {
    // Step 1: Claim the job in a short transaction and commit immediately
    const claimResult = await withTransaction(async (dbClient) => {
      const jobRes = await dbClient.query<CleanupJobRow>(
        `SELECT * FROM cloudinary_cleanup_jobs WHERE id = $1 FOR UPDATE SKIP LOCKED;`,
        [jobId]
      );

      if (jobRes.rows.length === 0) {
        return { status: 'LOCKED_OR_NOT_FOUND' as const };
      }

      const job = jobRes.rows[0];
      if (job.status === 'COMPLETED' || job.status === 'ABORTED') {
        return { status: job.status, job };
      }

      // Safety Guard: verify that no active enquiry references this artwork asset
      const isReferenced = await isAssetReferencedByActiveEnquiry(job.public_id, dbClient);
      if (isReferenced) {
        await dbClient.query(
          `UPDATE cloudinary_cleanup_jobs
           SET status = 'ABORTED',
               claim_token = NULL,
               last_error = 'Asset actively referenced by existing enquiry. Deletion aborted for safety.',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1;`,
          [jobId]
        );
        return { status: 'ABORTED' as const, job };
      }

      const claimToken = crypto.randomUUID();
      await dbClient.query(
        `UPDATE cloudinary_cleanup_jobs
         SET status = 'PROCESSING',
             claimed_at = CURRENT_TIMESTAMP,
             claim_token = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2;`,
        [claimToken, jobId]
      );

      return { status: 'CLAIMED' as const, job: { ...job, claim_token: claimToken } };
    });

    if (claimResult.status === 'LOCKED_OR_NOT_FOUND') {
      return { success: false, status: 'FAILED', error: 'Job not found or locked' };
    }
    if (claimResult.status === 'COMPLETED' || claimResult.status === 'ABORTED') {
      return { success: true, status: claimResult.status };
    }

    const job = claimResult.job!;
    const claimToken = job.claim_token!;

    // Step 2: Execute Cloudinary deletion OUTSIDE database transactions
    const deleted = await deleteCloudinaryAsset(job.public_id, {
      type: job.asset_type,
      resourceType: job.resource_type,
    });

    // Step 3: Record the result in a separate short transaction, validating job ID and claim_token
    return await withTransaction(async (dbClient) => {
      if (deleted) {
        const updateRes = await dbClient.query(
          `UPDATE cloudinary_cleanup_jobs
           SET status = 'COMPLETED',
               claim_token = NULL,
               last_error = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND claim_token = $2
           RETURNING id;`,
          [jobId, claimToken]
        );

        if (updateRes.rows.length === 0) {
          return { success: false, status: 'FAILED', error: 'Stale worker lease expired' };
        }
        return { success: true, status: 'COMPLETED' };
      }

      // Transient failure handling: increment attempt and calculate bounded exponential backoff
      const nextAttempt = job.attempt_count + 1;
      const isTerminal = nextAttempt >= job.max_attempts;
      const backoffSeconds = Math.min(Math.pow(2, nextAttempt) * 30, 3600);
      const nextStatus = isTerminal ? 'FAILED' : 'PENDING';

      const updateRes = await dbClient.query(
        `UPDATE cloudinary_cleanup_jobs
         SET status = $1,
             attempt_count = $2,
             next_attempt_at = CURRENT_TIMESTAMP + ($3 || ' seconds')::interval,
             claim_token = NULL,
             last_error = 'Cloudinary returned non-ok status during asset deletion',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4 AND claim_token = $5
         RETURNING id;`,
        [nextStatus, nextAttempt, backoffSeconds, jobId, claimToken]
      );

      if (updateRes.rows.length === 0) {
        return { success: false, status: 'FAILED', error: 'Stale worker lease expired' };
      }

      return {
        success: false,
        status: nextStatus,
        error: 'Cloudinary deletion returned non-ok status',
      };
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn('[Cloudinary Cleanup Single Job Error]', {
      jobId,
      error: errorMsg,
      timestamp: new Date().toISOString(),
    });
    return { success: false, status: 'FAILED', error: errorMsg };
  }
}

/**
 * Worker function that claims and processes queued cleanup jobs with bounded retry backoff.
 * Operates safely with short claim transaction -> external call -> short update transaction
 * using claim_token verification.
 */
export async function processCloudinaryCleanupQueue(batchSize: number = 10): Promise<{
  processed: number;
  completed: number;
  aborted: number;
  failed: number;
}> {
  let completed = 0;
  let aborted = 0;
  let failed = 0;

  // 1. Claim eligible jobs inside a short transaction
  const claimedJobs = await withTransaction(async (dbClient) => {
    const candidateRes = await dbClient.query<{ id: string }>(
      `SELECT id
       FROM cloudinary_cleanup_jobs
       WHERE (
         status IN ('PENDING', 'FAILED')
         OR (status = 'PROCESSING' AND claimed_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes')
       )
       AND attempt_count < max_attempts
       AND next_attempt_at <= CURRENT_TIMESTAMP
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED;`,
      [batchSize]
    );

    if (candidateRes.rows.length === 0) {
      return [];
    }

    const claimedList: CleanupJobRow[] = [];
    for (const cand of candidateRes.rows) {
      const claimToken = crypto.randomUUID();
      const updateRes = await dbClient.query<CleanupJobRow>(
        `UPDATE cloudinary_cleanup_jobs
         SET status = 'PROCESSING',
             claimed_at = CURRENT_TIMESTAMP,
             claim_token = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *;`,
        [claimToken, cand.id]
      );
      if (updateRes.rows.length > 0) {
        claimedList.push(updateRes.rows[0]);
      }
    }
    return claimedList;
  });

  // 2. Process each claimed job OUTSIDE database transactions
  for (const job of claimedJobs) {
    const claimToken = job.claim_token;
    try {
      const isReferenced = await isAssetReferencedByActiveEnquiry(job.public_id);
      if (isReferenced) {
        await query(
          `UPDATE cloudinary_cleanup_jobs
           SET status = 'ABORTED',
               claim_token = NULL,
               last_error = 'Asset actively referenced by existing enquiry. Deletion aborted for safety.',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND claim_token = $2;`,
          [job.id, claimToken]
        );
        aborted++;
        continue;
      }

      // External Cloudinary deletion OUTSIDE database transactions
      const deleted = await deleteCloudinaryAsset(job.public_id, {
        type: job.asset_type,
        resourceType: job.resource_type,
      });

      if (deleted) {
        const updateRes = await query(
          `UPDATE cloudinary_cleanup_jobs
           SET status = 'COMPLETED',
               claim_token = NULL,
               last_error = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND claim_token = $2
           RETURNING id;`,
          [job.id, claimToken]
        );
        if (updateRes.rowCount && updateRes.rowCount > 0) {
          completed++;
        }
      } else {
        const nextAttempt = job.attempt_count + 1;
        const isTerminal = nextAttempt >= job.max_attempts;
        const backoffSeconds = Math.min(Math.pow(2, nextAttempt) * 30, 3600);
        const nextStatus = isTerminal ? 'FAILED' : 'PENDING';

        const updateRes = await query(
          `UPDATE cloudinary_cleanup_jobs
           SET status = $1,
               attempt_count = $2,
               next_attempt_at = CURRENT_TIMESTAMP + ($3 || ' seconds')::interval,
               claim_token = NULL,
               last_error = 'Cloudinary deletion returned non-ok status',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $4 AND claim_token = $5
           RETURNING id;`,
          [nextStatus, nextAttempt, backoffSeconds, job.id, claimToken]
        );
        if (updateRes.rowCount && updateRes.rowCount > 0) {
          failed++;
        }
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const nextAttempt = job.attempt_count + 1;
      const isTerminal = nextAttempt >= job.max_attempts;
      const backoffSeconds = Math.min(Math.pow(2, nextAttempt) * 30, 3600);
      const nextStatus = isTerminal ? 'FAILED' : 'PENDING';

      await query(
        `UPDATE cloudinary_cleanup_jobs
         SET status = $1,
             attempt_count = $2,
             next_attempt_at = CURRENT_TIMESTAMP + ($3 || ' seconds')::interval,
             claim_token = NULL,
             last_error = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5 AND claim_token = $6;`,
        [nextStatus, nextAttempt, backoffSeconds, errorMsg.slice(0, 300), job.id, claimToken]
      );
      failed++;
    }
  }

  return {
    processed: claimedJobs.length,
    completed,
    aborted,
    failed,
  };
}

/**
 * Reconciles Cloudinary assets bearing the 'pending_commit' lifecycle tag.
 *
 * Safety rules:
 * - Assets younger than conservative threshold (minAgeMs, default 1 hour) are skipped.
 * - Database lookup failures never trigger deletion; they are logged and skipped.
 * - If active enquiry references the asset, tags are updated to 'committed' and 'pending_commit' is removed.
 * - If confirmed that no enquiry references the asset, it is safely deleted.
 */
export async function reconcileCloudinaryPendingTags(options?: {
  minAgeMs?: number;
}): Promise<{
  scanned: number;
  reconciledCommitted: number;
  deletedOrphans: number;
  skippedActiveOrRecent: number;
  errors: number;
}> {
  const minAgeMs = options?.minAgeMs ?? 60 * 60 * 1000; // 1 hour conservative threshold
  let scanned = 0;
  let reconciledCommitted = 0;
  let deletedOrphans = 0;
  let skippedActiveOrRecent = 0;
  let errors = 0;

  try {
    const pendingResources = await listCloudinaryResourcesByTag('pending_commit');
    scanned = pendingResources.length;

    const now = Date.now();
    for (const res of pendingResources) {
      try {
        const createdAt = new Date(res.created_at).getTime();
        // 1. Skip recent uploads: must exceed conservative threshold
        if (now - createdAt < minAgeMs) {
          skippedActiveOrRecent++;
          continue;
        }

        // 2. Query PostgreSQL to see if an active enquiry references this public_id
        let isReferenced = false;
        try {
          isReferenced = await isAssetReferencedByActiveEnquiry(res.public_id);
        } catch (dbErr) {
          // Never delete an asset merely because its database lookup temporarily fails
          console.error(`[Reconcile Tags] DB lookup failed for asset ${res.public_id}; skipping:`, dbErr);
          errors++;
          continue;
        }

        if (isReferenced) {
          // Active enquiry exists: upload and DB write succeeded, but post-commit tag update was missed
          await tagCloudinaryAsset({
            publicId: res.public_id,
            tag: 'pending_commit',
            command: 'remove',
            type: res.type || 'authenticated',
            resourceType: res.resource_type || 'image',
          });
          await tagCloudinaryAsset({
            publicId: res.public_id,
            tag: 'committed',
            command: 'add',
            type: res.type || 'authenticated',
            resourceType: res.resource_type || 'image',
          });
          reconciledCommitted++;
        } else {
          // Confirmed orphan: no active enquiry exists in database. Safe to delete!
          const deleted = await deleteCloudinaryAsset(res.public_id, {
            type: res.type || 'authenticated',
            resourceType: res.resource_type || 'image',
          });
          if (deleted) {
            deletedOrphans++;
          } else {
            errors++;
          }
        }
      } catch (assetErr) {
        console.warn(`[Reconcile Tags Error for ${res.public_id}]`, assetErr);
        errors++;
      }
    }
  } catch (err) {
    console.error('[Reconcile Cloudinary Pending Tags Failed]', err);
    errors++;
  }

  return {
    scanned,
    reconciledCommitted,
    deletedOrphans,
    skippedActiveOrRecent,
    errors,
  };
}

/**
 * Retrieves aggregate summary and recent cleanup jobs for operational discovery.
 * Sanitized to never expose customer PII, credentials, or signed URLs.
 */
export async function getCleanupJobsStatus(): Promise<{
  summary: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    aborted: number;
    total: number;
  };
  jobs: Array<{
    id: string;
    assetType: string;
    resourceType: string;
    reason: string;
    status: string;
    attemptCount: number;
    maxAttempts: number;
    nextAttemptAt: string;
    createdAt: string;
    updatedAt: string;
    hasError: boolean;
  }>;
}> {
  const countRes = await query<{ status: string; count: string }>(
    `SELECT status, COUNT(*) as count FROM cloudinary_cleanup_jobs GROUP BY status;`
  );

  const summary = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    aborted: 0,
    total: 0,
  };

  for (const row of countRes.rows) {
    const cnt = parseInt(row.count, 10) || 0;
    summary.total += cnt;
    if (row.status === 'PENDING') summary.pending = cnt;
    else if (row.status === 'PROCESSING') summary.processing = cnt;
    else if (row.status === 'COMPLETED') summary.completed = cnt;
    else if (row.status === 'FAILED') summary.failed = cnt;
    else if (row.status === 'ABORTED') summary.aborted = cnt;
  }

  const jobsRes = await query<CleanupJobRow>(
    `SELECT id, asset_type, resource_type, reason, status, attempt_count, max_attempts, next_attempt_at, last_error, created_at, updated_at
     FROM cloudinary_cleanup_jobs
     ORDER BY created_at DESC
     LIMIT 50;`
  );

  const jobs = jobsRes.rows.map((j) => ({
    id: j.id,
    assetType: j.asset_type,
    resourceType: j.resource_type,
    reason: j.reason,
    status: j.status,
    attemptCount: j.attempt_count,
    maxAttempts: j.max_attempts,
    nextAttemptAt: new Date(j.next_attempt_at).toISOString(),
    createdAt: new Date(j.created_at).toISOString(),
    updatedAt: new Date(j.updated_at).toISOString(),
    hasError: Boolean(j.last_error),
  }));

  return { summary, jobs };
}

/**
 * Retries failed or eligible cleanup jobs by resetting them to PENDING.
 */
export async function retryCleanupJobs(jobId?: string): Promise<number> {
  if (jobId) {
    const res = await query(
      `UPDATE cloudinary_cleanup_jobs
       SET status = 'PENDING',
           attempt_count = 0,
           next_attempt_at = CURRENT_TIMESTAMP,
           last_error = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'FAILED'
       RETURNING id;`,
      [jobId]
    );
    return res.rowCount || 0;
  }

  const res = await query(
    `UPDATE cloudinary_cleanup_jobs
     SET status = 'PENDING',
         attempt_count = 0,
         next_attempt_at = CURRENT_TIMESTAMP,
         last_error = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE status = 'FAILED'
     RETURNING id;`
  );
  return res.rowCount || 0;
}
