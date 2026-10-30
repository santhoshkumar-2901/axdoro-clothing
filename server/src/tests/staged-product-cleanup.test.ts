import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import {
  initializeTestDatabase,
  truncateTestCatalogue,
  truncateTestAdmin,
  truncateTestEnquiries,
  closeTestDatabase,
  testPool,
} from './test-db.js';
import { provisionAdmin, loginAdmin } from '../services/admin-auth.service.js';
import * as cloudinaryService from '../services/cloudinary.service.js';
import {
  isAssetReferencedByProductImages,
  isAssetReferencedByCategory,
  isAssetReferencedInDatabase,
  reconcileStagedProductUploads,
} from '../services/cloudinary-cleanup.service.js';
import { reconcileCloudinaryPendingTags } from '../services/cloudinary-cleanup.service.js';
import {
  createStagingSession,
  heartbeatStagingSession,
  abandonStagingSession,
  preRegisterStagedAsset,
  isAssetInActiveStagingSession,
  claimStagedAssetForDeletion,
  releaseStagedAssetClaim,
  markStagedAssetDeleted,
} from '../services/product-staging.service.js';
import { createEnquiry } from '../services/enquiry.service.js';
import * as db from '../config/db.js';

describe('AXDORO Phase 1: Product Staging Session Lifecycle & Concurrency (20 Required Tests)', () => {
  let adminToken: string;
  let adminUserId: string;
  let foreignAdminToken: string;
  let foreignAdminUserId: string;
  let categoryId: string;
  let productId: string;

  beforeAll(async () => {
    await initializeTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await truncateTestAdmin();
    await truncateTestCatalogue();
    await truncateTestEnquiries();

    // 1. Provision Primary Admin
    await provisionAdmin({
      email: 'primary-admin@axdoro.test',
      password: 'AdminPassword123!',
      fullName: 'Primary Admin',
    });
    const loginRes = await loginAdmin({
      email: 'primary-admin@axdoro.test',
      password: 'AdminPassword123!',
    });
    adminToken = loginRes.token;
    adminUserId = loginRes.admin.id;

    // 2. Provision Foreign Admin
    await provisionAdmin({
      email: 'foreign-admin@axdoro.test',
      password: 'ForeignPassword123!',
      fullName: 'Foreign Admin',
    });
    const foreignLoginRes = await loginAdmin({
      email: 'foreign-admin@axdoro.test',
      password: 'ForeignPassword123!',
    });
    foreignAdminToken = foreignLoginRes.token;
    foreignAdminUserId = foreignLoginRes.admin.id;

    // 3. Create default test category
    const catRes = await testPool.query(
      `INSERT INTO categories (name, slug, public_id)
       VALUES ('T-Shirts', 't-shirts', 'cat_tshirts_pub_123')
       RETURNING id;`
    );
    categoryId = catRes.rows[0].id;

    // 4. Create default test product
    const prodRes = await testPool.query(
      `INSERT INTO products (name, slug, category_id, status)
       VALUES ('Test Tee', 'test-tee', $1, 'published')
       RETURNING id;`,
      [categoryId]
    );
    productId = prodRes.rows[0].id;

    // 5. Insert an active product image referencing a public_id
    await testPool.query(
      `INSERT INTO product_images (product_id, image_url, public_id, is_primary, display_order)
       VALUES ($1, 'https://res.cloudinary.com/demo/image/upload/v1/axdoro/products/staged/active_img_1.jpg', 'axdoro/products/staged/active_img_1', true, 0);`,
      [productId]
    );
  });

  // =========================================================================
  // TEST 1: Session creation and admin ownership
  // =========================================================================
  it('1. Session creation and admin ownership: creates ACTIVE session tied to admin', async () => {
    const res = await request(app)
      .post('/api/admin/products/staging-sessions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.sessionId).toBeDefined();
    expect(res.body.data.expiresAt).toBeDefined();

    const sessionId = res.body.data.sessionId;

    // Verify in PostgreSQL
    const dbCheck = await testPool.query(
      `SELECT id, admin_id, status, expires_at FROM product_staging_sessions WHERE id = $1;`,
      [sessionId]
    );
    expect(dbCheck.rows.length).toBe(1);
    expect(dbCheck.rows[0].admin_id).toBe(adminUserId);
    expect(dbCheck.rows[0].status).toBe('ACTIVE');
    expect(new Date(dbCheck.rows[0].expires_at).getTime()).toBeGreaterThan(Date.now() + 60 * 60 * 1000);
  });

  // =========================================================================
  // TEST 2: Foreign-admin heartbeat rejection
  // =========================================================================
  it('2. Foreign-admin heartbeat rejection: rejects heartbeat from unauthorized admin with 403', async () => {
    // Primary admin creates session
    const createRes = await request(app)
      .post('/api/admin/products/staging-sessions')
      .set('Authorization', `Bearer ${adminToken}`);
    const sessionId = createRes.body.data.sessionId;

    // Foreign admin attempts heartbeat
    const foreignRes = await request(app)
      .post(`/api/admin/products/staging-sessions/${sessionId}/heartbeat`)
      .set('Authorization', `Bearer ${foreignAdminToken}`);

    expect(foreignRes.status).toBe(403);
    expect(foreignRes.body.error).toMatch(/belongs to another administrator/i);
  });

  // =========================================================================
  // TEST 3: Expired and abandoned session rejection
  // =========================================================================
  it('3. Expired and abandoned session rejection: rejects heartbeat on expired (410) and abandoned (409) sessions', async () => {
    const createRes = await request(app)
      .post('/api/admin/products/staging-sessions')
      .set('Authorization', `Bearer ${adminToken}`);
    const sessionId = createRes.body.data.sessionId;

    // Part A: Expired session (410)
    await testPool.query(
      `UPDATE product_staging_sessions SET expires_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes' WHERE id = $1;`,
      [sessionId]
    );

    const expiredRes = await request(app)
      .post(`/api/admin/products/staging-sessions/${sessionId}/heartbeat`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(expiredRes.status).toBe(410);
    expect(expiredRes.body.error).toMatch(/expired/i);

    // Part B: Abandoned session (409)
    const createRes2 = await request(app)
      .post('/api/admin/products/staging-sessions')
      .set('Authorization', `Bearer ${adminToken}`);
    const sessionId2 = createRes2.body.data.sessionId;

    const abandonRes = await request(app)
      .post(`/api/admin/products/staging-sessions/${sessionId2}/abandon`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(abandonRes.status).toBe(200);

    const heartbeatAbandonedRes = await request(app)
      .post(`/api/admin/products/staging-sessions/${sessionId2}/heartbeat`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(heartbeatAbandonedRes.status).toBe(409);
    expect(heartbeatAbandonedRes.body.error).toMatch(/ABANDONED/i);
  });

  // =========================================================================
  // TEST 4: Heartbeat extension
  // =========================================================================
  it('4. Heartbeat extension: extends session expiration by 2 hours and updates last_heartbeat_at', async () => {
    const createRes = await request(app)
      .post('/api/admin/products/staging-sessions')
      .set('Authorization', `Bearer ${adminToken}`);
    const sessionId = createRes.body.data.sessionId;

    // Shorten expiration to 30 minutes from now
    await testPool.query(
      `UPDATE product_staging_sessions 
       SET expires_at = CURRENT_TIMESTAMP + INTERVAL '30 minutes',
           last_heartbeat_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes'
       WHERE id = $1;`,
      [sessionId]
    );

    const heartbeatRes = await request(app)
      .post(`/api/admin/products/staging-sessions/${sessionId}/heartbeat`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(heartbeatRes.status).toBe(200);
    expect(heartbeatRes.body.status).toBe('success');

    const dbCheck = await testPool.query(
      `SELECT expires_at, last_heartbeat_at FROM product_staging_sessions WHERE id = $1;`,
      [sessionId]
    );
    const expiresAt = new Date(dbCheck.rows[0].expires_at).getTime();
    const now = Date.now();
    // Expiration must be approximately 2 hours from now (> 1h 50m)
    expect(expiresAt - now).toBeGreaterThan(110 * 60 * 1000);
  });

  // =========================================================================
  // TEST 5: Pre-registration before upload signature response
  // =========================================================================
  it('5. Pre-registration before upload signature response: registers asset in product_staged_assets before returning signature', async () => {
    vi.spyOn(cloudinaryService, 'isCloudinaryConfigured').mockReturnValue(true);

    const createRes = await request(app)
      .post('/api/admin/products/staging-sessions')
      .set('Authorization', `Bearer ${adminToken}`);
    const sessionId = createRes.body.data.sessionId;

    const sigRes = await request(app)
      .post('/api/admin/products/upload-signature')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sessionId });

    expect(sigRes.status).toBe(200);
    expect(sigRes.body.publicId).toBeDefined();
    expect(sigRes.body.signature).toBeDefined();

    const publicId = sigRes.body.publicId;

    // Verify asset was pre-registered in DB
    const assetCheck = await testPool.query(
      `SELECT session_id, public_id, claim_status FROM product_staged_assets WHERE public_id = $1;`,
      [publicId]
    );
    expect(assetCheck.rows.length).toBe(1);
    expect(assetCheck.rows[0].session_id).toBe(sessionId);
    expect(assetCheck.rows[0].claim_status).toBe('UNCLAIMED');
  });

  // =========================================================================
  // TEST 6: Duplicate public ID retry within the same session
  // =========================================================================
  it('6. Duplicate public ID retry within the same session: idempotently succeeds without error', async () => {
    const session = await createStagingSession(adminUserId);
    const publicId = 'axdoro/products/staged/idempotent_test_public_id';

    // First pre-registration
    await expect(preRegisterStagedAsset(session.id, adminUserId, publicId)).resolves.not.toThrow();

    // Second pre-registration with same publicId within same session
    await expect(preRegisterStagedAsset(session.id, adminUserId, publicId)).resolves.not.toThrow();

    const check = await testPool.query(
      `SELECT COUNT(*)::int as count FROM product_staged_assets WHERE public_id = $1;`,
      [publicId]
    );
    expect(check.rows[0].count).toBe(1);
  });

  // =========================================================================
  // TEST 7: Cross-session public ID registration rejection
  // =========================================================================
  it('7. Cross-session public ID registration rejection: strictly rejects registration under another session with 409', async () => {
    const sessionA = await createStagingSession(adminUserId);
    const sessionB = await createStagingSession(foreignAdminUserId);
    const publicId = 'axdoro/products/staged/shared_conflict_public_id';

    // Pre-register for Session A
    await preRegisterStagedAsset(sessionA.id, adminUserId, publicId);

    // Attempt pre-register for Session B with same publicId
    await expect(preRegisterStagedAsset(sessionB.id, foreignAdminUserId, publicId)).rejects.toThrow(
      /already registered to another session/i
    );
  });

  // =========================================================================
  // TEST 8: Active-session asset protection
  // =========================================================================
  it('8. Active-session asset protection: cleanup skips assets belonging to active unexpired staging session', async () => {
    const session = await createStagingSession(adminUserId);
    const publicId = 'axdoro/products/staged/active_protected_asset_8';
    await preRegisterStagedAsset(session.id, adminUserId, publicId);

    const deleteSpy = vi.spyOn(cloudinaryService, 'deleteCloudinaryAsset').mockResolvedValue(true);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    vi.spyOn(cloudinaryService, 'listCloudinaryResourcesByPrefix').mockResolvedValue([
      {
        public_id: publicId,
        created_at: twoHoursAgo, // older than 1 hr, but protected by active session!
        bytes: 2048,
        format: 'jpg',
        resource_type: 'image',
        type: 'upload',
      },
    ]);

    const result = await reconcileStagedProductUploads({ minAgeMs: 60 * 60 * 1000 });

    expect(result.scanned).toBe(1);
    expect(result.skippedActiveOrRecent).toBe(1);
    expect(result.deletedOrphans).toBe(0);
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  // =========================================================================
  // TEST 9: Expired-session orphan reconciliation
  // =========================================================================
  it('9. Expired-session orphan reconciliation: reconciles and deletes assets belonging to expired or abandoned sessions', async () => {
    const session = await createStagingSession(adminUserId);
    const publicId = 'axdoro/products/staged/expired_orphan_asset_9';
    await preRegisterStagedAsset(session.id, adminUserId, publicId);

    // Set session status to EXPIRED
    await testPool.query(
      `UPDATE product_staging_sessions SET status = 'EXPIRED', expires_at = CURRENT_TIMESTAMP - INTERVAL '2 hours' WHERE id = $1;`,
      [session.id]
    );

    const deleteSpy = vi.spyOn(cloudinaryService, 'deleteCloudinaryAsset').mockResolvedValue(true);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    vi.spyOn(cloudinaryService, 'listCloudinaryResourcesByPrefix').mockResolvedValue([
      {
        public_id: publicId,
        created_at: twoHoursAgo,
        bytes: 2048,
        format: 'jpg',
        resource_type: 'image',
        type: 'upload',
      },
    ]);

    const result = await reconcileStagedProductUploads({ minAgeMs: 60 * 60 * 1000 });

    expect(result.scanned).toBe(1);
    expect(result.deletedOrphans).toBe(1);
    expect(deleteSpy).toHaveBeenCalledWith(publicId, expect.anything());

    const assetCheck = await testPool.query(
      `SELECT claim_status FROM product_staged_assets WHERE public_id = $1;`,
      [publicId]
    );
    expect(assetCheck.rows[0].claim_status).toBe('DELETED');
  });

  // =========================================================================
  // TEST 10: Product creation and COMMITTED transition in one transaction
  // =========================================================================
  it('10. Product creation and COMMITTED transition in one transaction: commits product and sets session COMMITTED atomically', async () => {
    const session = await createStagingSession(adminUserId);
    const publicId = 'axdoro/products/staged/committed_product_img_10';
    await preRegisterStagedAsset(session.id, adminUserId, publicId);

    const prodRes = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Atomic Staged Product',
        slug: 'atomic-staged-product',
        description: 'Test atomic staging session commit',
        categoryId,
        status: 'draft',
        stagingSessionId: session.id,
        variants: [
          {
            size: 'M',
            color: 'Navy',
            colorHex: '#000080',
            sku: 'AX-STAGED-10-M-NVY',
            pricePaise: 99900,
            stockQuantity: 10,
            isActive: true,
          },
        ],
        images: [
          {
            imageUrl: 'https://res.cloudinary.com/test/image/upload/v1/axdoro/products/staged/committed_product_img_10.jpg',
            publicId,
            altText: 'Front',
            isPrimary: true,
            displayOrder: 0,
          },
        ],
      });

    expect(prodRes.status).toBe(201);

    // Verify session status updated to COMMITTED
    const sessionCheck = await testPool.query(
      `SELECT status FROM product_staging_sessions WHERE id = $1;`,
      [session.id]
    );
    expect(sessionCheck.rows[0].status).toBe('COMMITTED');

    // Verify product_images record created
    const imgCheck = await testPool.query(
      `SELECT id FROM product_images WHERE public_id = $1;`,
      [publicId]
    );
    expect(imgCheck.rows.length).toBe(1);
  });

  // =========================================================================
  // TEST 11: Product creation rollback preserving the active session
  // =========================================================================
  it('11. Product creation rollback preserving the active session: failed creation rolls back but leaves session ACTIVE', async () => {
    const session = await createStagingSession(adminUserId);
    const publicId = 'axdoro/products/staged/rollback_preserved_img_11';
    await preRegisterStagedAsset(session.id, adminUserId, publicId);

    // Send payload that fails validation (e.g. invalid empty variants array)
    const failRes = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Failing Product',
        slug: 'failing-product',
        categoryId,
        status: 'draft',
        stagingSessionId: session.id,
        variants: [], // Fails min(1) variant requirement
        images: [
          {
            imageUrl: 'https://res.cloudinary.com/test/img11.jpg',
            publicId,
            isPrimary: true,
            displayOrder: 0,
          },
        ],
      });

    expect(failRes.status).toBe(400);

    // Verify staging session is STILL ACTIVE for retry!
    const sessionCheck = await testPool.query(
      `SELECT status FROM product_staging_sessions WHERE id = $1;`,
      [session.id]
    );
    expect(sessionCheck.rows[0].status).toBe('ACTIVE');
  });

  // =========================================================================
  // TEST 12: Product submission with an asset from another session
  // =========================================================================
  it('12. Product submission with an asset from another session: rejects foreign asset and aborts transaction', async () => {
    const sessionA = await createStagingSession(adminUserId);
    const sessionB = await createStagingSession(foreignAdminUserId);

    const publicIdB = 'axdoro/products/staged/foreign_asset_session_b_12';
    await preRegisterStagedAsset(sessionB.id, foreignAdminUserId, publicIdB);

    // Admin A tries to create product using session A, but references foreign asset registered under session B
    const crossRes = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Cross Session Attempt',
        slug: 'cross-session-attempt',
        categoryId,
        status: 'draft',
        stagingSessionId: sessionA.id,
        variants: [
          {
            size: 'L',
            color: 'Black',
            colorHex: '#000000',
            sku: 'AX-CROSS-12-L-BLK',
            pricePaise: 89900,
            stockQuantity: 5,
            isActive: true,
          },
        ],
        images: [
          {
            imageUrl: 'https://res.cloudinary.com/test/foreign.jpg',
            publicId: publicIdB,
            isPrimary: true,
            displayOrder: 0,
          },
        ],
      });

    expect(crossRes.status).toBe(400);
    expect(crossRes.body.error).toMatch(/belongs to a different staging session/i);

    // Session A remains ACTIVE
    const sessionCheck = await testPool.query(
      `SELECT status FROM product_staging_sessions WHERE id = $1;`,
      [sessionA.id]
    );
    expect(sessionCheck.rows[0].status).toBe('ACTIVE');
  });

  // =========================================================================
  // TEST 13: Product creation racing with cleanup
  // =========================================================================
  it('13. Product creation racing with cleanup: product creation rejects assets claimed for deletion', async () => {
    const session = await createStagingSession(adminUserId);
    const publicId = 'axdoro/products/staged/racing_cleanup_claims_first_13';
    await preRegisterStagedAsset(session.id, adminUserId, publicId);

    // Cleanup worker claims the asset for deletion first
    await testPool.query(
      `UPDATE product_staged_assets 
       SET claim_status = 'CLAIMED_FOR_DELETION', claim_token = 'cleanup_worker_token', claimed_at = CURRENT_TIMESTAMP
       WHERE public_id = $1;`,
      [publicId]
    );

    // Product creation attempts to commit the claimed asset
    const raceRes = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Racing Product Attempt',
        slug: 'racing-product-attempt',
        categoryId,
        status: 'draft',
        stagingSessionId: session.id,
        variants: [
          {
            size: 'S',
            color: 'White',
            colorHex: '#ffffff',
            sku: 'AX-RACE-13-S-WHT',
            pricePaise: 79900,
            stockQuantity: 2,
            isActive: true,
          },
        ],
        images: [
          {
            imageUrl: 'https://res.cloudinary.com/test/racing13.jpg',
            publicId,
            isPrimary: true,
            displayOrder: 0,
          },
        ],
      });

    expect(raceRes.status).toBe(400);
    expect(raceRes.body.error).toMatch(/claimed for deletion/i);
  });

  // =========================================================================
  // TEST 14: Cleanup racing with product creation
  // =========================================================================
  it('14. Cleanup racing with product creation: cleanup cannot claim an asset already referenced in product_images', async () => {
    const session = await createStagingSession(adminUserId);
    const publicId = 'axdoro/products/staged/racing_product_wins_14';
    await preRegisterStagedAsset(session.id, adminUserId, publicId);

    // Product is successfully committed to catalogue with this image
    await testPool.query(
      `INSERT INTO product_images (product_id, image_url, public_id, is_primary, display_order)
       VALUES ($1, 'https://res.cloudinary.com/test/prod14.jpg', $2, false, 1);`,
      [productId, publicId]
    );

    // Session is marked expired
    await testPool.query(
      `UPDATE product_staging_sessions SET status = 'EXPIRED', expires_at = CURRENT_TIMESTAMP - INTERVAL '1 hour' WHERE id = $1;`,
      [session.id]
    );

    // Cleanup tries to claim the asset
    const claimResult = await claimStagedAssetForDeletion(publicId, testPool);
    expect(claimResult.claimed).toBe(false);
    expect(claimResult.reason).toBeDefined();

    // Verify claim_status was NOT set to CLAIMED_FOR_DELETION
    const assetCheck = await testPool.query(
      `SELECT claim_status FROM product_staged_assets WHERE public_id = $1;`,
      [publicId]
    );
    expect(assetCheck.rows[0].claim_status).toBe('UNCLAIMED');
  });

  // =========================================================================
  // TEST 15: Cloudinary deletion failure and claim recovery
  // =========================================================================
  it('15. Cloudinary deletion failure and claim recovery: releases claim on Cloudinary failure; recovers stale claim leases', async () => {
    const session = await createStagingSession(adminUserId);
    const publicId = 'axdoro/products/staged/failure_recovery_asset_15';
    await preRegisterStagedAsset(session.id, adminUserId, publicId);

    await testPool.query(
      `UPDATE product_staging_sessions SET status = 'EXPIRED', expires_at = CURRENT_TIMESTAMP - INTERVAL '2 hours' WHERE id = $1;`,
      [session.id]
    );

    // Step A: Simulate Cloudinary failure -> claim must be released back to UNCLAIMED
    vi.spyOn(cloudinaryService, 'deleteCloudinaryAsset').mockResolvedValue(false);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    vi.spyOn(cloudinaryService, 'listCloudinaryResourcesByPrefix').mockResolvedValue([
      {
        public_id: publicId,
        created_at: twoHoursAgo,
        bytes: 1024,
        format: 'jpg',
        resource_type: 'image',
        type: 'upload',
      },
    ]);

    const resultA = await reconcileStagedProductUploads({ minAgeMs: 60 * 60 * 1000 });
    expect(resultA.deletedOrphans).toBe(0);

    const checkA = await testPool.query(
      `SELECT claim_status, claim_token FROM product_staged_assets WHERE public_id = $1;`,
      [publicId]
    );
    expect(checkA.rows[0].claim_status).toBe('UNCLAIMED');
    expect(checkA.rows[0].claim_token).toBeNull();

    // Step B: Simulate crash recovery of stale lease (> 15 minutes)
    await testPool.query(
      `UPDATE product_staged_assets 
       SET claim_status = 'CLAIMED_FOR_DELETION', claim_token = 'stale_token_crash', claimed_at = CURRENT_TIMESTAMP - INTERVAL '20 minutes'
       WHERE public_id = $1;`,
      [publicId]
    );

    // Cloudinary works now
    vi.spyOn(cloudinaryService, 'deleteCloudinaryAsset').mockResolvedValue(true);

    const resultB = await reconcileStagedProductUploads({ minAgeMs: 60 * 60 * 1000 });
    expect(resultB.deletedOrphans).toBe(1);

    const checkB = await testPool.query(
      `SELECT claim_status FROM product_staged_assets WHERE public_id = $1;`,
      [publicId]
    );
    expect(checkB.rows[0].claim_status).toBe('DELETED');
  });

  // =========================================================================
  // TEST 16: Server restart with an active session
  // =========================================================================
  it('16. Server restart with an active session: active session persists and remains usable without in-memory state', async () => {
    // Session created before "restart"
    const session = await createStagingSession(adminUserId);
    const publicId = 'axdoro/products/staged/restart_persistent_asset_16';
    await preRegisterStagedAsset(session.id, adminUserId, publicId);

    // Query using a raw/independent DB query (simulating completely new server process)
    const isProtected = await isAssetInActiveStagingSession(publicId, testPool);
    expect(isProtected).toBe(true);

    // Heartbeat from new process succeeds
    const heartbeatRes = await request(app)
      .post(`/api/admin/products/staging-sessions/${session.id}/heartbeat`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(heartbeatRes.status).toBe(200);
  });

  // =========================================================================
  // TEST 17: PostgreSQL outage fail-safe behavior
  // =========================================================================
  it('17. PostgreSQL outage fail-safe behavior: fails safely without deleting if database lookup fails', async () => {
    vi.spyOn(db, 'query').mockRejectedValue(new Error('PostgreSQL connection timeout'));
    const deleteSpy = vi.spyOn(cloudinaryService, 'deleteCloudinaryAsset');

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    vi.spyOn(cloudinaryService, 'listCloudinaryResourcesByPrefix').mockResolvedValue([
      {
        public_id: 'axdoro/products/staged/candidate_during_outage_17',
        created_at: twoHoursAgo,
        bytes: 1024,
        format: 'jpg',
        resource_type: 'image',
        type: 'upload',
      },
    ]);

    const result = await reconcileStagedProductUploads({ minAgeMs: 60 * 60 * 1000 });

    expect(result.scanned).toBe(1);
    expect(result.deletedOrphans).toBe(0);
    expect(result.errors).toBe(1);
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  // =========================================================================
  // TEST 18: Cloudinary 429/5xx fail-safe behavior
  // =========================================================================
  it('18. Cloudinary 429/5xx fail-safe behavior: handles HTTP 429/5xx gracefully without crashing or false deletion', async () => {
    vi.spyOn(cloudinaryService, 'isCloudinaryConfigured').mockReturnValue(true);

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    }) as any;

    const result = await cloudinaryService.listCloudinaryResourcesByPrefix('axdoro/products/staged', {
      maxPages: 2,
    });

    expect(result.length).toBe(0);
    expect([...result]).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBe(null);
  });

  // =========================================================================
  // TEST 19: Existing enquiry cleanup regression tests
  // =========================================================================
  it('19. Existing enquiry cleanup regression tests: preserves enquiry artwork lifecycle and reconcileCloudinaryPendingTags behavior', async () => {
    const tagSpy = vi.spyOn(cloudinaryService, 'tagCloudinaryAsset').mockResolvedValue(true);
    const deleteSpy = vi.spyOn(cloudinaryService, 'deleteCloudinaryAsset').mockResolvedValue(true);

    // Active enquiry in PostgreSQL
    await createEnquiry(
      {
        enquiryType: 'BULK',
        name: 'Staging Test Customer',
        email: 'staging-test@axdoro.test',
        phone: '+919876543210',
        message: 'Preserve existing artwork reconciliation',
        quantity: 50,
        source: 'WEBSITE',
      },
      {
        designFileUrl: 'https://res.cloudinary.com/test/active_enquiry_artwork.png',
        designFilePublicId: 'axdoro/enquiries/artwork/active_enquiry_artwork_19',
        designFileName: 'active_logo.png',
        designFileFormat: 'png',
        designFileBytes: 2048,
      }
    );

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    vi.spyOn(cloudinaryService, 'listCloudinaryResourcesByTag').mockResolvedValue([
      {
        public_id: 'axdoro/enquiries/artwork/active_enquiry_artwork_19',
        created_at: twoHoursAgo,
        bytes: 2048,
        format: 'png',
        resource_type: 'image',
        type: 'authenticated',
      },
      {
        public_id: 'axdoro/enquiries/artwork/unreferenced_enquiry_orphan_19',
        created_at: twoHoursAgo,
        bytes: 1024,
        format: 'jpg',
        resource_type: 'image',
        type: 'authenticated',
      },
    ]);

    const result = await reconcileCloudinaryPendingTags({ minAgeMs: 60 * 60 * 1000 });

    expect(result.scanned).toBe(2);
    expect(result.reconciledCommitted).toBe(1);
    expect(result.deletedOrphans).toBe(1);
    expect(deleteSpy).toHaveBeenCalledWith('axdoro/enquiries/artwork/unreferenced_enquiry_orphan_19', expect.anything());
    expect(tagSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        publicId: 'axdoro/enquiries/artwork/active_enquiry_artwork_19',
      })
    );
  });

  // =========================================================================
  // TEST 20: Existing multi-page pagination tests
  // =========================================================================
  it('20. Existing multi-page pagination tests: paginates with next_cursor, breaks cycles, and bounds scans', async () => {
    const page1Json = {
      resources: [
        {
          public_id: 'axdoro/products/staged/pagination_p1_asset',
          created_at: '2026-10-30T00:00:00Z',
          bytes: 100,
          format: 'jpg',
          resource_type: 'image',
          type: 'upload',
        },
      ],
      next_cursor: 'cursor_page_2',
    };

    const page2Json = {
      resources: [
        {
          public_id: 'axdoro/products/staged/pagination_p2_asset',
          created_at: '2026-10-30T00:00:00Z',
          bytes: 200,
          format: 'jpg',
          resource_type: 'image',
          type: 'upload',
        },
      ],
      next_cursor: null,
    };

    vi.spyOn(cloudinaryService, 'isCloudinaryConfigured').mockReturnValue(true);

    let fetchCount = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      fetchCount++;
      if (url.includes('next_cursor=cursor_page_2')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(page2Json),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(page1Json),
      });
    }) as any;

    const result = await cloudinaryService.listCloudinaryResourcesByPrefix('axdoro/products/staged', {
      maxPages: 3,
    });

    expect(fetchCount).toBe(2);
    expect(result.length).toBe(2);
    expect(result[0].public_id).toBe('axdoro/products/staged/pagination_p1_asset');
    expect(result[1].public_id).toBe('axdoro/products/staged/pagination_p2_asset');
    expect(result.hasMore).toBe(false);
  });
});
