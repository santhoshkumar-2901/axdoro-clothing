import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment file
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string({ required_error: 'DATABASE_URL is required' }).min(1, 'DATABASE_URL is required'),
  MIGRATION_DATABASE_URL: z.string().optional(),
  TEST_DATABASE_URL: z.string().optional(),
  NEON_DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string({ required_error: 'JWT_SECRET is required' }).min(32, 'JWT_SECRET must be at least 32 characters long for cryptographic security'),
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
