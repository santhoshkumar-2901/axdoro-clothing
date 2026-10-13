import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import request from 'supertest';
import { app } from '../app.js';
import {
  initializeTestDatabase,
  truncateTestAdmin,
  truncateTestCatalogue,
  closeTestDatabase,
  testPool,
} from './test-db.js';
import { provisionAdmin, loginAdmin } from '../services/admin-auth.service.js';

const { Pool } = pg;

describe('Audit-Log Database Permissions Hardening (Phase 3D)', () => {
  let appPool: pg.Pool;
  let adminToken: string;

  beforeAll(async () => {
    await initializeTestDatabase();

    // Dedicated connection pool running strictly as the runtime application role (axdoro_app)
    appPool = new Pool({
      connectionString: 'postgresql://axdoro_app:axdoro_local_app_pw@localhost:5432/axdoro_test',
      ssl: false,
    });
  });

  afterAll(async () => {
    await appPool.end();
    await closeTestDatabase();
  });

  it('proves admin_audit_logs is owned by migrator and axdoro_app has no inheritance bypass', async () => {
    const client = await testPool.connect();
    try {
      // 1. Check table owner
      const ownerRes = await client.query<{ tableowner: string }>(`
        SELECT tableowner
        FROM pg_tables
        WHERE tablename = 'admin_audit_logs';
      `);
      expect(ownerRes.rows[0].tableowner).toBe('axdoro_migrator');

      // 2. Check axdoro_app role attributes
      const roleRes = await client.query<{ rolsuper: boolean; rolcreaterole: boolean; rolcreatedb: boolean }>(`
        SELECT rolsuper, rolcreaterole, rolcreatedb
        FROM pg_roles
        WHERE rolname = 'axdoro_app';
      `);
      expect(roleRes.rows[0].rolsuper).toBe(false);
      expect(roleRes.rows[0].rolcreaterole).toBe(false);
      expect(roleRes.rows[0].rolcreatedb).toBe(false);

      // 3. Check role memberships (must have no inheritance of migrator or postgres)
      const memberRes = await client.query(`
        SELECT r.rolname as role, m.rolname as member
        FROM pg_auth_members am
        JOIN pg_roles r ON r.oid = am.roleid
        JOIN pg_roles m ON m.oid = am.member
        WHERE m.rolname = 'axdoro_app';
      `);
      expect(memberRes.rows).toHaveLength(0);
    } finally {
      client.release();
    }
  });

  it('verifies information_schema grants for axdoro_app contain only SELECT and INSERT', async () => {
    const client = await testPool.connect();
    try {
      const grantsRes = await client.query<{ privilege_type: string }>(`
        SELECT privilege_type
        FROM information_schema.role_table_grants
        WHERE table_name = 'admin_audit_logs' AND grantee = 'axdoro_app';
      `);
      const privileges = grantsRes.rows.map((r) => r.privilege_type);

      expect(privileges).toContain('SELECT');
      expect(privileges).toContain('INSERT');
      expect(privileges).not.toContain('UPDATE');
      expect(privileges).not.toContain('DELETE');
      expect(privileges).not.toContain('TRUNCATE');
    } finally {
      client.release();
    }
  });

  it('allows runtime role axdoro_app to execute SELECT on admin_audit_logs', async () => {
    const client = await appPool.connect();
    try {
      const res = await client.query('SELECT COUNT(*) FROM admin_audit_logs;');
      expect(res.rows).toBeDefined();
      expect(res.rows[0].count).toBeDefined();
    } finally {
      client.release();
    }
  });

  it('allows runtime role axdoro_app to execute INSERT on admin_audit_logs', async () => {
    const client = await appPool.connect();
    try {
      const res = await client.query<{ id: string }>(`
        INSERT INTO admin_audit_logs (admin_email, action, entity_type, details)
        VALUES ('security-test@axdoro.test', 'SECURITY_TEST_AUDIT', 'security_test', '{"permitted": true}')
        RETURNING id;
      `);
      expect(res.rows[0].id).toBeDefined();
    } finally {
      client.release();
    }
  });

  it('denies runtime role axdoro_app from executing UPDATE on admin_audit_logs with permission denied', async () => {
    const client = await appPool.connect();
    try {
      await expect(
        client.query("UPDATE admin_audit_logs SET action = 'TAMPERED';")
      ).rejects.toThrow(/permission denied for table admin_audit_logs/i);
    } finally {
      client.release();
    }
  });

  it('denies runtime role axdoro_app from executing DELETE on admin_audit_logs with permission denied', async () => {
    const client = await appPool.connect();
    try {
      await expect(
        client.query("DELETE FROM admin_audit_logs WHERE action = 'SECURITY_TEST_AUDIT';")
      ).rejects.toThrow(/permission denied for table admin_audit_logs/i);
    } finally {
      client.release();
    }
  });

  it('denies runtime role axdoro_app from executing TRUNCATE on admin_audit_logs with permission denied', async () => {
    const client = await appPool.connect();
    try {
      await expect(
        client.query('TRUNCATE admin_audit_logs;')
      ).rejects.toThrow(/permission denied for table admin_audit_logs/i);
    } finally {
      client.release();
    }
  });

  it('proves normal catalogue mutations continue to record audit logs without error', async () => {
    await truncateTestAdmin();
    await truncateTestCatalogue();

    await provisionAdmin({
      email: 'catalogue-perm-admin@axdoro.test',
      password: 'AdminPassword123!',
      fullName: 'Perm Admin',
    });

    const loginRes = await loginAdmin({
      email: 'catalogue-perm-admin@axdoro.test',
      password: 'AdminPassword123!',
    });
    adminToken = loginRes.token;

    // Create Category via app API (running as axdoro_app)
    const catRes = await request(app)
      .post('/api/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Audit Hardening Category', slug: 'audit-hardening-category' });
    expect(catRes.status).toBe(201);

    // Verify audit log was created
    const client = await appPool.connect();
    try {
      const auditRes = await client.query<{ action: string; entity_id: string }>(
        "SELECT action, entity_id FROM admin_audit_logs WHERE action = 'CATEGORY_CREATE';"
      );
      expect(auditRes.rows.length).toBeGreaterThanOrEqual(1);
      expect(auditRes.rows[0].action).toBe('CATEGORY_CREATE');
    } finally {
      client.release();
    }
  });

  it('proves audit-log retrieval and pagination via admin API continue to function properly', async () => {
    const res = await request(app)
      .get('/api/admin/audit-logs?limit=10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.totalCount).toBeGreaterThan(0);
  });
});
