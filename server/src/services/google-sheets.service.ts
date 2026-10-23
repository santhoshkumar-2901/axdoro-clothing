import crypto from 'crypto';
import pg from 'pg';
import { withTransaction, query } from '../config/db.js';
import { getEnquirySyncAdvisoryLockKey } from './enquiry.service.js';

export interface GoogleSheetsClient {
  appendRow(sheetId: string, rowValues: (string | number | null)[]): Promise<{ rowNumber: number }>;
  getExistingEnquiryIds(sheetId: string): Promise<Set<string>>;
}

/**
 * In-memory / Mockable Google Sheets Client for tests and local development.
 */
export class MockGoogleSheetsClient implements GoogleSheetsClient {
  public rows: (string | number | null)[][] = [];
  public shouldFail = false;
  public failureError = new Error('Simulated Google Sheets API service outage');
  public latencyMs = 0;

  constructor(options?: {
    shouldFail?: boolean;
    failureError?: Error;
    latencyMs?: number;
  }) {
    if (options?.shouldFail !== undefined) this.shouldFail = options.shouldFail;
    if (options?.failureError) this.failureError = options.failureError;
    if (options?.latencyMs !== undefined) this.latencyMs = options.latencyMs;
  }

  async appendRow(
    _sheetId: string,
    rowValues: (string | number | null)[]
  ): Promise<{ rowNumber: number }> {
    if (this.latencyMs > 0) {
      await new Promise((r) => setTimeout(r, this.latencyMs));
    }
    if (this.shouldFail) {
      throw this.failureError;
    }
    this.rows.push(rowValues);
    return { rowNumber: this.rows.length + 1 };
  }

  async getExistingEnquiryIds(_sheetId: string): Promise<Set<string>> {
    if (this.shouldFail) {
      throw this.failureError;
    }
    const ids = new Set<string>();
    for (const row of this.rows) {
      if (row[0]) {
        ids.add(String(row[0]));
      }
    }
    return ids;
  }
}

/**
 * Real Google Sheets v4 REST API Client using Service Account JWT assertion.
 * Zero external bloated SDK dependencies — uses Node.js standard crypto and fetch.
 */
export class RealGoogleSheetsClient implements GoogleSheetsClient {
  private serviceAccountEmail: string;
  private privateKey: string;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(serviceAccountEmail: string, privateKey: string) {
    this.serviceAccountEmail = serviceAccountEmail;
    // Replace escaped newlines if passed in single-line env string
    this.privateKey = privateKey.replace(/\\n/g, '\n');
  }

  private async getAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.accessToken && this.tokenExpiresAt > now + 60) {
      return this.accessToken;
    }

    const header = { alg: 'RS256', typ: 'JWT' };
    const claimSet = {
      iss: this.serviceAccountEmail,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    };

    const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
    const b64Claim = Buffer.from(JSON.stringify(claimSet)).toString('base64url');
    const signatureInput = `${b64Header}.${b64Claim}`;

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signatureInput);
    const signature = signer.sign(this.privateKey, 'base64url');
    const assertion = `${signatureInput}.${signature}`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Google OAuth authentication failed: ${tokenRes.status} ${errText}`);
    }

    const tokenJson = (await tokenRes.json()) as { access_token: string; expires_in: number };
    this.accessToken = tokenJson.access_token;
    this.tokenExpiresAt = now + tokenJson.expires_in;
    return this.accessToken;
  }

  async getExistingEnquiryIds(sheetId: string): Promise<Set<string>> {
    const token = await this.getAccessToken();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      sheetId
    )}/values/A:A`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`Failed to query Google Sheet values: ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as { values?: string[][] };
    const ids = new Set<string>();
    if (json.values) {
      for (const row of json.values) {
        if (row[0]) ids.add(row[0].trim());
      }
    }
    return ids;
  }

  async appendRow(
    sheetId: string,
    rowValues: (string | number | null)[]
  ): Promise<{ rowNumber: number }> {
    const token = await this.getAccessToken();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      sheetId
    )}/values/A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [rowValues],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to append row to Google Sheet: ${res.status} ${errText}`);
    }

    const json = (await res.json()) as { updates?: { updatedRange?: string } };
    const range = json.updates?.updatedRange || '';
    const match = range.match(/\d+$/);
    const rowNumber = match ? parseInt(match[0], 10) : 0;
    return { rowNumber };
  }
}

