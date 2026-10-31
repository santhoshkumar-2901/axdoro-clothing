import crypto from 'crypto';
import pg from 'pg';
import { withTransaction, query } from '../config/db.js';
import { createAuditLog } from './audit-log.service.js';
import { AdminUserDTO } from './admin-auth.service.js';
import { OrderCreateInput, OrderStatusUpdateInput } from '../schemas/orders.js';

export interface OrderItemSnapshot {
  id: string;
  orderId: string;
  productId: string | null;
  variantId: string | null;
  productName: string;
  productSlug: string;
  variantSku: string;
  variantSize: string;
  variantColor: string;
  unitPricePaise: number;
  quantity: number;
  lineTotalPaise: number;
}

export interface OrderRecord {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddressLine1: string;
  shippingAddressLine2: string | null;
  shippingCity: string;
  shippingState: string;
  shippingPincode: string;
  subtotalPaise: number;
  discountPaise: number;
  shippingFeePaise: number;
  totalPaise: number;
  paymentMethod: 'COD' | 'RAZORPAY';
  paymentStatus: 'UNPAID' | 'PENDING' | 'PAID' | 'REFUNDED' | 'FAILED';
  orderStatus: 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  customerOrderToken: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  deliveredAt: string | null;
  acknowledgedAt: string | null;
  items?: OrderItemSnapshot[];
  isReplay?: boolean;
}

export interface SafeReplayOrderRecord {
  isReplay: true;
  id: string;
  orderNumber: string;
  orderStatus: 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  paymentMethod: 'COD' | 'RAZORPAY';
  paymentStatus: 'UNPAID' | 'PENDING' | 'PAID' | 'REFUNDED' | 'FAILED';
  subtotalPaise: number;
  discountPaise: number;
  shippingFeePaise: number;
  totalPaise: number;
  grandTotalPaise: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublicOrderTrackingRecord {
  id: string;
  orderNumber: string;
  orderStatus: 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  paymentMethod: 'COD' | 'RAZORPAY';
  paymentStatus: 'UNPAID' | 'PENDING' | 'PAID' | 'REFUNDED' | 'FAILED';
  subtotalPaise: number;
  discountPaise: number;
  shippingFeePaise: number;
  totalPaise: number;
  grandTotalPaise: number;
  shippingCity: string;
  shippingState: string;
  shippingPincode: string;
  createdAt: string;
  deliveredAt: string | null;
  cancelledAt: string | null;
  items: OrderItemSnapshot[];
}

export class IdempotencyConflictError extends Error {
  public statusCode = 409;
  constructor(message = 'Idempotency key already exists with differing order payload') {
    super(message);
    this.name = 'IdempotencyConflictError';
  }
}

// State machine defining strictly valid order status transitions
const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [], // Terminal state
  CANCELLED: [], // Terminal state
};

function generateOrderNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `AXD-${dateStr}-${randomSuffix}`;
}

function generateCustomerOrderToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

/**
 * Computes a deterministic SHA-256 fingerprint from canonical, normalized order input.
 * Excludes untrusted client pricing/totals and unvalidated fields.
 */
export function computeOrderRequestFingerprint(input: OrderCreateInput): string {
  const normalizedCustomer = {
    customerName: input.customerName.trim(),
    customerEmail: input.customerEmail.trim().toLowerCase(),
    customerPhone: input.customerPhone.trim(),
    shippingAddressLine1: input.shippingAddressLine1.trim(),
    shippingAddressLine2: (input.shippingAddressLine2 || '').trim() || null,
    shippingCity: input.shippingCity.trim(),
    shippingState: input.shippingState.trim(),
    shippingPincode: input.shippingPincode.trim(),
    paymentMethod: input.paymentMethod,
    notes: (input.notes || '').trim() || null,
  };

  // Sort normalized items deterministically by lowercase variant ID
  const normalizedItems = [...input.items]
    .map((it) => ({
      variantId: it.variantId.toLowerCase(),
      quantity: it.quantity,
    }))
    .sort((a, b) => a.variantId.localeCompare(b.variantId));

  const canonicalPayload = JSON.stringify({
    customer: normalizedCustomer,
    items: normalizedItems,
  });

  return crypto.createHash('sha256').update(canonicalPayload).digest('hex');
}

/**
 * Creates a COD order with server-authoritative pricing, deterministic row-locking,
 * secure canonical request fingerprinting, and resilient idempotency handling.
 */
