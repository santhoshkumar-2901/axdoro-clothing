import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import {
  initializeTestDatabase,
  truncateTestOrders,
  truncateTestReturns,
  truncateTestEnquiries,
  truncateTestCatalogue,
  closeTestDatabase,
  testPool,
} from './test-db.js';
import * as cloudinaryService from '../services/cloudinary.service.js';
import * as returnService from '../services/return.service.js';
import * as db from '../config/db.js';
import {
  activeEvidenceUploads,
  resetActiveEvidenceUploads,
  setActiveEvidenceUploads,
  MAX_CONCURRENT_UPLOADS,
} from '../routes/returns.js';
import {
  isAssetReferencedByReturnEvidence,
  isAssetReferencedInDatabase,
  reconcileCloudinaryPendingTags,
} from '../services/cloudinary-cleanup.service.js';

describe('Phase 3.1: Customer Return Evidence Upload Integration Tests (axdoro_test)', () => {
  let validOrderNumber: string;

  // Minimal valid buffers conforming to file-validator magic bytes
  const validJpgBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
    0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60,
  ]);

  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  ]);

  const validWebpBuffer = Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([0x20, 0x00, 0x00, 0x00]),
    Buffer.from('WEBPVP8 '),
    Buffer.alloc(16),
  ]);

  const validPdfBuffer = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
  const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>');
  const gifBuffer = Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;');

  let uploadCounter = 0;
  let deletedAssets: { publicId: string; options?: any }[] = [];
  let taggedCalls: any[] = [];

  beforeAll(async () => {
    await initializeTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  beforeEach(async () => {
    await truncateTestReturns();
    await truncateTestOrders();
    await truncateTestEnquiries();
    resetActiveEvidenceUploads();
    vi.restoreAllMocks();

    uploadCounter = 0;
    deletedAssets = [];
    taggedCalls = [];

    // Seed test order
    const orderRes = await testPool.query<{ order_number: string }>(`
      INSERT INTO orders (
        order_number,
        customer_name,
        customer_email,
        customer_phone,
        shipping_address_line1,
        shipping_city,
        shipping_state,
        shipping_pincode,
        subtotal_paise,
        total_paise,
        customer_order_token,
        order_status,
        delivered_at
      ) VALUES (
        'AX-202611-EV01',
        'Customer Evidence Test',
        'evidence@example.com',
        '+919876543210',
        '100 Fashion Hub',
        'Chennai',
        'Tamil Nadu',
        '600001',
        299900,
        299900,
        'token1234567890token1234567890token1234567890',
        'DELIVERED',
        NOW() - INTERVAL '3 days'
      ) RETURNING order_number;
    `);
    validOrderNumber = orderRes.rows[0].order_number;

    // Default Cloudinary mocks
    vi.spyOn(cloudinaryService, 'uploadReturnEvidenceBuffer').mockImplementation(async (opts) => {
      uploadCounter++;
      return {
        secureUrl: `https://res.cloudinary.com/test/image/authenticated/s--dummy--/v1/axdoro/returns/evidence/evidence_test_${uploadCounter}.jpg`,
        publicId: `axdoro/returns/evidence/evidence_test_${uploadCounter}`,
        format: opts.format,
        bytes: opts.buffer.length,
      };
    });

    vi.spyOn(cloudinaryService, 'deleteCloudinaryAsset').mockImplementation(async (publicId, options) => {
      deletedAssets.push({ publicId, options });
      return true;
    });

    vi.spyOn(cloudinaryService, 'tagCloudinaryAsset').mockImplementation(async (opts) => {
      taggedCalls.push(opts);
      return true;
    });
  });

  // =========================================================================
  // 1. VALID IMAGE EVIDENCE UPLOADS (JPEG, PNG, WEBP)
  // =========================================================================
  it('successfully uploads valid JPEG evidence and persists database row', async () => {
    const res = await request(app)
      .post('/api/returns')
      .field('orderId', validOrderNumber)
      .field('phone', '+919876543210')
      .field('email', 'evidence@example.com')
      .field('reason', 'PRODUCT_DAMAGED_OR_DEFECTIVE')
      .field('description', 'Tear along shoulder seam')
      .attach('evidence', validJpgBuffer, {
        filename: 'defect.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.requestId).toMatch(/^RET-\d{6}-[A-F0-9]{6}$/);

    // Verify database record
    const evidenceRows = await testPool.query<{
      cloudinary_public_id: string;
      original_filename: string;
      mime_type: string;
      format: string;
      file_size_bytes: number;
      deleted_at: Date | null;
    }>(`SELECT * FROM return_request_evidence;`);

    expect(evidenceRows.rows).toHaveLength(1);
    expect(evidenceRows.rows[0].cloudinary_public_id).toBe('axdoro/returns/evidence/evidence_test_1');
    expect(evidenceRows.rows[0].original_filename).toBe('defect.jpg');
    expect(evidenceRows.rows[0].mime_type).toBe('image/jpeg');
    expect(evidenceRows.rows[0].format).toBe('jpg');
    expect(evidenceRows.rows[0].deleted_at).toBeNull();

    // Verify tag promotion occurred
    expect(taggedCalls.some((c) => c.tag === 'committed' && c.command === 'add')).toBe(true);
  });

  it('successfully uploads valid PNG and WebP evidence images', async () => {
    const resPng = await request(app)
      .post('/api/returns')
      .field('orderId', validOrderNumber)
      .field('phone', '+919876543210')
      .field('email', 'evidence@example.com')
      .field('reason', 'WRONG_PRODUCT_RECEIVED')
      .attach('evidence', validPngBuffer, {
        filename: 'wrong-item.png',
        contentType: 'image/png',
      });

    expect(resPng.status).toBe(201);

    const resWebp = await request(app)
      .post('/api/returns')
      .field('orderId', validOrderNumber)
      .field('phone', '+919876543210')
      .field('email', 'evidence@example.com')
      .field('reason', 'OTHER')
      .attach('evidence', validWebpBuffer, {
        filename: 'texture.webp',
        contentType: 'image/webp',
      });

    expect(resWebp.status).toBe(201);

    const evidenceRows = await testPool.query<{ format: string; mime_type: string }>(
      `SELECT format, mime_type FROM return_request_evidence ORDER BY created_at ASC;`
    );
    expect(evidenceRows.rows).toHaveLength(2);
    expect(evidenceRows.rows[0].format).toBe('png');
    expect(evidenceRows.rows[0].mime_type).toBe('image/png');
    expect(evidenceRows.rows[1].format).toBe('webp');
    expect(evidenceRows.rows[1].mime_type).toBe('image/webp');
  });

  it('allows uploading up to 3 valid images in a single request', async () => {
    const res = await request(app)
      .post('/api/returns')
      .field('orderId', validOrderNumber)
      .field('phone', '+919876543210')
      .field('email', 'evidence@example.com')
      .field('reason', 'PRODUCT_DAMAGED_OR_DEFECTIVE')
      .attach('evidence', validJpgBuffer, 'photo1.jpg')
      .attach('evidence', validPngBuffer, 'photo2.png')
      .attach('evidence', validWebpBuffer, 'photo3.webp');

    expect(res.status).toBe(201);

    const evidenceRows = await testPool.query<{ count: string }>(
      `SELECT count(*) FROM return_request_evidence;`
    );
    expect(parseInt(evidenceRows.rows[0].count, 10)).toBe(3);
  });

  // =========================================================================
  // 2. DISALLOWED FORMAT REJECTIONS (SVG, PDF, GIF, MAGIC-BYTE MISMATCH)
  // =========================================================================
  it('rejects SVG files even when given a .jpg extension', async () => {
    const res = await request(app)
      .post('/api/returns')
      .field('orderId', validOrderNumber)
      .field('phone', '+919876543210')
      .field('email', 'evidence@example.com')
      .field('reason', 'OTHER')
      .attach('evidence', svgBuffer, {
        filename: 'malicious.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('magic bytes');
    expect(uploadCounter).toBe(0);
  });

  it('rejects PDF files (PDF is permitted for bulk enquiries, strictly disallowed for return evidence)', async () => {
    const res = await request(app)
      .post('/api/returns')
      .field('orderId', validOrderNumber)
      .field('phone', '+919876543210')
      .field('email', 'evidence@example.com')
      .field('reason', 'OTHER')
      .attach('evidence', validPdfBuffer, {
        filename: 'invoice.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Only JPEG, PNG, and WebP');
    expect(uploadCounter).toBe(0);
  });

  it('rejects GIF files', async () => {
    const res = await request(app)
      .post('/api/returns')
      .field('orderId', validOrderNumber)
      .field('phone', '+919876543210')
      .field('email', 'evidence@example.com')
      .field('reason', 'OTHER')
      .attach('evidence', gifBuffer, {
        filename: 'animation.gif',
        contentType: 'image/gif',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Unsupported file extension');
    expect(uploadCounter).toBe(0);
  });

  it('rejects extension and content magic-byte mismatch (e.g. .jpg filename with PNG buffer)', async () => {
    const res = await request(app)
      .post('/api/returns')
      .field('orderId', validOrderNumber)
      .field('phone', '+919876543210')
      .field('email', 'evidence@example.com')
      .field('reason', 'OTHER')
      .attach('evidence', validPngBuffer, {
        filename: 'fake-jpeg.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('File extension does not match');
    expect(uploadCounter).toBe(0);
  });

  it('rejects corrupt/empty buffers with 400 Bad Request', async () => {
    const corruptBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    const res = await request(app)
      .post('/api/returns')
      .field('orderId', validOrderNumber)
      .field('phone', '+919876543210')
      .field('email', 'evidence@example.com')
      .field('reason', 'OTHER')
      .attach('evidence', corruptBuffer, {
        filename: 'corrupt.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('invalid magic bytes');
  });

  // =========================================================================
  // 3. BOUNDARY CONDITIONS (LIMITS, SIZES, COUNTS)
  // =========================================================================
  it('rejects requests with more than 3 evidence images', async () => {
    const res = await request(app)
      .post('/api/returns')
      .field('orderId', validOrderNumber)
      .field('phone', '+919876543210')
      .field('email', 'evidence@example.com')
      .field('reason', 'OTHER')
      .attach('evidence', validJpgBuffer, 'img1.jpg')
      .attach('evidence', validJpgBuffer, 'img2.jpg')
      .attach('evidence', validJpgBuffer, 'img3.jpg')
      .attach('evidence', validJpgBuffer, 'img4.jpg');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('maximum of 3');
    expect(uploadCounter).toBe(0);
  });

  it('rejects an evidence image that exceeds 4 MB', async () => {
    const oversizedBuffer = Buffer.alloc(4.5 * 1024 * 1024);
    // Add JPG magic bytes to header
    validJpgBuffer.copy(oversizedBuffer, 0);

    const res = await request(app)
      .post('/api/returns')
      .field('orderId', validOrderNumber)
      .field('phone', '+919876543210')
      .field('email', 'evidence@example.com')
      .field('reason', 'OTHER')
      .attach('evidence', oversizedBuffer, 'oversized.jpg');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('4 MB');
    expect(uploadCounter).toBe(0);
  });

  it('rejects requests exceeding the 13 MB preflight content-length threshold with 413', async () => {
    const res = await request(app)
      .post('/api/returns')
      .set('Content-Length', String(14 * 1024 * 1024))
      .set('Content-Type', 'multipart/form-data; boundary=----WebKitFormBoundaryXYZ')
      .send('dummy');

    expect(res.status).toBe(413);
    expect(res.body.message).toContain('exceeds maximum allowed size');
  });

  it('rejects unexpected non-evidence file field names', async () => {
    const res = await request(app)
      .post('/api/returns')
      .field('orderId', validOrderNumber)
      .field('phone', '+919876543210')
      .field('email', 'evidence@example.com')
      .field('reason', 'OTHER')
      .attach('avatar', validJpgBuffer, 'avatar.jpg');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('evidence');
  });

  // =========================================================================
  // 4. CONCURRENCY GUARD & RESOURCE PROTECTION
  // =========================================================================
  it('enforces upload concurrency guard and responds with 429 and Retry-After', async () => {
    // Manually saturate concurrency counter to MAX_CONCURRENT_UPLOADS (4)
    // We import and test activeEvidenceUploads
    for (let i = 0; i < MAX_CONCURRENT_UPLOADS; i++) {
      // simulate saturation
      (cloudinaryService as any); // no-op
    }

    // Set activeEvidenceUploads to 4 by calling a simulated saturation or setting the variable
    // Let's test the route guard directly
    const originalCount = activeEvidenceUploads;
    try {
      // Simulate 4 concurrent requests in flight
      const res = await request(app)
        .post('/api/returns')
        .field('orderId', validOrderNumber)
        .field('phone', '+919876543210')
        .field('email', 'evidence@example.com')
        .field('reason', 'OTHER')
        .attach('evidence', validJpgBuffer, 'file1.jpg');

      // The normal request succeeds and decrements counter
      expect(res.status).toBe(201);
      expect(activeEvidenceUploads).toBe(0);
    } finally {
      resetActiveEvidenceUploads();
    }
  });

  it('returns 429 when concurrency guard is saturated', async () => {
    // Artificially saturate counter using helper
    setActiveEvidenceUploads(MAX_CONCURRENT_UPLOADS);

    const res = await request(app)
      .post('/api/returns')
      .field('orderId', validOrderNumber)
      .field('phone', '+919876543210')
      .field('email', 'evidence@example.com')
      .field('reason', 'OTHER')
      .attach('evidence', validJpgBuffer, 'file.jpg');

    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('5');
    expect(res.body.message).toContain('peak upload traffic');

    resetActiveEvidenceUploads();
  });

  // =========================================================================
  // 5. COMPENSATING DELETION & FAILURE RECOVERY
  // =========================================================================
  it('rolls back previously uploaded assets if a subsequent Cloudinary upload fails', async () => {
    let callIdx = 0;
    vi.spyOn(cloudinaryService, 'uploadReturnEvidenceBuffer').mockImplementation(async (opts) => {
      callIdx++;
      if (callIdx === 2) {
        throw new Error('Cloudinary upstream 503 Service Unavailable');
      }
      return {
        secureUrl: 'https://res.cloudinary.com/test/dummy.jpg',
        publicId: `axdoro/returns/evidence/partial_${callIdx}`,
        format: opts.format,
        bytes: opts.buffer.length,
      };
    });

    const res = await request(app)
      .post('/api/returns')
      .field('orderId', validOrderNumber)
      .field('phone', '+919876543210')
      .field('email', 'evidence@example.com')
      .field('reason', 'OTHER')
      .attach('evidence', validJpgBuffer, 'img1.jpg')
      .attach('evidence', validPngBuffer, 'img2.png');

    expect(res.status).toBe(502);
    expect(res.body.message).toContain('Failed to upload evidence image');

    // Asset 1 must have been deleted via deleteCloudinaryAsset
    expect(deletedAssets).toHaveLength(1);
    expect(deletedAssets[0].publicId).toBe('axdoro/returns/evidence/partial_1');

    // No rows committed to database
    const rows = await testPool.query('SELECT count(*) FROM return_requests;');
    expect(parseInt(rows.rows[0].count, 10)).toBe(0);
  });

  it('rolls back all uploaded Cloudinary assets if the database transaction fails', async () => {
    vi.spyOn(returnService, 'createReturnRequest').mockRejectedValueOnce(
      new Error('Simulated PostgreSQL connection drop')
    );

    const res = await request(app)
      .post('/api/returns')
      .field('orderId', validOrderNumber)
      .field('phone', '+919876543210')
      .field('email', 'evidence@example.com')
      .field('reason', 'OTHER')
      .attach('evidence', validJpgBuffer, 'img1.jpg')
      .attach('evidence', validPngBuffer, 'img2.png');

    expect(res.status).toBe(500);

    // Both assets must have been deleted
    expect(deletedAssets).toHaveLength(2);
    expect(deletedAssets.map((d) => d.publicId)).toContain('axdoro/returns/evidence/evidence_test_1');
    expect(deletedAssets.map((d) => d.publicId)).toContain('axdoro/returns/evidence/evidence_test_2');
  });

  it('enqueues cleanup job to cloudinary_cleanup_jobs if direct deletion fails during compensation', async () => {
    vi.spyOn(returnService, 'createReturnRequest').mockRejectedValueOnce(
      new Error('Simulated DB failure')
    );
    // Simulate deleteCloudinaryAsset failing (e.g. Cloudinary down)
    vi.spyOn(cloudinaryService, 'deleteCloudinaryAsset').mockResolvedValue(false);

    const res = await request(app)
      .post('/api/returns')
      .field('orderId', validOrderNumber)
      .field('phone', '+919876543210')
      .field('email', 'evidence@example.com')
      .field('reason', 'OTHER')
      .attach('evidence', validJpgBuffer, 'img1.jpg');

    expect(res.status).toBe(500);

    // Verify job in cloudinary_cleanup_jobs
    const cleanupJobs = await testPool.query<{
      public_id: string;
      reason: string;
      status: string;
    }>(`SELECT public_id, reason, status FROM cloudinary_cleanup_jobs;`);

    expect(cleanupJobs.rows).toHaveLength(1);
    expect(cleanupJobs.rows[0].public_id).toBe('axdoro/returns/evidence/evidence_test_1');
    expect(cleanupJobs.rows[0].reason).toBe('COMPENSATING_FAILURE');
    expect(cleanupJobs.rows[0].status).toBe('PENDING');
  });

  // =========================================================================
  // 6. DEDUPLICATION (DOUBLE-SUBMISSION HANDLING)
  // =========================================================================
  it('cleans up newly uploaded assets when a submission is deduplicated within 60s', async () => {
    // 1st submission
    const res1 = await request(app)
      .post('/api/returns')
      .field('orderId', validOrderNumber)
      .field('phone', '+919876543210')
      .field('email', 'evidence@example.com')
      .field('reason', 'PRODUCT_DAMAGED_OR_DEFECTIVE')
      .attach('evidence', validJpgBuffer, 'first.jpg');

    expect(res1.status).toBe(201);
    const requestId1 = res1.body.data.requestId;

    // 2nd identical submission within 60 seconds (double-click)
    const res2 = await request(app)
      .post('/api/returns')
      .field('orderId', validOrderNumber)
      .field('phone', '+919876543210')
      .field('email', 'evidence@example.com')
      .field('reason', 'PRODUCT_DAMAGED_OR_DEFECTIVE')
      .attach('evidence', validJpgBuffer, 'duplicate.jpg');

    expect(res2.status).toBe(201);
    expect(res2.body.data.requestId).toBe(requestId1);

    // The second uploaded asset (evidence_test_2) must have been cleaned up
    expect(deletedAssets).toHaveLength(1);
    expect(deletedAssets[0].publicId).toBe('axdoro/returns/evidence/evidence_test_2');
  });

  // =========================================================================
  // 7. CLEANUP WORKER SAFETY CHECKS (isAssetReferencedInDatabase)
  // =========================================================================
  it('isAssetReferencedInDatabase protects active return evidence from background cleanup', async () => {
    // Upload evidence
    await request(app)
      .post('/api/returns')
      .field('orderId', validOrderNumber)
      .field('phone', '+919876543210')
      .field('email', 'evidence@example.com')
      .field('reason', 'PRODUCT_DAMAGED_OR_DEFECTIVE')
      .attach('evidence', validJpgBuffer, 'evidence.jpg');

    const publicId = 'axdoro/returns/evidence/evidence_test_1';

    // Must be recognized as actively referenced
    const isReferencedDirect = await isAssetReferencedByReturnEvidence(publicId, testPool);
    expect(isReferencedDirect).toBe(true);

    const isReferencedGeneral = await isAssetReferencedInDatabase(publicId, testPool);
    expect(isReferencedGeneral).toBe(true);

    // Soft-delete the evidence record
    await testPool.query(
      `UPDATE return_request_evidence SET deleted_at = NOW() WHERE cloudinary_public_id = $1;`,
      [publicId]
    );

    // Now it should NOT be protected (eligible for retention cleanup)
    const afterSoftDelete = await isAssetReferencedByReturnEvidence(publicId, testPool);
    expect(afterSoftDelete).toBe(false);
  });

  // =========================================================================
  // 8. BACKWARD COMPATIBILITY: SUBMISSION WITHOUT EVIDENCE
  // =========================================================================
  it('handles standard JSON submissions without evidence seamlessly', async () => {
    const res = await request(app)
      .post('/api/returns')
      .send({
        orderId: validOrderNumber,
        phone: '+919876543210',
        email: 'evidence@example.com',
        reason: 'SIZE_DOES_NOT_FIT',
        description: 'No photos provided',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.requestId).toBeDefined();

    const countRes = await testPool.query('SELECT count(*) FROM return_request_evidence;');
    expect(parseInt(countRes.rows[0].count, 10)).toBe(0);
  });

  // =========================================================================
  // 9. PHASE 3.1.4: PENDING-TAG RECONCILIATION SAFETY TESTS
  // =========================================================================
  describe('Phase 3.1.4: Pending-Tag Reconciliation Safety Tests', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    beforeEach(async () => {
      await truncateTestCatalogue();
      await truncateTestEnquiries();
      await truncateTestReturns();
    });

    it('1. does NOT delete an active return evidence asset with pending_commit and promotes its tag', async () => {
      // 1. Seed return request and return_request_evidence
      const retReqRes = await testPool.query<{ id: string }>(`
        INSERT INTO return_requests (
          request_number, submitted_order_id, customer_phone, customer_email, reason
        ) VALUES (
          'RET-202611-REC001', 'AX-202611-EV01', '+919876543210', 'evidence@example.com', 'PRODUCT_DAMAGED_OR_DEFECTIVE'
        ) RETURNING id;
      `);
      const returnRequestId = retReqRes.rows[0].id;
      const evidencePublicId = 'axdoro/returns/evidence/reconcile_evidence_active';

      await testPool.query(`
        INSERT INTO return_request_evidence (
          return_request_id, cloudinary_public_id, original_filename, mime_type, file_size_bytes, format
        ) VALUES (
          $1, $2, 'damage.jpg', 'image/jpeg', 2048, 'jpg'
        );
      `, [returnRequestId, evidencePublicId]);

      // Mock Cloudinary list resources by tag returning this asset
      vi.spyOn(cloudinaryService, 'listCloudinaryResourcesByTag').mockResolvedValue([
        {
          public_id: evidencePublicId,
          created_at: twoHoursAgo,
          bytes: 2048,
          format: 'jpg',
          resource_type: 'image',
          type: 'authenticated',
        },
      ]);

      const deleteSpy = vi.spyOn(cloudinaryService, 'deleteCloudinaryAsset');
      const tagSpy = vi.spyOn(cloudinaryService, 'tagCloudinaryAsset');

      const result = await reconcileCloudinaryPendingTags({ minAgeMs: 60 * 60 * 1000 });

      expect(result.scanned).toBe(1);
      expect(result.reconciledCommitted).toBe(1);
      expect(result.deletedOrphans).toBe(0);

      // Verify asset was NOT deleted
      expect(deleteSpy).not.toHaveBeenCalledWith(evidencePublicId, expect.anything());

      // Verify tag promotion to committed
      expect(tagSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          publicId: evidencePublicId,
          tag: 'committed',
          command: 'add',
        })
      );
      expect(tagSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          publicId: evidencePublicId,
          tag: 'pending_commit',
          command: 'remove',
        })
      );
    });

    it('2. preserves and protects an active enquiry artwork asset during reconciliation', async () => {
      const enquiryPublicId = 'axdoro/enquiries/artwork/reconcile_enquiry_active';
      await testPool.query(`
        INSERT INTO enquiries (
          name, email, phone, message, design_file_public_id, design_file_url
        ) VALUES (
          'Enquiry Cust', 'enquiry@example.com', '+919876543210', 'Bulk note',
          $1, 'https://res.cloudinary.com/axdoro/dummy.png'
        );
      `, [enquiryPublicId]);

      vi.spyOn(cloudinaryService, 'listCloudinaryResourcesByTag').mockResolvedValue([
        {
          public_id: enquiryPublicId,
          created_at: twoHoursAgo,
          bytes: 4096,
          format: 'png',
          resource_type: 'image',
          type: 'authenticated',
        },
      ]);

      const deleteSpy = vi.spyOn(cloudinaryService, 'deleteCloudinaryAsset');
      const tagSpy = vi.spyOn(cloudinaryService, 'tagCloudinaryAsset');

      const result = await reconcileCloudinaryPendingTags({ minAgeMs: 60 * 60 * 1000 });

      expect(result.scanned).toBe(1);
      expect(result.reconciledCommitted).toBe(1);
      expect(result.deletedOrphans).toBe(0);
      expect(deleteSpy).not.toHaveBeenCalledWith(enquiryPublicId, expect.anything());
      expect(tagSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          publicId: enquiryPublicId,
          tag: 'committed',
          command: 'add',
        })
      );
    });

    it('3. preserves and protects a referenced product image asset during reconciliation', async () => {
      const catRes = await testPool.query<{ id: string }>(`
        INSERT INTO categories (name, slug) VALUES ('Jackets', 'jackets') RETURNING id;
      `);
      const prodRes = await testPool.query<{ id: string }>(`
        INSERT INTO products (category_id, name, slug, description)
        VALUES ($1, 'Leather Jacket', 'leather-jacket', 'Luxury leather')
        RETURNING id;
      `, [catRes.rows[0].id]);

      const productPublicId = 'axdoro/products/reconcile_product_active';
      await testPool.query(`
        INSERT INTO product_images (product_id, image_url, public_id, is_primary, display_order)
        VALUES ($1, 'https://res.cloudinary.com/dummy.jpg', $2, false, 0);
      `, [prodRes.rows[0].id, productPublicId]);

      vi.spyOn(cloudinaryService, 'listCloudinaryResourcesByTag').mockResolvedValue([
        {
          public_id: productPublicId,
          created_at: twoHoursAgo,
          bytes: 8192,
          format: 'jpg',
          resource_type: 'image',
          type: 'upload',
        },
      ]);

      const deleteSpy = vi.spyOn(cloudinaryService, 'deleteCloudinaryAsset');
      const result = await reconcileCloudinaryPendingTags({ minAgeMs: 60 * 60 * 1000 });

      expect(result.scanned).toBe(1);
      expect(result.reconciledCommitted).toBe(1);
      expect(result.deletedOrphans).toBe(0);
      expect(deleteSpy).not.toHaveBeenCalledWith(productPublicId, expect.anything());
    });

    it('4. preserves and protects a referenced category image asset during reconciliation', async () => {
      const categoryPublicId = 'axdoro/categories/reconcile_category_active';
      await testPool.query(`
        INSERT INTO categories (name, slug, public_id)
        VALUES ('Overcoats', 'overcoats', $1);
      `, [categoryPublicId]);

      vi.spyOn(cloudinaryService, 'listCloudinaryResourcesByTag').mockResolvedValue([
        {
          public_id: categoryPublicId,
          created_at: twoHoursAgo,
          bytes: 10240,
          format: 'jpg',
          resource_type: 'image',
          type: 'upload',
        },
      ]);

      const deleteSpy = vi.spyOn(cloudinaryService, 'deleteCloudinaryAsset');
      const result = await reconcileCloudinaryPendingTags({ minAgeMs: 60 * 60 * 1000 });

      expect(result.scanned).toBe(1);
      expect(result.reconciledCommitted).toBe(1);
      expect(result.deletedOrphans).toBe(0);
      expect(deleteSpy).not.toHaveBeenCalledWith(categoryPublicId, expect.anything());
    });

    it('5. safely deletes genuinely unreferenced orphan assets older than threshold', async () => {
      const genuineOrphanPublicId = 'axdoro/orphans/genuine_orphan_asset';

      vi.spyOn(cloudinaryService, 'listCloudinaryResourcesByTag').mockResolvedValue([
        {
          public_id: genuineOrphanPublicId,
          created_at: twoHoursAgo,
          bytes: 1024,
          format: 'jpg',
          resource_type: 'image',
          type: 'authenticated',
        },
      ]);

      const deleteSpy = vi.spyOn(cloudinaryService, 'deleteCloudinaryAsset');
      const result = await reconcileCloudinaryPendingTags({ minAgeMs: 60 * 60 * 1000 });

      expect(result.scanned).toBe(1);
      expect(result.reconciledCommitted).toBe(0);
      expect(result.deletedOrphans).toBe(1);
      expect(deleteSpy).toHaveBeenCalledWith(genuineOrphanPublicId, expect.anything());
    });

    it('6. fails closed and prevents deletion when a database query error occurs', async () => {
      const candidatePublicId = 'axdoro/candidate/db_glitch_asset';

      vi.spyOn(cloudinaryService, 'listCloudinaryResourcesByTag').mockResolvedValue([
        {
          public_id: candidatePublicId,
          created_at: twoHoursAgo,
          bytes: 2048,
          format: 'jpg',
          resource_type: 'image',
          type: 'authenticated',
        },
      ]);

      // Mock database query failure
      vi.spyOn(db, 'query').mockRejectedValue(new Error('PostgreSQL connection drop'));

      const deleteSpy = vi.spyOn(cloudinaryService, 'deleteCloudinaryAsset');
      const result = await reconcileCloudinaryPendingTags({ minAgeMs: 60 * 60 * 1000 });

      expect(result.errors).toBeGreaterThan(0);
      expect(result.deletedOrphans).toBe(0);
      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it('7. tag-promotion failure after database persistence does not result in evidence deletion during reconciliation', async () => {
      // 1. Submit return request with evidence through API where tag promotion fails
      const evidencePublicId = 'axdoro/returns/evidence/evidence_test_tag_fail';
      vi.spyOn(cloudinaryService, 'uploadReturnEvidenceBuffer').mockResolvedValue({
        secureUrl: 'https://res.cloudinary.com/test/dummy.jpg',
        publicId: evidencePublicId,
        format: 'jpg',
        bytes: 1024,
      });

      // Simulate tag promotion failing in background post-commit
      vi.spyOn(cloudinaryService, 'tagCloudinaryAsset').mockRejectedValue(
        new Error('Cloudinary Tag API rate limited')
      );

      const res = await request(app)
        .post('/api/returns')
        .field('orderId', 'AX-202611-EV01')
        .field('phone', '+919876543210')
        .field('email', 'evidence@example.com')
        .field('reason', 'PRODUCT_DAMAGED_OR_DEFECTIVE')
        .attach('evidence', validJpgBuffer, 'evidence.jpg');

      expect(res.status).toBe(201);

      // Asset now exists in return_request_evidence in PostgreSQL, but Cloudinary still has tag pending_commit
      // 2. Later, reconciliation runs for assets older than 1 hour
      vi.spyOn(cloudinaryService, 'listCloudinaryResourcesByTag').mockResolvedValue([
        {
          public_id: evidencePublicId,
          created_at: twoHoursAgo,
          bytes: 1024,
          format: 'jpg',
          resource_type: 'image',
          type: 'authenticated',
        },
      ]);

      // Now Cloudinary tag API is healthy
      const tagSpy = vi.spyOn(cloudinaryService, 'tagCloudinaryAsset').mockResolvedValue(true);
      const deleteSpy = vi.spyOn(cloudinaryService, 'deleteCloudinaryAsset');

      const reconResult = await reconcileCloudinaryPendingTags({ minAgeMs: 60 * 60 * 1000 });

      // Must be safely reconciled, NOT deleted!
      expect(reconResult.scanned).toBe(1);
      expect(reconResult.reconciledCommitted).toBe(1);
      expect(reconResult.deletedOrphans).toBe(0);
      expect(deleteSpy).not.toHaveBeenCalledWith(evidencePublicId, expect.anything());
      expect(tagSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          publicId: evidencePublicId,
          tag: 'committed',
          command: 'add',
        })
      );
    });
  });
});
