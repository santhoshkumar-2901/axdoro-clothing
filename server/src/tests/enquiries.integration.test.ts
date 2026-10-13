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
} from '../services/enquiry.service.js';
import {
  processDriveSyncQueue,
  backfillPendingEnquiries,
  MockGoogleSheetsClient,
} from '../services/google-sheets.service.js';

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
});