export async function createOrder(
  input: OrderCreateInput
): Promise<OrderRecord | SafeReplayOrderRecord> {
  const requestFingerprint = computeOrderRequestFingerprint(input);

  // Validate duplicate variant IDs
  const variantIdSet = new Set<string>();
  for (const item of input.items) {
    const vid = item.variantId.toLowerCase();
    if (variantIdSet.has(vid)) {
      throw new Error(`Duplicate variant ID in order items (${item.variantId})`);
    }
    variantIdSet.add(vid);
  }

  try {
    return await withTransaction(async (client) => {
      // 1. Idempotency check: if key provided, verify existing order and request hash
      if (input.idempotencyKey) {
        const existingRes = await client.query<{
          id: string;
          order_number: string;
          order_status: 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
          payment_status: 'UNPAID' | 'PENDING' | 'PAID' | 'REFUNDED' | 'FAILED';
          payment_method: 'COD' | 'RAZORPAY';
          subtotal_paise: number;
          discount_paise: number;
          shipping_fee_paise: number;
          total_paise: number;
          request_hash: string | null;
          created_at: Date;
          updated_at: Date;
        }>(
          `SELECT id, order_number, order_status, payment_status, payment_method,
                  subtotal_paise, discount_paise, shipping_fee_paise, total_paise,
                  request_hash, created_at, updated_at
           FROM orders WHERE idempotency_key = $1`,
          [input.idempotencyKey]
        );

        if (existingRes.rows.length > 0) {
          const existing = existingRes.rows[0];
          // Reject mismatched payloads with 409 Conflict
          if (existing.request_hash && existing.request_hash !== requestFingerprint) {
            throw new IdempotencyConflictError();
          }

          // Return safe, minimized replay record omitting bearer token and full PII
          return {
            isReplay: true,
            id: existing.id,
            orderNumber: existing.order_number,
            orderStatus: existing.order_status,
            paymentStatus: existing.payment_status,
            paymentMethod: existing.payment_method,
            subtotalPaise: existing.subtotal_paise,
            discountPaise: existing.discount_paise,
            shippingFeePaise: existing.shipping_fee_paise,
            totalPaise: existing.total_paise,
            grandTotalPaise: existing.total_paise,
            createdAt: new Date(existing.created_at).toISOString(),
            updatedAt: new Date(existing.updated_at).toISOString(),
          };
        }
      }

      // 2. Deterministic variant locking: acquire row-level locks sorted by variantId ASC
      const sortedVariantIds = [...input.items]
        .map((it) => it.variantId)
        .sort((a, b) => a.localeCompare(b));

      const variantMap = new Map<string, any>();
      for (const vid of sortedVariantIds) {
        const varRes = await client.query<{
          id: string;
          product_id: string;
          sku: string;
          size: string;
          color: string;
          price_paise: number;
          stock_quantity: number;
          is_active: boolean;
          product_name: string;
          product_slug: string;
          product_status: string;
        }>(
          `SELECT pv.*, p.name as product_name, p.slug as product_slug, p.status as product_status
           FROM product_variants pv
           JOIN products p ON p.id = pv.product_id
           WHERE pv.id = $1
           FOR UPDATE OF pv;`,
          [vid]
        );

        if (varRes.rows.length === 0) {
          throw new Error(`Variant not found or no longer available (${vid})`);
        }

        const variant = varRes.rows[0];

        if (!variant.is_active || variant.product_status !== 'published') {
          throw new Error(`Product '${variant.product_name}' is currently unavailable`);
        }

        variantMap.set(vid, variant);
      }

      // 3. Validate stock, deduct inventory, and build snapshots in client cart order
      let subtotalPaise = 0;
      const resolvedItems: {
        productId: string;
        variantId: string;
        productName: string;
        productSlug: string;
        variantSku: string;
        variantSize: string;
        variantColor: string;
        unitPricePaise: number;
        quantity: number;
        lineTotalPaise: number;
      }[] = [];

      for (const item of input.items) {
        const variant = variantMap.get(item.variantId)!;

        if (variant.stock_quantity < item.quantity) {
          throw new Error(
            `Insufficient stock for '${variant.product_name}' (${variant.size} / ${variant.color}). Requested: ${item.quantity}, Available: ${variant.stock_quantity}`
          );
        }

        // Deduct stock atomically
        await client.query(
          `UPDATE product_variants SET stock_quantity = stock_quantity - $1 WHERE id = $2;`,
          [item.quantity, variant.id]
        );

        // Decrement local tracking quantity in map
        variant.stock_quantity -= item.quantity;

        // Authoritative pricing from locked variant row
        const lineTotalPaise = variant.price_paise * item.quantity;
        subtotalPaise += lineTotalPaise;

        resolvedItems.push({
          productId: variant.product_id,
          variantId: variant.id,
          productName: variant.product_name,
          productSlug: variant.product_slug,
          variantSku: variant.sku,
          variantSize: variant.size,
          variantColor: variant.color,
          unitPricePaise: variant.price_paise,
          quantity: item.quantity,
          lineTotalPaise,
        });
      }

      // 4. Server-authoritative totals
      const discountPaise = 0;
      const shippingFeePaise = 0;
      const totalPaise = subtotalPaise - discountPaise + shippingFeePaise;

      const orderNumber = generateOrderNumber();
      const customerOrderToken = generateCustomerOrderToken();

      // 5. Insert order record with request_hash
      const orderRes = await client.query<{ id: string; created_at: Date; updated_at: Date }>(
        `INSERT INTO orders (
          order_number, customer_name, customer_email, customer_phone,
          shipping_address_line1, shipping_address_line2, shipping_city, shipping_state, shipping_pincode,
          subtotal_paise, discount_paise, shipping_fee_paise, total_paise,
          payment_method, payment_status, order_status,
          idempotency_key, request_hash, customer_order_token, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        RETURNING id, created_at, updated_at;`,
        [
          orderNumber,
          input.customerName,
          input.customerEmail,
          input.customerPhone,
          input.shippingAddressLine1,
          input.shippingAddressLine2 || null,
          input.shippingCity,
          input.shippingState,
          input.shippingPincode,
          subtotalPaise,
          discountPaise,
          shippingFeePaise,
          totalPaise,
          'COD',
          'UNPAID',
          'PENDING',
          input.idempotencyKey || null,
          requestFingerprint,
          customerOrderToken,
          input.notes || null,
        ]
      );

      const orderId = orderRes.rows[0].id;

      // 6. Insert immutable order item snapshots preserving cart order
      const createdItems: OrderItemSnapshot[] = [];
      for (const it of resolvedItems) {
        const itemRes = await client.query<{ id: string }>(
          `INSERT INTO order_items (
            order_id, product_id, variant_id,
            product_name, product_slug, variant_sku, variant_size, variant_color,
            unit_price_paise, quantity, line_total_paise
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id;`,
          [
            orderId,
            it.productId,
            it.variantId,
            it.productName,
            it.productSlug,
            it.variantSku,
            it.variantSize,
            it.variantColor,
            it.unitPricePaise,
            it.quantity,
            it.lineTotalPaise,
          ]
        );

        createdItems.push({
          id: itemRes.rows[0].id,
          orderId,
          productId: it.productId,
          variantId: it.variantId,
          productName: it.productName,
          productSlug: it.productSlug,
          variantSku: it.variantSku,
          variantSize: it.variantSize,
          variantColor: it.variantColor,
          unitPricePaise: it.unitPricePaise,
          quantity: it.quantity,
          lineTotalPaise: it.lineTotalPaise,
        });
      }

      // 7. Record audit log
      await createAuditLog({
        adminEmail: 'system@axdoro.internal',
        action: 'ORDER_CREATE',
        entityType: 'order',
        entityId: orderId,
        details: {
          orderNumber,
          customerEmail: input.customerEmail,
          itemCount: resolvedItems.length,
          totalPaise,
          paymentMethod: 'COD',
        },
        client,
      });

      return {
        id: orderId,
        orderNumber,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone,
        shippingAddressLine1: input.shippingAddressLine1,
        shippingAddressLine2: input.shippingAddressLine2 || null,
        shippingCity: input.shippingCity,
        shippingState: input.shippingState,
        shippingPincode: input.shippingPincode,
        subtotalPaise,
        discountPaise,
        shippingFeePaise,
        totalPaise,
        paymentMethod: 'COD',
        paymentStatus: 'UNPAID',
        orderStatus: 'PENDING',
        customerOrderToken,
        notes: input.notes || null,
        createdAt: orderRes.rows[0].created_at.toISOString(),
        updatedAt: orderRes.rows[0].updated_at.toISOString(),
        cancelledAt: null,
        deliveredAt: null,
        acknowledgedAt: null,
        items: createdItems,
      };
    });
  } catch (err: unknown) {
    // Handle concurrent same-key collision: PostgreSQL 23505 unique constraint violation
    const pgErr = err as { code?: string; constraint?: string };
    if (
      pgErr.code === '23505' &&
      pgErr.constraint === 'orders_idempotency_key_key' &&
      input.idempotencyKey
    ) {
      // Re-fetch winning committed order in fresh query outside aborted transaction
      const winningRes = await query<{
        id: string;
        order_number: string;
        order_status: 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
        payment_status: 'UNPAID' | 'PENDING' | 'PAID' | 'REFUNDED' | 'FAILED';
        payment_method: 'COD' | 'RAZORPAY';
        subtotal_paise: number;
        discount_paise: number;
        shipping_fee_paise: number;
        total_paise: number;
        request_hash: string | null;
        created_at: Date;
        updated_at: Date;
      }>(
        `SELECT id, order_number, order_status, payment_status, payment_method,
                subtotal_paise, discount_paise, shipping_fee_paise, total_paise,
                request_hash, created_at, updated_at
         FROM orders
         WHERE idempotency_key = $1;`,
        [input.idempotencyKey]
      );

      if (winningRes.rows.length > 0) {
        const winning = winningRes.rows[0];
        if (winning.request_hash && winning.request_hash !== requestFingerprint) {
          throw new IdempotencyConflictError();
        }

        return {
          isReplay: true,
          id: winning.id,
          orderNumber: winning.order_number,
          orderStatus: winning.order_status,
          paymentStatus: winning.payment_status,
          paymentMethod: winning.payment_method,
          subtotalPaise: winning.subtotal_paise,
          discountPaise: winning.discount_paise,
          shippingFeePaise: winning.shipping_fee_paise,
          totalPaise: winning.total_paise,
          grandTotalPaise: winning.total_paise,
          createdAt: new Date(winning.created_at).toISOString(),
          updatedAt: new Date(winning.updated_at).toISOString(),
        };
      }
    }

    // Rethrow all other errors (including unrelated 23505)
    throw err;
  }
}

