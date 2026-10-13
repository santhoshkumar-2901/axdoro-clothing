import { query } from '../config/db.js';
import pg from 'pg';

export interface AuditLogEntry {
  id: string;
  adminId: string | null;
  adminEmail: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}

export interface CreateAuditLogParams {
  adminId?: string | null;
  adminEmail: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
  client?: pg.PoolClient; // Optional client for transactional writes
}

/**
 * Creates an immutable audit log entry.
 * Can be run within an existing transaction client or against the global pool.
 */
export async function createAuditLog(params: CreateAuditLogParams): Promise<void> {
  const {
    adminId = null,
    adminEmail,
    action,
    entityType,
    entityId = null,
    details = {},
    ipAddress = null,
    client,
  } = params;

  const sql = `
    INSERT INTO admin_audit_logs (
      admin_id, admin_email, action, entity_type, entity_id, details, ip_address
    ) VALUES ($1, $2, $3, $4, $5, $6, $7);
  `;
  const values = [
    adminId,
    adminEmail,
    action,
    entityType,
    entityId,
    JSON.stringify(details),
    ipAddress,
  ];

  if (client) {
    await client.query(sql, values);
  } else {
    await query(sql, values);
  }
}

/**
 * Retrieves audit logs with pagination and optional filtering by action or entity type.
 */
export async function getAuditLogs(params: {
  page?: number;
  limit?: number;
  action?: string;
  entityType?: string;
}): Promise<{ logs: AuditLogEntry[]; totalCount: number; totalPages: number }> {
  const page = Math.max(params.page || 1, 1);
  const limit = Math.min(Math.max(params.limit || 20, 1), 100);
  const offset = (page - 1) * limit;

  const whereClauses: string[] = [];
  const queryParams: unknown[] = [];

  if (params.action) {
    queryParams.push(params.action);
    whereClauses.push(`action = $${queryParams.length}`);
  }

  if (params.entityType) {
    queryParams.push(params.entityType);
    whereClauses.push(`entity_type = $${queryParams.length}`);
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const countRes = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM admin_audit_logs ${whereSql}`,
    queryParams
  );
  const totalCount = parseInt(countRes.rows[0]?.count || '0', 10);
  const totalPages = Math.ceil(totalCount / limit) || 1;

  const dataParams = [...queryParams, limit, offset];
  const listSql = `
    SELECT id, admin_id, admin_email, action, entity_type, entity_id, details, ip_address, created_at
    FROM admin_audit_logs
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length};
  `;
  const listRes = await query<{
    id: string;
    admin_id: string | null;
    admin_email: string;
    action: string;
    entity_type: string;
    entity_id: string | null;
    details: Record<string, unknown>;
    ip_address: string | null;
    created_at: Date;
  }>(listSql, dataParams);

  const logs: AuditLogEntry[] = listRes.rows.map((row) => ({
    id: row.id,
    adminId: row.admin_id,
    adminEmail: row.admin_email,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    details: row.details,
    ipAddress: row.ip_address,
    createdAt: row.created_at.toISOString(),
  }));

  return { logs, totalCount, totalPages };
}
