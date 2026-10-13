import { describe, it, expect } from 'vitest';
import { parseEnv, isLocalDatabase, isRemoteDatabase } from '../config/env.js';
import { validateRuntimeDbTarget } from '../config/db.js';

describe('Environment Configuration Validation & Strict Database Isolation', () => {
  it('successfully parses valid environment variables', () => {
    const raw = {
      NODE_ENV: 'test',
      PORT: '5001',
      DATABASE_URL: 'postgresql://axdoro_app:pw@localhost:5432/axdoro_test',
      JWT_SECRET: 'a_very_secure_test_jwt_secret_that_is_32_characters_long',
    };
    const config = parseEnv(raw);
    expect(config.NODE_ENV).toBe('test');
    expect(config.PORT).toBe(5001);
    expect(config.DATABASE_URL).toBe(raw.DATABASE_URL);
  });

  it('fails fast when required DATABASE_URL is missing', () => {
    const raw = {
      NODE_ENV: 'test',
      JWT_SECRET: 'a_very_secure_test_jwt_secret_that_is_32_characters_long',
    };
    expect(() => parseEnv(raw)).toThrow('DATABASE_URL is required');
  });

  it('fails fast when JWT_SECRET is shorter than 32 characters', () => {
    const raw = {
      DATABASE_URL: 'postgresql://localhost:5432/db',
      JWT_SECRET: 'short_secret',
    };
    expect(() => parseEnv(raw)).toThrow('at least 32 characters');
  });

  it('accurately identifies local PostgreSQL URLs', () => {
    expect(isLocalDatabase('postgresql://user:pass@localhost:5432/axdoro_dev')).toBe(true);
    expect(isLocalDatabase('postgresql://user:pass@127.0.0.1:5432/axdoro_dev')).toBe(true);
    expect(isLocalDatabase('postgresql://user:pass@[::1]:5432/axdoro_dev')).toBe(true);
  });

  it('accurately rejects remote, cloud, and malformed database URLs', () => {
    expect(isRemoteDatabase('postgresql://user:pass@ep-cool-db.ap-southeast-1.aws.neon.tech/neondb')).toBe(true);
    expect(isRemoteDatabase('postgresql://user:pass@db.example.com:5432/axdoro')).toBe(true);
    expect(isRemoteDatabase('postgresql://user:pass@localhost:5432/axdoro?sslmode=require')).toBe(true);
    expect(isRemoteDatabase('postgresql://user:pass@192.168.1.100:5432/axdoro')).toBe(true);
    expect(isRemoteDatabase('')).toBe(true);
  });

  it('fails closed when remote database is configured in development or test', () => {
    const remoteUrl = 'postgresql://user:pass@ep-cool-db.ap-southeast-1.aws.neon.tech/neondb';
    expect(() => validateRuntimeDbTarget(remoteUrl, 'development')).toThrow(
      'STRICT LOCAL DATABASE ISOLATION ERROR'
    );
    expect(() => validateRuntimeDbTarget(remoteUrl, 'test')).toThrow(
      'STRICT LOCAL DATABASE ISOLATION ERROR'
    );
  });

  it('permits local PostgreSQL in development and test environments', () => {
    const localUrl = 'postgresql://axdoro_app:pw@localhost:5432/axdoro_dev';
    expect(() => validateRuntimeDbTarget(localUrl, 'development')).not.toThrow();
    expect(() => validateRuntimeDbTarget(localUrl, 'test')).not.toThrow();
  });

  it('permits remote database configuration only when NODE_ENV is production', () => {
    const remoteUrl = 'postgresql://user:pass@ep-cool-db.ap-southeast-1.aws.neon.tech/neondb';
    expect(() => validateRuntimeDbTarget(remoteUrl, 'production')).not.toThrow();
  });
});