/**
 * Public order confirmation lookup by cryptographic customer token.
 * Prevents enumeration and IDOR, and minimises returned PII for public tracking.
 */
export async function getOrderByToken(token: string): Promise<PublicOrderTrackingRecord | null> {
  const orderRes = await query<any>(
    `SELECT * FROM orders WHERE customer_order_token = $1`,
    [token]
  );
  if (orderRes.rows.length === 0) return null;
  const o = orderRes.rows[0];

  const itemsRes = await query<any>(
    `SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at ASC`,
    [o.id]
  );

  return {
    id: o.id,
    orderNumber: o.order_number,
    orderStatus: o.order_status,
    paymentMethod: o.payment_method,
    paymentStatus: o.payment_status,
    subtotalPaise: o.subtotal_paise,
    discountPaise: o.discount_paise,
    shippingFeePaise: o.shipping_fee_paise,
    totalPaise: o.total_paise,
    grandTotalPaise: o.total_paise,
    shippingCity: o.shipping_city,
    shippingState: o.shipping_state,
    shippingPincode: o.shipping_pincode,
    createdAt: o.created_at ? new Date(o.created_at).toISOString() : '',
    deliveredAt: o.delivered_at ? new Date(o.delivered_at).toISOString() : null,
    cancelledAt: o.cancelled_at ? new Date(o.cancelled_at).toISOString() : null,
    items: itemsRes.rows.map((it: any) => ({
      id: it.id,
      orderId: it.order_id,
      productId: it.product_id,
      variantId: it.variant_id,
      productName: it.product_name,
      productSlug: it.product_slug,
      variantSku: it.variant_sku,
      variantSize: it.variant_size,
      variantColor: it.variant_color,
      unitPricePaise: it.unit_price_paise,
      quantity: it.quantity,
      lineTotalPaise: it.line_total_paise,
    })),
  };
}

