import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import {
  initializeTestDatabase,
  truncateTestEnquiries,
  truncateTestAdmin,
  closeTestDatabase,
  testPool,
} from './test-db.js';
import { provisionAdmin, loginAdmin } from '../services/admin-auth.service.js';
import { generateCsrfToken } from '../middleware/csrf.js';
import { validateArtworkBuffer, MAX_ARTWORK_BYTES } from '../utils/file-validator.js';
import * as cloudinaryService from '../services/cloudinary.service.js';
import fs from 'fs';
import path from 'path';
import { createEnquiry, exportEnquiriesCsv, adminDeleteEnquiry } from '../services/enquiry.service.js';
import { processDriveSyncQueue, MockGoogleSheetsClient } from '../services/google-sheets.service.js';
import {
  enqueueCleanupJob,
  processCloudinaryCleanupQueue,
  processSingleCleanupJob,
  reconcileCloudinaryPendingTags,
  getCleanupJobsStatus,
  retryCleanupJobs,
} from '../services/cloudinary-cleanup.service.js';
import { env } from '../config/env.js';
import * as db from '../config/db.js';

describe('Bulk Order Artwork Upload — Phase A Backend Integration Tests', () => {
  let adminToken: string;
  let adminCookie: string;
  let csrfToken: string;
  let currentAdmin: { id: string; email: string; fullName: string; role: 'admin' };

  // Sample valid mock buffers
  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  ]);

  const validJpgBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
    0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60,
  ]);

  const validPdfBuffer = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');

  const validWebpBuffer = Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([0x20, 0x00, 0x00, 0x00]),
    Buffer.from('WEBPVP8 '),
    Buffer.alloc(16),
  ]);

  beforeAll(async () => {
    await initializeTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  beforeEach(async () => {
    await truncateTestAdmin();
    await truncateTestEnquiries();
    vi.restoreAllMocks();

    // Provision admin and log in
    await provisionAdmin({
      email: 'artwork-admin@axdoro.test',
      password: 'AdminPassword123!',
      fullName: 'Artwork Admin',
    });

    const loginRes = await loginAdmin({
      email: 'artwork-admin@axdoro.test',
      password: 'AdminPassword123!',
    });
    adminToken = loginRes.token;
    csrfToken = generateCsrfToken(adminToken);
    adminCookie = `axdoro_admin_session=${adminToken}; axdoro_csrf_token=${csrfToken}`;
    currentAdmin = loginRes.admin;
  });

  describe('1. In-Memory Magic-Byte & Buffer Validation', () => {
    it('approves genuine PNG, JPEG, WebP, and PDF buffers with correct extensions', () => {
      const pngRes = validateArtworkBuffer(validPngBuffer, 'team-logo.png', 'image/png');
      expect(pngRes.isValid).toBe(true);
      expect(pngRes.detectedFormat).toBe('png');
      expect(pngRes.sanitizedFilename).toBe('team-logo.png');

      const jpgRes = validateArtworkBuffer(validJpgBuffer, 'mockup.jpg', 'image/jpeg');
      expect(jpgRes.isValid).toBe(true);
      expect(jpgRes.detectedFormat).toBe('jpg');

      const webpRes = validateArtworkBuffer(validWebpBuffer, 'banner.webp', 'image/webp');
      expect(webpRes.isValid).toBe(true);
      expect(webpRes.detectedFormat).toBe('webp');

      const pdfRes = validateArtworkBuffer(validPdfBuffer, 'specifications.pdf', 'application/pdf');
      expect(pdfRes.isValid).toBe(true);
      expect(pdfRes.detectedFormat).toBe('pdf');
    });

    it('rejects buffers exceeding 4 MB limit', () => {
      const oversizedBuffer = Buffer.alloc(MAX_ARTWORK_BYTES + 1024);
      validPngBuffer.copy(oversizedBuffer, 0, 0, 8); // copy PNG magic bytes

      const res = validateArtworkBuffer(oversizedBuffer, 'huge.png', 'image/png');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('exceeds the 4 MB limit');
    });

    it('rejects empty buffers', () => {
      const emptyBuffer = Buffer.alloc(0);
      const res = validateArtworkBuffer(emptyBuffer, 'empty.png', 'image/png');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('empty');
    });

    it('rejects extension mismatches and spoofed extensions', () => {
      // PDF content disguised with .png extension
      const spoofRes = validateArtworkBuffer(validPdfBuffer, 'exploit.png', 'image/png');
      expect(spoofRes.isValid).toBe(false);
      expect(spoofRes.error).toContain('does not match');

      // Random text content named .pdf
      const fakePdf = Buffer.from('This is a plain text file, not a real PDF document.');
      const textRes = validateArtworkBuffer(fakePdf, 'invoice.pdf', 'application/pdf');
      expect(textRes.isValid).toBe(false);
      expect(textRes.error).toContain('invalid magic bytes');
    });

    it('rejects disallowed file extensions', () => {
      const exeRes = validateArtworkBuffer(validPngBuffer, 'script.exe', 'application/x-msdownload');
      expect(exeRes.isValid).toBe(false);
      expect(exeRes.error).toContain('Unsupported file extension');

      const svgRes = validateArtworkBuffer(validPngBuffer, 'vector.svg', 'image/svg+xml');
      expect(svgRes.isValid).toBe(false);
      expect(svgRes.error).toContain('Unsupported file extension');
    });
  });

  describe('2. Public Enquiry API (POST /api/enquiries)', () => {
    it('preserves existing JSON enquiry submissions with 100% backward compatibility', async () => {
      const res = await request(app)
        .post('/api/enquiries')
        .send({
          enquiryType: 'BULK',
          name: 'Classic Customer',
          email: 'classic@example.com',
          phone: '+919876543210',
          message: 'Bulk enquiry without artwork',
          quantity: 100,
          source: 'WEBSITE',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.hasArtwork).toBe(false);
      expect(res.body.data.enquiry.designFileName).toBeNull();

      // Verify row in database
      const dbRes = await testPool.query('SELECT * FROM enquiries WHERE id = $1', [res.body.data.id]);
      expect(dbRes.rows).toHaveLength(1);
      expect(dbRes.rows[0].design_file_public_id).toBeNull();
    });

    it('accepts multipart bulk enquiry with valid PNG artwork, storing metadata', async () => {
      // Mock Cloudinary upload
      vi.spyOn(cloudinaryService, 'uploadArtworkBuffer').mockResolvedValueOnce({
        secureUrl: 'https://res.cloudinary.com/test-cloud/image/authenticated/s--123--/v1/artwork_test_png.png',
        publicId: 'axdoro/enquiries/artwork/artwork_test_png',
        format: 'png',
        bytes: validPngBuffer.length,
      });

      const res = await request(app)
        .post('/api/enquiries')
        .field('enquiryType', 'BULK')
        .field('name', 'Corporate Client')
        .field('email', 'corporate@company.com')
        .field('phone', '+919988776655')
        .field('message', 'Custom polo shirts with company logo')
        .field('quantity', '250')
        .attach('artwork', validPngBuffer, 'company-logo.png');

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.hasArtwork).toBe(true);
      expect(res.body.data.enquiry.designFileName).toBe('company-logo.png');
      expect(res.body.data.enquiry.designFileFormat).toBe('png');
      expect(res.body.data.enquiry.designFileBytes).toBe(validPngBuffer.length);
      // Public response does not leak internal secureUrl or publicId
      expect(res.body.data.enquiry.designFileUrl).toBeUndefined();
      expect(res.body.data.enquiry.designFilePublicId).toBeUndefined();

      // Verify database record
      const dbRes = await testPool.query('SELECT * FROM enquiries WHERE id = $1', [res.body.data.id]);
      expect(dbRes.rows).toHaveLength(1);
      expect(dbRes.rows[0].design_file_public_id).toBe('axdoro/enquiries/artwork/artwork_test_png');
      expect(dbRes.rows[0].design_file_name).toBe('company-logo.png');
    });

    it('accepts multipart bulk enquiry with valid PDF artwork', async () => {
      vi.spyOn(cloudinaryService, 'uploadArtworkBuffer').mockResolvedValueOnce({
        secureUrl: 'https://res.cloudinary.com/test-cloud/image/authenticated/s--456--/v1/artwork_test_pdf.pdf',
        publicId: 'axdoro/enquiries/artwork/artwork_test_pdf',
        format: 'pdf',
        bytes: validPdfBuffer.length,
      });

      const res = await request(app)
        .post('/api/enquiries')
        .field('enquiryType', 'BULK')
        .field('name', 'Design Agency')
        .field('email', 'design@agency.test')
        .field('phone', '+919876543210')
        .field('message', 'Vector tech pack in PDF')
        .field('quantity', '75')
        .attach('artwork', validPdfBuffer, 'tech-pack.pdf');

      expect(res.status).toBe(201);
      expect(res.body.data.hasArtwork).toBe(true);
      expect(res.body.data.enquiry.designFileFormat).toBe('pdf');
    });

    it('rejects multipart uploads exceeding 4 MB with HTTP 413 Payload Too Large', async () => {
      const oversizedBuffer = Buffer.alloc(MAX_ARTWORK_BYTES + 2048);

      const res = await request(app)
        .post('/api/enquiries')
        .field('enquiryType', 'BULK')
        .field('name', 'Heavy Uploader')
        .field('email', 'heavy@example.com')
        .field('phone', '+919876543210')
        .field('message', 'Trying to upload a massive file')
        .field('quantity', '50')
        .attach('artwork', oversizedBuffer, 'oversized.png');

      expect(res.status).toBe(413);
      expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');

      // Verify zero records written to DB
      const dbRes = await testPool.query('SELECT count(*) FROM enquiries');
      expect(parseInt(dbRes.rows[0].count, 10)).toBe(0);
    });

    it('rejects corrupted or extension-mismatched files with HTTP 400', async () => {
      const corruptedBuffer = Buffer.from('corrupted non-image content');

      const res = await request(app)
        .post('/api/enquiries')
        .field('enquiryType', 'BULK')
        .field('name', 'Bad File User')
        .field('email', 'badfile@example.com')
        .field('phone', '+919876543210')
        .field('message', 'Corrupted file test')
        .field('quantity', '50')
        .attach('artwork', corruptedBuffer, 'fake-logo.png');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_FILE');
    });

    it('quietly discards honeypot spam without uploading or writing to database', async () => {
      const uploadSpy = vi.spyOn(cloudinaryService, 'uploadArtworkBuffer');

      const res = await request(app)
        .post('/api/enquiries')
        .field('enquiryType', 'BULK')
        .field('name', 'Spam Bot')
        .field('email', 'spambot@example.com')
        .field('phone', '+919876543210')
        .field('message', 'Buy cheap pills')
        .field('quantity', '500')
        .field('website_hp', 'bot_filled_value')
        .attach('artwork', validPngBuffer, 'spam.png');

      expect(res.status).toBe(201);
      expect(res.body.data.driveSyncStatus).toBe('DISCARDED');
      expect(uploadSpy).not.toHaveBeenCalled();

      const count = await testPool.query('SELECT count(*) FROM enquiries');
      expect(parseInt(count.rows[0].count, 10)).toBe(0);
    });

    it('handles Cloudinary failure gracefully with HTTP 502', async () => {
      vi.spyOn(cloudinaryService, 'uploadArtworkBuffer').mockRejectedValueOnce(
        new Error('Cloudinary 503 Service Unavailable')
      );

      const res = await request(app)
        .post('/api/enquiries')
        .field('enquiryType', 'BULK')
        .field('name', 'Storage Outage Test')
        .field('email', 'outage@example.com')
        .field('phone', '+919876543210')
        .field('message', 'Storage outage scenario')
        .field('quantity', '50')
        .attach('artwork', validPngBuffer, 'logo.png');

      expect(res.status).toBe(502);
      expect(res.body.code).toBe('STORAGE_UPLOAD_FAILED');

      const count = await testPool.query('SELECT count(*) FROM enquiries');
      expect(parseInt(count.rows[0].count, 10)).toBe(0);
    });

    it('rejects unexpected file field names (e.g. uploading under "mockup" instead of "artwork") with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/enquiries')
        .field('enquiryType', 'BULK')
        .field('name', 'Wrong Field User')
        .field('email', 'wrongfield@example.com')
        .field('phone', '+919876543210')
        .field('message', 'Uploading to wrong field name')
        .field('quantity', '50')
        .attach('mockup', validPngBuffer, 'mockup.png');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('UNEXPECTED_FIELD');
    });

    it('rejects multipart payloads containing empty field names with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/enquiries')
        .field('enquiryType', 'BULK')
        .field('name', 'Empty Key User')
        .field('email', 'emptykey@example.com')
        .field('phone', '+919876543210')
        .field('message', 'Valid message')
        .field('quantity', '50')
        .field('', 'malformed_empty_key_value')
        .attach('artwork', validPngBuffer, 'valid.png');

      expect(res.status).toBe(400);
      expect(['INVALID_FIELD_NAME', 'INVALID_MULTIPART_PAYLOAD']).toContain(res.body.code);
    });

    it('rejects malformed multipart requests with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/enquiries')
        .set('Content-Type', 'multipart/form-data; boundary=invalid-boundary-never-closed')
        .send('--invalid-boundary-never-closed\r\nContent-Disposition: form-data; name="test"\r\n\r\n');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_MULTIPART_PAYLOAD');
    });

    it('handles compensating failure cleanly without relying on local disk fallback journal', async () => {
      const journalFile = path.resolve(process.cwd(), 'data/fallback_cloudinary_cleanup.jsonl');
      if (fs.existsSync(journalFile)) {
        fs.unlinkSync(journalFile);
      }

      // Mock Cloudinary upload success
      vi.spyOn(cloudinaryService, 'uploadArtworkBuffer').mockResolvedValueOnce({
        secureUrl: 'https://res.cloudinary.com/test/artwork.png',
        publicId: 'artwork_comp_failure_test',
        format: 'png',
        bytes: 1024,
      });

      // Mock compensating deletion failure
      vi.spyOn(cloudinaryService, 'deleteCloudinaryAsset').mockResolvedValueOnce(false);

      // Force createEnquiry to fail
      const enquiryService = await import('../services/enquiry.service.js');
      vi.spyOn(enquiryService, 'createEnquiry').mockRejectedValueOnce(new Error('Simulated database write failure'));

      const res = await request(app)
        .post('/api/enquiries')
        .field('enquiryType', 'BULK')
        .field('name', 'Compensating Test')
        .field('email', 'comp@example.com')
        .field('phone', '+919876543210')
        .field('message', 'Testing compensating failure')
        .field('quantity', '10')
        .field('source', 'WEBSITE')
        .attach('artwork', validPngBuffer, 'artwork.png');

      expect(res.status).toBe(500);

      // Verify a cleanup job was enqueued in PostgreSQL outbox
      const jobs = await testPool.query(
        "SELECT * FROM cloudinary_cleanup_jobs WHERE public_id = 'artwork_comp_failure_test'"
      );
      expect(jobs.rows).toHaveLength(1);
      expect(jobs.rows[0].reason).toBe('COMPENSATING_FAILURE');

      // Verify ZERO reliance on local disk journal
      expect(fs.existsSync(journalFile)).toBe(false);
    });
  });

  describe('3. Admin Artwork Access Endpoint (GET /api/admin/enquiries/:id/artwork)', () => {
    it('rejects unauthenticated requests with HTTP 401 Unauthorized', async () => {
      const res = await request(app).get('/api/admin/enquiries/00000000-0000-0000-0000-000000000000/artwork');
      expect(res.status).toBe(401);
    });

    it('returns 404 for non-existent enquiry UUIDs', async () => {
      const res = await request(app)
        .get('/api/admin/enquiries/00000000-0000-0000-0000-000000000000/artwork')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Enquiry not found');
    });

    it('returns 404 when an enquiry has no artwork attachment', async () => {
      const enquiry = await createEnquiry({
        enquiryType: 'BULK',
        name: 'No Artwork User',
        email: 'noart@example.com',
        phone: '+919876543210',
        message: 'No artwork',
        quantity: 50,
        source: 'WEBSITE',
      });

      const res = await request(app)
        .get(`/api/admin/enquiries/${enquiry.id}/artwork`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('No custom artwork attachment');
    });

    it('serves artwork buffer with strict attachment and security headers to authenticated admin', async () => {
      const enquiry = await createEnquiry(
        {
          enquiryType: 'BULK',
          name: 'Artwork Attached User',
          email: 'art@example.com',
          phone: '+919876543210',
          message: 'Artwork exists',
          quantity: 100,
          source: 'WEBSITE',
        },
        {
          designFileUrl: 'https://res.cloudinary.com/test/image/authenticated/artwork.pdf',
          designFilePublicId: 'axdoro/enquiries/artwork/artwork_sample_pdf',
          designFileName: 'customer-techpack.pdf',
          designFileFormat: 'pdf',
          designFileBytes: validPdfBuffer.length,
        }
      );

      vi.spyOn(cloudinaryService, 'fetchAuthenticatedArtworkBuffer').mockResolvedValueOnce({
        buffer: validPdfBuffer,
        contentType: 'application/pdf',
      });

      const res = await request(app)
        .get(`/api/admin/enquiries/${enquiry.id}/artwork`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toBe('attachment; filename="customer-techpack.pdf"');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toBe("default-src 'none'");
      expect(res.body.equals(validPdfBuffer)).toBe(true);
    });
  });

  describe('4. Deletion & Decoupled Post-Commit Cleanup', () => {
    it('deletes database record and invokes Cloudinary cleanup post-commit', async () => {
      const deleteSpy = vi.spyOn(cloudinaryService, 'deleteCloudinaryAsset').mockResolvedValueOnce(true);

      const enquiry = await createEnquiry(
        {
          enquiryType: 'BULK',
          name: 'Delete Target',
          email: 'delete@example.com',
          phone: '+919876543210',
          message: 'To be deleted',
          quantity: 50,
          source: 'WEBSITE',
        },
        {
          designFileUrl: 'https://res.cloudinary.com/test/artwork.png',
          designFilePublicId: 'axdoro/enquiries/artwork/artwork_del_target',
          designFileName: 'delete-me.png',
          designFileFormat: 'png',
          designFileBytes: 1024,
        }
      );

      const delRes = await adminDeleteEnquiry(enquiry.id, currentAdmin);

      expect(delRes.status).toBe('success');
      expect(deleteSpy).toHaveBeenCalledWith(
        'axdoro/enquiries/artwork/artwork_del_target',
        expect.objectContaining({
          type: 'authenticated',
        })
      );

      // Verify row removed from PostgreSQL
      const dbCheck = await testPool.query('SELECT * FROM enquiries WHERE id = $1', [enquiry.id]);
      expect(dbCheck.rows).toHaveLength(0);
    });

    it('ensures Cloudinary deletion error leaves job in PENDING status with retry backoff and does NOT invalidate database deletion or audit log', async () => {
      // Simulate Cloudinary outage on asset deletion
      vi.spyOn(cloudinaryService, 'deleteCloudinaryAsset').mockResolvedValue(false);

      const enquiry = await createEnquiry(
        {
          enquiryType: 'BULK',
          name: 'Resilient Delete',
          email: 'resilient@example.com',
          phone: '+919876543210',
          message: 'Resilient delete test',
          quantity: 50,
          source: 'WEBSITE',
        },
        {
          designFileUrl: 'https://res.cloudinary.com/test/artwork.png',
          designFilePublicId: 'axdoro/enquiries/artwork/artwork_resilient_del',
          designFileName: 'logo.png',
          designFileFormat: 'png',
          designFileBytes: 1024,
        }
      );

      const delRes = await adminDeleteEnquiry(enquiry.id, currentAdmin);

      // Database delete must still succeed
      expect(delRes.status).toBe('success');
      const dbCheck = await testPool.query('SELECT * FROM enquiries WHERE id = $1', [enquiry.id]);
      expect(dbCheck.rows).toHaveLength(0);

      // Verify audit log exists
      const auditRes = await testPool.query(
        "SELECT * FROM admin_audit_logs WHERE action = 'ENQUIRY_DELETE' AND entity_id = $1",
        [enquiry.id]
      );
      expect(auditRes.rows).toHaveLength(1);
      expect(auditRes.rows[0].details.hasArtwork).toBe(true);

      // Verify cleanup job remains stored in PENDING status with retry backoff
      const jobRes = await testPool.query(
        "SELECT * FROM cloudinary_cleanup_jobs WHERE public_id = 'axdoro/enquiries/artwork/artwork_resilient_del'"
      );
      expect(jobRes.rows).toHaveLength(1);
      expect(jobRes.rows[0].status).toBe('PENDING');
      expect(jobRes.rows[0].attempt_count).toBe(1);
      expect(new Date(jobRes.rows[0].next_attempt_at).getTime()).toBeGreaterThan(Date.now());
    });

    it('retries transient failures via processCloudinaryCleanupQueue with bounded backoff and records attempt count', async () => {
      const jobId = await enqueueCleanupJob(testPool, {
        publicId: 'axdoro/enquiries/artwork/artwork_retry_test',
        assetType: 'authenticated',
        reason: 'ORPHANED_UPLOAD',
      });

      // First run: Cloudinary fails
      vi.spyOn(cloudinaryService, 'deleteCloudinaryAsset').mockResolvedValueOnce(false);
      const queueRun1 = await processCloudinaryCleanupQueue(5);
      expect(queueRun1.processed).toBe(1);
      expect(queueRun1.failed).toBe(1);

      const job1 = await testPool.query('SELECT * FROM cloudinary_cleanup_jobs WHERE id = $1', [jobId]);
      expect(job1.rows[0].attempt_count).toBe(1);
      expect(job1.rows[0].status).toBe('PENDING');

      // Fast-forward next_attempt_at to now for test retry
      await testPool.query('UPDATE cloudinary_cleanup_jobs SET next_attempt_at = CURRENT_TIMESTAMP WHERE id = $1', [jobId]);

      // Second run: Cloudinary recovers
      vi.spyOn(cloudinaryService, 'deleteCloudinaryAsset').mockResolvedValueOnce(true);
      const queueRun2 = await processCloudinaryCleanupQueue(5);
      expect(queueRun2.processed).toBe(1);
      expect(queueRun2.completed).toBe(1);

      const job2 = await testPool.query('SELECT * FROM cloudinary_cleanup_jobs WHERE id = $1', [jobId]);
      expect(job2.rows[0].status).toBe('COMPLETED');
    });

    it('handles duplicate processing idempotently when asset was already deleted in Cloudinary', async () => {
      // deleteCloudinaryAsset returns true when Cloudinary returns 'not found'
      vi.spyOn(cloudinaryService, 'deleteCloudinaryAsset').mockResolvedValue(true);

      const jobId = await enqueueCleanupJob(testPool, {
        publicId: 'axdoro/enquiries/artwork/already_deleted_asset',
        assetType: 'authenticated',
        reason: 'ENQUIRY_DELETION',
      });

      const queueRun = await processCloudinaryCleanupQueue(5);
      expect(queueRun.completed).toBe(1);

      const job = await testPool.query('SELECT * FROM cloudinary_cleanup_jobs WHERE id = $1', [jobId]);
      expect(job.rows[0].status).toBe('COMPLETED');
    });

    it('protects active customer enquiries: worker ABORTS cleanup job if an active enquiry references the artwork', async () => {
      const deleteSpy = vi.spyOn(cloudinaryService, 'deleteCloudinaryAsset');

      const activeEnquiry = await createEnquiry(
        {
          enquiryType: 'BULK',
          name: 'Active Customer',
          email: 'active@example.com',
          phone: '+919876543210',
          message: 'Active order in progress',
          quantity: 100,
          source: 'WEBSITE',
        },
        {
          designFileUrl: 'https://res.cloudinary.com/test/active_logo.png',
          designFilePublicId: 'axdoro/enquiries/artwork/active_customer_logo',
          designFileName: 'active-logo.png',
          designFileFormat: 'png',
          designFileBytes: 2048,
        }
      );

      const rogueJobId = await enqueueCleanupJob(testPool, {
        publicId: 'axdoro/enquiries/artwork/active_customer_logo',
        assetType: 'authenticated',
        reason: 'ORPHANED_UPLOAD',
      });

      const queueRun = await processCloudinaryCleanupQueue(5);
      expect(queueRun.aborted).toBe(1);
      expect(deleteSpy).not.toHaveBeenCalled();

      const job = await testPool.query('SELECT * FROM cloudinary_cleanup_jobs WHERE id = $1', [rogueJobId]);
      expect(job.rows[0].status).toBe('ABORTED');
      expect(job.rows[0].last_error).toContain('Asset actively referenced');

      const enquiryCheck = await testPool.query('SELECT * FROM enquiries WHERE id = $1', [activeEnquiry.id]);
      expect(enquiryCheck.rows[0].design_file_public_id).toBe('axdoro/enquiries/artwork/active_customer_logo');
    });

    it('reconciles Cloudinary pending_commit lifecycle tags safely with conservative age threshold', async () => {
      const tagSpy = vi.spyOn(cloudinaryService, 'tagCloudinaryAsset').mockResolvedValue(true);
      const deleteSpy = vi.spyOn(cloudinaryService, 'deleteCloudinaryAsset').mockResolvedValue(true);

      // Create an active enquiry in DB referencing 'asset_with_enquiry'
      await createEnquiry(
        {
          enquiryType: 'BULK',
          name: 'Committed Customer',
          email: 'committed@example.com',
          phone: '+919876543210',
          message: 'Active enquiry with committed artwork',
          quantity: 20,
          source: 'WEBSITE',
        },
        {
          designFileUrl: 'https://res.cloudinary.com/test/committed_logo.png',
          designFilePublicId: 'asset_with_enquiry',
          designFileName: 'committed-logo.png',
          designFileFormat: 'png',
          designFileBytes: 1024,
        }
      );

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

      vi.spyOn(cloudinaryService, 'listCloudinaryResourcesByTag').mockResolvedValue([
        {
          public_id: 'recent_upload_in_flight',
          created_at: tenMinutesAgo, // younger than 1 hr threshold
          bytes: 5000,
          format: 'png',
          resource_type: 'image',
          type: 'authenticated',
        },
        {
          public_id: 'asset_with_enquiry',
          created_at: twoHoursAgo, // older than 1 hr, active DB record exists
          bytes: 1024,
          format: 'png',
          resource_type: 'image',
          type: 'authenticated',
        },
        {
          public_id: 'confirmed_orphan_asset',
          created_at: twoHoursAgo, // older than 1 hr, NO DB record exists
          bytes: 2048,
          format: 'jpg',
          resource_type: 'image',
          type: 'authenticated',
        },
      ]);

      const result = await reconcileCloudinaryPendingTags({ minAgeMs: 60 * 60 * 1000 });

      expect(result.scanned).toBe(3);
      expect(result.skippedActiveOrRecent).toBe(1);
      expect(result.reconciledCommitted).toBe(1);
      expect(result.deletedOrphans).toBe(1);

      // Verify recent upload was never touched or deleted
      expect(deleteSpy).not.toHaveBeenCalledWith('recent_upload_in_flight', expect.anything());

      // Verify active enquiry artwork had tags promoted to committed
      expect(tagSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          publicId: 'asset_with_enquiry',
          tag: 'committed',
          command: 'add',
        })
      );
      expect(deleteSpy).not.toHaveBeenCalledWith('asset_with_enquiry', expect.anything());

      // Verify confirmed orphan was deleted
      expect(deleteSpy).toHaveBeenCalledWith('confirmed_orphan_asset', expect.anything());
    });

    it('never deletes an asset if its database lookup temporarily fails during tag reconciliation', async () => {
      const deleteSpy = vi.spyOn(cloudinaryService, 'deleteCloudinaryAsset');
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

      vi.spyOn(cloudinaryService, 'listCloudinaryResourcesByTag').mockResolvedValue([
        {
          public_id: 'db_glitch_candidate',
          created_at: twoHoursAgo,
          bytes: 1024,
          format: 'png',
          resource_type: 'image',
          type: 'authenticated',
        },
      ]);

      // Mock query failure inside isAssetReferencedByActiveEnquiry
      vi.spyOn(db, 'query').mockImplementation(async (text: any, params: any) => {
        if (typeof text === 'string' && text.includes('SELECT id FROM enquiries WHERE design_file_public_id')) {
          throw new Error('Database connection pool timeout');
        }
        return testPool.query(text, params);
      });

      const result = await reconcileCloudinaryPendingTags({ minAgeMs: 60 * 60 * 1000 });

      // Asset was skipped due to DB error and NOT deleted
      expect(result.errors).toBeGreaterThan(0);
      expect(result.deletedOrphans).toBe(0);
      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it('prevents stale workers from overwriting newer worker state using claim_token verification', async () => {
      const jobId = await enqueueCleanupJob(testPool, {
        publicId: 'axdoro/enquiries/artwork/concurrency_test_asset',
        assetType: 'authenticated',
        reason: 'ORPHANED_UPLOAD',
      });

      // Claim job manually with token A
      const tokenA = 'claim-token-worker-A';
      await testPool.query(
        "UPDATE cloudinary_cleanup_jobs SET status = 'PROCESSING', claimed_at = CURRENT_TIMESTAMP, claim_token = $1 WHERE id = $2",
        [tokenA, jobId]
      );

      // Lease expires and worker B claims it with token B
      const tokenB = 'claim-token-worker-B';
      await testPool.query(
        "UPDATE cloudinary_cleanup_jobs SET status = 'PROCESSING', claimed_at = CURRENT_TIMESTAMP, claim_token = $1 WHERE id = $2",
        [tokenB, jobId]
      );

      // Stale Worker A attempts to mark job COMPLETED using old token A
      const staleUpdate = await testPool.query(
        "UPDATE cloudinary_cleanup_jobs SET status = 'COMPLETED', claim_token = NULL WHERE id = $1 AND claim_token = $2 RETURNING id",
        [jobId, tokenA]
      );
      expect(staleUpdate.rowCount).toBe(0); // Protected: updated 0 rows!

      // Worker B marks job COMPLETED using active token B
      const activeUpdate = await testPool.query(
        "UPDATE cloudinary_cleanup_jobs SET status = 'COMPLETED', claim_token = NULL WHERE id = $1 AND claim_token = $2 RETURNING id",
        [jobId, tokenB]
      );
      expect(activeUpdate.rowCount).toBe(1);

      const finalJob = await testPool.query('SELECT * FROM cloudinary_cleanup_jobs WHERE id = $1', [jobId]);
      expect(finalJob.rows[0].status).toBe('COMPLETED');
    });

    it('operational recovery: discoverable cleanup status and retry API with audit logging', async () => {
      const failedJobId = await enqueueCleanupJob(testPool, {
        publicId: 'axdoro/enquiries/artwork/failed_op_recovery_asset',
        assetType: 'authenticated',
        reason: 'ORPHANED_UPLOAD',
      });

      // Mark as FAILED
      await testPool.query(
        "UPDATE cloudinary_cleanup_jobs SET status = 'FAILED', attempt_count = 5, last_error = 'Cloudinary 503 Service Unavailable' WHERE id = $1",
        [failedJobId]
      );

      // 1. Discover status via GET /api/admin/enquiries/cleanup-status
      const statusRes = await request(app)
        .get('/api/admin/enquiries/cleanup-status')
        .set('Cookie', adminCookie);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.status).toBe('success');
      expect(statusRes.body.data.summary.failed).toBe(1);
      expect(statusRes.body.data.jobs).toHaveLength(1);
      expect(statusRes.body.data.jobs[0].id).toBe(failedJobId);
      // Verify no customer PII or raw internal URLs exposed
      expect(statusRes.body.data.jobs[0]).not.toHaveProperty('email');
      expect(statusRes.body.data.jobs[0]).not.toHaveProperty('phone');

      // 2. Retry failed jobs via POST /api/admin/enquiries/cleanup-retry
      vi.spyOn(cloudinaryService, 'deleteCloudinaryAsset').mockResolvedValue(true);

      const retryRes = await request(app)
        .post('/api/admin/enquiries/cleanup-retry')
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ jobId: failedJobId });

      expect(retryRes.status).toBe(200);
      expect(retryRes.body.status).toBe('success');
      expect(retryRes.body.data.retriedCount).toBe(1);
      expect(retryRes.body.data.processResult.completed).toBe(1);

      // Verify audit log entry
      const auditRes = await testPool.query(
        "SELECT * FROM admin_audit_logs WHERE action = 'CLEANUP_JOB_RETRY' AND entity_id = $1",
        [failedJobId]
      );
      expect(auditRes.rows).toHaveLength(1);
      expect(auditRes.rows[0].admin_email).toBe('artwork-admin@axdoro.test');

      // Verify job is now COMPLETED
      const jobCheck = await testPool.query('SELECT * FROM cloudinary_cleanup_jobs WHERE id = $1', [failedJobId]);
      expect(jobCheck.rows[0].status).toBe('COMPLETED');
    });

    it('maintenance endpoint: rejects unauthorized requests and authorizes valid CRON_SECRET', async () => {
      // 1. Unauthenticated request without CRON_SECRET or admin cookie
      const unauthRes = await request(app).get('/api/admin/maintenance/cleanup');
      expect(unauthRes.status).toBe(401);

      // 2. Invalid Bearer token
      const invalidBearerRes = await request(app)
        .get('/api/admin/maintenance/cleanup')
        .set('Authorization', 'Bearer invalid-cron-secret-token');
      expect(invalidBearerRes.status).toBe(401);

      // 3. Valid Bearer token matching CRON_SECRET
      const testSecret = 'axdoro-test-cron-secret-super-secure-32ch';
      (env as any).CRON_SECRET = testSecret;

      vi.spyOn(cloudinaryService, 'listCloudinaryResourcesByTag').mockResolvedValue([]);

      const validBearerRes = await request(app)
        .get('/api/admin/maintenance/cleanup')
        .set('Authorization', `Bearer ${testSecret}`);

      expect(validBearerRes.status).toBe(200);
      expect(validBearerRes.body.status).toBe('success');
      expect(validBearerRes.body.data).toHaveProperty('queue');
      expect(validBearerRes.body.data).toHaveProperty('reconciliation');
    });
  });

  describe('5. CSV Export & Google Sheets Synchronization Compatibility', () => {
    it('includes Column 15 in CSV export without leaking private storage URLs', async () => {
      await createEnquiry(
        {
          enquiryType: 'BULK',
          name: 'CSV Test Customer',
          email: 'csv@example.com',
          phone: '+919876543210',
          message: 'Export test',
          quantity: 50,
          source: 'WEBSITE',
        },
        {
          designFileUrl: 'https://res.cloudinary.com/secret/artwork.png',
          designFilePublicId: 'secret_public_id',
          designFileName: 'confidential-logo.png',
          designFileFormat: 'png',
          designFileBytes: 204800, // 200 KB
        }
      );

      const csv = await exportEnquiriesCsv({});
      expect(csv).toContain('Artwork Attachment');
      expect(csv).toContain('Yes (confidential-logo.png, 200.0 KB)');
      // Private Cloudinary URL and internal public_id are NOT present in CSV
      expect(csv).not.toContain('secret_public_id');
      expect(csv).not.toContain('https://res.cloudinary.com/secret/artwork.png');
    });

    it('appends Column 14 to Google Sheets rowData without leaking private storage URLs', async () => {
      const enquiry = await createEnquiry(
        {
          enquiryType: 'BULK',
          name: 'Sheets Client',
          email: 'sheets@example.com',
          phone: '+919876543210',
          message: 'Sheets test',
          quantity: 120,
          source: 'WEBSITE',
        },
        {
          designFileUrl: 'https://res.cloudinary.com/secret/artwork.png',
          designFilePublicId: 'secret_public_id',
          designFileName: 'brand-art.pdf',
          designFileFormat: 'pdf',
          designFileBytes: 50000,
        }
      );

      const mockSheets = new MockGoogleSheetsClient();
      const syncResult = await processDriveSyncQueue(mockSheets);

      expect(syncResult.synced).toBe(1);
      expect(mockSheets.rows).toHaveLength(1);

      const row = mockSheets.rows[0];
      expect(row).toHaveLength(14); // Exactly 14 columns
      expect(row[0]).toBe(enquiry.id);
      expect(row[13]).toBe('Yes (Artwork Attached)');
      // Zero raw Cloudinary URLs
      expect(row[13]).not.toContain('cloudinary');
      expect(row[13]).not.toContain('secret_public_id');
    });
  });
});
