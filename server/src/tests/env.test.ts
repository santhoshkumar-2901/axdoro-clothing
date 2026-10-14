import { describe, it, expect } from 'vitest';
import { parseEnv, isLocalDatabase, isRemoteDatabase, isPooledNeonUrl, assertSecureTlsParameters } from '../config/env.js';
import { validateRuntimeDbTarget } from '../config/db.js';

describe('Environment Configuration Validation & Strict Database Isolation', () => {
  it('successfully parses valid environment variables with default ALLOW_REMOTE_DEV_DB=false', () => {
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
    expect(config.ALLOW_REMOTE_DEV_DB).toBe(false);
  });

  it('correctly parses ALLOW_REMOTE_DEV_DB boolean string values', () => {
    const rawTrue = {
      DATABASE_URL: 'postgresql://localhost:5432/db',
      JWT_SECRET: 'a_very_secure_test_jwt_secret_that_is_32_characters_long',
      ALLOW_REMOTE_DEV_DB: 'true',
    };
    expect(parseEnv(rawTrue).ALLOW_REMOTE_DEV_DB).toBe(true);

    const rawFalse = {
      DATABASE_URL: 'postgresql://localhost:5432/db',
      JWT_SECRET: 'a_very_secure_test_jwt_secret_that_is_32_characters_long',
      ALLOW_REMOTE_DEV_DB: 'false',
    };
    expect(parseEnv(rawFalse).ALLOW_REMOTE_DEV_DB).toBe(false);
  });

  it('fails fast on invalid ALLOW_REMOTE_DEV_DB values', () => {
    const invalidValues = ['yes', '1', 'True', 'invalid', ''];
    for (const val of invalidValues) {
      expect(() =>
        parseEnv({
          DATABASE_URL: 'postgresql://localhost:5432/db',
          JWT_SECRET: 'a_very_secure_test_jwt_secret_that_is_32_characters_long',
          ALLOW_REMOTE_DEV_DB: val,
        })
      ).toThrow("ALLOW_REMOTE_DEV_DB must be either 'true' or 'false'");
    }
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

  it('accurately detects Neon pooled connection endpoints (-pooler)', () => {
    expect(isPooledNeonUrl('postgresql://user:pass@ep-xyz-pooler.ap-southeast-1.aws.neon.tech/neondb')).toBe(true);
    expect(isPooledNeonUrl('postgresql://user:pass@ep-xyz.pooler.aws.neon.tech/neondb')).toBe(true);
    expect(isPooledNeonUrl('postgresql://user:pass@ep-xyz.ap-southeast-1.aws.neon.tech/neondb')).toBe(false);
    expect(isPooledNeonUrl('postgresql://axdoro_app:pw@localhost:5432/axdoro_dev')).toBe(false);
    expect(isPooledNeonUrl('')).toBe(false);
  });

  it('fails closed when remote database is configured in development without opt-in', () => {
    const remoteUrl = 'postgresql://user:pass@ep-cool-db.ap-southeast-1.aws.neon.tech/neondb';
    expect(() => validateRuntimeDbTarget(remoteUrl, 'development', false)).toThrow(
      'STRICT LOCAL DATABASE ISOLATION ERROR: Remote database detected in development without explicit opt-in'
    );
  });

  it('permits remote database in development ONLY when ALLOW_REMOTE_DEV_DB=true is enabled', () => {
    const remoteUrl = 'postgresql://user:pass@ep-cool-db.ap-southeast-1.aws.neon.tech/neondb';
    expect(() => validateRuntimeDbTarget(remoteUrl, 'development', true)).not.toThrow();
  });

  it('strictly rejects remote database in test mode even if ALLOW_REMOTE_DEV_DB is true', () => {
    const remoteUrl = 'postgresql://user:pass@ep-cool-db.ap-southeast-1.aws.neon.tech/neondb';
    expect(() => validateRuntimeDbTarget(remoteUrl, 'test', true)).toThrow(
      'STRICT LOCAL DATABASE ISOLATION ERROR: Remote database detected in test environment'
    );
    expect(() => validateRuntimeDbTarget(remoteUrl, 'test', false)).toThrow(
      'STRICT LOCAL DATABASE ISOLATION ERROR: Remote database detected in test environment'
    );
  });

  it('permits local PostgreSQL in development and test environments regardless of opt-in flag', () => {
    const localUrl = 'postgresql://axdoro_app:pw@localhost:5432/axdoro_dev';
    expect(() => validateRuntimeDbTarget(localUrl, 'development', false)).not.toThrow();
    expect(() => validateRuntimeDbTarget(localUrl, 'development', true)).not.toThrow();
    expect(() => validateRuntimeDbTarget(localUrl, 'test', false)).not.toThrow();
    expect(() => validateRuntimeDbTarget(localUrl, 'test', true)).not.toThrow();
  });

  it('permits remote database configuration in production mode', () => {
    const remoteUrl = 'postgresql://user:pass@ep-cool-db.ap-southeast-1.aws.neon.tech/neondb';
    expect(() => validateRuntimeDbTarget(remoteUrl, 'production')).not.toThrow();
  });

  it('rejects remote database in non-standard environments (e.g. staging)', () => {
    const remoteUrl = 'postgresql://user:pass@ep-cool-db.ap-southeast-1.aws.neon.tech/neondb';
    expect(() => validateRuntimeDbTarget(remoteUrl, 'staging', true)).toThrow(
      "STRICT LOCAL DATABASE ISOLATION ERROR: Remote database detected in non-production environment 'staging'"
    );
  });

  describe('assertSecureTlsParameters — TLS Parameter Hardening', () => {
    const validRemote = 'postgresql://user:secret_pass@ep-cool-dev.ap-southeast-1.aws.neon.tech/neondb';

    it('permits valid local PostgreSQL connection strings', () => {
      expect(() => assertSecureTlsParameters('postgresql://axdoro_app:pw@localhost:5432/axdoro_dev')).not.toThrow();
      expect(() => assertSecureTlsParameters('postgresql://axdoro_app:pw@127.0.0.1:5432/axdoro_dev')).not.toThrow();
      expect(() => assertSecureTlsParameters('postgresql://axdoro_app:pw@localhost:5432/axdoro_dev?sslmode=disable')).not.toThrow();
    });

    it('permits valid remote PostgreSQL connection strings with verified TLS parameters', () => {
      expect(() => assertSecureTlsParameters(`${validRemote}?sslmode=require`)).not.toThrow();
      expect(() => assertSecureTlsParameters(`${validRemote}?sslmode=verify-full`)).not.toThrow();
      expect(() => assertSecureTlsParameters(`${validRemote}?sslmode=verify-ca`)).not.toThrow();
      expect(() => assertSecureTlsParameters(`${validRemote}?ssl=true`)).not.toThrow();
    });

    it('rejects sslmode=no-verify unconditionally', () => {
      expect(() => assertSecureTlsParameters(`${validRemote}?sslmode=no-verify`)).toThrow(
        "INSECURE TLS CONFIGURATION REJECTED: Insecure sslmode 'no-verify' is forbidden"
      );
      expect(() => assertSecureTlsParameters('postgresql://user:pass@localhost:5432/db?sslmode=no-verify')).toThrow(
        "INSECURE TLS CONFIGURATION REJECTED: Insecure sslmode 'no-verify' is forbidden"
      );
    });

    it('rejects case-insensitive variations of sslmode=no-verify', () => {
      expect(() => assertSecureTlsParameters(`${validRemote}?SSLMODE=no-verify`)).toThrow(
        "INSECURE TLS CONFIGURATION REJECTED: Insecure sslmode 'no-verify' is forbidden"
      );
      expect(() => assertSecureTlsParameters(`${validRemote}?sslmode=NO-VERIFY`)).toThrow(
        "INSECURE TLS CONFIGURATION REJECTED: Insecure sslmode 'no-verify' is forbidden"
      );
    });

    it('rejects sslmode=prefer due to insecure unverified fallback', () => {
      expect(() => assertSecureTlsParameters(`${validRemote}?sslmode=prefer`)).toThrow(
        "INSECURE TLS CONFIGURATION REJECTED: Insecure sslmode 'prefer' is forbidden"
      );
    });

    it('rejects ssl=no-verify query parameter', () => {
      expect(() => assertSecureTlsParameters(`${validRemote}?ssl=no-verify`)).toThrow(
        "INSECURE TLS CONFIGURATION REJECTED: Insecure ssl parameter 'no-verify' is forbidden"
      );
      expect(() => assertSecureTlsParameters(`${validRemote}?SSL=no-verify`)).toThrow(
        "INSECURE TLS CONFIGURATION REJECTED: Insecure ssl parameter 'no-verify' is forbidden"
      );
    });

    it('rejects sslmode=disable and sslmode=allow on remote databases', () => {
      expect(() => assertSecureTlsParameters(`${validRemote}?sslmode=disable`)).toThrow(
        "INSECURE TLS CONFIGURATION REJECTED: 'sslmode=disable' is forbidden on remote database connections"
      );
      expect(() => assertSecureTlsParameters(`${validRemote}?sslmode=allow`)).toThrow(
        "INSECURE TLS CONFIGURATION REJECTED: 'sslmode=allow' is forbidden on remote database connections"
      );
    });

    it('rejects ssl=0 and ssl=false on remote databases', () => {
      expect(() => assertSecureTlsParameters(`${validRemote}?ssl=false`)).toThrow(
        "INSECURE TLS CONFIGURATION REJECTED: Insecure ssl parameter 'false' is forbidden on remote database connections"
      );
      expect(() => assertSecureTlsParameters(`${validRemote}?ssl=0`)).toThrow(
        "INSECURE TLS CONFIGURATION REJECTED: Insecure ssl parameter '0' is forbidden on remote database connections"
      );
    });

    it('rejects uselibpqcompat parameter', () => {
      expect(() => assertSecureTlsParameters(`${validRemote}?sslmode=require&uselibpqcompat=true`)).toThrow(
        'INSECURE TLS CONFIGURATION REJECTED: uselibpqcompat parameter is forbidden'
      );
      expect(() => assertSecureTlsParameters(`${validRemote}?sslmode=require&useLibpqCompat=1`)).toThrow(
        'INSECURE TLS CONFIGURATION REJECTED: uselibpqcompat parameter is forbidden'
      );
    });

    it('safely rejects malformed URLs without leaking credentials or passwords', () => {
      const secret = 'SUPER_SECRET_COMPROMISED_PASSWORD_987654';
      const malformedWithSecret = `postgresql://user:${secret}@localhost:not-a-port/db`;

      try {
        assertSecureTlsParameters(malformedWithSecret);
        expect.unreachable('Should have thrown on malformed URL');
      } catch (err: unknown) {
        const error = err as Error;
        expect(error.message).toContain('DATABASE CONFIGURATION ERROR: Malformed database connection URL');
        expect(error.message).not.toContain(secret);
      }
    });

    it('safely rejects empty and whitespace-only connection strings', () => {
      expect(() => assertSecureTlsParameters('')).toThrow('DATABASE CONFIGURATION ERROR: Connection string is empty or missing');
      expect(() => assertSecureTlsParameters('   ')).toThrow('DATABASE CONFIGURATION ERROR: Connection string is empty or missing');
    });

    it('rejects unsupported protocols', () => {
      expect(() => assertSecureTlsParameters('http://localhost:5432/db')).toThrow(
        "DATABASE CONFIGURATION ERROR: Unsupported database protocol 'http:'"
      );
      expect(() => assertSecureTlsParameters('mysql://user:pass@localhost:3306/db')).toThrow(
        "DATABASE CONFIGURATION ERROR: Unsupported database protocol 'mysql:'"
      );
    });
  });

  describe('parseEnv and validateRuntimeDbTarget TLS enforcement', () => {
    it('parseEnv rejects DATABASE_URL with sslmode=no-verify', () => {
      expect(() =>
        parseEnv({
          DATABASE_URL: 'postgresql://user:pass@ep-cool-dev.aws.neon.tech/neondb?sslmode=no-verify',
          JWT_SECRET: 'a_very_secure_test_jwt_secret_that_is_32_characters_long',
        })
      ).toThrow("Insecure sslmode 'no-verify' is forbidden");
    });

    it('parseEnv rejects MIGRATION_DATABASE_URL with insecure TLS parameter', () => {
      expect(() =>
        parseEnv({
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/axdoro_dev',
          MIGRATION_DATABASE_URL: 'postgresql://user:pass@ep-cool-dev.aws.neon.tech/neondb?ssl=no-verify',
          JWT_SECRET: 'a_very_secure_test_jwt_secret_that_is_32_characters_long',
        })
      ).toThrow("Insecure ssl parameter 'no-verify' is forbidden");
    });

    it('validateRuntimeDbTarget rejects insecure TLS parameters before creating connection pool', () => {
      const insecureUrl = 'postgresql://user:pass@ep-cool-dev.aws.neon.tech/neondb?sslmode=no-verify';
      expect(() => validateRuntimeDbTarget(insecureUrl, 'development', true)).toThrow(
        "Insecure sslmode 'no-verify' is forbidden"
      );
    });
  });
});