/**
 * Admin order lookup by UUID.
 */
export async function getOrderById(id: string, client?: pg.PoolClient): Promise<OrderRecord | null> {
  const runner = client ? client.query.bind(client) : query;
  const orderRes = await runner<any>(`SELECT * FROM orders WHERE id = $1`, [id]);
  if (orderRes.rows.length === 0) return null;
  const o = orderRes.rows[0];

  const itemsRes = await runner<any>(
    `SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at ASC`,
    [o.id]
  );

  return mapOrderRow(o, itemsRes.rows);
}

/**
 * Admin list orders with pagination and filtering.
 */
export async function listOrders(params: {
  page?: number;
  limit?: number;
  status?: string;
  paymentStatus?: string;
  search?: string;
}): Promise<{ orders: OrderRecord[]; totalCount: number; totalPages: number }> {
  const page = Math.max(params.page || 1, 1);
  const limit = Math.min(Math.max(params.limit || 20, 1), 100);
  const offset = (page - 1) * limit;

  const whereClauses: string[] = [];
  const queryParams: unknown[] = [];

  if (params.status) {
    queryParams.push(params.status);
    whereClauses.push(`order_status = $${queryParams.length}`);
  }

  if (params.paymentStatus) {
    queryParams.push(params.paymentStatus);
    whereClauses.push(`payment_status = $${queryParams.length}`);
  }

  if (params.search && params.search.trim()) {
    queryParams.push(`%${params.search.trim()}%`);
    const idx = queryParams.length;
    whereClauses.push(`(order_number ILIKE $${idx} OR customer_name ILIKE $${idx} OR customer_email ILIKE $${idx} OR customer_phone ILIKE $${idx})`);
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const countRes = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM orders ${whereSql}`,
    queryParams
  );
  const totalCount = parseInt(countRes.rows[0]?.count || '0', 10);
  const totalPages = Math.ceil(totalCount / limit) || 1;

  const dataParams = [...queryParams, limit, offset];
  const listSql = `
    SELECT * FROM orders
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length};
  `;

  const listRes = await query<any>(listSql, dataParams);
  if (listRes.rows.length === 0) {
    return { orders: [], totalCount, totalPages };
  }

  const orderIds = listRes.rows.map((r) => r.id);
  const itemsRes = await query<any>(
    `SELECT * FROM order_items WHERE order_id = ANY($1::uuid[]) ORDER BY created_at ASC`,
    [orderIds]
  );

  const itemsByOrderId = new Map<string, any[]>();
  for (const item of itemsRes.rows) {
    const existing = itemsByOrderId.get(item.order_id);
    if (existing) {
      existing.push(item);
    } else {
      itemsByOrderId.set(item.order_id, [item]);
    }
  }

  const orders = listRes.rows.map((row) =>
    mapOrderRow(row, itemsByOrderId.get(row.id) || [])
  );

  return { orders, totalCount, totalPages };
}

/**
 * Updates order status according to the strict state machine.
 * If transitioning to CANCELLED, restores inventory atomically and records an audit log.
 * If transitioning to DELIVERED for COD, updates payment_status to PAID.
 */
export async function updateOrderStatus(
  orderId: string,
  input: OrderStatusUpdateInput,
  actor: AdminUserDTO
): Promise<OrderRecord> {
  return await withTransaction(async (client) => {
    // 1. Lock order row
    const orderRes = await client.query<any>(
      `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );

    if (orderRes.rows.length === 0) {
      throw new Error('Order not found');
    }

    const order = orderRes.rows[0];
    const currentStatus = order.order_status;
    const nextStatus = input.status;

    if (currentStatus === nextStatus) {
      return (await getOrderById(orderId, client))!;
    }

    const allowedTransitions = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowedTransitions.includes(nextStatus)) {
      throw new Error(
        `Invalid order status transition from '${currentStatus}' to '${nextStatus}'. Allowed: [${allowedTransitions.join(', ')}]`
      );
    }

    let paymentStatus = order.payment_status;
    let cancelledAt = order.cancelled_at;
    let deliveredAt = order.delivered_at;

    // 2. Handle cancellation: atomically restore inventory
    if (nextStatus === 'CANCELLED') {
      cancelledAt = new Date();

      const itemsRes = await client.query<{ variant_id: string; quantity: number }>(
        `SELECT variant_id, quantity FROM order_items WHERE order_id = $1`,
        [orderId]
      );

      for (const item of itemsRes.rows) {
        if (item.variant_id) {
          // Lock variant row and increment stock
          await client.query(
            `UPDATE product_variants
             SET stock_quantity = stock_quantity + $1
             WHERE id = $2`,
            [item.quantity, item.variant_id]
          );

          await createAuditLog({
            adminId: actor.id,
            adminEmail: actor.email,
            action: 'STOCK_ADJUSTMENT',
            entityType: 'variant',
            entityId: item.variant_id,
            details: {
              delta: item.quantity,
              reason: `Order cancelled (${order.order_number})`,
            },
            client,
          });
        }
      }
    }

    // 3. Handle delivery: mark COD order paid upon confirmed collection
    if (nextStatus === 'DELIVERED') {
      deliveredAt = new Date();
      if (order.payment_method === 'COD' && paymentStatus === 'UNPAID') {
        paymentStatus = 'PAID';
      }
    }

    // 4. Update order record (also marks order acknowledged if not already)
    await client.query(
      `UPDATE orders
       SET order_status = $1, payment_status = $2, cancelled_at = $3, delivered_at = $4,
           acknowledged_at = COALESCE(acknowledged_at, CURRENT_TIMESTAMP)
       WHERE id = $5`,
      [nextStatus, paymentStatus, cancelledAt, deliveredAt, orderId]
    );

    // 5. Audit log
    await createAuditLog({
      adminId: actor.id,
      adminEmail: actor.email,
      action: 'ORDER_STATUS_UPDATE',
      entityType: 'order',
      entityId: orderId,
      details: {
        orderNumber: order.order_number,
        previousStatus: currentStatus,
        newStatus: nextStatus,
        reason: input.reason || null,
        paymentStatus,
      },
      client,
    });

    return (await getOrderById(orderId, client))!;
  });
}

