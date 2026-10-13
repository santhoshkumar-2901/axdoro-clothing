import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestDatabase,
  truncateTestAdmin,
  closeTestDatabase,
  testPool,
} from './test-db.js';
import {
  provisionAdmin,
  loginAdmin,
  validateSessionToken,
  resetAdminPassword,
  ALLOWED_RESET_ADMIN_EMAILS,
} from '../services/admin-auth.service.js';
import { validateResetTarget } from '../scripts/reset-admin-password.js';
import { verifyPassword } from '../utils/crypto.js';

describe('Admin Password Reset CLI Utility & Service (axdoro_test)', () => {
  beforeAll(async () => {
    await initializeTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  beforeEach(async () => {
    await truncateTestAdmin();
  });

  // 1. Target database validation tests
  describe('Database Target Safety Validation', () => {
    it('rejects empty or missing target URLs', () => {
      expect(() => validateResetTarget('', 'development')).toThrow(
        'STRICT LOCAL ISOLATION ERROR: No database connection URL provided for password reset.'
      );
    });

    it('strictly rejects remote or cloud database targets', () => {
      const remoteUrl = 'postgresql://admin:secret@ep-cool-project.us-east-2.aws.neon.tech/neondb';
      expect(() => validateResetTarget(remoteUrl, 'development')).toThrow(
        'STRICT LOCAL ISOLATION ABORT'
      );
    });

    it('rejects non-axdoro_dev database targets in development mode', () => {
      const wrongDbUrl = 'postgresql://axdoro_migrator:pw@localhost:5432/axdoro_prod';
      expect(() => validateResetTarget(wrongDbUrl, 'development')).toThrow(
        "LOCAL TARGET SAFETY GUARD: Admin password reset must target strictly 'axdoro_dev'"
      );
    });

    it('accepts valid local axdoro_dev database URL in development mode', () => {
      const validDevUrl = 'postgresql://axdoro_migrator:pw@localhost:5432/axdoro_dev';
      expect(() => validateResetTarget(validDevUrl, 'development')).not.toThrow();
    });

    it('accepts valid local axdoro_test database URL in test mode', () => {
      const validTestUrl = 'postgresql://axdoro_migrator:pw@localhost:5432/axdoro_test';
      expect(() => validateResetTarget(validTestUrl, 'test')).not.toThrow();
    });
  });

  // 2. Account selection restrictions
  describe('Account Selection & Email Restrictions', () => {
    it('restricts password reset to only the 2 authorized administrator accounts', async () => {
      expect(ALLOWED_RESET_ADMIN_EMAILS).toEqual([
        'admin1@axdoro.internal',
        'admin2@axdoro.internal',
      ]);

      await expect(
        resetAdminPassword({
          email: 'sandyff355@gmail.com',
          newPassword: 'NewPassword12345!',
        })
      ).rejects.toThrow(
        'Password reset is strictly restricted to authorized admin accounts: admin1@axdoro.internal, admin2@axdoro.internal'
      );

      await expect(
        resetAdminPassword({
          email: 'unauthorized-admin@axdoro.internal',
          newPassword: 'NewPassword12345!',
        })
      ).rejects.toThrow(
        'Password reset is strictly restricted to authorized admin accounts'
      );
    });

    it('rejects password reset if authorized admin account does not exist in database', async () => {
      // Empty database (truncated in beforeEach)
      await expect(
        resetAdminPassword({
          email: 'admin1@axdoro.internal',
          newPassword: 'NewPassword12345!',
        })
      ).rejects.toThrow('Administrator account "admin1@axdoro.internal" not found in database.');
    });

    it('rejects password reset if administrator account is inactive', async () => {
      // Seed inactive admin
      await testPool.query(`
        INSERT INTO admin_users (email, password_hash, full_name, role, is_active)
        VALUES ('admin1@axdoro.internal', 'scrypt$dummy$dummy', 'Admin One', 'admin', false);
      `);

      await expect(
        resetAdminPassword({
          email: 'admin1@axdoro.internal',
          newPassword: 'NewPassword12345!',
        })
      ).rejects.toThrow('Cannot reset password for inactive administrator account "admin1@axdoro.internal".');
    });
  });

  // 3. Password policy enforcement
  describe('Password Policy Enforcement', () => {
    it('enforces minimum 12-character password length', async () => {
      await expect(
        resetAdminPassword({
          email: 'admin1@axdoro.internal',
          newPassword: 'short',
        })
      ).rejects.toThrow('Password must be at least 12 characters long');
    });
  });

  // 4. End-to-end password reset, session revocation, and audit logging
  describe('Transactional Execution, Session Revocation & Audit Trail', () => {
    it('resets password, revokes active sessions, records audit log, and preserves account metadata', async () => {
      // 1. Provision initial administrator account
      const initialAdmin = await provisionAdmin({
        email: 'admin1@axdoro.internal',
        fullName: 'Primary Admin User',
        password: 'InitialPassword123!',
      });
      expect(initialAdmin.id).toBeDefined();

      // 2. Log in to establish an active session
      const loginRes = await loginAdmin({
        email: 'admin1@axdoro.internal',
        password: 'InitialPassword123!',
      });
      expect(loginRes.token).toBeDefined();

      // Verify active session exists in database
      const activeSessionRes = await testPool.query(
        'SELECT COUNT(*)::int AS count FROM admin_sessions WHERE admin_id = $1;',
        [initialAdmin.id]
      );
      expect(activeSessionRes.rows[0].count).toBe(1);

      // Verify session token validates
      const validSession = await validateSessionToken(loginRes.token);
      expect(validSession?.email).toBe('admin1@axdoro.internal');

      // 3. Execute password reset
      const resetResult = await resetAdminPassword({
        email: 'admin1@axdoro.internal',
        newPassword: 'BrandNewSecurePassword456!',
      });

      expect(resetResult.adminId).toBe(initialAdmin.id);
      expect(resetResult.adminEmail).toBe('admin1@axdoro.internal');
      expect(resetResult.sessionsRevoked).toBe(1);

      // 4. Verify previous sessions were revoked
      const postResetSessions = await testPool.query(
        'SELECT COUNT(*)::int AS count FROM admin_sessions WHERE admin_id = $1;',
        [initialAdmin.id]
      );
      expect(postResetSessions.rows[0].count).toBe(0);

      const revokedSession = await validateSessionToken(loginRes.token);
      expect(revokedSession).toBeNull();

      // 5. Verify database password_hash was updated and scrypt-hashed
      const userRes = await testPool.query<{
        id: string;
        email: string;
        full_name: string;
        role: string;
        is_active: boolean;
        password_hash: string;
      }>('SELECT * FROM admin_users WHERE id = $1;', [initialAdmin.id]);

      const updatedUser = userRes.rows[0];
      expect(updatedUser.email).toBe('admin1@axdoro.internal');
      expect(updatedUser.full_name).toBe('Primary Admin User');
      expect(updatedUser.role).toBe('admin');
      expect(updatedUser.is_active).toBe(true);

      // Verify password verification functions
      const isNewValid = await verifyPassword('BrandNewSecurePassword456!', updatedUser.password_hash);
      expect(isNewValid).toBe(true);

      const isOldValid = await verifyPassword('InitialPassword123!', updatedUser.password_hash);
      expect(isOldValid).toBe(false);

      // 6. Verify audit log entry
      const auditRes = await testPool.query<{
        action: string;
        admin_email: string;
        entity_type: string;
        entity_id: string;
        details: Record<string, unknown>;
      }>(
        `SELECT action, admin_email, entity_type, entity_id, details
         FROM admin_audit_logs
         WHERE action = 'ADMIN_PASSWORD_RESET'
         ORDER BY created_at DESC
         LIMIT 1;`
      );

      expect(auditRes.rows.length).toBe(1);
      const audit = auditRes.rows[0];
      expect(audit.action).toBe('ADMIN_PASSWORD_RESET');
      expect(audit.admin_email).toBe('admin1@axdoro.internal');
      expect(audit.entity_type).toBe('admin_user');
      expect(audit.entity_id).toBe(initialAdmin.id);
      expect(audit.details).toEqual({
        method: 'local_cli_reset',
        sessionsRevoked: 1,
      });

      // Verify NO passwords or hashes leaked into audit log details
      const detailsStr = JSON.stringify(audit.details);
      expect(detailsStr).not.toContain('BrandNewSecurePassword456!');
      expect(detailsStr).not.toContain('scrypt');
      expect(detailsStr).not.toContain('password');

      // 7. Verify login works with new password and fails with old password
      await expect(
        loginAdmin({
          email: 'admin1@axdoro.internal',
          password: 'InitialPassword123!',
        })
      ).rejects.toThrow('Invalid email or password');

      const newLogin = await loginAdmin({
        email: 'admin1@axdoro.internal',
        password: 'BrandNewSecurePassword456!',
      });
      expect(newLogin.token).toBeDefined();
      expect(newLogin.admin.email).toBe('admin1@axdoro.internal');
    });
  });
});
