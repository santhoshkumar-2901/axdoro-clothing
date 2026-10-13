import pg from 'pg';
import { query, withTransaction } from '../config/db.js';
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashSessionToken,
} from '../utils/crypto.js';
import { createAuditLog } from './audit-log.service.js';

export interface AdminUserDTO {
  id: string;
  email: string;
  fullName: string;
  role: 'admin';
}

export interface LoginResult {
  token: string;
  admin: AdminUserDTO;
  expiresAt: Date;
}

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/**
 * Validates and normalizes an administrator email address.
 * Rejects malformed addresses and normalizes to lower case.
 */
export function validateAndNormalizeEmail(email: string): string {
  if (!email || typeof email !== 'string') {
    throw new Error('Email address is required');
  }
  const normalized = email.trim().toLowerCase();
  if (normalized.length === 0 || normalized.length > 255) {
    throw new Error('Email must be between 1 and 255 characters long');
  }
  if (!EMAIL_REGEX.test(normalized)) {
    throw new Error(`Invalid email address format: "${email}". Must be a valid email address.`);
  }
  return normalized;
}

/**
 * Validates an administrator's full name.
 */
export function validateFullName(name: string): string {
  if (!name || typeof name !== 'string') {
    throw new Error('Administrator full name is required');
  }
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 100) {
    throw new Error('Administrator full name must be between 1 and 100 characters long');
  }
  return trimmed;
}

/**
 * Validates password strength and minimum length.
 */
export function validatePasswordStrength(password: string): void {
  if (!password || typeof password !== 'string') {
    throw new Error('Password is required');
  }
  if (password.length < 12) {
    throw new Error('Password must be at least 12 characters long');
  }
  if (password.length > 128) {
    throw new Error('Password cannot exceed 128 characters');
  }
}

/**
 * Returns the current count of active administrators.
 */
export async function getActiveAdminCount(client?: pg.PoolClient): Promise<number> {
  const sql = 'SELECT COUNT(*)::int AS count FROM admin_users WHERE is_active = true;';
  const res = client
    ? await client.query<{ count: number }>(sql)
    : await query<{ count: number }>(sql);
  return Number(res.rows[0]?.count || 0);
}

/**
 * Provisions an administrator account securely.
 * Enforces:
 *  - Strict 2-administrator cap across the system.
 *  - Transaction-level serialization via PostgreSQL advisory lock to prevent concurrent bypass.
 *  - Rejection of duplicate accounts and unexpected account updates.
 *  - Secure scrypt password hashing.
 *  - Atomically records an audit-log entry within the same database transaction.
 */
export async function provisionAdmin(params: {
  email: string;
  password: string;
  fullName: string;
}): Promise<AdminUserDTO> {
  const normalizedEmail = validateAndNormalizeEmail(params.email);
  const fullName = validateFullName(params.fullName);
  validatePasswordStrength(params.password);

  const passwordHash = await hashPassword(params.password);

  return await withTransaction(async (client) => {
    // 1. Transactional advisory lock to serialize concurrent provisioning requests
    await client.query("SELECT pg_advisory_xact_lock(hashtext('axdoro_admin_provisioning_lock'));");

    // 2. Reject duplicate email / unexpected updates
    const existing = await client.query<{ id: string; email: string }>(
      'SELECT id, email FROM admin_users WHERE email = $1;',
      [normalizedEmail]
    );
    if (existing.rows.length > 0) {
      throw new Error(
        `Administrator with email "${normalizedEmail}" already exists. Duplicate accounts and unexpected updates are rejected.`
      );
    }

    // 3. Strict 2-administrator limit enforcement
    const activeCount = await getActiveAdminCount(client);
    if (activeCount >= 2) {
      throw new Error(
        `Maximum administrator limit reached: strictly at most 2 active administrator accounts are permitted (currently ${activeCount}).`
      );
    }

    // 4. Insert new administrator
    const res = await client.query<{
      id: string;
      email: string;
      full_name: string;
      role: string;
    }>(
      `INSERT INTO admin_users (email, password_hash, full_name, role, is_active)
       VALUES ($1, $2, $3, 'admin', true)
       RETURNING id, email, full_name, role;`,
      [normalizedEmail, passwordHash, fullName]
    );

    const admin = res.rows[0];

    // 5. Create audit log within the same transaction
    await createAuditLog({
      adminId: admin.id,
      adminEmail: admin.email,
      action: 'ADMIN_PROVISIONED',
      entityType: 'admin_user',
      entityId: admin.id,
      details: { fullName: admin.full_name },
      client,
    });

    return {
      id: admin.id,
      email: admin.email,
      fullName: admin.full_name,
      role: 'admin',
    };
  });
}

