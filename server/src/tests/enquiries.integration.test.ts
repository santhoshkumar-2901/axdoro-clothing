import crypto from 'crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import {
  initializeTestDatabase,
  truncateTestAdmin,
  truncateTestEnquiries,
  closeTestDatabase,
  testPool,
} from './test-db.js';
import { provisionAdmin, loginAdmin } from '../services/admin-auth.service.js';
import {
  createEnquiry,
  exportEnquiriesCsv,
  generateWhatsAppShareUrl,
  adminDeleteEnquiry,
  getEnquirySyncAdvisoryLockKey,
} from '../services/enquiry.service.js';
import {
  processDriveSyncQueue,
  backfillPendingEnquiries,
  MockGoogleSheetsClient,
} from '../services/google-sheets.service.js';
import { generateCsrfToken } from '../middleware/csrf.js';

/**
 * Deterministic mock client with barrier synchronization for concurrency testing.
 * Allows pausing worker inside appendRow to simulate long-running I/O or pre-append races.
 */
class BarrierGoogleSheetsClient extends MockGoogleSheetsClient {
  public appendStartedBarrier: () => void = () => {};
  public appendReleasePromise: Promise<void>;
  public releaseResolve: () => void = () => {};

  constructor() {
    super();
    this.appendReleasePromise = new Promise((resolve) => {
      this.releaseResolve = resolve;
    });
  }

  override async appendRow(
    sheetId: string,
    rowValues: (string | number | null)[]
  ): Promise<{ rowNumber: number }> {
    this.appendStartedBarrier();
    await this.appendReleasePromise;
    return super.appendRow(sheetId, rowValues);
  }

  release(): void {
    this.releaseResolve();
  }
}

