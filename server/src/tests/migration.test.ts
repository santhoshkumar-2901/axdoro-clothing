import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  calculateChecksum,
  getMigrationFiles,
  runMigrations,
  getMigrationStatus,
} from '../db/migration-runner.js';

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

  it('unconditionally rejects remote database URLs in runMigrations', async () => {
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
});
