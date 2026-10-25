import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment file
dotenv.config();

/**
 * Rigorously checks if a database connection URL targets a strictly local PostgreSQL instance.
 * Fails closed: any non-standard, malformed, or remote host is treated as non-local.
 */
export function isLocalDatabase(connectionString: string): boolean {
  if (!connectionString) return false;
  try {
    const parsed = new URL(connectionString);
    const hostname = parsed.hostname.toLowerCase();

    // Must strictly be localhost, 127.0.0.1, or IPv6 loopback ::1
    const isLocalHost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '[::1]';

    if (!isLocalHost) {
      return false;
    }

    // Remote signatures: reject if sslmode=require, verify-ca, or verify-full is set
    const sslMode = parsed.searchParams.get('sslmode')?.toLowerCase();
    if (sslMode === 'require' || sslMode === 'verify-full' || sslMode === 'verify-ca') {
      return false;
    }

    return true;
  } catch {
    // If URL parsing fails, perform strict fallback checks
    if (
      connectionString.includes('.neon.tech') ||
      connectionString.includes('.rds.amazonaws.com') ||
      connectionString.includes('sslmode=require') ||
      (!connectionString.includes('localhost') && !connectionString.includes('127.0.0.1') && !connectionString.includes('::1'))
    ) {
      return false;
    }
    return connectionString.includes('localhost') || connectionString.includes('127.0.0.1') || connectionString.includes('::1');
  }
}

/**
 * Checks if a connection string targets Neon or another remote/production cloud database.
 */
export function isRemoteDatabase(connectionString: string): boolean {
  return !isLocalDatabase(connectionString);
}

/**
 * Detects whether a database connection URL targets a pooled Neon endpoint (PgBouncer).
 * Neon pooler endpoints use a '-pooler' hostname suffix in their compute endpoint.
 */
export function isPooledNeonUrl(connectionString: string): boolean {
  if (!connectionString) return false;
  try {
    const parsed = new URL(connectionString);
    const hostname = parsed.hostname.toLowerCase();
    return hostname.includes('-pooler.') || hostname.includes('pooler.');
  } catch {
    return connectionString.includes('-pooler.') || connectionString.includes('pooler.');
  }
}

/**
 * Rigorously validates connection string TLS/SSL parameters.
 * Rejects insecure configurations (e.g. sslmode=no-verify, ssl=no-verify, sslmode=prefer,
 * sslmode=disable on remote endpoints, uselibpqcompat) before allocating database pools.
 * Fails safely on malformed URLs without leaking sensitive credentials in error messages.
 */
export function assertSecureTlsParameters(connectionString: string): void {
  if (!connectionString || typeof connectionString !== 'string' || connectionString.trim() === '') {
    throw new Error('DATABASE CONFIGURATION ERROR: Connection string is empty or missing.');
  }

  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error(
      'DATABASE CONFIGURATION ERROR: Malformed database connection URL. Could not parse connection string.'
    );
  }

  // Validate protocol
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'postgresql:' && protocol !== 'postgres:') {
    throw new Error(
      `DATABASE CONFIGURATION ERROR: Unsupported database protocol '${protocol}'. Expected 'postgresql:' or 'postgres:'.`
    );
  }

  // Ensure host exists
  if (!parsed.hostname && !connectionString.includes('@/')) {
    throw new Error(
      'DATABASE CONFIGURATION ERROR: Malformed database connection URL. Hostname is missing.'
    );
  }

  const isRemote = isRemoteDatabase(connectionString);

  for (const [rawKey, rawValue] of parsed.searchParams.entries()) {
    const key = rawKey.toLowerCase().trim();
    const val = rawValue.toLowerCase().trim();

    // 1. Inspect 'sslmode' query parameter
    if (key === 'sslmode') {
      if (val === 'no-verify' || val === 'prefer') {
        throw new Error(
          `INSECURE TLS CONFIGURATION REJECTED: Insecure sslmode '${val}' is forbidden. ` +
            `PostgreSQL connections must enforce verified TLS (e.g. sslmode=require or sslmode=verify-full).`
        );
      }
      if (isRemote && (val === 'disable' || val === 'allow')) {
        throw new Error(
          `INSECURE TLS CONFIGURATION REJECTED: 'sslmode=${val}' is forbidden on remote database connections. ` +
            `Remote cloud instances require encrypted TLS.`
        );
      }
    }

    // 2. Inspect 'ssl' query parameter (used by pg / ConnectionParameters)
    if (key === 'ssl') {
      if (val === 'no-verify') {
        throw new Error(
          `INSECURE TLS CONFIGURATION REJECTED: Insecure ssl parameter 'no-verify' is forbidden. ` +
            `Disabling certificate verification is prohibited.`
        );
      }
      if (isRemote && (val === 'false' || val === '0' || val === 'disable')) {
        throw new Error(
          `INSECURE TLS CONFIGURATION REJECTED: Insecure ssl parameter '${val}' is forbidden on remote database connections. ` +
            `Remote cloud instances require encrypted TLS.`
        );
      }
    }

    // 3. Inspect 'uselibpqcompat' (causes pg-connection-string to disable rejectUnauthorized on sslmode=require)
    if (key === 'uselibpqcompat') {
      if (val === 'true' || val === '1') {
        throw new Error(
          'INSECURE TLS CONFIGURATION REJECTED: uselibpqcompat parameter is forbidden because it can weaken TLS certificate verification.'
        );
      }
    }
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z
    .string({ required_error: 'DATABASE_URL is required' })
    .min(1, 'DATABASE_URL is required')
    .superRefine((val, ctx) => {
      try {
        assertSecureTlsParameters(val);
      } catch (err: unknown) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  MIGRATION_DATABASE_URL: z
    .string()
    .optional()
    .superRefine((val, ctx) => {
      if (!val) return;
      try {
        assertSecureTlsParameters(val);
      } catch (err: unknown) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  TEST_DATABASE_URL: z
    .string()
    .optional()
    .superRefine((val, ctx) => {
      if (!val) return;
      try {
        assertSecureTlsParameters(val);
      } catch (err: unknown) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  NEON_DATABASE_URL: z
    .string()
    .optional()
    .superRefine((val, ctx) => {
      if (!val) return;
      try {
        assertSecureTlsParameters(val);
      } catch (err: unknown) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  ALLOW_REMOTE_DEV_DB: z
    .enum(['true', 'false'], {
      errorMap: () => ({ message: "ALLOW_REMOTE_DEV_DB must be either 'true' or 'false'" }),
    })
    .default('false')
    .transform((val) => val === 'true'),
  JWT_SECRET: z.string({ required_error: 'JWT_SECRET is required' }).min(32, 'JWT_SECRET must be at least 32 characters long for cryptographic security'),
  CLOUDINARY_CLOUD_NAME: z.string().trim().optional(),
  CLOUDINARY_API_KEY: z.string().trim().optional(),
  CLOUDINARY_API_SECRET: z.string().trim().optional(),
  CRON_SECRET: z.string().trim().min(16, 'CRON_SECRET must be at least 16 characters long if set').optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function parseEnv(rawEnv: Record<string, unknown> = process.env): EnvConfig {
  const result = envSchema.safeParse(rawEnv);
  if (!result.success) {
    const errorDetails = result.error.errors
      .map((err) => `${err.path.join('.')}: ${err.message}`)
      .join(', ');
    throw new Error(`Environment validation failed: ${errorDetails}`);
  }
  return result.data;
}

// Global parsed config
export const env = parseEnv(process.env);