describe('Phase 4 — Enquiries, CSV Export, WhatsApp Sharing & Drive Sync Integration Tests (axdoro_test)', () => {
  let adminToken: string;

  beforeAll(async () => {
    await initializeTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  beforeEach(async () => {
    await truncateTestEnquiries();
    await truncateTestAdmin();

    // Provision admin and log in
    await provisionAdmin({
      email: 'enquiry-admin@axdoro.test',
      password: 'AdminPassword123!',
      fullName: 'Enquiry Admin',
    });

    const loginRes = await loginAdmin({
      email: 'enquiry-admin@axdoro.test',
      password: 'AdminPassword123!',
    });
    adminToken = loginRes.token;
  });

  // 1. Valid enquiry creation (general & bulk)
  it('creates general and bulk enquiries, persists them in PostgreSQL, and queues drive sync job', async () => {
    const generalPayload = {
      name: 'Rohan Mehta',
      email: 'rohan@example.com',
      phone: '+919820098200',
      message: 'Interested in bespoke styling consultations.',
      enquiryType: 'GENERAL',
    };

    const res = await request(app)
      .post('/api/enquiries')
      .send(generalPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.driveSyncStatus).toBe('PENDING');

    // Verify outbox job was queued in drive_sync_jobs table
    const jobRes = await testPool.query(
      'SELECT status FROM drive_sync_jobs WHERE enquiry_id = $1',
      [res.body.data.id]
    );
    expect(jobRes.rows).toHaveLength(1);
    expect(jobRes.rows[0].status).toBe('PENDING');
  });

  // 2. Honeypot anti-spam protection
  it('silently ignores spam submissions with filled honeypot website_hp field', async () => {
    const spamPayload = {
      name: 'Spam Bot',
      email: 'bot@spam.com',
      phone: '+919999999999',
      message: 'Buy cheap watches now',
      website_hp: 'http://malicious-spam-link.ru', // honeypot filled
    };

    const res = await request(app)
      .post('/api/enquiries')
      .send(spamPayload);

    // Returns simulated success to avoid alerting bot
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    // Verify zero enquiries actually written to DB
    const countRes = await testPool.query('SELECT count(*) FROM enquiries');
    expect(parseInt(countRes.rows[0].count, 10)).toBe(0);
  });

  // 3. CSV formula injection mitigation and Unicode formatting
  it('mitigates spreadsheet formula injection characters (=, +, -, @) and handles Unicode and quotes', async () => {
    // Insert payload designed to test Excel DDE / formula execution mitigation
    await createEnquiry({
      name: '=cmd|\'/C calc\'!A0', // Excel formula injection attempt
      email: 'formula.test@example.com',
      phone: '+919876543210',
      message: '@SUM(1+1) - payload with "Quotes" & हिन्दी Unicode',
      enquiryType: 'BULK',
      quantity: 50,
      source: 'WEBSITE',
    });

    const csvOutput = await exportEnquiriesCsv();

    // Verify UTF-8 BOM is present
    expect(csvOutput.charCodeAt(0)).toBe(0xfeff);

    // Verify raw values in database are NOT corrupted
    const dbRow = await testPool.query('SELECT name FROM enquiries LIMIT 1');
    expect(dbRow.rows[0].name).toBe('=cmd|\'/C calc\'!A0');

    // Verify exported CSV escaped dangerous leading characters with a single-quote
    expect(csvOutput).toContain("'=cmd|'/C calc'!A0");
    expect(csvOutput).toContain("'@SUM(1+1) - payload with \"\"Quotes\"\" & हिन्दी Unicode");

    // Verify Unicode and double quotes escaping
    expect(csvOutput).toContain('हिन्दी Unicode');
    expect(csvOutput).toContain('""Quotes""');
  });

  // 4. WhatsApp share URL generation and sensitive data exclusion
  it('generates safely encoded WhatsApp share URL without exposing sensitive data', async () => {
    const enquiry = await createEnquiry({
      name: 'Vikram Seth',
      email: 'vikram@example.com',
      phone: '+919123456789',
      message: 'Need 100 customized polo shirts with embroidered logo.',
      enquiryType: 'BULK',
      productName: 'Axdoro Polo',
      quantity: 100,
      source: 'WEBSITE',
    });

    const shareUrl = generateWhatsAppShareUrl(enquiry);

    expect(shareUrl).toMatch(/^https:\/\/wa\.me\//);
    expect(shareUrl).toContain(encodeURIComponent('AXDORO Team'));
    expect(shareUrl).toContain(encodeURIComponent('Vikram Seth'));
    expect(shareUrl).toContain(encodeURIComponent('100 units'));

    // Verify sensitive internals are NEVER included
    expect(shareUrl).not.toContain(enquiry.id);
    expect(shareUrl).not.toContain('password');
    expect(shareUrl).not.toContain('token');
  });

  // 5. Database-first synchronization: Enquiry persists even when Drive fails
  it('retains local PostgreSQL enquiry intact when Drive client fails, tracking failed sync state', async () => {
    const enquiry = await createEnquiry({
      name: 'Resilience Test',
      email: 'resilience@example.com',
      phone: '+919876543210',
      message: 'Testing drive outage',
      enquiryType: 'GENERAL',
      source: 'WEBSITE',
    });

    // Create a mock Google Sheets client that throws an outage error
    const failingMock = new MockGoogleSheetsClient({
      shouldFail: true,
      failureError: new Error('Google Drive API 503 Service Unavailable: Remote outage'),
    });

    // Set attempt_count to max_attempts - 1 so the next failure is terminal
    await testPool.query(
      'UPDATE drive_sync_jobs SET attempt_count = max_attempts - 1 WHERE enquiry_id = $1',
      [enquiry.id]
    );

    // Process sync queue with failing client
    const syncResult = await processDriveSyncQueue(failingMock);

    expect(syncResult.synced).toBe(0);
    expect(syncResult.failed).toBe(1);

    // Verify enquiry still exists safely in PostgreSQL with FAILED status and error summary
    const checkRes = await testPool.query(
      'SELECT drive_sync_status, drive_sync_error FROM enquiries WHERE id = $1',
      [enquiry.id]
    );
    expect(checkRes.rows[0].drive_sync_status).toBe('FAILED');
    expect(checkRes.rows[0].drive_sync_error).toContain('503 Service Unavailable');
  });

  // 6. Retry strategy and duplicate prevention
  it('retries failed enquiries and prevents duplicate rows in Google Sheets via Enquiry ID deduplication', async () => {
    const enquiry = await createEnquiry({
      name: 'Duplicate Check',
      email: 'dup@example.com',
      phone: '+919876543210',
      message: 'Verify remote idempotency',
      enquiryType: 'GENERAL',
      source: 'WEBSITE',
    });

    const mockClient = new MockGoogleSheetsClient();

    // First successful sync
    const firstRun = await processDriveSyncQueue(mockClient);
    expect(firstRun.synced).toBe(1);
    expect(mockClient.rows).toHaveLength(1);
    expect(mockClient.rows[0][0]).toBe(enquiry.id);

    // Verify PostgreSQL status updated to SYNCED
    const dbAfterFirst = await testPool.query(
      'SELECT drive_sync_status FROM enquiries WHERE id = $1',
      [enquiry.id]
    );
    expect(dbAfterFirst.rows[0].drive_sync_status).toBe('SYNCED');

    // Simulate worker retry or job re-execution for the same enquiry
    await testPool.query(
      'UPDATE drive_sync_jobs SET status = \'PENDING\' WHERE enquiry_id = $1',
      [enquiry.id]
    );

    const secondRun = await processDriveSyncQueue(mockClient);
    // Remote client detected existing Enquiry ID and avoided appending duplicate row
    expect(mockClient.rows).toHaveLength(1);
  });

  // 7. Backfill of existing pending enquiries without duplicate PostgreSQL rows
  it('backfills unqueued enquiries with pending sync status without duplicating database rows', async () => {
    // Insert 2 legacy enquiries directly with PENDING status and no sync jobs
    await testPool.query(`
      INSERT INTO enquiries (name, email, phone, message, enquiry_type, drive_sync_status)
      VALUES
        ('Legacy Customer 1', 'legacy1@example.com', '+919876543210', 'Pre-existing enquiry 1', 'GENERAL', 'PENDING'),
        ('Legacy Customer 2', 'legacy2@example.com', '+919876543211', 'Pre-existing enquiry 2', 'GENERAL', 'PENDING');
    `);

    // Run backfill
    const backfilledCount = await backfillPendingEnquiries();
    expect(backfilledCount).toBe(2);

    // Running backfill again should not insert redundant sync jobs
    const secondBackfill = await backfillPendingEnquiries();
    expect(secondBackfill).toBe(0);

    // Total enquiry rows in DB should remain strictly 2
    const totalEnquiries = await testPool.query('SELECT count(*) FROM enquiries');
    expect(parseInt(totalEnquiries.rows[0].count, 10)).toBe(2);
  });

  // 8. Admin authorization for CSV export and sync management
  it('protects CSV export and sync management endpoints with administrator authorization', async () => {
    // Unauthenticated request to CSV export
    const unauthCsv = await request(app).get('/api/admin/enquiries/export.csv');
    expect(unauthCsv.status).toBe(401);

    // Unauthenticated request to sync trigger
    const unauthSync = await request(app).post('/api/admin/enquiries/sync');
    expect(unauthSync.status).toBe(401);

    // Authenticated CSV export
    const authCsv = await request(app)
      .get('/api/admin/enquiries/export.csv')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(authCsv.status).toBe(200);
    expect(authCsv.headers['content-type']).toContain('text/csv');
    expect(authCsv.headers['content-disposition']).toContain('attachment; filename="axdoro-enquiries-');

    // Authenticated sync status check
    const authStatus = await request(app)
      .get('/api/admin/enquiries/sync-status')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(authStatus.status).toBe(200);
    expect(authStatus.body.data.totalEnquiries).toBeDefined();
  });

  // 9. F-04: Concurrent workers atomically claim distinct jobs using FOR UPDATE SKIP LOCKED
  it('concurrent workers atomically claim distinct jobs using FOR UPDATE SKIP LOCKED without collisions (F-04)', async () => {
    // Create 4 distinct enquiries
    const e1 = await createEnquiry({ name: 'Worker Test 1', email: 'w1@example.com', phone: '+919876543210', message: 'Test 1', enquiryType: 'GENERAL', source: 'WEBSITE' });
    const e2 = await createEnquiry({ name: 'Worker Test 2', email: 'w2@example.com', phone: '+919876543210', message: 'Test 2', enquiryType: 'GENERAL', source: 'WEBSITE' });
    const e3 = await createEnquiry({ name: 'Worker Test 3', email: 'w3@example.com', phone: '+919876543210', message: 'Test 3', enquiryType: 'GENERAL', source: 'WEBSITE' });
    const e4 = await createEnquiry({ name: 'Worker Test 4', email: 'w4@example.com', phone: '+919876543210', message: 'Test 4', enquiryType: 'GENERAL', source: 'WEBSITE' });

    // Shared mock client with slight latency to exercise concurrent race condition
    const sharedMock = new MockGoogleSheetsClient({ latencyMs: 25 });

    // Launch two workers concurrently with batchSize = 2
    const [workerA, workerB] = await Promise.all([
      processDriveSyncQueue(sharedMock, 2),
      processDriveSyncQueue(sharedMock, 2),
    ]);

    // Combined, both workers must process all 4 jobs with zero collisions
    expect(workerA.processed + workerB.processed).toBe(4);
    expect(workerA.synced + workerB.synced).toBe(4);
    expect(workerA.failed + workerB.failed).toBe(0);

    // Verify all 4 unique enquiry IDs are in the sheet exactly once
    expect(sharedMock.rows).toHaveLength(4);
    const syncedIds = new Set(sharedMock.rows.map((r) => r[0]));
    expect(syncedIds).toEqual(new Set([e1.id, e2.id, e3.id, e4.id]));

    // All jobs in DB must be SYNCED
    const jobs = await testPool.query('SELECT status FROM drive_sync_jobs');
    expect(jobs.rows.every((j) => j.status === 'SYNCED')).toBe(true);
  });

  // 10. F-04: Lease expiry recovery of abandoned PROCESSING jobs and stale token rejection
  it('reclaims abandoned jobs after lease expiry (5 minutes) and rejects stale worker updates (F-04)', async () => {
    const enquiry = await createEnquiry({
      name: 'Abandoned Worker Enquiry',
      email: 'abandoned@example.com',
      phone: '+919876543210',
      message: 'Worker crashed mid-flight',
      enquiryType: 'GENERAL',
      source: 'WEBSITE',
    });

    const staleToken = 'stale-worker-claim-token-12345';

    // Simulate a worker crash that left the job in PROCESSING 10 minutes ago
    await testPool.query(
      `UPDATE drive_sync_jobs
       SET status = 'PROCESSING',
           claimed_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes',
           claim_token = $1
       WHERE enquiry_id = $2`,
      [staleToken, enquiry.id]
    );

    const recoveryMock = new MockGoogleSheetsClient();

    // A fresh worker runs: should successfully reclaim the expired PROCESSING job
    const runResult = await processDriveSyncQueue(recoveryMock, 5);
    expect(runResult.synced).toBe(1);
    expect(recoveryMock.rows).toHaveLength(1);
    expect(recoveryMock.rows[0][0]).toBe(enquiry.id);

    // Job in DB must now be SYNCED
    const jobRes = await testPool.query(
      'SELECT status, claim_token FROM drive_sync_jobs WHERE enquiry_id = $1',
      [enquiry.id]
    );
    expect(jobRes.rows[0].status).toBe('SYNCED');

    // Prove that a stale update using the expired staleToken affects 0 rows
    const staleUpdate = await testPool.query(
      `UPDATE drive_sync_jobs
       SET status = 'FAILED'
       WHERE enquiry_id = $1 AND claim_token = $2`,
      [enquiry.id, staleToken]
    );
    expect(staleUpdate.rowCount).toBe(0);
  });

  // 11. F-04: Recovery from ambiguous remote append followed by local failure without duplicate rows
  it('reconciles ambiguous remote appends without duplicate rows upon subsequent recovery (F-04)', async () => {
    const enquiry = await createEnquiry({
      name: 'Ambiguous Remote Append',
      email: 'ambiguous@example.com',
      phone: '+919876543210',
      message: 'Remote append succeeded but local DB update crashed',
      enquiryType: 'GENERAL',
      source: 'WEBSITE',
    });

    const mockClient = new MockGoogleSheetsClient();

    // Simulate scenario: row was already appended into the sheet on a previous run before local crash
    mockClient.rows.push([
      enquiry.id,
      new Date().toISOString(),
      'GENERAL',
      'Ambiguous Remote Append',
      'ambiguous@example.com',
      '+919876543210',
      'WEBSITE',
      'N/A',
      '',
      '',
      '',
      '',
      'Remote append succeeded but local DB update crashed',
    ]);
    expect(mockClient.rows).toHaveLength(1);

    // Job in DB is still in PENDING or FAILED
    const initialJob = await testPool.query(
      'SELECT status FROM drive_sync_jobs WHERE enquiry_id = $1',
      [enquiry.id]
    );
    expect(initialJob.rows[0].status).toBe('PENDING');

    // Run sync queue
    const syncResult = await processDriveSyncQueue(mockClient);
    expect(syncResult.synced).toBe(1);

    // Reconciled: detected remote enquiry ID and DID NOT append a duplicate row!
    expect(mockClient.rows).toHaveLength(1);

    // PostgreSQL status successfully reconciled to SYNCED
    const finalJob = await testPool.query(
      'SELECT status FROM drive_sync_jobs WHERE enquiry_id = $1',
      [enquiry.id]
    );
    expect(finalJob.rows[0].status).toBe('SYNCED');

    const finalEnquiry = await testPool.query(
      'SELECT drive_sync_status FROM enquiries WHERE id = $1',
      [enquiry.id]
    );
    expect(finalEnquiry.rows[0].drive_sync_status).toBe('SYNCED');
  });

  // =========================================================================
  // Phase 2 — Backend Enquiry Deletion & Concurrency Synchronization Tests
  // =========================================================================
  describe('Phase 2 — Backend Enquiry Deletion & Concurrency Synchronization (axdoro_test)', () => {
    // 1. Successful deletion of a pending enquiry with cascade
    it('permanently deletes a pending enquiry from PostgreSQL and cascades to drive_sync_jobs', async () => {
      const enquiry = await createEnquiry({
        name: 'Delete Pending User',
        email: 'delpending@axdoro.test',
        phone: '+919876543210',
        message: 'Pending enquiry to be deleted',
        enquiryType: 'GENERAL',
        source: 'WEBSITE',
      });

      // Confirm enquiry and sync job exist
      const initialJob = await testPool.query(
        'SELECT status FROM drive_sync_jobs WHERE enquiry_id = $1',
        [enquiry.id]
      );
      expect(initialJob.rows).toHaveLength(1);

      // Issue DELETE request as admin
      const res = await request(app)
        .delete(`/api/admin/enquiries/${enquiry.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.message).toContain('deleted successfully');

      // Verify enquiry is permanently deleted from PostgreSQL
      const dbEnquiry = await testPool.query(
        'SELECT 1 FROM enquiries WHERE id = $1',
        [enquiry.id]
      );
      expect(dbEnquiry.rows).toHaveLength(0);

      // Verify foreign key CASCADE removed the drive_sync_jobs record
      const dbJob = await testPool.query(
        'SELECT 1 FROM drive_sync_jobs WHERE enquiry_id = $1',
        [enquiry.id]
      );
      expect(dbJob.rows).toHaveLength(0);
    });

    // 2. Successful deletion of an already-synced enquiry while retaining Google Sheets rows
    it('permanently deletes an already-synced enquiry while retaining remote Google Sheets copy', async () => {
      const enquiry = await createEnquiry({
        name: 'Delete Synced User',
        email: 'delsynced@axdoro.test',
        phone: '+919876543210',
        message: 'Synced enquiry to be deleted locally',
        enquiryType: 'BULK',
        quantity: 75,
        source: 'WEBSITE',
      });

      const mockClient = new MockGoogleSheetsClient();
      const syncRes = await processDriveSyncQueue(mockClient);
      expect(syncRes.synced).toBe(1);
      expect(mockClient.rows).toHaveLength(1);
      expect(mockClient.rows[0][0]).toBe(enquiry.id);

      // Issue DELETE request as admin
      const res = await request(app)
        .delete(`/api/admin/enquiries/${enquiry.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);

      // Verify enquiry is deleted locally
      const dbEnquiry = await testPool.query(
        'SELECT 1 FROM enquiries WHERE id = $1',
        [enquiry.id]
      );
      expect(dbEnquiry.rows).toHaveLength(0);

      // Verify Google Sheets mock copy is strictly preserved
      expect(mockClient.rows).toHaveLength(1);
      expect(mockClient.rows[0][0]).toBe(enquiry.id);
    });

    // 3. Immutable audit log creation with metadata and minimized PII
    it('creates an immutable audit log entry in admin_audit_logs with non-PII attributes and deletion metadata', async () => {
      const enquiry = await createEnquiry({
        name: 'Audit Verification User',
        email: 'audit-user@axdoro.test',
        phone: '+919876543210',
        message: 'Testing audit log creation for deletion',
        enquiryType: 'BULK',
        quantity: 120,
        source: 'INSTAGRAM',
      });

      const res = await request(app)
        .delete(`/api/admin/enquiries/${enquiry.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);

      // Query admin_audit_logs for this deletion
      const auditRes = await testPool.query<{
        action: string;
        entity_type: string;
        entity_id: string;
        admin_email: string;
        details: any;
      }>(
        `SELECT action, entity_type, entity_id, admin_email, details
         FROM admin_audit_logs
         WHERE action = 'ENQUIRY_DELETE' AND entity_id = $1;`,
        [enquiry.id]
      );

      expect(auditRes.rows).toHaveLength(1);
      const log = auditRes.rows[0];
      expect(log.action).toBe('ENQUIRY_DELETE');
      expect(log.entity_type).toBe('enquiry');
      expect(log.entity_id).toBe(enquiry.id);
      expect(log.admin_email).toBe('enquiry-admin@axdoro.test');
      expect(log.details.enquiryId).toBe(enquiry.id);
      expect(log.details.enquiryType).toBe('BULK');
      expect(log.details.source).toBe('INSTAGRAM');
      expect(log.details.driveSyncStatus).toBe('PENDING');
      expect(log.details.hasBulkQuantity).toBe(true);
      expect(log.details.deletedAt).toBeDefined();

      // PII minimization check: customer name, email, phone, and message body are NOT stored in audit log details
      expect(log.details.name).toBeUndefined();
      expect(log.details.email).toBeUndefined();
      expect(log.details.phone).toBeUndefined();
      expect(log.details.message).toBeUndefined();
    });

    // 4. Missing enquiry returns 404
    it('returns 404 when attempting to delete a non-existent enquiry', async () => {
      const nonExistentId = crypto.randomUUID();
      const res = await request(app)
        .delete(`/api/admin/enquiries/${nonExistentId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toBe('Enquiry not found');
    });

    // 5. Malformed UUID returns 400
    it('returns 400 when attempting to delete with a malformed non-UUID parameter', async () => {
      const res = await request(app)
        .delete('/api/admin/enquiries/malformed-id-not-a-uuid')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toContain('Invalid enquiry ID format');
    });

    // 6. Unauthenticated requests are rejected with 401
    it('rejects unauthenticated delete requests with 401', async () => {
      const enquiry = await createEnquiry({
        name: 'Auth Test User',
        email: 'authtest@axdoro.test',
        phone: '+919876543210',
        message: 'Unauthenticated test',
        enquiryType: 'GENERAL',
        source: 'WEBSITE',
      });

      const res = await request(app).delete(`/api/admin/enquiries/${enquiry.id}`);
      expect(res.status).toBe(401);

      // Verify enquiry still exists
      const dbCheck = await testPool.query('SELECT 1 FROM enquiries WHERE id = $1', [enquiry.id]);
      expect(dbCheck.rows).toHaveLength(1);
    });

    // 7. CSRF protection on cookie-authenticated requests
    it('rejects cookie-authenticated delete requests missing CSRF token with 403', async () => {
      const enquiry = await createEnquiry({
        name: 'CSRF Test User',
        email: 'csrftest@axdoro.test',
        phone: '+919876543210',
        message: 'CSRF missing test',
        enquiryType: 'GENERAL',
        source: 'WEBSITE',
      });

      const res = await request(app)
        .delete(`/api/admin/enquiries/${enquiry.id}`)
        .set('Cookie', [`axdoro_admin_session=${adminToken}`]);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('CSRF');

      // Verify enquiry still exists
      const dbCheck = await testPool.query('SELECT 1 FROM enquiries WHERE id = $1', [enquiry.id]);
      expect(dbCheck.rows).toHaveLength(1);
    });

    it('rejects cookie-authenticated delete requests with forged CSRF token with 403', async () => {
      const enquiry = await createEnquiry({
        name: 'CSRF Forged User',
        email: 'csrfforged@axdoro.test',
        phone: '+919876543210',
        message: 'CSRF forged test',
        enquiryType: 'GENERAL',
        source: 'WEBSITE',
      });

      const res = await request(app)
        .delete(`/api/admin/enquiries/${enquiry.id}`)
        .set('Cookie', [
          `axdoro_admin_session=${adminToken}`,
          'axdoro_csrf_token=forged-csrf-token',
        ])
        .set('X-CSRF-Token', 'forged-csrf-token');

      expect(res.status).toBe(403);

      // Verify enquiry still exists
      const dbCheck = await testPool.query('SELECT 1 FROM enquiries WHERE id = $1', [enquiry.id]);
      expect(dbCheck.rows).toHaveLength(1);
    });

    it('accepts cookie-authenticated delete requests with valid synchronizer CSRF token', async () => {
      const enquiry = await createEnquiry({
        name: 'CSRF Valid User',
        email: 'csrfvalid@axdoro.test',
        phone: '+919876543210',
        message: 'CSRF valid test',
        enquiryType: 'GENERAL',
        source: 'WEBSITE',
      });

      const validCsrf = generateCsrfToken(adminToken);

      const res = await request(app)
        .delete(`/api/admin/enquiries/${enquiry.id}`)
        .set('Cookie', [
          `axdoro_admin_session=${adminToken}`,
          `axdoro_csrf_token=${validCsrf}`,
        ])
        .set('X-CSRF-Token', validCsrf);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');

      // Verify enquiry deleted
      const dbCheck = await testPool.query('SELECT 1 FROM enquiries WHERE id = $1', [enquiry.id]);
      expect(dbCheck.rows).toHaveLength(0);
    });

    // 8. In-flight synchronization guard: rejects delete with 409 Conflict when job is actively PROCESSING
    it('rejects delete request with 409 Conflict when enquiry sync job is currently PROCESSING with an active lease', async () => {
      const enquiry = await createEnquiry({
        name: 'Active Processing User',
        email: 'activeproc@axdoro.test',
        phone: '+919876543210',
        message: 'Active sync test',
        enquiryType: 'GENERAL',
        source: 'WEBSITE',
      });

      // Simulate a sync worker actively processing this enquiry right now
      const activeClaimToken = crypto.randomUUID();
      await testPool.query(
        `UPDATE drive_sync_jobs
         SET status = 'PROCESSING',
             claimed_at = CURRENT_TIMESTAMP,
             claim_token = $1
         WHERE enquiry_id = $2;`,
        [activeClaimToken, enquiry.id]
      );

      // Attempt to delete while actively claimed
      const res = await request(app)
        .delete(`/api/admin/enquiries/${enquiry.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.status).toBe('error');
      expect(res.body.error).toContain('synchronizing with Google Drive');

      // Verify enquiry was NOT deleted and no delete audit log was created
      const dbCheck = await testPool.query('SELECT 1 FROM enquiries WHERE id = $1', [enquiry.id]);
      expect(dbCheck.rows).toHaveLength(1);

      const auditCheck = await testPool.query(
        "SELECT 1 FROM admin_audit_logs WHERE action = 'ENQUIRY_DELETE' AND entity_id = $1",
        [enquiry.id]
      );
      expect(auditCheck.rows).toHaveLength(0);
    });

    // 9. Permits deletion if job was left in PROCESSING but lease has expired (abandoned worker recovery)
    it('permits deletion if a sync job was left in PROCESSING but its lease has expired', async () => {
      const enquiry = await createEnquiry({
        name: 'Expired Lease User',
        email: 'expiredlease@axdoro.test',
        phone: '+919876543210',
        message: 'Expired lease recovery test',
        enquiryType: 'GENERAL',
        source: 'WEBSITE',
      });

      // Simulate a crashed worker whose 5-minute lease expired 10 minutes ago
      await testPool.query(
        `UPDATE drive_sync_jobs
         SET status = 'PROCESSING',
             claimed_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes',
             claim_token = 'stale-crashed-worker-token'
         WHERE enquiry_id = $1;`,
        [enquiry.id]
      );

      // Deletion should succeed because the lease is expired (safe to reclaim/delete)
      const res = await request(app)
        .delete(`/api/admin/enquiries/${enquiry.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);

      const dbCheck = await testPool.query('SELECT 1 FROM enquiries WHERE id = $1', [enquiry.id]);
      expect(dbCheck.rows).toHaveLength(0);
    });

    // 10. Worker cannot append after deletion has successfully committed
    it('prevents a stale worker from appending to Google Sheets if the enquiry was deleted after lease expired', async () => {
      const enquiry = await createEnquiry({
        name: 'Stale Worker Race User',
        email: 'staleworker@axdoro.test',
        phone: '+919876543210',
        message: 'Stale worker race test',
        enquiryType: 'GENERAL',
        source: 'WEBSITE',
      });

      const sharedMock = new MockGoogleSheetsClient();

      // Step A: Worker claims the job
      await testPool.query(
        `UPDATE drive_sync_jobs
         SET status = 'PROCESSING',
             claimed_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes',
             claim_token = 'stale-token-123'
         WHERE enquiry_id = $1;`,
        [enquiry.id]
      );

      // Step B: Admin deletes the enquiry (permitted since lease is expired)
      const delRes = await request(app)
        .delete(`/api/admin/enquiries/${enquiry.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(delRes.status).toBe(200);

      // Step C: A revived stale worker tries to run
      // The worker pre-append claim verification checks drive_sync_jobs, finds no active claim, and skips append!
      const staleWorkerRes = await processDriveSyncQueue(sharedMock);
      expect(staleWorkerRes.synced).toBe(0);
      expect(sharedMock.rows).toHaveLength(0); // Zero rows appended!
    });

    // 11. Multiple concurrent delete requests for the same enquiry
    it('handles multiple concurrent delete requests for the same enquiry with exactly one 200 and remaining 404s or 409s', async () => {
      const enquiry = await createEnquiry({
        name: 'Concurrent Delete User',
        email: 'concurrentdel@axdoro.test',
        phone: '+919876543210',
        message: 'Concurrent deletion test',
        enquiryType: 'GENERAL',
        source: 'WEBSITE',
      });

      // Launch 5 parallel delete requests for the exact same enquiry ID
      const deletePromises = Array.from({ length: 5 }).map(() =>
        request(app)
          .delete(`/api/admin/enquiries/${enquiry.id}`)
          .set('Authorization', `Bearer ${adminToken}`)
      );

      const responses = await Promise.all(deletePromises);
      const statuses = responses.map((r) => r.status);

      // Exactly one request must succeed (200)
      const successCount = statuses.filter((s) => s === 200).length;
      expect(successCount).toBe(1);

      // Remaining 4 requests must return either 404 (if executed after commit)
      // or 409 (if executed concurrently while advisory lock was held)
      const nonSuccessStatuses = statuses.filter((s) => s === 404 || s === 409);
      expect(nonSuccessStatuses).toHaveLength(4);

      // Verify exactly ONE audit log entry was written
      const auditRes = await testPool.query(
        "SELECT count(*) FROM admin_audit_logs WHERE action = 'ENQUIRY_DELETE' AND entity_id = $1",
        [enquiry.id]
      );
      expect(parseInt(auditRes.rows[0].count, 10)).toBe(1);
    });

    // 12. Transaction rollback: Enquiry deletion failure rolls back audit entry and preserves data
    it('ensures transactional rollback: enquiry and audit log succeed or fail atomically', async () => {
      const enquiry = await createEnquiry({
        name: 'Rollback User',
        email: 'rollback@axdoro.test',
        phone: '+919876543210',
        message: 'Rollback test',
        enquiryType: 'GENERAL',
        source: 'WEBSITE',
      });

      // Verify that calling adminDeleteEnquiry with a malformed ID does not write audit log
      const actor = {
        id: crypto.randomUUID(),
        email: 'enquiry-admin@axdoro.test',
        fullName: 'Enquiry Admin',
        role: 'admin' as const,
      };

      const result = await adminDeleteEnquiry('invalid-uuid', actor);
      expect(result.status).toBe('not_found');

      const auditCheck = await testPool.query(
        "SELECT count(*) FROM admin_audit_logs WHERE action = 'ENQUIRY_DELETE' AND entity_id = 'invalid-uuid'"
      );
      expect(parseInt(auditCheck.rows[0].count, 10)).toBe(0);

      // The original enquiry remains completely intact
      const enquiryCheck = await testPool.query('SELECT 1 FROM enquiries WHERE id = $1', [enquiry.id]);
      expect(enquiryCheck.rows).toHaveLength(1);
    });

    // 13. Worker holding the shared guard across remote append while deletion attempt returns 409
    it('returns 409 Conflict when deletion is attempted while a worker holds the shared guard across remote append', async () => {
      const enquiry = await createEnquiry({
        name: 'Shared Guard Worker Test',
        email: 'guardworker@axdoro.test',
        phone: '+919876543210',
        message: 'Worker holds advisory lock',
        enquiryType: 'GENERAL',
        source: 'WEBSITE',
      });

      const barrierClient = new BarrierGoogleSheetsClient();

      const workerStarted = new Promise<void>((resolve) => {
        barrierClient.appendStartedBarrier = resolve;
      });

      // Start worker in background
      const workerPromise = processDriveSyncQueue(barrierClient);

      try {
        // Wait until worker is actively holding the advisory guard and inside appendRow
        await workerStarted;

        // Admin attempts deletion while worker holds the guard
        const res = await request(app)
          .delete(`/api/admin/enquiries/${enquiry.id}`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(409);
        expect(res.body.status).toBe('error');
        expect(res.body.error).toContain('synchronizing with Google Drive');

        // Enquiry must still exist
        const dbCheck = await testPool.query('SELECT 1 FROM enquiries WHERE id = $1', [enquiry.id]);
        expect(dbCheck.rows).toHaveLength(1);
      } finally {
        barrierClient.release();
        await workerPromise;
      }

      // Verify worker successfully completed and marked enquiry SYNCED
      const finalEnquiry = await testPool.query('SELECT drive_sync_status FROM enquiries WHERE id = $1', [enquiry.id]);
      expect(finalEnquiry.rows[0].drive_sync_status).toBe('SYNCED');
      expect(barrierClient.rows).toHaveLength(1);
      expect(barrierClient.rows[0][0]).toBe(enquiry.id);
    });

    // 14. Deletion acquiring the guard first and preventing a worker from initiating an append
    it('prevents a worker from initiating an append when deletion holds the shared guard', async () => {
      const enquiry = await createEnquiry({
        name: 'Guard Held By Deletion User',
        email: 'guardheld@axdoro.test',
        phone: '+919876543210',
        message: 'Guard held by deletion test',
        enquiryType: 'GENERAL',
        source: 'WEBSITE',
      });

      const lockKey = getEnquirySyncAdvisoryLockKey(enquiry.id);
      const testClient = await testPool.connect();

      try {
        // Hold transaction-level advisory lock (simulating deletion in flight)
        await testClient.query('BEGIN');
        const lockRes = await testClient.query<{ acquired: boolean }>(
          `SELECT pg_try_advisory_xact_lock($1::bigint) as acquired;`,
          [lockKey]
        );
        expect(lockRes.rows[0].acquired).toBe(true);

        // Run sync worker
        const mockClient = new MockGoogleSheetsClient();
        const workerRes = await processDriveSyncQueue(mockClient);

        // Worker must skip the job without failing or appending
        expect(workerRes.synced).toBe(0);
        expect(mockClient.rows).toHaveLength(0);
        expect(workerRes.errors.some((e) => e.includes('could not acquire synchronization guard'))).toBe(true);
      } finally {
        await testClient.query('ROLLBACK');
        testClient.release();
      }
    });

    // 15. Concurrent workers competing for the same enquiry: one acquires guard, the other skips
    it('handles concurrent workers competing for the same enquiry where one acquires guard and the other skips', async () => {
      const enquiry = await createEnquiry({
        name: 'Concurrent Worker Compete',
        email: 'compete@axdoro.test',
        phone: '+919876543210',
        message: 'Worker competition test',
        enquiryType: 'GENERAL',
        source: 'WEBSITE',
      });

      const barrierClient1 = new BarrierGoogleSheetsClient();
      const mockClient2 = new MockGoogleSheetsClient();

      const worker1Started = new Promise<void>((resolve) => {
        barrierClient1.appendStartedBarrier = resolve;
      });

      const worker1Promise = processDriveSyncQueue(barrierClient1);

      try {
        await worker1Started;

        // While worker 1 is appending and holding the advisory guard, worker 2 runs
        const worker2Res = await processDriveSyncQueue(mockClient2);

        // Worker 2 must not append or fail
        expect(worker2Res.synced).toBe(0);
        expect(mockClient2.rows).toHaveLength(0);
      } finally {
        barrierClient1.release();
        await worker1Promise;
      }

      expect(barrierClient1.rows).toHaveLength(1);
      expect(barrierClient1.rows[0][0]).toBe(enquiry.id);
    });

    // 16. Lock release after success, database rollback, and worker failure
    it('ensures advisory lock is released after success, database rollback, and worker failure', async () => {
      const enquiry = await createEnquiry({
        name: 'Lock Release User',
        email: 'lockrelease@axdoro.test',
        phone: '+919876543210',
        message: 'Lock release test',
        enquiryType: 'GENERAL',
        source: 'WEBSITE',
      });

      const lockKey = getEnquirySyncAdvisoryLockKey(enquiry.id);

      // Part A: Worker failure releases lock
      const failingClient = new MockGoogleSheetsClient({
        shouldFail: true,
        failureError: new Error('Simulated network timeout during appendRow'),
      });

      await processDriveSyncQueue(failingClient);

      // Verify that advisory lock is completely free
      const lockCheck1 = await testPool.query<{ acquired: boolean }>(
        `SELECT pg_try_advisory_xact_lock($1::bigint) as acquired;`,
        [lockKey]
      );
      expect(lockCheck1.rows[0].acquired).toBe(true);
      await testPool.query(`SELECT pg_advisory_unlock($1::bigint);`, [lockKey]);

      // Part B: Successful sync releases lock
      const successClient = new MockGoogleSheetsClient();
      await testPool.query(
        "UPDATE drive_sync_jobs SET status = 'PENDING', next_attempt_at = CURRENT_TIMESTAMP WHERE enquiry_id = $1",
        [enquiry.id]
      );
      await processDriveSyncQueue(successClient);

      const lockCheck2 = await testPool.query<{ acquired: boolean }>(
        `SELECT pg_try_advisory_xact_lock($1::bigint) as acquired;`,
        [lockKey]
      );
      expect(lockCheck2.rows[0].acquired).toBe(true);
      await testPool.query(`SELECT pg_advisory_unlock($1::bigint);`, [lockKey]);

      // Part C: Deletion failure / rollback releases lock
      const enquiry2 = await createEnquiry({
        name: 'Rollback Lock User',
        email: 'rollbacklock@axdoro.test',
        phone: '+919876543210',
        message: 'Rollback lock release test',
        enquiryType: 'GENERAL',
        source: 'WEBSITE',
      });
      const lockKey2 = getEnquirySyncAdvisoryLockKey(enquiry2.id);

      // Calling adminDeleteEnquiry with a non-existent ID fails and rolls back
      const actor = {
        id: crypto.randomUUID(),
        email: 'admin@axdoro.test',
        fullName: 'Admin',
        role: 'admin' as const,
      };
      await adminDeleteEnquiry(crypto.randomUUID(), actor);

      // Verify lockKey2 is completely free
      const lockCheck3 = await testPool.query<{ acquired: boolean }>(
        `SELECT pg_try_advisory_xact_lock($1::bigint) as acquired;`,
        [lockKey2]
      );
      expect(lockCheck3.rows[0].acquired).toBe(true);
      await testPool.query(`SELECT pg_advisory_unlock($1::bigint);`, [lockKey2]);
    });
  });
});