let activeGoogleSheetsClient: GoogleSheetsClient | null = null;

export function setGoogleSheetsClient(client: GoogleSheetsClient | null): void {
  activeGoogleSheetsClient = client;
}

export function getActiveGoogleSheetsClient(): GoogleSheetsClient | null {
  if (activeGoogleSheetsClient) {
    return activeGoogleSheetsClient;
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;

  if (email && key) {
    activeGoogleSheetsClient = new RealGoogleSheetsClient(email, key);
    return activeGoogleSheetsClient;
  }

  return null;
}

/**
 * Backfills any eligible existing enquiries created before Drive sync into drive_sync_jobs,
 * ensuring no duplicate PostgreSQL enquiry records are created.
 */
export async function backfillPendingEnquiries(): Promise<number> {
  const insertRes = await query<{ count: string }>(`
    WITH inserted AS (
      INSERT INTO drive_sync_jobs (enquiry_id, status, idempotency_key)
      SELECT e.id, 'PENDING', 'sync-enquiry-' || e.id
      FROM enquiries e
      WHERE e.drive_sync_status != 'SYNCED'
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id
    )
    SELECT COUNT(*) as count FROM inserted;
  `);

  return parseInt(insertRes.rows[0]?.count || '0', 10);
}

export interface SyncProcessResult {
  processed: number;
  synced: number;
  failed: number;
  errors: string[];
}/**
 * Processes pending Drive sync jobs with atomic row-level claiming (FOR UPDATE SKIP LOCKED),
 * per-job claim tokens, lease recovery, and duplicate row prevention.
 */
export async function processDriveSyncQueue(
  customClient?: GoogleSheetsClient,
  batchSize = 20
): Promise<SyncProcessResult> {
  const client = customClient || getActiveGoogleSheetsClient();
  const sheetId = process.env.GOOGLE_SHEET_ID || (customClient ? 'test-mock-sheet-id' : undefined);

  if (!client || !sheetId) {
    return {
      processed: 0,
      synced: 0,
      failed: 0,
      errors: ['Google Sheets integration is not configured with credentials or sheet ID.'],
    };
  }

  // 1. Atomically claim pending or lease-expired jobs using FOR UPDATE SKIP LOCKED inside short transaction
  const claimedJobs = await withTransaction(async (dbClient) => {
    const candidateRes = await dbClient.query<{ id: string }>(
      `SELECT id
       FROM drive_sync_jobs
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

    const claimedList: {
      jobId: string;
      claimToken: string;
      enquiryId: string;
      attemptCount: number;
      maxAttempts: number;
      createdAt: Date;
      enquiryType: string;
      name: string;
      email: string;
      phone: string;
      source: string;
      productName: string | null;
      quantity: number | null;
      sizeBreakdown: string | null;
      targetDate: string | null;
      organization: string | null;
      message: string;
    }[] = [];

    for (const cand of candidateRes.rows) {
      const claimToken = crypto.randomUUID();
      await dbClient.query(
        `UPDATE drive_sync_jobs
         SET status = 'PROCESSING',
             claimed_at = CURRENT_TIMESTAMP,
             claim_token = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2;`,
        [claimToken, cand.id]
      );

      const jobDetails = await dbClient.query<any>(
        `SELECT j.id as job_id, j.attempt_count, j.max_attempts,
                e.id as enquiry_id, e.created_at, e.enquiry_type, e.name, e.email, e.phone,
                e.source, e.product_name, e.quantity, e.size_breakdown, e.target_date, e.organization, e.message
         FROM drive_sync_jobs j
         JOIN enquiries e ON e.id = j.enquiry_id
         WHERE j.id = $1;`,
        [cand.id]
      );

      if (jobDetails.rows.length > 0) {
        const row = jobDetails.rows[0];
        claimedList.push({
          jobId: row.job_id,
          claimToken,
          enquiryId: row.enquiry_id,
          attemptCount: row.attempt_count,
          maxAttempts: row.max_attempts,
          createdAt: row.created_at,
          enquiryType: row.enquiry_type,
          name: row.name,
          email: row.email,
          phone: row.phone,
          source: row.source,
          productName: row.product_name,
          quantity: row.quantity,
          sizeBreakdown: row.size_breakdown,
          targetDate: row.target_date,
          organization: row.organization,
          message: row.message,
        });
      }
    }

    return claimedList;
  });

  if (claimedJobs.length === 0) {
    return { processed: 0, synced: 0, failed: 0, errors: [] };
  }

  // 2. Fetch existing enquiry IDs from remote Google Sheet outside database transaction
  let existingRemoteIds: Set<string>;
  try {
    existingRemoteIds = await client.getExistingEnquiryIds(sheetId);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const safeError = errorMsg.slice(0, 300);

    for (const job of claimedJobs) {
      const nextAttemptCount = job.attemptCount + 1;
      const isTerminalFailure = nextAttemptCount >= job.maxAttempts;
      const backoffSeconds = Math.min(Math.pow(2, nextAttemptCount) * 30, 3600);

      await withTransaction(async (dbClient) => {
        const updateRes = await dbClient.query(
          `UPDATE drive_sync_jobs
           SET status = $1,
               attempt_count = $2,
               next_attempt_at = CURRENT_TIMESTAMP + ($3 || ' seconds')::interval,
               last_error = $4,
               claim_token = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $5 AND claim_token = $6;`,
          [
            isTerminalFailure ? 'FAILED' : 'PENDING',
            nextAttemptCount,
            backoffSeconds,
            safeError,
            job.jobId,
            job.claimToken,
          ]
        );

        if (updateRes.rowCount && updateRes.rowCount > 0) {
          if (isTerminalFailure) {
            await dbClient.query(
              `UPDATE enquiries
               SET drive_sync_status = 'FAILED', drive_sync_error = $1
               WHERE id = $2;`,
              [safeError, job.enquiryId]
            );
          } else {
            await dbClient.query(
              `UPDATE enquiries
               SET drive_sync_error = $1
               WHERE id = $2;`,
              [safeError, job.enquiryId]
            );
          }
        }
      });
    }

    return {
      processed: claimedJobs.length,
      synced: 0,
      failed: claimedJobs.length,
      errors: [`Failed to query remote Google Sheet state: ${errorMsg}`],
    };
  }

  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  // 3. Process claimed jobs with remote verification and shared advisory guard
  for (const job of claimedJobs) {
    try {
      const lockKey = getEnquirySyncAdvisoryLockKey(job.enquiryId);

      const syncSuccess = await withTransaction(async (dbClient) => {
        // A. Acquire the shared transaction-level advisory guard non-blockingly
        const lockRes = await dbClient.query<{ acquired: boolean }>(
          `SELECT pg_try_advisory_xact_lock($1::bigint) as acquired;`,
          [lockKey]
        );

        if (!lockRes.rows[0]?.acquired) {
          // Another worker or deletion operation currently holds the guard for this enquiry
          errors.push(`Job ${job.jobId}: could not acquire synchronization guard; skipping.`);
          return false;
        }

        // B. Final database claim validation inside the locked transaction:
        // Guarantees that if deletion committed while job was in flight or after lease expired,
        // the worker will not append an orphaned or stale row to Google Sheets.
        const claimCheck = await dbClient.query<{ id: string }>(
          `SELECT j.id FROM drive_sync_jobs j
           JOIN enquiries e ON e.id = j.enquiry_id
           WHERE j.id = $1 AND j.claim_token = $2 AND j.status = 'PROCESSING';`,
          [job.jobId, job.claimToken]
        );

        if (claimCheck.rows.length === 0) {
          errors.push(`Job ${job.jobId}: active claim was lost before remote append; skipping append.`);
          return false;
        }

        // C. Remote duplicate prevention and append WHILE holding the advisory guard
        if (!existingRemoteIds.has(job.enquiryId)) {
          const rowData = [
            job.enquiryId,
            new Date(job.createdAt).toISOString(),
            job.enquiryType,
            job.name,
            job.email,
            job.phone,
            job.source,
            job.productName || 'N/A',
            job.quantity || '',
            job.sizeBreakdown || '',
            job.targetDate || '',
            job.organization || '',
            job.message,
          ];

          await client.appendRow(sheetId, rowData);
          existingRemoteIds.add(job.enquiryId);
        }

        // D. Mark locally as SYNCED inside the same locked transaction
        const updateRes = await dbClient.query(
          `UPDATE drive_sync_jobs
           SET status = 'SYNCED', updated_at = CURRENT_TIMESTAMP, last_error = NULL, claim_token = NULL
           WHERE id = $1 AND claim_token = $2;`,
          [job.jobId, job.claimToken]
        );

        if (updateRes.rowCount && updateRes.rowCount > 0) {
          await dbClient.query(
            `UPDATE enquiries
             SET drive_sync_status = 'SYNCED', drive_synced_at = CURRENT_TIMESTAMP, drive_sync_error = NULL
             WHERE id = $1;`,
            [job.enquiryId]
          );
          return true;
        }

        return false;
      });

      if (syncSuccess) {
        synced++;
      }
    } catch (err: unknown) {
      failed++;
      const rawError = err instanceof Error ? err.message : String(err);
      const safeError = rawError.slice(0, 300);
      errors.push(`Enquiry ${job.enquiryId}: ${safeError}`);

      const nextAttemptCount = job.attemptCount + 1;
      const isTerminalFailure = nextAttemptCount >= job.maxAttempts;
      const backoffSeconds = Math.min(Math.pow(2, nextAttemptCount) * 30, 3600);

      await withTransaction(async (dbClient) => {
        const updateRes = await dbClient.query(
          `UPDATE drive_sync_jobs
           SET status = $1,
               attempt_count = $2,
               next_attempt_at = CURRENT_TIMESTAMP + ($3 || ' seconds')::interval,
               last_error = $4,
               claim_token = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $5 AND claim_token = $6;`,
          [
            isTerminalFailure ? 'FAILED' : 'PENDING',
            nextAttemptCount,
            backoffSeconds,
            safeError,
            job.jobId,
            job.claimToken,
          ]
        );

        if (updateRes.rowCount && updateRes.rowCount > 0) {
          if (isTerminalFailure) {
            await dbClient.query(
              `UPDATE enquiries
               SET drive_sync_status = 'FAILED', drive_sync_error = $1
               WHERE id = $2;`,
              [safeError, job.enquiryId]
            );
          } else {
            await dbClient.query(
              `UPDATE enquiries
               SET drive_sync_error = $1
               WHERE id = $2;`,
              [safeError, job.enquiryId]
            );
          }
        }
      });
    }
  }

  return {
    processed: claimedJobs.length,
    synced,
    failed,
    errors,
  };
}

/**
 * Retrieves aggregate Drive sync status for admin dashboard review.
 */
export async function getDriveSyncStatus(): Promise<{
  totalEnquiries: number;
  syncedCount: number;
  pendingCount: number;
  failedCount: number;
  isConfigured: boolean;
}> {
  const countsRes = await query<{
    total: string;
    synced: string;
    pending: string;
    failed: string;
  }>(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE drive_sync_status = 'SYNCED') as synced,
      COUNT(*) FILTER (WHERE drive_sync_status = 'PENDING') as pending,
      COUNT(*) FILTER (WHERE drive_sync_status = 'FAILED') as failed
    FROM enquiries;
  `);

  const row = countsRes.rows[0];
  const isConfigured = Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_PRIVATE_KEY &&
      process.env.GOOGLE_SHEET_ID
  );

  return {
    totalEnquiries: parseInt(row?.total || '0', 10),
    syncedCount: parseInt(row?.synced || '0', 10),
    pendingCount: parseInt(row?.pending || '0', 10),
    failedCount: parseInt(row?.failed || '0', 10),
    isConfigured,
  };
}
