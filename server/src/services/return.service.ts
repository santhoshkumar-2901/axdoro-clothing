import crypto from 'crypto';
import pg from 'pg';
import { withTransaction, query } from '../config/db.js';
import { ReturnCreateInput } from '../schemas/returns.js';
import {
  AdminReturnListQuery,
  AdminReturnStatusUpdatePayload,
  AdminReturnShippingPayload,
  AdminReturnInspectionPayload,
  AdminReturnRefundPayload,
} from '../schemas/admin-returns.js';
import { createAuditLog } from './audit-log.service.js';
import { enqueueCleanupJob, processSingleCleanupJob } from './cloudinary-cleanup.service.js';

export interface ReturnSubmissionResult {
  requestId: string;
  isDuplicate?: boolean;
}

export interface ReturnEvidenceItem {
  cloudinaryPublicId: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  format: 'jpg' | 'jpeg' | 'png' | 'webp';
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Generates a cryptographically secure, human-readable Return Request Reference.
 * Format: RET-YYYYMM-XXXXXX (e.g., RET-202611-A8B9C0)
 */
export function generateRequestNumber(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `RET-${year}${month}-${randomSuffix}`;
}

/**
 * Creates a return request record with background order matching and eligibility review metadata.
 */
export async function createReturnRequest(
  input: ReturnCreateInput,
  evidence?: ReturnEvidenceItem[]
): Promise<ReturnSubmissionResult> {
  const trimmedOrderId = input.orderId.trim();
  const trimmedPhone = input.phone.trim();
  const trimmedEmail = input.email.trim().toLowerCase();
  const trimmedDescription = input.description?.trim() || null;

  // 1. Duplicate submission check:
  const duplicateCheck = await query<{ request_number: string }>(
    `SELECT request_number
     FROM return_requests
     WHERE UPPER(TRIM(submitted_order_id)) = UPPER($1)
       AND customer_phone = $2
       AND customer_email = $3
       AND reason = $4
       AND created_at >= NOW() - INTERVAL '60 seconds'
     ORDER BY created_at DESC
     LIMIT 1`,
    [trimmedOrderId, trimmedPhone, trimmedEmail, input.reason]
  );

  if (duplicateCheck.rows.length > 0) {
    return {
      requestId: duplicateCheck.rows[0].request_number,
      isDuplicate: true,
    };
  }

  // 2. Strict 3-Field Order Matching
  const orderLookup = await query<{
    id: string;
    order_number: string;
    customer_phone: string;
    customer_email: string;
    delivered_at: Date | null;
    order_status: string;
  }>(
    `SELECT id, order_number, customer_phone, customer_email, delivered_at, order_status
     FROM orders
     WHERE UPPER(TRIM(order_number)) = UPPER($1)
     LIMIT 1`,
    [trimmedOrderId]
  );

  let matchedOrderId: string | null = null;
  let isOrderMatched = false;
  let deliveryDateRecorded: Date | null = null;
  let requiresDeliveryReview = true;
  let eligibilityFlag = 'PENDING_REVIEW';

  if (orderLookup.rows.length > 0) {
    const candidateOrder = orderLookup.rows[0];
    const candidatePhone = candidateOrder.customer_phone.trim();
    const candidateEmail = candidateOrder.customer_email.trim().toLowerCase();

    if (candidatePhone === trimmedPhone && candidateEmail === trimmedEmail) {
      matchedOrderId = candidateOrder.id;
      isOrderMatched = true;

      if (candidateOrder.delivered_at) {
        deliveryDateRecorded = candidateOrder.delivered_at;
        requiresDeliveryReview = false;

        const deliveredTime = new Date(candidateOrder.delivered_at).getTime();
        const nowTime = Date.now();
        const diffDays = (nowTime - deliveredTime) / (1000 * 60 * 60 * 24);

        if (diffDays <= 7) {
          eligibilityFlag = 'WITHIN_7_DAYS';
          requiresDeliveryReview = false;
        } else {
          eligibilityFlag = 'EXCEEDS_7_DAYS';
          requiresDeliveryReview = true;
        }
      } else {
        requiresDeliveryReview = true;
        eligibilityFlag = 'NO_DELIVERY_DATE';
      }
    } else {
      matchedOrderId = null;
      isOrderMatched = false;
      requiresDeliveryReview = true;
      eligibilityFlag = 'CUSTOMER_INFO_MISMATCH';
    }
  } else {
    matchedOrderId = null;
    isOrderMatched = false;
    requiresDeliveryReview = true;
    eligibilityFlag = 'ORDER_UNMATCHED';
  }

  // 3. Persist Return Request inside a database transaction
  return await withTransaction(async (client) => {
    let requestNumber = generateRequestNumber();
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 5) {
      attempts++;
      const existing = await client.query(
        'SELECT 1 FROM return_requests WHERE request_number = $1',
        [requestNumber]
      );
      if (existing.rows.length === 0) {
        isUnique = true;
      } else {
        requestNumber = generateRequestNumber();
      }
    }

    if (!isUnique) {
      throw new Error('Unable to generate unique return request reference. Please retry.');
    }

    const insertResult = await client.query<{ id: string; request_number: string }>(
      `INSERT INTO return_requests (
         request_number,
         submitted_order_id,
         customer_phone,
         customer_email,
         reason,
         description,
         matched_order_id,
         is_order_matched,
         delivery_date_recorded,
         requires_delivery_review,
         eligibility_flag,
         status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'REQUEST_SUBMITTED')
       RETURNING id, request_number`,
      [
        requestNumber,
        trimmedOrderId,
        trimmedPhone,
        trimmedEmail,
        input.reason,
        trimmedDescription,
        matchedOrderId,
        isOrderMatched,
        deliveryDateRecorded,
        requiresDeliveryReview,
        eligibilityFlag,
      ]
    );

    const createdRecord = insertResult.rows[0];

    // Audit trail in history table
    await client.query(
      `INSERT INTO return_request_history (
         return_request_id,
         previous_status,
         new_status,
         actor_type,
         notes
       ) VALUES ($1, NULL, 'REQUEST_SUBMITTED', 'CUSTOMER', 'Return request submitted via storefront')`,
      [createdRecord.id]
    );

    // Insert evidence items transactionally if provided
    if (evidence && evidence.length > 0) {
      for (const item of evidence) {
        await client.query(
          `INSERT INTO return_request_evidence (
             return_request_id,
             cloudinary_public_id,
             original_filename,
             mime_type,
             file_size_bytes,
             format
           ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            createdRecord.id,
            item.cloudinaryPublicId,
            item.originalFilename,
            item.mimeType,
            item.fileSizeBytes,
            item.format,
          ]
        );
      }
    }

    console.log(
      `[Return Request] Created reference: ${createdRecord.request_number}, matched: ${isOrderMatched}, flag: ${eligibilityFlag}, evidence: ${evidence ? evidence.length : 0}`
    );

    return {
      requestId: createdRecord.request_number,
    };
  });
}

// ---------------------------------------------------------------------------
// ADMIN RETURNS SERVICE IMPLEMENTATION (PHASE 4)
// ---------------------------------------------------------------------------

export interface AdminReturnListItem {
  id: string;
  requestNumber: string;
  submittedOrderId: string;
  customerPhone: string;
  customerEmail: string;
  customerName: string | null;
  reason: string;
  description: string | null;
  status: string;
  isOrderMatched: boolean;
  eligibilityFlag: string;
  evidenceCount: number;
  refundStatus: string;
  productReceivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminReturnsListResult {
  items: AdminReturnListItem[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
}

export interface AdminReturnDetail {
  id: string;
  requestNumber: string;
  submittedOrderId: string;
  customerPhone: string;
  customerEmail: string;
  reason: string;
  description: string | null;
  status: string;
  adminNotes: string | null;
  rejectionReason: string | null;
  isOrderMatched: boolean;
  eligibilityFlag: string;
  deliveryDateRecorded: string | null;
  requiresDeliveryReview: boolean;
  shipping: {
    shippingInstructions: string | null;
    returnCourierName: string | null;
    returnTrackingNumber: string | null;
    customerShippedAt: string | null;
    productReceivedAt: string | null;
  };
  inspection: {
    inspectionResult: string | null;
    inspectionNotes: string | null;
    inspectedAt: string | null;
    inspectedBy: string | null;
  };
  refund: {
    refundStatus: string;
    refundAmountPaise: number | null;
    refundMethod: string | null;
    refundReference: string | null;
    refundInitiatedAt: string | null;
    refundCompletedAt: string | null;
    refundNotes: string | null;
  };
  matchedOrder: {
    id: string;
    orderNumber: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    orderStatus: string;
    paymentMethod: string;
    paymentStatus: string;
    totalPaise: number;
    deliveredAt: string | null;
    createdAt: string;
    items: Array<{
      id: string;
      productName: string;
      variantSku: string | null;
      variantSize: string | null;
      variantColor: string | null;
      unitPricePaise: number;
      quantity: number;
      lineTotalPaise: number;
    }>;
  } | null;
  evidence: Array<{
    id: string;
    originalFilename: string;
    mimeType: string;
    fileSizeBytes: number;
    format: string;
    createdAt: string;
  }>;
  history: Array<{
    id: string;
    previousStatus: string | null;
    newStatus: string;
    actorType: string;
    actorId: string | null;
    notes: string | null;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Lists return requests with server-side pagination, search, status filtering, and date filtering.
 */
export async function listAdminReturns(
  filters: AdminReturnListQuery
): Promise<AdminReturnsListResult> {
  const { page, limit, status, search, fromDate, toDate } = filters;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (status && status !== 'ALL') {
    conditions.push(`r.status = $${paramIndex++}`);
    params.push(status);
  }

  if (search && search.trim().length > 0) {
    const searchPattern = `%${search.trim()}%`;
    conditions.push(
      `(r.request_number ILIKE $${paramIndex} OR r.submitted_order_id ILIKE $${paramIndex} OR r.customer_email ILIKE $${paramIndex} OR r.customer_phone ILIKE $${paramIndex})`
    );
    params.push(searchPattern);
    paramIndex++;
  }

  if (fromDate) {
    conditions.push(`r.created_at >= $${paramIndex++}`);
    params.push(fromDate);
  }

  if (toDate) {
    conditions.push(`r.created_at <= $${paramIndex++}`);
    params.push(toDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total records
  const countSql = `
    SELECT COUNT(r.id)::int as total
    FROM return_requests r
    ${whereClause}
  `;
  const countRes = await query<{ total: number }>(countSql, params);
  const totalCount = countRes.rows[0]?.total || 0;
  const totalPages = Math.ceil(totalCount / limit) || 1;

  // Retrieve paginated records with evidence count and matched customer name
  const listSql = `
    SELECT
      r.id,
      r.request_number,
      r.submitted_order_id,
      r.customer_phone,
      r.customer_email,
      o.customer_name,
      r.reason,
      r.description,
      r.status,
      r.is_order_matched,
      r.eligibility_flag,
      COALESCE(e.evidence_count, 0)::int as evidence_count,
      r.refund_status,
      r.product_received_at,
      r.created_at,
      r.updated_at
    FROM return_requests r
    LEFT JOIN orders o ON r.matched_order_id = o.id
    LEFT JOIN (
      SELECT return_request_id, COUNT(id) as evidence_count
      FROM return_request_evidence
      WHERE deleted_at IS NULL
      GROUP BY return_request_id
    ) e ON r.id = e.return_request_id
    ${whereClause}
    ORDER BY r.created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `;

  params.push(limit, offset);

  const listRes = await query<{
    id: string;
    request_number: string;
    submitted_order_id: string;
    customer_phone: string;
    customer_email: string;
    customer_name: string | null;
    reason: string;
    description: string | null;
    status: string;
    is_order_matched: boolean;
    eligibility_flag: string;
    evidence_count: number;
    refund_status: string;
    product_received_at: Date | null;
    created_at: Date;
    updated_at: Date;
  }>(listSql, params);

  const items: AdminReturnListItem[] = listRes.rows.map((row) => ({
    id: row.id,
    requestNumber: row.request_number,
    submittedOrderId: row.submitted_order_id,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    customerName: row.customer_name,
    reason: row.reason,
    description: row.description,
    status: row.status,
    isOrderMatched: row.is_order_matched,
    eligibilityFlag: row.eligibility_flag,
    evidenceCount: row.evidence_count,
    refundStatus: row.refund_status,
    productReceivedAt: row.product_received_at ? row.product_received_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }));

  return {
    items,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages,
    },
  };
}

/**
 * Returns triage metrics and pending count.
 */
export async function getAdminReturnMetrics(): Promise<{
  pendingReview: number;
  underReview: number;
  approved: number;
  rejected: number;
  completed: number;
  total: number;
}> {
  const res = await query<{
    pending_review: number;
    under_review: number;
    approved: number;
    rejected: number;
    completed: number;
    total: number;
  }>(`
    SELECT
      COUNT(id) FILTER (WHERE status = 'REQUEST_SUBMITTED')::int as pending_review,
      COUNT(id) FILTER (WHERE status = 'UNDER_REVIEW')::int as under_review,
      COUNT(id) FILTER (WHERE status = 'APPROVED')::int as approved,
      COUNT(id) FILTER (WHERE status = 'REJECTED')::int as rejected,
      COUNT(id) FILTER (WHERE status = 'COMPLETED')::int as completed,
      COUNT(id)::int as total
    FROM return_requests;
  `);

  const row = res.rows[0];
  return {
    pendingReview: row?.pending_review || 0,
    underReview: row?.under_review || 0,
    approved: row?.approved || 0,
    rejected: row?.rejected || 0,
    completed: row?.completed || 0,
    total: row?.total || 0,
  };
}

/**
 * Retrieves full details for a single return request.
 */
export async function getAdminReturnById(id: string): Promise<AdminReturnDetail | null> {
  if (!UUID_REGEX.test(id)) return null;

  const reqRes = await query<{
    id: string;
    request_number: string;
    submitted_order_id: string;
    customer_phone: string;
    customer_email: string;
    reason: string;
    description: string | null;
    status: string;
    admin_notes: string | null;
    rejection_reason: string | null;
    matched_order_id: string | null;
    is_order_matched: boolean;
    delivery_date_recorded: Date | null;
    requires_delivery_review: boolean;
    eligibility_flag: string;
    shipping_instructions: string | null;
    return_courier_name: string | null;
    return_tracking_number: string | null;
    customer_shipped_at: Date | null;
    product_received_at: Date | null;
    inspection_result: string | null;
    inspection_notes: string | null;
    inspected_at: Date | null;
    inspected_by: string | null;
    refund_status: string;
    refund_amount_paise: number | null;
    refund_method: string | null;
    refund_reference: string | null;
    refund_initiated_at: Date | null;
    refund_completed_at: Date | null;
    refund_notes: string | null;
    created_at: Date;
    updated_at: Date;
  }>(`SELECT * FROM return_requests WHERE id = $1`, [id]);

  if (reqRes.rows.length === 0) return null;
  const row = reqRes.rows[0];

  // Matched order details
  let matchedOrder: AdminReturnDetail['matchedOrder'] = null;
  if (row.matched_order_id) {
    const orderRes = await query<{
      id: string;
      order_number: string;
      customer_name: string;
      customer_email: string;
      customer_phone: string;
      order_status: string;
      payment_method: string;
      payment_status: string;
      total_paise: number;
      delivered_at: Date | null;
      created_at: Date;
    }>(`SELECT * FROM orders WHERE id = $1`, [row.matched_order_id]);

    if (orderRes.rows.length > 0) {
      const o = orderRes.rows[0];
      const itemsRes = await query<{
        id: string;
        product_name: string;
        variant_sku: string | null;
        variant_size: string | null;
        variant_color: string | null;
        unit_price_paise: number;
        quantity: number;
        line_total_paise: number;
      }>(`SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at ASC`, [o.id]);

      matchedOrder = {
        id: o.id,
        orderNumber: o.order_number,
        customerName: o.customer_name,
        customerEmail: o.customer_email,
        customerPhone: o.customer_phone,
        orderStatus: o.order_status,
        paymentMethod: o.payment_method,
        paymentStatus: o.payment_status,
        totalPaise: o.total_paise,
        deliveredAt: o.delivered_at ? o.delivered_at.toISOString() : null,
        createdAt: o.created_at.toISOString(),
        items: itemsRes.rows.map((item) => ({
          id: item.id,
          productName: item.product_name,
          variantSku: item.variant_sku,
          variantSize: item.variant_size,
          variantColor: item.variant_color,
          unitPricePaise: item.unit_price_paise,
          quantity: item.quantity,
          lineTotalPaise: item.line_total_paise,
        })),
      };
    }
  }

  // Active evidence items
  const evidenceRes = await query<{
    id: string;
    original_filename: string;
    mime_type: string;
    file_size_bytes: number;
    format: string;
    created_at: Date;
  }>(
    `SELECT id, original_filename, mime_type, file_size_bytes, format, created_at
     FROM return_request_evidence
     WHERE return_request_id = $1 AND deleted_at IS NULL
     ORDER BY created_at ASC`,
    [id]
  );

  // History entries
  const historyRes = await query<{
    id: string;
    previous_status: string | null;
    new_status: string;
    actor_type: string;
    actor_id: string | null;
    notes: string | null;
    created_at: Date;
  }>(
    `SELECT id, previous_status, new_status, actor_type, actor_id, notes, created_at
     FROM return_request_history
     WHERE return_request_id = $1
     ORDER BY created_at ASC`,
    [id]
  );

  return {
    id: row.id,
    requestNumber: row.request_number,
    submittedOrderId: row.submitted_order_id,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    reason: row.reason,
    description: row.description,
    status: row.status,
    adminNotes: row.admin_notes,
    rejectionReason: row.rejection_reason,
    isOrderMatched: row.is_order_matched,
    eligibilityFlag: row.eligibility_flag,
    deliveryDateRecorded: row.delivery_date_recorded ? row.delivery_date_recorded.toISOString() : null,
    requiresDeliveryReview: row.requires_delivery_review,
    shipping: {
      shippingInstructions: row.shipping_instructions,
      returnCourierName: row.return_courier_name,
      returnTrackingNumber: row.return_tracking_number,
      customerShippedAt: row.customer_shipped_at ? row.customer_shipped_at.toISOString() : null,
      productReceivedAt: row.product_received_at ? row.product_received_at.toISOString() : null,
    },
    inspection: {
      inspectionResult: row.inspection_result,
      inspectionNotes: row.inspection_notes,
      inspectedAt: row.inspected_at ? row.inspected_at.toISOString() : null,
      inspectedBy: row.inspected_by,
    },
    refund: {
      refundStatus: row.refund_status,
      refundAmountPaise: row.refund_amount_paise,
      refundMethod: row.refund_method,
      refundReference: row.refund_reference,
      refundInitiatedAt: row.refund_initiated_at ? row.refund_initiated_at.toISOString() : null,
      refundCompletedAt: row.refund_completed_at ? row.refund_completed_at.toISOString() : null,
      refundNotes: row.refund_notes,
    },
    matchedOrder,
    evidence: evidenceRes.rows.map((ev) => ({
      id: ev.id,
      originalFilename: ev.original_filename,
      mimeType: ev.mime_type,
      fileSizeBytes: ev.file_size_bytes,
      format: ev.format,
      createdAt: ev.created_at.toISOString(),
    })),
    history: historyRes.rows.map((h) => ({
      id: h.id,
      previousStatus: h.previous_status,
      newStatus: h.new_status,
      actorType: h.actor_type,
      actorId: h.actor_id,
      notes: h.notes,
      createdAt: h.created_at.toISOString(),
    })),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * Validates permitted status transitions.
 */
function isValidStatusTransition(current: string, next: string): boolean {
  if (current === next) return true;

  switch (current) {
    case 'REQUEST_SUBMITTED':
      return next === 'UNDER_REVIEW' || next === 'APPROVED' || next === 'REJECTED';
    case 'UNDER_REVIEW':
      return next === 'APPROVED' || next === 'REJECTED';
    case 'APPROVED':
      return next === 'COMPLETED' || next === 'REJECTED';
    case 'REJECTED':
      return next === 'UNDER_REVIEW'; // Appeal / reopening allowed
    case 'COMPLETED':
      return false; // Terminal state
    default:
      return false;
  }
}

/**
 * Updates status of a return request with history and audit logging.
 */
export async function updateReturnStatus(
  id: string,
  payload: AdminReturnStatusUpdatePayload,
  admin: { id: string | null; email: string },
  ipAddress?: string | null
): Promise<AdminReturnDetail> {
  await withTransaction(async (client) => {
    const curRes = await client.query<{
      status: string;
      request_number: string;
      customer_email: string;
      admin_notes: string | null;
      rejection_reason: string | null;
      inspection_result: string | null;
    }>(
      `SELECT status, request_number, customer_email, admin_notes, rejection_reason, inspection_result
       FROM return_requests
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    if (curRes.rows.length === 0) {
      throw new Error('Return request not found');
    }

    const current = curRes.rows[0];

    if (!isValidStatusTransition(current.status, payload.status)) {
      throw new Error(
        `Invalid status transition from '${current.status}' to '${payload.status}'.`
      );
    }

    if (payload.status === 'COMPLETED') {
      if (current.status !== 'APPROVED') {
        throw new Error(
          `Cannot complete return request directly from '${current.status}'. Request must be APPROVED prior to completion.`
        );
      }
      if (current.inspection_result === 'FAIL') {
        throw new Error(
          'Cannot mark return request as COMPLETED when product inspection result is FAIL. The request must be REJECTED instead.'
        );
      }
    }

    const nextAdminNotes =
      payload.adminNotes !== undefined ? payload.adminNotes : current.admin_notes;
    const nextRejectionReason =
      payload.status === 'REJECTED'
        ? payload.rejectionReason || current.rejection_reason
        : current.rejection_reason;

    await client.query(
      `UPDATE return_requests
       SET status = $1,
           admin_notes = $2,
           rejection_reason = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [payload.status, nextAdminNotes, nextRejectionReason, id]
    );

    const historyNotes =
      payload.status === 'REJECTED'
        ? `Request rejected: ${nextRejectionReason}`
        : payload.adminNotes || `Status updated to ${payload.status}`;

    await client.query(
      `INSERT INTO return_request_history (
         return_request_id,
         previous_status,
         new_status,
         actor_type,
         actor_id,
         notes
       ) VALUES ($1, $2, $3, 'ADMIN', $4, $5)`,
      [id, current.status, payload.status, admin.email, historyNotes]
    );

    await createAuditLog({
      adminId: admin.id,
      adminEmail: admin.email,
      action: 'RETURN_STATUS_UPDATE',
      entityType: 'RETURN_REQUEST',
      entityId: id,
      details: {
        requestNumber: current.request_number,
        previousStatus: current.status,
        newStatus: payload.status,
        adminNotes: nextAdminNotes,
        rejectionReason: nextRejectionReason,
      },
      ipAddress: ipAddress || null,
      client,
    });
  });

  const updated = await getAdminReturnById(id);
  if (!updated) throw new Error('Failed to retrieve updated return request');
  return updated;
}

/**
 * Updates shipping information.
 */
export async function updateReturnShipping(
  id: string,
  payload: AdminReturnShippingPayload,
  admin: { id: string | null; email: string },
  ipAddress?: string | null
): Promise<AdminReturnDetail> {
  await withTransaction(async (client) => {
    const curRes = await client.query<{ id: string; request_number: string }>(
      `SELECT id, request_number FROM return_requests WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (curRes.rows.length === 0) throw new Error('Return request not found');

    await client.query(
      `UPDATE return_requests
       SET shipping_instructions = COALESCE($1, shipping_instructions),
           return_courier_name = COALESCE($2, return_courier_name),
           return_tracking_number = COALESCE($3, return_tracking_number),
           customer_shipped_at = COALESCE($4, customer_shipped_at),
           product_received_at = COALESCE($5, product_received_at),
           updated_at = NOW()
       WHERE id = $6`,
      [
        payload.shippingInstructions !== undefined ? payload.shippingInstructions : null,
        payload.returnCourierName !== undefined ? payload.returnCourierName : null,
        payload.returnTrackingNumber !== undefined ? payload.returnTrackingNumber : null,
        payload.customerShippedAt ? new Date(payload.customerShippedAt) : null,
        payload.productReceivedAt ? new Date(payload.productReceivedAt) : null,
        id,
      ]
    );

    await createAuditLog({
      adminId: admin.id,
      adminEmail: admin.email,
      action: 'RETURN_SHIPPING_UPDATE',
      entityType: 'RETURN_REQUEST',
      entityId: id,
      details: {
        requestNumber: curRes.rows[0].request_number,
        ...payload,
      },
      ipAddress: ipAddress || null,
      client,
    });
  });

  const updated = await getAdminReturnById(id);
  if (!updated) throw new Error('Failed to retrieve updated return request');
  return updated;
}

/**
 * Updates product inspection details.
 */
export async function updateReturnInspection(
  id: string,
  payload: AdminReturnInspectionPayload,
  admin: { id: string | null; email: string },
  ipAddress?: string | null
): Promise<AdminReturnDetail> {
  await withTransaction(async (client) => {
    const curRes = await client.query<{ id: string; request_number: string }>(
      `SELECT id, request_number FROM return_requests WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (curRes.rows.length === 0) throw new Error('Return request not found');

    await client.query(
      `UPDATE return_requests
       SET inspection_result = $1,
           inspection_notes = $2,
           inspected_at = NOW(),
           inspected_by = $3,
           product_received_at = COALESCE($4, product_received_at, NOW()),
           updated_at = NOW()
       WHERE id = $5`,
      [
        payload.inspectionResult,
        payload.inspectionNotes,
        admin.email,
        payload.productReceivedAt ? new Date(payload.productReceivedAt) : null,
        id,
      ]
    );

    await createAuditLog({
      adminId: admin.id,
      adminEmail: admin.email,
      action: 'RETURN_INSPECTION_UPDATE',
      entityType: 'RETURN_REQUEST',
      entityId: id,
      details: {
        requestNumber: curRes.rows[0].request_number,
        inspectionResult: payload.inspectionResult,
        inspectionNotes: payload.inspectionNotes,
      },
      ipAddress: ipAddress || null,
      client,
    });
  });

  const updated = await getAdminReturnById(id);
  if (!updated) throw new Error('Failed to retrieve updated return request');
  return updated;
}

/**
 * Validates permitted refund status transitions.
 */
function isValidRefundTransition(current: string, next: string): boolean {
  if (current === next) return true;

  switch (current) {
    case 'NOT_APPLICABLE':
      return next === 'PENDING' || next === 'INITIATED' || next === 'COMPLETED' || next === 'REJECTED';
    case 'PENDING':
      return next === 'INITIATED' || next === 'COMPLETED' || next === 'REJECTED' || next === 'NOT_APPLICABLE';
    case 'INITIATED':
      return next === 'COMPLETED' || next === 'REJECTED' || next === 'PENDING';
    case 'COMPLETED':
      return false; // Terminal state - completed refunds cannot be moved backwards
    case 'REJECTED':
      return next === 'PENDING' || next === 'INITIATED'; // Allow reopening if appealed
    default:
      return false;
  }
}

/**
 * Updates manual refund tracking ledger.
 */
export async function updateReturnRefund(
  id: string,
  payload: AdminReturnRefundPayload,
  admin: { id: string | null; email: string },
  ipAddress?: string | null
): Promise<AdminReturnDetail> {
  await withTransaction(async (client) => {
    const curRes = await client.query<{
      id: string;
      request_number: string;
      status: string;
      matched_order_id: string | null;
      refund_status: string;
      refund_amount_paise: number | null;
      refund_method: string | null;
      refund_reference: string | null;
      refund_notes: string | null;
      refund_initiated_at: Date | null;
      refund_completed_at: Date | null;
    }>(
      `SELECT id, request_number, status, matched_order_id, refund_status,
              refund_amount_paise, refund_method, refund_reference, refund_notes,
              refund_initiated_at, refund_completed_at
       FROM return_requests
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );
    if (curRes.rows.length === 0) throw new Error('Return request not found');

    const cur = curRes.rows[0];

    // Check duplicate completion & terminal completed state
    if (cur.refund_status === 'COMPLETED') {
      if (payload.refundStatus === 'COMPLETED') {
        const sameReference = cur.refund_reference === payload.refundReference;
        const sameAmount =
          payload.refundAmountPaise === undefined ||
          payload.refundAmountPaise === null ||
          cur.refund_amount_paise === payload.refundAmountPaise;

        if (sameReference && sameAmount) {
          // Idempotent duplicate submission of already completed refund
          return;
        }
        throw new Error(
          `Refund has already been completed with reference '${cur.refund_reference}'. Completed refunds cannot be modified.`
        );
      }
      throw new Error(
        `Refund is already marked COMPLETED and cannot be transitioned to '${payload.refundStatus}'.`
      );
    }

    // Validate state machine transition
    if (!isValidRefundTransition(cur.refund_status, payload.refundStatus)) {
      throw new Error(
        `Invalid refund status transition from '${cur.refund_status}' to '${payload.refundStatus}'.`
      );
    }

    // Explanations required for rejection
    if (payload.refundStatus === 'REJECTED') {
      if (!payload.refundNotes || payload.refundNotes.trim().length < 5) {
        throw new Error(
          'Refund notes explaining the reason for rejection (at least 5 characters) are required when marking refund as REJECTED.'
        );
      }
    }

    // Requirements for completion
    if (payload.refundStatus === 'COMPLETED') {
      if (!payload.refundReference || payload.refundReference.trim().length === 0) {
        throw new Error('A non-empty refundReference is required when marking refund as COMPLETED.');
      }
      if (typeof payload.refundAmountPaise !== 'number' || payload.refundAmountPaise <= 0) {
        throw new Error('A positive refundAmountPaise is required when marking refund as COMPLETED.');
      }
      if (!payload.refundMethod && !cur.refund_method) {
        throw new Error('A valid refundMethod is required when marking refund as COMPLETED.');
      }
    }

    // Check if order total is known and if refund exceeds order total
    let exceedsOrderTotal = false;
    let orderTotalPaise: number | null = null;
    const prospectiveAmount =
      payload.refundAmountPaise !== undefined && payload.refundAmountPaise !== null
        ? payload.refundAmountPaise
        : cur.refund_amount_paise;

    if (cur.matched_order_id && typeof prospectiveAmount === 'number' && prospectiveAmount > 0) {
      const orderRes = await client.query<{ total_paise: number }>(
        `SELECT total_paise FROM orders WHERE id = $1`,
        [cur.matched_order_id]
      );
      if (orderRes.rows.length > 0) {
        orderTotalPaise = orderRes.rows[0].total_paise;
        if (prospectiveAmount > orderTotalPaise) {
          exceedsOrderTotal = true;
          if (!payload.allowExcessRefund) {
            throw new Error(
              `Refund amount (₹${(prospectiveAmount / 100).toFixed(2)}) exceeds verified order total (₹${(orderTotalPaise / 100).toFixed(2)}). Authorizing an excess refund requires explicit administrator confirmation (allowExcessRefund: true) and a detailed explanation in refundNotes.`
            );
          }
          if (!payload.refundNotes || payload.refundNotes.trim().length < 10) {
            throw new Error(
              'Refund amount exceeds order total. A detailed explanation in refundNotes (at least 10 characters) is required when authorizing an excess refund.'
            );
          }
        }
      }
    }

    const initiatedAt =
      cur.refund_initiated_at ||
      (payload.refundStatus === 'INITIATED' || payload.refundStatus === 'COMPLETED'
        ? new Date()
        : null);

    const completedAt =
      payload.refundStatus === 'COMPLETED'
        ? payload.refundCompletedAt
          ? new Date(payload.refundCompletedAt)
          : cur.refund_completed_at || new Date()
        : null;

    await client.query(
      `UPDATE return_requests
       SET refund_status = $1,
           refund_amount_paise = COALESCE($2, refund_amount_paise),
           refund_method = COALESCE($3, refund_method),
           refund_reference = COALESCE($4, refund_reference),
           refund_notes = COALESCE($5, refund_notes),
           refund_initiated_at = COALESCE($6, refund_initiated_at),
           refund_completed_at = COALESCE($7, refund_completed_at),
           updated_at = NOW()
       WHERE id = $8`,
      [
        payload.refundStatus,
        payload.refundAmountPaise !== undefined ? payload.refundAmountPaise : null,
        payload.refundMethod !== undefined ? payload.refundMethod : null,
        payload.refundReference !== undefined ? payload.refundReference : null,
        payload.refundNotes !== undefined ? payload.refundNotes : null,
        initiatedAt,
        completedAt,
        id,
      ]
    );

    await createAuditLog({
      adminId: admin.id,
      adminEmail: admin.email,
      action: 'RETURN_REFUND_UPDATE',
      entityType: 'RETURN_REQUEST',
      entityId: id,
      details: {
        requestNumber: cur.request_number,
        refundStatus: payload.refundStatus,
        refundAmountPaise: prospectiveAmount,
        refundMethod: payload.refundMethod || cur.refund_method,
        refundReference: payload.refundReference || cur.refund_reference,
        orderTotalPaise,
        exceedsOrderTotal,
        allowExcessRefund: payload.allowExcessRefund || false,
      },
      ipAddress: ipAddress || null,
      client,
    });
  });

  const updated = await getAdminReturnById(id);
  if (!updated) throw new Error('Failed to retrieve updated return request');
  return updated;
}

/**
 * Soft-deletes evidence item in database and enqueues Cloudinary cleanup.
 */
export async function deleteReturnEvidence(
  returnId: string,
  evidenceId: string,
  admin: { id: string | null; email: string },
  ipAddress?: string | null
): Promise<{ success: boolean; evidenceId: string }> {
  if (!UUID_REGEX.test(returnId) || !UUID_REGEX.test(evidenceId)) {
    throw new Error('Invalid ID format');
  }

  const txResult = await withTransaction(async (client) => {
    const evidenceRes = await client.query<{
      id: string;
      cloudinary_public_id: string;
      original_filename: string;
    }>(
      `SELECT id, cloudinary_public_id, original_filename
       FROM return_request_evidence
       WHERE id = $1 AND return_request_id = $2 AND deleted_at IS NULL
       FOR UPDATE`,
      [evidenceId, returnId]
    );

    if (evidenceRes.rows.length === 0) {
      throw new Error('Evidence item not found or already deleted');
    }

    const ev = evidenceRes.rows[0];

    // Soft delete
    await client.query(
      `UPDATE return_request_evidence
       SET deleted_at = NOW(),
           deleted_by = $1
       WHERE id = $2`,
      [admin.email, evidenceId]
    );

    // Audit log
    await createAuditLog({
      adminId: admin.id,
      adminEmail: admin.email,
      action: 'RETURN_EVIDENCE_DELETE',
      entityType: 'RETURN_REQUEST_EVIDENCE',
      entityId: evidenceId,
      details: {
        returnRequestId: returnId,
        cloudinaryPublicId: ev.cloudinary_public_id,
        originalFilename: ev.original_filename,
        deletedBy: admin.email,
      },
      ipAddress: ipAddress || null,
      client,
    });

    // Enqueue Cloudinary cleanup job
    const cleanupJobId = await enqueueCleanupJob(client, {
      publicId: ev.cloudinary_public_id,
      assetType: 'authenticated',
      resourceType: 'image',
      reason: 'ORPHANED_UPLOAD',
    });

    return {
      evidenceId,
      cleanupJobId,
    };
  });

  // Post-commit: trigger immediate cleanup attempt
  if (txResult.cleanupJobId) {
    try {
      await processSingleCleanupJob(txResult.cleanupJobId);
    } catch (cleanupErr) {
      console.warn('[Evidence Delete Cleanup Warning]', {
        jobId: txResult.cleanupJobId,
        error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
      });
    }
  }

  return { success: true, evidenceId: txResult.evidenceId };
}