/**
 * Authenticates an administrator and creates a server-side session.
 */
export async function loginAdmin(params: {
  email: string;
  password: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<LoginResult> {
  const normalizedEmail = params.email.trim().toLowerCase();

  const userRes = await query<{
    id: string;
    email: string;
    password_hash: string;
    full_name: string;
    role: string;
    is_active: boolean;
  }>(
    `SELECT id, email, password_hash, full_name, role, is_active
     FROM admin_users
     WHERE email = $1;`,
    [normalizedEmail]
  );

  const user = userRes.rows[0];

  // Constant-time check: if user doesn't exist, execute dummy verification to prevent timing attacks
  if (!user || !user.is_active) {
    await verifyPassword('dummy_password_for_timing', 'scrypt$0000$0000');
    await createAuditLog({
      adminEmail: normalizedEmail,
      action: 'AUTH_LOGIN_FAILURE',
      entityType: 'auth',
      details: { reason: 'account_not_found_or_inactive' },
      ipAddress: params.ipAddress,
    });
    throw new Error('Invalid email or password');
  }

  const isValidPassword = await verifyPassword(params.password, user.password_hash);
  if (!isValidPassword) {
    await createAuditLog({
      adminId: user.id,
      adminEmail: user.email,
      action: 'AUTH_LOGIN_FAILURE',
      entityType: 'auth',
      entityId: user.id,
      details: { reason: 'invalid_password' },
      ipAddress: params.ipAddress,
    });
    throw new Error('Invalid email or password');
  }

  // Create session
  const rawToken = generateSessionToken();
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await query(
    `INSERT INTO admin_sessions (admin_id, session_token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5);`,
    [user.id, tokenHash, expiresAt, params.ipAddress || null, params.userAgent || null]
  );

  // Update last login
  await query(`UPDATE admin_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1;`, [user.id]);

  await createAuditLog({
    adminId: user.id,
    adminEmail: user.email,
    action: 'AUTH_LOGIN_SUCCESS',
    entityType: 'auth',
    entityId: user.id,
    ipAddress: params.ipAddress,
  });

  return {
    token: rawToken,
    expiresAt,
    admin: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: 'admin',
    },
  };
}

/**
 * Validates a session token and returns the authenticated administrator.
 */
export async function validateSessionToken(token: string): Promise<AdminUserDTO | null> {
  if (!token || typeof token !== 'string') return null;

  const tokenHash = hashSessionToken(token);

  const res = await query<{
    id: string;
    email: string;
    full_name: string;
    role: string;
  }>(
    `SELECT u.id, u.email, u.full_name, u.role
     FROM admin_sessions s
     JOIN admin_users u ON s.admin_id = u.id
     WHERE s.session_token_hash = $1
       AND s.expires_at > CURRENT_TIMESTAMP
       AND u.is_active = true;`,
    [tokenHash]
  );

  if (res.rows.length === 0) {
    return null;
  }

  const row = res.rows[0];
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: 'admin',
  };
}

/**
 * Logs out an administrator and invalidates the session token on the server.
 */
