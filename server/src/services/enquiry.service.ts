import crypto from 'crypto';
import pg from 'pg';
import { withTransaction, query } from '../config/db.js';
import { UUID_REGEX, EnquiryCreateInput, EnquiryQueryInput, ArtworkMetadataInput } from '../schemas/enquiries.js';
import { AdminUserDTO } from './admin-auth.service.js';
import { createAuditLog } from './audit-log.service.js';
import { deleteCloudinaryAsset } from './cloudinary.service.js';
import { enqueueCleanupJob, processSingleCleanupJob } from './cloudinary-cleanup.service.js';

export interface EnquiryRecord {
  id: string;
  enquiryType: 'GENERAL' | 'BULK';
  name: string;
  email: string;
  phone: string;
  message: string;
  productId: string | null;
  productName: string | null;
  quantity: number | null;
  sizeBreakdown: string | null;
  targetDate: string | null;
  organization: string | null;
  source: 'WEBSITE' | 'INSTAGRAM' | 'WHATSAPP' | 'GOOGLE' | 'OTHER';
  driveSyncStatus: 'PENDING' | 'SYNCED' | 'FAILED';
  driveSyncedAt: string | null;
  driveSyncError: string | null;
  hasArtwork: boolean;
  designFileUrl: string | null;
  designFilePublicId: string | null;
  designFileName: string | null;
  designFileFormat: string | null;
  designFileBytes: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Creates an enquiry in PostgreSQL first, ensuring durable local storage,
 * and enqueues a drive_sync_jobs record.
 */
export async function createEnquiry(
  input: EnquiryCreateInput,
  artwork?: ArtworkMetadataInput
): Promise<EnquiryRecord> {
  return await withTransaction(async (client) => {
    let productName: string | null = null;
    if (input.productId) {
      const prodRes = await client.query<{ name: string }>(
        'SELECT name FROM products WHERE id = $1',
        [input.productId]
      );
      if (prodRes.rows.length > 0) {
        productName = prodRes.rows[0].name;
      }
    }

    const insertRes = await client.query<any>(
      `INSERT INTO enquiries (
        enquiry_type, name, email, phone, message,
        product_id, product_name, quantity, size_breakdown, target_date, organization,
        source, drive_sync_status,
        design_file_url, design_file_public_id, design_file_name, design_file_format, design_file_bytes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'PENDING', $13, $14, $15, $16, $17)
      RETURNING *;`,
      [
        input.enquiryType,
        input.name,
        input.email,
        input.phone,
        input.message,
        input.productId || null,
        productName,
        input.quantity || null,
        input.sizeBreakdown || null,
        input.targetDate || null,
        input.organization || null,
        input.source,
        artwork?.designFileUrl || null,
        artwork?.designFilePublicId || null,
        artwork?.designFileName || null,
        artwork?.designFileFormat || null,
        artwork?.designFileBytes || null,
      ]
    );

    const enquiry = insertRes.rows[0];

    // Enqueue a drive sync job
    const idempotencyKey = `sync-enquiry-${enquiry.id}`;
    await client.query(
      `INSERT INTO drive_sync_jobs (enquiry_id, status, idempotency_key)
       VALUES ($1, 'PENDING', $2)
       ON CONFLICT (idempotency_key) DO NOTHING;`,
      [enquiry.id, idempotencyKey]
    );

    return mapEnquiryRow(enquiry);
  });
}

/**
 * Retrieves a single enquiry record by ID.
 */
export async function getEnquiryById(id: string): Promise<EnquiryRecord | null> {
  if (!UUID_REGEX.test(id)) return null;
  const res = await query<any>('SELECT * FROM enquiries WHERE id = $1;', [id]);
  if (res.rows.length === 0) return null;
  return mapEnquiryRow(res.rows[0]);
}

/**
 * Lists enquiries with filtering and pagination.
 */
export async function listEnquiries(params: EnquiryQueryInput): Promise<{
  enquiries: EnquiryRecord[];
  totalCount: number;
  totalPages: number;
}> {
  const page = Math.max(params.page, 1);
  const limit = Math.min(Math.max(params.limit, 1), 100);
  const offset = (page - 1) * limit;

  const whereClauses: string[] = [];
  const queryParams: unknown[] = [];

  if (params.enquiryType) {
    queryParams.push(params.enquiryType);
    whereClauses.push(`enquiry_type = $${queryParams.length}`);
  }

  if (params.source) {
    queryParams.push(params.source);
    whereClauses.push(`source = $${queryParams.length}`);
  }

  if (params.syncStatus) {
    queryParams.push(params.syncStatus);
    whereClauses.push(`drive_sync_status = $${queryParams.length}`);
  }

  if (params.startDate) {
    queryParams.push(params.startDate);
    whereClauses.push(`created_at >= $${queryParams.length}`);
  }

  if (params.endDate) {
    queryParams.push(params.endDate);
    whereClauses.push(`created_at <= $${queryParams.length}`);
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const countRes = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM enquiries ${whereSql}`,
    queryParams
  );
  const totalCount = parseInt(countRes.rows[0]?.count || '0', 10);
  const totalPages = Math.ceil(totalCount / limit) || 1;

  const dataParams = [...queryParams, limit, offset];
  const listSql = `
    SELECT * FROM enquiries
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length};
  `;

  const listRes = await query<any>(listSql, dataParams);
  const enquiries = listRes.rows.map(mapEnquiryRow);

  return { enquiries, totalCount, totalPages };
}

/**
 * Sanitizes a field against Spreadsheet Formula Injection (CSV Injection).
 * Dangerous characters at the start of a cell: =, +, -, @, \t, \r
 */
export function sanitizeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str = String(value);

  // Strip leading whitespace to detect hidden prefixes
  const trimmed = str.trimStart();
  const dangerousChars = ['=', '+', '-', '@', '\t', '\r'];
  if (trimmed.length > 0 && dangerousChars.includes(trimmed[0])) {
    // Prepend single quote (') so spreadsheets treat it strictly as text
    str = `'${str}`;
  }

