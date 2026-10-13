import crypto from 'crypto';
import pg from 'pg';
import { withTransaction, query } from '../config/db.js';
import { EnquiryCreateInput, EnquiryQueryInput } from '../schemas/enquiries.js';

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
  createdAt: string;
  updatedAt: string;
}

/**
 * Creates an enquiry in PostgreSQL first, ensuring durable local storage,
 * and enqueues a drive_sync_jobs record.
 */
export async function createEnquiry(input: EnquiryCreateInput): Promise<EnquiryRecord> {
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
        source, drive_sync_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'PENDING')
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
}): string {
  const phone = '919941816815'; // AXDORO primary business WhatsApp
  let text = `Hello AXDORO Team! I submitted an enquiry on your website.\n`;
  text += `Name: ${enquiry.name}\n`;
  text += `Type: ${enquiry.enquiryType}\n`;
  if (enquiry.productName) text += `Product: ${enquiry.productName}\n`;
  if (enquiry.quantity) text += `Quantity: ${enquiry.quantity} units\n`;
  if (enquiry.message) text += `Details: ${enquiry.message.slice(0, 150)}\n`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
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
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : '',
  };
}
