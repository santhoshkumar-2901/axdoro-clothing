import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import {
  initializeTestDatabase,
  truncateTestAdmin,
  truncateTestCatalogue,
  closeTestDatabase,
  testPool,
  validateTestDatabaseTarget,
} from './test-db.js';
import {
  provisionAdmin,
  getActiveAdminCount,
  validateAndNormalizeEmail,
} from '../services/admin-auth.service.js';
import { validateProvisioningTarget } from '../scripts/provision-admin.js';
import { generateCsrfToken } from '../middleware/csrf.js';

describe('Admin Authentication & Authorization Integration Tests (axdoro_test)', () => {
  beforeAll(async () => {
    await initializeTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  beforeEach(async () => {
    await truncateTestAdmin();
  });

  it('proves database isolation rejects non-test and remote database targets', () => {
    expect(() => validateTestDatabaseTarget('postgresql://user:pass@remote.neon.tech/axdoro_test')).toThrow(
      /Remote database URL rejected/i
    );
    expect(() => validateTestDatabaseTarget('postgresql://user:pass@localhost:5432/axdoro_dev')).toThrow(
      /TEST DB SAFETY GUARD/i
    );
    expect(() => validateTestDatabaseTarget('postgresql://user:pass@localhost:5432/production_db')).toThrow(
      /TEST DB SAFETY GUARD/i
    );
  });

  it('rejects anonymous requests to all protected admin endpoints with 401', async () => {
    const endpoints = [
      { method: 'get', path: '/api/admin/auth/me' },
      { method: 'get', path: '/api/admin/metrics' },
      { method: 'get', path: '/api/admin/products' },
      { method: 'post', path: '/api/admin/products' },
      { method: 'get', path: '/api/admin/categories' },
      { method: 'post', path: '/api/admin/inventory/variants/any-id/stock' },
      { method: 'get', path: '/api/admin/audit-logs' },
    ];

    for (const ep of endpoints) {
      const res = await (request(app) as any)[ep.method](ep.path);
      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    }
  });

  it('rejects fake, expired, or invalid session tokens with 401', async () => {
    const resBearer = await request(app)
      .get('/api/admin/auth/me')
      .set('Authorization', 'Bearer invalid_token_12345');
    expect(resBearer.status).toBe(401);
    expect(resBearer.body.error).toMatch(/session|unauthorized|authentication/i);

    const resCookie = await request(app)
      .get('/api/admin/auth/me')
      .set('Cookie', ['axdoro_admin_session=invalid_cookie_token_98765']);
    expect(resCookie.status).toBe(401);
  });

  it('allows both provisioned administrator accounts to login successfully', async () => {
    // Provision exactly two authorized administrator accounts
    const admin1 = await provisionAdmin({
      email: 'admin1@axdoro.test',
      password: 'SuperSecretPassword1!',
      fullName: 'Primary Administrator',
    });
    const admin2 = await provisionAdmin({
      email: 'admin2@axdoro.test',
      password: 'SuperSecretPassword2!',
      fullName: 'Operations Administrator',
    });

    expect(admin1.email).toBe('admin1@axdoro.test');
    expect(admin2.email).toBe('admin2@axdoro.test');

    // Admin 1 login
    const res1 = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: 'admin1@axdoro.test', password: 'SuperSecretPassword1!' });
    expect(res1.status).toBe(200);
    expect(res1.body.user.email).toBe('admin1@axdoro.test');
    expect(res1.body.user.role).toBe('admin');
    expect(res1.body.token).toBeDefined();

    // Verify session cookie was set
    const cookies1 = res1.headers['set-cookie'];
    expect(cookies1).toBeDefined();
    expect(cookies1[0]).toMatch(/axdoro_admin_session=/);
    expect(cookies1[0]).toMatch(/HttpOnly/i);

    // Admin 2 login
    const res2 = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: 'admin2@axdoro.test', password: 'SuperSecretPassword2!' });
    expect(res2.status).toBe(200);
    expect(res2.body.user.email).toBe('admin2@axdoro.test');
    expect(res2.body.user.role).toBe('admin');
  });

  it('returns generic authentication error for invalid email or password without revealing existence', async () => {
    await provisionAdmin({
      email: 'existing@axdoro.test',
      password: 'CorrectPassword123!',
      fullName: 'Test Admin',
    });

    // Wrong password for existing user
    const resWrongPw = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: 'existing@axdoro.test', password: 'WrongPassword999!' });
    expect(resWrongPw.status).toBe(401);
    expect(resWrongPw.body.error).toBe('Invalid email or password');

    // Non-existent user
    const resNoUser = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: 'nonexistent@axdoro.test', password: 'AnyPassword123!' });
    expect(resNoUser.status).toBe(401);
    expect(resNoUser.body.error).toBe('Invalid email or password');

    // Both error messages must be strictly identical
    expect(resWrongPw.body.error).toEqual(resNoUser.body.error);
  });

  it('verifies /me endpoint returns authenticated admin profile and rejects after logout', async () => {
    await provisionAdmin({
      email: 'session-test@axdoro.test',
      password: 'SessionPassword123!',
      fullName: 'Session Admin',
    });

    const loginRes = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: 'session-test@axdoro.test', password: 'SessionPassword123!' });
    const token = loginRes.body.token;
    const cookie = loginRes.headers['set-cookie'];

    // Access /me via Bearer token
    const meBearer = await request(app)
      .get('/api/admin/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(meBearer.status).toBe(200);
    expect(meBearer.body.user.email).toBe('session-test@axdoro.test');

    // Access /me via cookie
    const meCookie = await request(app)
      .get('/api/admin/auth/me')
      .set('Cookie', cookie);
    expect(meCookie.status).toBe(200);
    expect(meCookie.body.user.email).toBe('session-test@axdoro.test');

    // Invalidate session via logout
    const logoutRes = await request(app)
      .post('/api/admin/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);

    // Verify session is now unusable
    const meAfterLogout = await request(app)
      .get('/api/admin/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(meAfterLogout.status).toBe(401);
  });

  it('ensures no public admin registration or self-promotion route exists', async () => {
    const registerRes = await request(app)
      .post('/api/admin/register')
      .send({ email: 'hacker@axdoro.test', password: 'Password123!' });
    expect([404, 401]).toContain(registerRes.status);

    const publicRegisterRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'hacker@axdoro.test', password: 'Password123!' });
    expect(publicRegisterRes.status).toBe(404);
  });

  it('records successful and failed login attempts in the audit log', async () => {
    await provisionAdmin({
      email: 'audit-user@axdoro.test',
      password: 'AuditPassword123!',
      fullName: 'Audit User',
    });

    // Failed attempt
    await request(app)
      .post('/api/admin/auth/login')
      .send({ email: 'audit-user@axdoro.test', password: 'WrongPassword!' });

    // Successful attempt
    const loginRes = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: 'audit-user@axdoro.test', password: 'AuditPassword123!' });
    const token = loginRes.body.token;

    // View audit logs as authenticated admin
    const auditRes = await request(app)
      .get('/api/admin/audit-logs')
      .set('Authorization', `Bearer ${token}`);
    expect(auditRes.status).toBe(200);
    expect(auditRes.body.logs.length).toBeGreaterThanOrEqual(2);

    const actions = auditRes.body.logs.map((l: any) => l.action);
    expect(actions).toContain('AUTH_LOGIN_FAILURE');
    expect(actions).toContain('AUTH_LOGIN_SUCCESS');

    // Never log raw passwords in audit details
    for (const log of auditRes.body.logs) {
      const detailsStr = JSON.stringify(log.details);
      expect(detailsStr).not.toMatch(/AuditPassword123!/);
      expect(detailsStr).not.toMatch(/WrongPassword!/);
    }
  });

  describe('Secure Administrator Account Provisioning Controls', () => {
    it('strictly enforces the maximum of two active administrator accounts', async () => {
      // 1. First admin succeeds
      const first = await provisionAdmin({
        email: 'primary@axdoro.test',
        fullName: 'Primary Owner',
        password: 'ValidPassword123!',
      });
      expect(first.email).toBe('primary@axdoro.test');

      // 2. Second admin succeeds
      const second = await provisionAdmin({
        email: 'secondary@axdoro.test',
        fullName: 'Operations Manager',
        password: 'ValidPassword456!',
      });
      expect(second.email).toBe('secondary@axdoro.test');

      // Verify active count is 2
      const count = await getActiveAdminCount();
      expect(count).toBe(2);

      // 3. Third admin must be strictly rejected
      await expect(
        provisionAdmin({
          email: 'third@axdoro.test',
          fullName: 'Unauthorized Third Admin',
          password: 'ValidPassword789!',
        })
      ).rejects.toThrow(/Maximum administrator limit reached/i);

      // Verify count remains strictly 2
      const finalCount = await getActiveAdminCount();
      expect(finalCount).toBe(2);
    });

    it('rejects duplicate emails and unexpected account updates', async () => {
      await provisionAdmin({
        email: 'unique-admin@axdoro.test',
        fullName: 'Original Admin',
        password: 'OriginalPassword123!',
      });

      // Exact match duplicate
      await expect(
        provisionAdmin({
          email: 'unique-admin@axdoro.test',
          fullName: 'Duplicate Admin',
          password: 'NewPassword12345!',
        })
      ).rejects.toThrow(/already exists.*duplicate/i);

      // Case-insensitive duplicate (e.g., uppercase or mixed case)
      await expect(
        provisionAdmin({
          email: 'UNIQUE-ADMIN@axdoro.test',
          fullName: 'Uppercase Duplicate',
          password: 'NewPassword12345!',
        })
      ).rejects.toThrow(/already exists.*duplicate/i);

      // Whitespace padded duplicate
      await expect(
        provisionAdmin({
          email: '  unique-admin@axdoro.test  ',
          fullName: 'Padded Duplicate',
          password: 'NewPassword12345!',
        })
      ).rejects.toThrow(/already exists.*duplicate/i);

      // Verify active count remains 1
      expect(await getActiveAdminCount()).toBe(1);
    });

    it('prevents concurrent provisioning attempts from exceeding the two-account limit', async () => {
      // Launch 3 simultaneous provisioning calls concurrently
      const attempts = [
        provisionAdmin({
          email: 'concurrent1@axdoro.test',
          fullName: 'Concurrent Admin 1',
          password: 'ConcurrentPass123!',
        }),
        provisionAdmin({
          email: 'concurrent2@axdoro.test',
          fullName: 'Concurrent Admin 2',
          password: 'ConcurrentPass123!',
        }),
        provisionAdmin({
          email: 'concurrent3@axdoro.test',
          fullName: 'Concurrent Admin 3',
          password: 'ConcurrentPass123!',
        }),
      ];

      const results = await Promise.allSettled(attempts);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly 2 must succeed and exactly 1 must fail due to the limit
      expect(fulfilled).toHaveLength(2);
      expect(rejected).toHaveLength(1);

      if (rejected[0].status === 'rejected') {
        expect(rejected[0].reason.message).toMatch(/Maximum administrator limit reached/i);
      }

      // Verify final database count is exactly 2
      const totalActive = await getActiveAdminCount();
      expect(totalActive).toBe(2);
    });

    it('enforces password length and verifies cryptographic scrypt storage', async () => {
      // Too short (< 12 chars)
      await expect(
        provisionAdmin({
          email: 'shortpass@axdoro.test',
          fullName: 'Short Pass',
          password: 'Short1!',
        })
      ).rejects.toThrow(/at least 12 characters/i);

      // Valid password
      const admin = await provisionAdmin({
        email: 'cryptotest@axdoro.test',
        fullName: 'Crypto Test Admin',
        password: 'ValidPassword123!',
      });

      // Verify raw database record stores scrypt hash, not plaintext
      const dbRes = await testPool.query<{ password_hash: string }>(
        'SELECT password_hash FROM admin_users WHERE id = $1;',
        [admin.id]
      );
      const hash = dbRes.rows[0].password_hash;
      expect(hash).toMatch(/^scrypt\$/);
      expect(hash).not.toBe('ValidPassword123!');
      expect(hash).not.toContain('ValidPassword123!');
    });

    it('validates and normalizes email format strictly', () => {
      expect(validateAndNormalizeEmail('  Admin@Axdoro.Test  ')).toBe('admin@axdoro.test');
      expect(() => validateAndNormalizeEmail('')).toThrow(/required/i);
      expect(() => validateAndNormalizeEmail('not-an-email')).toThrow(/invalid email/i);
      expect(() => validateAndNormalizeEmail('@missing-user.com')).toThrow(/invalid email/i);
      expect(() => validateAndNormalizeEmail('user@missing-tld')).toThrow(/invalid email/i);
    });

    describe('validateProvisioningTarget safeguards (Phase 4C-1)', () => {
      const localDevUrl = 'postgresql://axdoro_migrator:pass@localhost:5432/axdoro_dev';
      const remoteDirectUrl =
        'postgresql://user:pass@ep-cool-dev.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
      const remotePooledUrl =
        'postgresql://user:pass@ep-cool-dev-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

      it('1. permits valid local development target across opt-in states', () => {
        expect(() => validateProvisioningTarget(localDevUrl, 'development', false)).not.toThrow();
        expect(() => validateProvisioningTarget(localDevUrl, 'development', true)).not.toThrow();
      });

      it('2. permits remote development target with explicit opt-in and valid direct TLS endpoint', () => {
        expect(() => validateProvisioningTarget(remoteDirectUrl, 'development', true)).not.toThrow();
        expect(() =>
          validateProvisioningTarget(
            'postgresql://user:pass@ep-cool-dev.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full',
            'development',
            true
          )
        ).not.toThrow();
      });

      it('3. rejects remote target without opt-in', () => {
        expect(() => validateProvisioningTarget(remoteDirectUrl, 'development', false)).toThrow(
          /STRICT LOCAL ISOLATION ABORT: Admin provisioning script targeting a remote database requires explicit ALLOW_REMOTE_DEV_DB=true/i
        );
      });

      it('4. rejects remote target when explicit opt-in is false', () => {
        expect(() => validateProvisioningTarget(remoteDirectUrl, 'development', false)).toThrow(
          /STRICT LOCAL ISOLATION ABORT/i
        );
      });

      it('5. strictly rejects production mode with local target', () => {
        expect(() => validateProvisioningTarget(localDevUrl, 'production', false)).toThrow(
          /PRODUCTION SAFETY GUARD: Administrator provisioning script cannot and will not be executed in production environment/i
        );
        expect(() => validateProvisioningTarget(localDevUrl, 'production', true)).toThrow(
          /PRODUCTION SAFETY GUARD/i
        );
      });

      it('6. strictly rejects production mode with remote target', () => {
        expect(() => validateProvisioningTarget(remoteDirectUrl, 'production', true)).toThrow(
          /PRODUCTION SAFETY GUARD: Administrator provisioning script cannot and will not be executed in production environment/i
        );
        expect(() => validateProvisioningTarget(remoteDirectUrl, 'production', false)).toThrow(
          /PRODUCTION SAFETY GUARD/i
        );
      });

      it('7. strictly rejects test mode with local target', () => {
        expect(() => validateProvisioningTarget(localDevUrl, 'test', false)).toThrow(
          /TEST ISOLATION GUARD: Administrator provisioning script cannot be executed in test mode/i
        );
        expect(() => validateProvisioningTarget(localDevUrl, 'test', true)).toThrow(
          /TEST ISOLATION GUARD/i
        );
      });

      it('8. strictly rejects test mode with remote target', () => {
        expect(() => validateProvisioningTarget(remoteDirectUrl, 'test', true)).toThrow(
          /TEST ISOLATION GUARD: Administrator provisioning script cannot be executed in test mode/i
        );
        expect(() => validateProvisioningTarget(remoteDirectUrl, 'test', false)).toThrow(
          /TEST ISOLATION GUARD/i
        );
      });

      it('9. strictly rejects pooled Neon endpoints even when opt-in is true', () => {
        expect(() => validateProvisioningTarget(remotePooledUrl, 'development', true)).toThrow(
          /UNSUPPORTED POOLED ENDPOINT: Admin provisioning operations cannot be executed against pooled connection endpoints \(-pooler\)/i
        );
      });

      it('10. strictly rejects missing and malformed URLs without leaking secrets', () => {
        expect(() => validateProvisioningTarget('', 'development', true)).toThrow(
          /No database connection URL provided/i
        );
        expect(() => validateProvisioningTarget('   ', 'development', true)).toThrow(
          /No database connection URL provided/i
        );
        expect(() => validateProvisioningTarget('not-a-valid-url', 'development', true)).toThrow(
          /DATABASE CONFIGURATION ERROR: Malformed database connection URL/i
        );
        expect(() => validateProvisioningTarget('http://localhost:5432/db', 'development', true)).toThrow(
          /Unsupported database protocol 'http:'/i
        );

        try {
          validateProvisioningTarget(
            'postgresql://migrator:SUPER_SECRET_TOKEN@invalid-host:not-a-port/axdoro',
            'development',
            true
          );
          expect.unreachable('Should have thrown on malformed URL');
        } catch (err: unknown) {
          const error = err as Error;
          expect(error.message).toContain('DATABASE CONFIGURATION ERROR: Malformed database connection URL');
          expect(error.message).not.toContain('SUPER_SECRET_TOKEN');
        }
      });

      it('11. strictly rejects invalid or insecure remote TLS configurations', () => {
        expect(() =>
          validateProvisioningTarget(
            'postgresql://user:pass@ep-cool-dev.ap-southeast-1.aws.neon.tech/neondb?sslmode=disable',
            'development',
            true
          )
        ).toThrow(/INSECURE TLS CONFIGURATION REJECTED: 'sslmode=disable' is forbidden on remote database connections/i);

        expect(() =>
          validateProvisioningTarget(
            'postgresql://user:pass@ep-cool-dev.ap-southeast-1.aws.neon.tech/neondb?sslmode=allow',
            'development',
            true
          )
        ).toThrow(/INSECURE TLS CONFIGURATION REJECTED: 'sslmode=allow' is forbidden on remote database connections/i);

        expect(() =>
          validateProvisioningTarget(
            'postgresql://user:pass@ep-cool-dev.ap-southeast-1.aws.neon.tech/neondb?sslmode=no-verify',
            'development',
            true
          )
        ).toThrow(/INSECURE TLS CONFIGURATION REJECTED: Insecure sslmode 'no-verify' is forbidden/i);

        expect(() =>
          validateProvisioningTarget(
            'postgresql://user:pass@ep-cool-dev.ap-southeast-1.aws.neon.tech/neondb?sslmode=prefer',
            'development',
            true
          )
        ).toThrow(/INSECURE TLS CONFIGURATION REJECTED: Insecure sslmode 'prefer' is forbidden/i);

        expect(() =>
          validateProvisioningTarget(
            'postgresql://user:pass@ep-cool-dev.ap-southeast-1.aws.neon.tech/neondb?ssl=false',
            'development',
            true
          )
        ).toThrow(/INSECURE TLS CONFIGURATION REJECTED: Insecure ssl parameter 'false' is forbidden/i);

        expect(() =>
          validateProvisioningTarget(
            'postgresql://user:pass@ep-cool-dev.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&uselibpqcompat=true',
            'development',
            true
          )
        ).toThrow(/INSECURE TLS CONFIGURATION REJECTED: uselibpqcompat parameter is forbidden/i);

        expect(() =>
          validateProvisioningTarget(
            'postgresql://user:pass@ep-cool-dev.ap-southeast-1.aws.neon.tech/neondb',
            'development',
            true
          )
        ).toThrow(/Remote database connection must explicitly enforce verified TLS/i);
      });

      it('12. enforces regression coverage for existing runtime-target safeguards', () => {
        expect(() =>
          validateProvisioningTarget(
            'postgresql://user:pass@localhost:5432/axdoro_test?sslmode=require',
            'development',
            false
          )
        ).toThrow(
          /STRICT LOCAL ISOLATION ABORT: Admin provisioning script targeting a remote database requires explicit ALLOW_REMOTE_DEV_DB=true/i
        );

        expect(() => validateProvisioningTarget(remoteDirectUrl, 'staging', true)).toThrow(
          /STRICT LOCAL DATABASE ISOLATION ERROR: Remote database detected in non-production environment 'staging'/i
        );
      });
    });
  });

  describe('Admin Session Security and CSRF Hardening (Phase 3C)', () => {
    beforeEach(async () => {
      await truncateTestAdmin();
      await truncateTestCatalogue();
    });

    it('establishes HttpOnly session cookie, readable CSRF cookie, and returns csrfToken upon login', async () => {
      await provisionAdmin({
        email: 'csrf-admin@axdoro.test',
        password: 'AdminPassword123!',
        fullName: 'CSRF Test Admin',
      });

      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'csrf-admin@axdoro.test', password: 'AdminPassword123!' });

      expect(res.status).toBe(200);
      expect(res.body.data.admin.email).toBe('csrf-admin@axdoro.test');
      expect(res.body.data.csrfToken).toBeDefined();

      const setCookies = res.headers['set-cookie'] as string[];
      expect(setCookies).toBeDefined();

      // Verify HttpOnly session cookie
      const sessionCookie = setCookies.find((c) => c.startsWith('axdoro_admin_session='));
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie).toMatch(/HttpOnly/i);
      expect(sessionCookie).toMatch(/SameSite=Strict/i);

      // Verify non-HttpOnly readable CSRF cookie
      const csrfCookie = setCookies.find((c) => c.startsWith('axdoro_csrf_token='));
      expect(csrfCookie).toBeDefined();
      expect(csrfCookie).not.toMatch(/HttpOnly/i);
      expect(csrfCookie).toMatch(/SameSite=Strict/i);

      // Verify the returned token matches the CSRF cookie value
      const match = csrfCookie!.match(/axdoro_csrf_token=([^;]+)/);
      expect(match![1]).toBe(res.body.data.csrfToken);
    });

    it('allows login when a stale or expired session cookie is present without requiring X-CSRF-Token', async () => {
      await provisionAdmin({
        email: 'stale-cookie-admin@axdoro.test',
        password: 'AdminPassword123!',
        fullName: 'Stale Cookie Admin',
      });

      // Browser sends stale axdoro_admin_session cookie from a previous session and no X-CSRF-Token
      const res = await request(app)
        .post('/api/admin/auth/login')
        .set('Cookie', ['axdoro_admin_session=stale_expired_session_token_12345'])
        .send({ email: 'stale-cookie-admin@axdoro.test', password: 'AdminPassword123!' });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('stale-cookie-admin@axdoro.test');
      expect(res.body.data.csrfToken).toBeDefined();

      const setCookies = res.headers['set-cookie'] as string[];
      expect(setCookies).toBeDefined();
      const sessionCookie = setCookies.find((c) => c.startsWith('axdoro_admin_session='));
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie).not.toContain('stale_expired_session_token_12345');
    });

    it('allows login with trailing slash and query parameters when stale session cookie is present', async () => {
      await provisionAdmin({
        email: 'trailing-slash-admin@axdoro.test',
        password: 'AdminPassword123!',
        fullName: 'Trailing Slash Admin',
      });

      const res = await request(app)
        .post('/api/admin/auth/login/?source=admin-portal&ref=direct')
        .set('Cookie', ['axdoro_admin_session=stale_expired_token_99999'])
        .send({ email: 'trailing-slash-admin@axdoro.test', password: 'AdminPassword123!' });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('trailing-slash-admin@axdoro.test');
      expect(res.body.data.csrfToken).toBeDefined();
    });

    it('ensures unrelated paths like /api/admin/login do not inherit the login CSRF exemption when session cookie is present', async () => {
      // A request to /api/admin/login with a session cookie but no CSRF token must NOT be exempted
      const res = await request(app)
        .post('/api/admin/login')
        .set('Cookie', ['axdoro_admin_session=active_or_stale_session_12345'])
        .send({ email: 'any@axdoro.test', password: 'AnyPassword123!' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/CSRF token missing in request header/i);
    });

    it('still enforces Origin verification on login endpoint, rejecting untrusted origins with 403', async () => {
      await provisionAdmin({
        email: 'origin-login-admin@axdoro.test',
        password: 'AdminPassword123!',
        fullName: 'Origin Login Admin',
      });

      const res = await request(app)
        .post('/api/admin/auth/login')
        .set('Origin', 'http://malicious-attacker-site.com')
        .send({ email: 'origin-login-admin@axdoro.test', password: 'AdminPassword123!' });

      // Must be rejected by CORS or CSRF Origin verification
      expect([403, 500]).toContain(res.status);
      expect(res.body.status).toBe('error');
    });

    it('still enforces Referer verification on login endpoint when Origin header is omitted', async () => {
      await provisionAdmin({
        email: 'referer-login-admin@axdoro.test',
        password: 'AdminPassword123!',
        fullName: 'Referer Login Admin',
      });

      const res = await request(app)
        .post('/api/admin/auth/login')
        .set('Referer', 'http://malicious-attacker-site.com/exploit')
        .send({ email: 'referer-login-admin@axdoro.test', password: 'AdminPassword123!' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/untrusted Referer/i);
    });

    it('rejects state-changing requests when a CSRF token from a different session is supplied', async () => {
      const admin1 = await provisionAdmin({
        email: 'admin-one@axdoro.test',
        password: 'AdminPassword123!',
        fullName: 'Admin One',
      });
      const admin2 = await provisionAdmin({
        email: 'admin-two@axdoro.test',
        password: 'AdminPassword456!',
        fullName: 'Admin Two',
      });

      const loginRes1 = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin-one@axdoro.test', password: 'AdminPassword123!' });
      const cookies1 = loginRes1.headers['set-cookie'] as string[];

      const loginRes2 = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin-two@axdoro.test', password: 'AdminPassword456!' });
      const csrfToken2 = loginRes2.body.data.csrfToken;

      // Attempt state change using Admin 1 session cookie with Admin 2 CSRF token
      const sessionCookie1 = cookies1.find((c) => c.startsWith('axdoro_admin_session='));
      const crossSessionCookies = [sessionCookie1!, `axdoro_csrf_token=${csrfToken2}`];

      const createRes = await request(app)
        .post('/api/admin/categories')
        .set('Cookie', crossSessionCookies)
        .set('X-CSRF-Token', csrfToken2)
        .send({ name: 'Cross Session Category', slug: 'cross-session-category' });

      expect(createRes.status).toBe(403);
      expect(createRes.body.error).toMatch(/Invalid or forged CSRF token/i);

      // Verify database state: no category was inserted
      const dbCheck = await testPool.query('SELECT * FROM categories WHERE slug = $1;', ['cross-session-category']);
      expect(dbCheck.rows).toHaveLength(0);
    });

    it('allows read-only endpoints with valid session cookie without requiring CSRF header', async () => {
      await provisionAdmin({
        email: 'readonly-admin@axdoro.test',
        password: 'AdminPassword123!',
        fullName: 'Read Only Admin',
      });

      const loginRes = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'readonly-admin@axdoro.test', password: 'AdminPassword123!' });

      const cookies = loginRes.headers['set-cookie'] as string[];

      // GET /api/admin/auth/me
      const meRes = await request(app)
        .get('/api/admin/auth/me')
        .set('Cookie', cookies);
      expect(meRes.status).toBe(200);
      expect(meRes.body.data.email).toBe('readonly-admin@axdoro.test');

      // GET /api/admin/metrics
      const metricsRes = await request(app)
        .get('/api/admin/metrics')
        .set('Cookie', cookies);
      expect(metricsRes.status).toBe(200);
      expect(metricsRes.body.data.products).toBeDefined();

      // GET /api/admin/products
      const prodsRes = await request(app)
        .get('/api/admin/products')
        .set('Cookie', cookies);
      expect(prodsRes.status).toBe(200);
      expect(Array.isArray(prodsRes.body.data)).toBe(true);
    });

    it('rejects state-changing requests with cookie authentication when CSRF header is missing and prevents mutation', async () => {
      await provisionAdmin({
        email: 'csrf-mut-admin@axdoro.test',
        password: 'AdminPassword123!',
        fullName: 'Mutation Admin',
      });

      const loginRes = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'csrf-mut-admin@axdoro.test', password: 'AdminPassword123!' });

      const cookies = loginRes.headers['set-cookie'] as string[];

      // Attempt category creation without X-CSRF-Token header
      const createRes = await request(app)
        .post('/api/admin/categories')
        .set('Cookie', cookies)
        .send({ name: 'Unprotected Category', slug: 'unprotected-category' });

      expect(createRes.status).toBe(403);
      expect(createRes.body.error).toMatch(/CSRF token missing/i);

      // Verify database state: no category was inserted
      const dbCheck = await testPool.query('SELECT * FROM categories WHERE slug = $1;', ['unprotected-category']);
      expect(dbCheck.rows).toHaveLength(0);
    });

    it('rejects state-changing requests when CSRF token is invalid or forged and prevents mutation', async () => {
      await provisionAdmin({
        email: 'csrf-forged@axdoro.test',
        password: 'AdminPassword123!',
        fullName: 'Forged CSRF Admin',
      });

      const loginRes = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'csrf-forged@axdoro.test', password: 'AdminPassword123!' });

      const cookies = loginRes.headers['set-cookie'] as string[];
      const sessionCookie = cookies.find((c) => c.startsWith('axdoro_admin_session='));

      // Send forged CSRF header and cookie
      const fakeToken = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
      const fakeCookies = [sessionCookie!, `axdoro_csrf_token=${fakeToken}`];

      const createRes = await request(app)
        .post('/api/admin/categories')
        .set('Cookie', fakeCookies)
        .set('X-CSRF-Token', fakeToken)
        .send({ name: 'Forged Category', slug: 'forged-category' });

      expect(createRes.status).toBe(403);
      expect(createRes.body.error).toMatch(/Invalid or forged CSRF token/i);

      // Verify database state: no category was inserted
      const dbCheck = await testPool.query('SELECT * FROM categories WHERE slug = $1;', ['forged-category']);
      expect(dbCheck.rows).toHaveLength(0);
    });

    it('rejects state-changing requests when header and cookie CSRF tokens mismatch', async () => {
      await provisionAdmin({
        email: 'csrf-mismatch@axdoro.test',
        password: 'AdminPassword123!',
        fullName: 'Mismatch Admin',
      });

      const loginRes = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'csrf-mismatch@axdoro.test', password: 'AdminPassword123!' });

      const cookies = loginRes.headers['set-cookie'] as string[];
      const validCsrf = loginRes.body.data.csrfToken;

      const createRes = await request(app)
        .post('/api/admin/categories')
        .set('Cookie', cookies)
        .set('X-CSRF-Token', 'different_token_12345')
        .send({ name: 'Mismatch Category', slug: 'mismatch-category' });

      expect(createRes.status).toBe(403);
      expect(createRes.body.error).toMatch(/CSRF token mismatch/i);

      // Verify database state: no category was inserted
      const dbCheck = await testPool.query('SELECT * FROM categories WHERE slug = $1;', ['mismatch-category']);
      expect(dbCheck.rows).toHaveLength(0);
    });

    it('accepts state-changing requests when valid session and matching CSRF token are provided', async () => {
      await provisionAdmin({
        email: 'csrf-valid@axdoro.test',
        password: 'AdminPassword123!',
        fullName: 'Valid CSRF Admin',
      });

      const loginRes = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'csrf-valid@axdoro.test', password: 'AdminPassword123!' });

      const cookies = loginRes.headers['set-cookie'] as string[];
      const validCsrf = loginRes.body.data.csrfToken;

      const createRes = await request(app)
        .post('/api/admin/categories')
        .set('Cookie', cookies)
        .set('X-CSRF-Token', validCsrf)
        .send({ name: 'Valid CSRF Category', slug: 'valid-csrf-category' });

      expect(createRes.status).toBe(201);
      expect(createRes.body.category.name).toBe('Valid CSRF Category');

      // Verify database state: category was inserted
      const dbCheck = await testPool.query('SELECT * FROM categories WHERE slug = $1;', ['valid-csrf-category']);
      expect(dbCheck.rows).toHaveLength(1);
    });

    it('rejects state-changing requests when Origin is untrusted and prevents mutation', async () => {
      await provisionAdmin({
        email: 'csrf-origin@axdoro.test',
        password: 'AdminPassword123!',
        fullName: 'Origin Test Admin',
      });

      const loginRes = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'csrf-origin@axdoro.test', password: 'AdminPassword123!' });

      const cookies = loginRes.headers['set-cookie'] as string[];
      const validCsrf = loginRes.body.data.csrfToken;

      const createRes = await request(app)
        .post('/api/admin/categories')
        .set('Cookie', cookies)
        .set('X-CSRF-Token', validCsrf)
        .set('Origin', 'http://malicious-attacker-site.com')
        .send({ name: 'Attacker Category', slug: 'attacker-category' });

      // Must be rejected by CORS or CSRF Origin verification
      expect([403, 500]).toContain(createRes.status);
      expect(createRes.body.status).toBe('error');

      // Verify database state: no category was inserted
      const dbCheck = await testPool.query('SELECT * FROM categories WHERE slug = $1;', ['attacker-category']);
      expect(dbCheck.rows).toHaveLength(0);
    });

    it('rejects state-changing requests when Referer origin is untrusted and Origin is omitted', async () => {
      await provisionAdmin({
        email: 'csrf-referer@axdoro.test',
        password: 'AdminPassword123!',
        fullName: 'Referer Test Admin',
      });

      const loginRes = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'csrf-referer@axdoro.test', password: 'AdminPassword123!' });

      const cookies = loginRes.headers['set-cookie'] as string[];
      const validCsrf = loginRes.body.data.csrfToken;

      const createRes = await request(app)
        .post('/api/admin/categories')
        .set('Cookie', cookies)
        .set('X-CSRF-Token', validCsrf)
        .set('Referer', 'http://malicious-attacker-site.com/exploit')
        .send({ name: 'Referer Category', slug: 'referer-category' });

      expect(createRes.status).toBe(403);
      expect(createRes.body.error).toMatch(/untrusted Referer/i);

      // Verify database state: no category was inserted
      const dbCheck = await testPool.query('SELECT * FROM categories WHERE slug = $1;', ['referer-category']);
      expect(dbCheck.rows).toHaveLength(0);
    });

    it('protects logout endpoint against CSRF for cookie-authenticated sessions and invalidates session on logout', async () => {
      await provisionAdmin({
        email: 'logout-csrf@axdoro.test',
        password: 'AdminPassword123!',
        fullName: 'Logout Admin',
      });

      const loginRes = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'logout-csrf@axdoro.test', password: 'AdminPassword123!' });

      const cookies = loginRes.headers['set-cookie'] as string[];
      const validCsrf = loginRes.body.data.csrfToken;

      // 1. Attempt logout without CSRF token
      const failedLogout = await request(app)
        .post('/api/admin/auth/logout')
        .set('Cookie', cookies);
      expect(failedLogout.status).toBe(403);
      expect(failedLogout.body.error).toMatch(/CSRF token missing/i);

      // Verify session is still active
      const meStillActive = await request(app)
        .get('/api/admin/auth/me')
        .set('Cookie', cookies);
      expect(meStillActive.status).toBe(200);

      // 2. Perform legitimate logout with valid CSRF token
      const successfulLogout = await request(app)
        .post('/api/admin/auth/logout')
        .set('Cookie', cookies)
        .set('X-CSRF-Token', validCsrf);
      expect(successfulLogout.status).toBe(200);
      expect(successfulLogout.body.success).toBe(true);

      // 3. Verify session was invalidated on server
      const meAfterLogout = await request(app)
        .get('/api/admin/auth/me')
        .set('Cookie', cookies);
      expect(meAfterLogout.status).toBe(401);
    });
  });
});