  // Escape existing double quotes
  const escaped = str.replace(/"/g, '""');

  // Wrap in quotes if it contains commas, newlines, carriage returns, or quotes
  if (escaped.includes(',') || escaped.includes('\n') || escaped.includes('\r') || escaped.includes('"')) {
    return `"${escaped}"`;
  }

  return escaped;
}

/**
 * Exports filtered enquiries to a formula-safe CSV string.
 * Includes UTF-8 BOM (\uFEFF) for universal spreadsheet encoding support.
 * Appends Artwork Attachment info strictly without exposing raw external URLs.
 */
export async function exportEnquiriesCsv(params: Partial<EnquiryQueryInput>): Promise<string> {
  const { enquiries } = await listEnquiries({
    page: 1,
    limit: 5000, // Export up to 5000 entries
    ...params,
  });

  const headers = [
    'Enquiry ID',
    'Date Submitted',
    'Type',
    'Customer Name',
    'Email',
    'Phone',
    'Source',
    'Product',
    'Quantity',
    'Size Breakdown',
    'Target Date',
    'Organization',
    'Message',
    'Drive Sync Status',
    'Artwork Attachment',
  ];

  const rows = enquiries.map((e) => [
    sanitizeCsvField(e.id),
    sanitizeCsvField(e.createdAt),
    sanitizeCsvField(e.enquiryType),
    sanitizeCsvField(e.name),
    sanitizeCsvField(e.email),
    sanitizeCsvField(e.phone),
    sanitizeCsvField(e.source),
    sanitizeCsvField(e.productName || 'N/A'),
    sanitizeCsvField(e.quantity !== null ? e.quantity : ''),
    sanitizeCsvField(e.sizeBreakdown || ''),
    sanitizeCsvField(e.targetDate || ''),
    sanitizeCsvField(e.organization || ''),
    sanitizeCsvField(e.message),
    sanitizeCsvField(e.driveSyncStatus),
    sanitizeCsvField(
      e.hasArtwork
        ? `Yes (${e.designFileName || 'artwork'}, ${e.designFileBytes ? (e.designFileBytes / 1024).toFixed(1) + ' KB' : 'N/A'})`
        : 'None'
    ),
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  // Include UTF-8 Byte Order Mark
  return `\uFEFF${csvContent}`;
}

/**
 * Generates a safe, user-triggered WhatsApp sharing URL.
 */
export function generateWhatsAppShareUrl(enquiry: {
  enquiryType: string;
  name: string;
  quantity?: number | null;
  productName?: string | null;
  message?: string;
  hasArtwork?: boolean;
}): string {
  const phone = '919941816815'; // AXDORO primary business WhatsApp
  let text = `Hello AXDORO Team! I submitted an enquiry on your website.\n`;
  text += `Name: ${enquiry.name}\n`;
  text += `Type: ${enquiry.enquiryType}\n`;
  if (enquiry.productName) text += `Product: ${enquiry.productName}\n`;
  if (enquiry.quantity) text += `Quantity: ${enquiry.quantity} units\n`;
  if (enquiry.hasArtwork) text += `Custom Artwork: Uploaded\n`;
  if (enquiry.message) text += `Details: ${enquiry.message.slice(0, 150)}\n`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export interface DeleteEnquiryResult {
  status: 'success' | 'not_found' | 'conflict';
  message: string;
}

/**
 * Deterministically derives a 64-bit signed integer advisory lock key from an Enquiry UUID.
 */
export function getEnquirySyncAdvisoryLockKey(enquiryId: string): string {
  const hex = crypto.createHash('sha256').update(enquiryId).digest('hex').slice(0, 15);
  const bigInt = BigInt(`0x${hex}`);
  const signed64 = BigInt.asIntN(64, bigInt);
  return signed64.toString();
}

/**
 * Permanently deletes an enquiry and its associated drive_sync_jobs from PostgreSQL.
 * Executes external Cloudinary cleanup post-commit to guarantee database deletion
 * and immutable audit logging cannot be blocked by third-party outages.
 */
export async function adminDeleteEnquiry(
  id: string,
  actor: AdminUserDTO,
  ipAddress?: string
): Promise<DeleteEnquiryResult> {
  if (!UUID_REGEX.test(id)) {
    return { status: 'not_found', message: 'Invalid enquiry ID format' };
  }

  const result = await withTransaction(async (client) => {
    // 1. Acquire transaction-level advisory lock
    const lockKey = getEnquirySyncAdvisoryLockKey(id);
    const guardRes = await client.query<{ acquired: boolean }>(
      `SELECT pg_try_advisory_xact_lock($1::bigint) as acquired;`,
      [lockKey]
    );

    if (!guardRes.rows[0]?.acquired) {
      return {
        status: 'conflict' as const,
        message: 'Enquiry is currently synchronizing with Google Drive. Please retry after synchronization completes.',
        artworkPublicId: null,
      };
    }

    // 2. Lock associated drive_sync_jobs first to maintain deterministic lock ordering
    const syncJobRes = await client.query<{
      id: string;
      status: string;
      claimed_at: Date | null;
      claim_token: string | null;
    }>(
      `SELECT id, status, claimed_at, claim_token
       FROM drive_sync_jobs
       WHERE enquiry_id = $1
       FOR UPDATE;`,
      [id]
    );

    // 2. Lock enquiry row
    const enquiryRes = await client.query<{
      id: string;
      enquiry_type: string;
      name: string;
      email: string;
      source: string;
      drive_sync_status: string;
      created_at: Date;
      product_id: string | null;
      product_name: string | null;
      quantity: number | null;
      design_file_public_id: string | null;
    }>(
      `SELECT id, enquiry_type, name, email, source, drive_sync_status, created_at,
              product_id, product_name, quantity, design_file_public_id
       FROM enquiries
       WHERE id = $1
       FOR UPDATE;`,
      [id]
    );

    if (enquiryRes.rows.length === 0) {
      return { status: 'not_found' as const, message: 'Enquiry not found', artworkPublicId: null };
    }

    const enquiry = enquiryRes.rows[0];

    // 3. Concurrency check: verify if an active worker claim is currently in progress
    const hasActiveClaim = syncJobRes.rows.some((job) => {
      if (job.status !== 'PROCESSING') return false;
      if (!job.claimed_at) return false;
      const claimedTime = new Date(job.claimed_at).getTime();
      const leaseThreshold = Date.now() - 5 * 60 * 1000;
      return claimedTime >= leaseThreshold;
    });

    if (hasActiveClaim) {
      return {
        status: 'conflict' as const,
        message: 'Enquiry is currently synchronizing with Google Drive. Please retry after synchronization completes.',
        artworkPublicId: null,
      };
    }

    // 4. Record immutable audit log entry in the SAME transaction
    await createAuditLog({
      adminId: actor.id,
      adminEmail: actor.email,
      action: 'ENQUIRY_DELETE',
      entityType: 'enquiry',
      entityId: id,
      details: {
        enquiryId: enquiry.id,
        enquiryType: enquiry.enquiry_type,
        source: enquiry.source,
        driveSyncStatus: enquiry.drive_sync_status,
        enquiryCreatedAt: enquiry.created_at.toISOString(),
        deletedAt: new Date().toISOString(),
        hasProductReference: Boolean(enquiry.product_id || enquiry.product_name),
        hasBulkQuantity: Boolean(enquiry.quantity),
        hasArtwork: Boolean(enquiry.design_file_public_id),
      },
      ipAddress: ipAddress || null,
      client,
    });

    // 5. Enqueue durable Cloudinary cleanup job within the SAME transaction
    let cleanupJobId: string | null = null;
    if (enquiry.design_file_public_id) {
      cleanupJobId = await enqueueCleanupJob(client, {
        publicId: enquiry.design_file_public_id,
        assetType: 'authenticated',
        reason: 'ENQUIRY_DELETION',
      });
    }

    // 6. Permanently delete the enquiry (cascades to drive_sync_jobs)
    await client.query('DELETE FROM enquiries WHERE id = $1;', [id]);

    return {
      status: 'success' as const,
      message: 'Enquiry deleted successfully',
      cleanupJobId,
      artworkPublicId: enquiry.design_file_public_id,
    };
  });

  // 7. Post-Commit Durable Cloudinary Cleanup Execution
  // Executed outside the database transaction so third-party errors cannot rollback the deletion or audit trail
  if (result.status === 'success' && result.cleanupJobId) {
    try {
      await processSingleCleanupJob(result.cleanupJobId);
    } catch (cleanupErr: unknown) {
      // Non-fatal: the job remains stored as PENDING in cloudinary_cleanup_jobs for worker retry
      console.warn('[Cloudinary Post-Delete Immediate Execution Warning]', {
        cleanupJobId: result.cleanupJobId,
        error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
        timestamp: new Date().toISOString(),
      });
    }
  }

  return {
    status: result.status,
    message: result.message,
  };
}

function mapEnquiryRow(row: any): EnquiryRecord {
  return {
    id: row.id,
    enquiryType: row.enquiry_type,
    name: row.name,
    email: row.email,
    phone: row.phone,
    message: row.message,
    productId: row.product_id,
    productName: row.product_name,
    quantity: row.quantity,
    sizeBreakdown: row.size_breakdown,
    targetDate: row.target_date,
    organization: row.organization,
    source: row.source,
    driveSyncStatus: row.drive_sync_status,
    driveSyncedAt: row.drive_synced_at ? new Date(row.drive_synced_at).toISOString() : null,
    driveSyncError: row.drive_sync_error,
    hasArtwork: Boolean(row.design_file_public_id || row.design_file_url),
    designFileUrl: row.design_file_url || null,
    designFilePublicId: row.design_file_public_id || null,
    designFileName: row.design_file_name || null,
    designFileFormat: row.design_file_format || null,
    designFileBytes: row.design_file_bytes || null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : '',
  };
}