export async function logoutAdmin(token: string, ipAddress?: string | null): Promise<void> {
  if (!token) return;

  const tokenHash = hashSessionToken(token);

  const sessionRes = await query<{ admin_id: string; email: string }>(
    `SELECT s.admin_id, u.email
     FROM admin_sessions s
     JOIN admin_users u ON s.admin_id = u.id
     WHERE s.session_token_hash = $1;`,
    [tokenHash]
  );

  await query(`DELETE FROM admin_sessions WHERE session_token_hash = $1;`, [tokenHash]);

  if (sessionRes.rows.length > 0) {
    const s = sessionRes.rows[0];
    await createAuditLog({
      adminId: s.admin_id,
      adminEmail: s.email,
      action: 'AUTH_LOGOUT',
      entityType: 'auth',
      entityId: s.admin_id,
      ipAddress,
    });
  }
}

export const ALLOWED_RESET_ADMIN_EMAILS = [
  'admin1@axdoro.internal',
  'admin2@axdoro.internal',
] as const;

export type AllowedResetAdminEmail = typeof ALLOWED_RESET_ADMIN_EMAILS[number];

export interface ResetAdminPasswordParams {
  email: string;
  newPassword: string;
}

export interface ResetAdminPasswordResult {
  adminId: string;
  adminEmail: string;
  sessionsRevoked: number;
}

/**
 * Securely resets an existing administrator's password.
 * Strictly limited to the 2 authorized administrator accounts.
 * Executes atomically in a transaction:
 *   1. Locks the admin user row.
 *   2. Updates password_hash with new memory-hard scrypt hash.
 *   3. Revokes all active sessions for the account.
 *   4. Writes an audit-log entry without secrets.
 */
export async function resetAdminPassword(
  params: ResetAdminPasswordParams,
  clientOverride?: pg.PoolClient
): Promise<ResetAdminPasswordResult> {
  const normalizedEmail = validateAndNormalizeEmail(params.email);

  if (!ALLOWED_RESET_ADMIN_EMAILS.includes(normalizedEmail as AllowedResetAdminEmail)) {
    throw new Error(
      `Password reset is strictly restricted to authorized admin accounts: ${ALLOWED_RESET_ADMIN_EMAILS.join(', ')}. Received: "${normalizedEmail}".`
    );
  }

  validatePasswordStrength(params.newPassword);
  const passwordHash = await hashPassword(params.newPassword);

  const executeInTransaction = async (client: pg.PoolClient): Promise<ResetAdminPasswordResult> => {
    // 1. Fetch and lock target account row
    const userRes = await client.query<{
      id: string;
      email: string;
      role: string;
      is_active: boolean;
    }>(
      `SELECT id, email, role, is_active
       FROM admin_users
       WHERE email = $1
       FOR UPDATE;`,
      [normalizedEmail]
    );

    if (userRes.rows.length === 0) {
      throw new Error(`Administrator account "${normalizedEmail}" not found in database.`);
    }

    const user = userRes.rows[0];

    if (!user.is_active) {
      throw new Error(`Cannot reset password for inactive administrator account "${normalizedEmail}".`);
    }

    // 2. Update password hash preserving all other fields
    const updateRes = await client.query(
      `UPDATE admin_users
       SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2;`,
      [passwordHash, user.id]
    );

    if (updateRes.rowCount !== 1) {
      throw new Error(`Expected exactly 1 admin user record to be updated, got ${updateRes.rowCount}.`);
    }

    // 3. Revoke all existing sessions for this admin
    const sessionRes = await client.query(
      `DELETE FROM admin_sessions
       WHERE admin_id = $1;`,
      [user.id]
    );
    const sessionsRevoked = sessionRes.rowCount || 0;

    // 4. Record audit log within the same transaction without secrets
    await createAuditLog({
      adminId: user.id,
      adminEmail: user.email,
      action: 'ADMIN_PASSWORD_RESET',
      entityType: 'admin_user',
      entityId: user.id,
      details: {
        method: 'local_cli_reset',
        sessionsRevoked,
      },
      client,
    });

    return {
      adminId: user.id,
      adminEmail: user.email,
      sessionsRevoked,
    };
  };

  if (clientOverride) {
    return await executeInTransaction(clientOverride);
  } else {
    return await withTransaction(executeInTransaction);
  }
}
