import { describe, it, expect, vi } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import type pg from 'pg';
import {
  calculateChecksum,
  getMigrationFiles,
  runMigrations,
  getMigrationStatus,
  validateMigrationTarget,
  checkMigrationTableExists,
  getAppliedMigrationsReadOnly,
  ensureMigrationTable,
} from '../db/migration-runner.js';
import { validateSeedTarget } from '../db/seed.js';

describe('Database Migration Runner Safety & Determinism', () => {
  const migrationsDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../db/migrations'
  );

  it('calculates deterministic SHA-256 checksums', () => {
    const hash1 = calculateChecksum('SELECT 1;');
    const hash2 = calculateChecksum('SELECT 1;');
    const hash3 = calculateChecksum('SELECT 2;');
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash1.length).toBe(64);
  });

  it('discovers and orders migration files sequentially', () => {
    const files = getMigrationFiles(migrationsDir);
    expect(files.length).toBeGreaterThanOrEqual(1);
    expect(files[0].filename).toBe('001_foundation.sql');
    expect(files[0].checksum).toBeDefined();
    expect(files[0].sqlContent).toContain('update_updated_at_column');
  });

  it('unconditionally rejects remote database URLs in runMigrations during tests', async () => {
    const remoteUrl = 'postgresql://user:pass@ep-cool-production.ap-southeast-1.aws.neon.tech/neondb';
    await expect(
      runMigrations({
        connectionString: remoteUrl,
        migrationsDir,
      })
    ).rejects.toThrow('STRICT LOCAL ISOLATION ABORT');
  });

  it('unconditionally rejects remote database URLs in getMigrationStatus before opening connection', async () => {
    const remoteUrl = 'postgresql://user:pass@ep-cool-production.ap-southeast-1.aws.neon.tech/neondb';
    await expect(
      getMigrationStatus({
        connectionString: remoteUrl,
        migrationsDir,
      })
    ).rejects.toThrow('STRICT LOCAL ISOLATION ABORT');
  });

  describe('validateMigrationTarget safeguards', () => {
    const directRemoteUrl = 'postgresql://user:pass@ep-cool-dev.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
    const pooledRemoteUrl = 'postgresql://user:pass@ep-cool-dev-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
    const localUrl = 'postgresql://axdoro_migrator:pw@localhost:5432/axdoro_dev';

    it('rejects remote database in development when ALLOW_REMOTE_DEV_DB is false', () => {
      expect(() => validateMigrationTarget(directRemoteUrl, 'development', false)).toThrow(
        'STRICT LOCAL ISOLATION ABORT: Target database appears to be a remote or cloud instance without explicit opt-in'
      );
    });

    it('permits remote direct database in development when ALLOW_REMOTE_DEV_DB is true', () => {
      expect(() => validateMigrationTarget(directRemoteUrl, 'development', true)).not.toThrow();
    });

    it('rejects pooled Neon URLs even when ALLOW_REMOTE_DEV_DB is true', () => {
      expect(() => validateMigrationTarget(pooledRemoteUrl, 'development', true)).toThrow(
        'UNSUPPORTED POOLED ENDPOINT: Migrations cannot be executed against Neon pooled connection endpoints (-pooler)'
      );
    });

    it('unconditionally rejects remote database in test mode', () => {
      expect(() => validateMigrationTarget(directRemoteUrl, 'test', true)).toThrow(
        'STRICT LOCAL ISOLATION ABORT: Target database appears to be a remote or cloud instance'
      );
      expect(() => validateMigrationTarget(directRemoteUrl, 'test', false)).toThrow(
        'STRICT LOCAL ISOLATION ABORT: Target database appears to be a remote or cloud instance'
      );
    });

    it('permits local database across development and test environments', () => {
      expect(() => validateMigrationTarget(localUrl, 'development', false)).not.toThrow();
      expect(() => validateMigrationTarget(localUrl, 'development', true)).not.toThrow();
      expect(() => validateMigrationTarget(localUrl, 'test', false)).not.toThrow();
    });

    it('fails fast when no target URL is provided', () => {
      expect(() => validateMigrationTarget('', 'development', true)).toThrow(
        'MIGRATION TARGET ERROR: No database connection URL provided'
      );
    });

    it('rejects insecure TLS parameters (sslmode=no-verify, ssl=no-verify)', () => {
      const insecureMode = 'postgresql://user:pass@ep-cool-dev.ap-southeast-1.aws.neon.tech/neondb?sslmode=no-verify';
      expect(() => validateMigrationTarget(insecureMode, 'development', true)).toThrow(
        "INSECURE TLS CONFIGURATION REJECTED: Insecure sslmode 'no-verify' is forbidden"
      );

      const insecureParam = 'postgresql://user:pass@ep-cool-dev.ap-southeast-1.aws.neon.tech/neondb?ssl=no-verify';
      expect(() => validateMigrationTarget(insecureParam, 'development', true)).toThrow(
        "INSECURE TLS CONFIGURATION REJECTED: Insecure ssl parameter 'no-verify' is forbidden"
      );
    });

    it('safely rejects malformed URLs without leaking secrets in error messages', () => {
      const malformedSecret = 'postgresql://migrator:MIGRATOR_SECRET_KEY@invalid-host:not-a-port/axdoro';
      try {
        validateMigrationTarget(malformedSecret, 'development', true);
        expect.unreachable('Should have thrown on malformed URL');
      } catch (err: unknown) {
        const error = err as Error;
        expect(error.message).toContain('DATABASE CONFIGURATION ERROR: Malformed database connection URL');
        expect(error.message).not.toContain('MIGRATOR_SECRET_KEY');
      }
    });
  });

  describe('validateSeedTarget safeguards', () => {
    const directRemoteUrl = 'postgresql://user:pass@ep-cool-dev.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
    const pooledRemoteUrl = 'postgresql://user:pass@ep-cool-dev-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
    const localUrl = 'postgresql://axdoro_migrator:pw@localhost:5432/axdoro_dev';

    it('strictly forbids seeding in production environment', () => {
      expect(() => validateSeedTarget(directRemoteUrl, 'production', true)).toThrow(
        'PRODUCTION SAFETY GUARD: Seed script cannot and will not be executed in production environment'
      );
    });

    it('strictly forbids seeding in test environment', () => {
      expect(() => validateSeedTarget(localUrl, 'test', false)).toThrow(
        'TEST ISOLATION GUARD: Seed script cannot be executed in test mode'
      );
    });

    it('rejects remote database in development without explicit opt-in', () => {
      expect(() => validateSeedTarget(directRemoteUrl, 'development', false)).toThrow(
        'STRICT LOCAL ISOLATION ABORT: Seed script targeting a remote database requires explicit ALLOW_REMOTE_DEV_DB=true'
      );
    });

    it('rejects pooled Neon URLs for seed operations', () => {
      expect(() => validateSeedTarget(pooledRemoteUrl, 'development', true)).toThrow(
        'UNSUPPORTED POOLED ENDPOINT: Seed operations cannot be executed against pooled connection endpoints (-pooler)'
      );
    });

    it('permits remote direct database in development with explicit opt-in', () => {
      expect(() => validateSeedTarget(directRemoteUrl, 'development', true)).not.toThrow();
    });

    it('permits local database in development', () => {
      expect(() => validateSeedTarget(localUrl, 'development', false)).not.toThrow();
    });

    it('rejects insecure TLS parameters for seed targets', () => {
      const insecureUrl = 'postgresql://user:pass@ep-cool-dev.ap-southeast-1.aws.neon.tech/neondb?sslmode=no-verify';
      expect(() => validateSeedTarget(insecureUrl, 'development', true)).toThrow(
        "INSECURE TLS CONFIGURATION REJECTED: Insecure sslmode 'no-verify' is forbidden"
      );
    });

    it('safely rejects malformed URLs for seed targets without leaking secrets', () => {
      const malformedSecret = 'postgresql://seeder:SEEDER_SECRET_KEY@invalid-host:not-a-port/axdoro';
      try {
        validateSeedTarget(malformedSecret, 'development', true);
        expect.unreachable('Should have thrown on malformed URL');
      } catch (err: unknown) {
        const error = err as Error;
        expect(error.message).toContain('DATABASE CONFIGURATION ERROR: Malformed database connection URL');
        expect(error.message).not.toContain('SEEDER_SECRET_KEY');
      }
    });
  });

  describe('Strictly Read-Only Migration Status Inspection', () => {
    it('proves checkMigrationTableExists executes a read-only catalog query without DDL', async () => {
      const executedQueries: string[] = [];
      const mockClient = {
        query: vi.fn(async (sql: string) => {
          executedQueries.push(sql);
          return { rows: [{ exists: false }] };
        }),
      } as unknown as pg.PoolClient;

      const exists = await checkMigrationTableExists(mockClient);
      expect(exists).toBe(false);
      expect(executedQueries.length).toBe(1);
      expect(executedQueries[0]).toContain("to_regclass('public.schema_migrations')");
      expect(executedQueries[0].toLowerCase()).not.toContain('create table');
      expect(executedQueries[0].toLowerCase()).not.toContain('insert');
    });

    it('proves getAppliedMigrationsReadOnly executes zero DDL and returns empty list when table is absent', async () => {
      const executedQueries: string[] = [];
      const mockClient = {
        query: vi.fn(async (sql: string) => {
          executedQueries.push(sql);
          if (sql.includes('to_regclass')) {
            return { rows: [{ exists: false }] };
          }
          return { rows: [] };
        }),
      } as unknown as pg.PoolClient;

      const result = await getAppliedMigrationsReadOnly(mockClient);
      expect(result.hasMigrationTable).toBe(false);
      expect(result.applied).toEqual([]);

      // Verify no DDL or mutation statements were executed
      expect(executedQueries.length).toBe(1);
      const allSql = executedQueries.join(' ').toLowerCase();
      expect(allSql).not.toContain('create table');
      expect(allSql).not.toContain('insert');
      expect(allSql).not.toContain('update');
      expect(allSql).not.toContain('delete');
      expect(allSql).not.toContain('lock');
    });

    it('proves getAppliedMigrationsReadOnly reads records safely when table exists without mutations', async () => {
      const executedQueries: string[] = [];
      const mockRows = [
        {
          id: 1,
          filename: '001_foundation.sql',
          checksum: 'abc123hash',
          applied_at: new Date('2026-01-01T00:00:00Z'),
        },
      ];

      const mockClient = {
        query: vi.fn(async (sql: string) => {
          executedQueries.push(sql);
          if (sql.includes('to_regclass')) {
            return { rows: [{ exists: true }] };
          }
          if (sql.includes('SELECT id, filename')) {
            return { rows: mockRows };
          }
          return { rows: [] };
        }),
      } as unknown as pg.PoolClient;

      const result = await getAppliedMigrationsReadOnly(mockClient);
      expect(result.hasMigrationTable).toBe(true);
      expect(result.applied).toEqual(mockRows);

      // Verify read-only operations only
      expect(executedQueries.length).toBe(2);
      const allSql = executedQueries.join(' ').toLowerCase();
      expect(allSql).not.toContain('create table');
      expect(allSql).not.toContain('insert');
      expect(allSql).not.toContain('update');
      expect(allSql).not.toContain('delete');
      expect(allSql).not.toContain('lock');
    });

    it('proves ensureMigrationTable in normal runner STILL creates table (runner behavior unchanged)', async () => {
      const executedQueries: string[] = [];
      const mockClient = {
        query: vi.fn(async (sql: string) => {
          executedQueries.push(sql);
          return { rows: [] };
        }),
      } as unknown as pg.PoolClient;

      await ensureMigrationTable(mockClient);
      expect(executedQueries.length).toBe(1);
      expect(executedQueries[0]).toContain('CREATE TABLE IF NOT EXISTS schema_migrations');
    });
  });
});