/**
 * Explicitly acknowledges an order.
 * Idempotent: does not change timestamp if already acknowledged.
 * Does not mutate fulfillment or payment status.
 */
export async function acknowledgeOrder(
  orderId: string,
  actor: AdminUserDTO
): Promise<OrderRecord> {
  return await withTransaction(async (client) => {
    const orderRes = await client.query<any>(
      `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );

    if (orderRes.rows.length === 0) {
      throw new Error('Order not found');
    }

    const order = orderRes.rows[0];

    if (!order.acknowledged_at) {
      await client.query(
        `UPDATE orders SET acknowledged_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [orderId]
      );

      await createAuditLog({
        adminId: actor.id,
        adminEmail: actor.email,
        action: 'ORDER_ACKNOWLEDGED',
        entityType: 'order',
        entityId: orderId,
        details: {
          orderNumber: order.order_number,
          orderStatus: order.order_status,
        },
        client,
      });
    }

    return (await getOrderById(orderId, client))!;
  });
}

/**
 * Returns count of unacknowledged orders requiring admin attention.
 * Eligible orders: acknowledged_at IS NULL AND order_status NOT IN ('CANCELLED', 'DELIVERED').
 */
export async function getUnacknowledgedOrdersCount(): Promise<number> {
  const res = await query<{ count: string }>(
    `SELECT COUNT(*)::text as count
     FROM orders
     WHERE acknowledged_at IS NULL
       AND order_status NOT IN ('CANCELLED', 'DELIVERED');`
  );
  return parseInt(res.rows[0]?.count || '0', 10);
}

function mapOrderRow(row: any, itemsRows: any[] = []): OrderRecord {
  return {
    id: row.id,
    orderNumber: row.order_number,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    shippingAddressLine1: row.shipping_address_line1,
    shippingAddressLine2: row.shipping_address_line2,
    shippingCity: row.shipping_city,
    shippingState: row.shipping_state,
    shippingPincode: row.shipping_pincode,
    subtotalPaise: row.subtotal_paise,
    discountPaise: row.discount_paise,
    shippingFeePaise: row.shipping_fee_paise,
    totalPaise: row.total_paise,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    orderStatus: row.order_status,
    customerOrderToken: row.customer_order_token,
    notes: row.notes,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : '',
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at).toISOString() : null,
    deliveredAt: row.delivered_at ? new Date(row.delivered_at).toISOString() : null,
    acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at).toISOString() : null,
    items: itemsRows.map((it) => ({
      id: it.id,
      orderId: it.order_id,
      productId: it.product_id,
      variantId: it.variant_id,
      productName: it.product_name,
      productSlug: it.product_slug,
      variantSku: it.variant_sku,
      variantSize: it.variant_size,
      variantColor: it.variant_color,
      unitPricePaise: it.unit_price_paise,
      quantity: it.quantity,
      lineTotalPaise: it.line_total_paise,
    })),
  };
}
