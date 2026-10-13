import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '../config/env.js';

/**
 * Extracts a specific cookie value from the Cookie header.
 */
export function extractCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').map((c) => c.trim());
  const target = cookies.find((c) => c.startsWith(`${name}=`));
  if (!target) return null;
  return decodeURIComponent(target.substring(name.length + 1));
}

/**
 * Generates a session-bound CSRF token derived from the session token using HMAC-SHA256.
 */
export function generateCsrfToken(sessionToken: string): string {
  return crypto.createHmac('sha256', env.JWT_SECRET).update(sessionToken.trim()).digest('hex');
}

/**
 * Validates candidate CSRF token against session token using constant-time comparison.
 */
export function verifyCsrfToken(sessionToken: string, candidateToken: string): boolean {
  if (!sessionToken || !candidateToken || typeof candidateToken !== 'string') return false;
  const expected = generateCsrfToken(sessionToken);
  try {
    const expectedBuf = Buffer.from(expected, 'hex');
    const candidateBuf = Buffer.from(candidateToken.trim(), 'hex');
    if (expectedBuf.length !== candidateBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, candidateBuf);
  } catch {
    return false;
  }
}

/**
 * Validates that an Origin header matches explicitly allowed origins.
 */
export function isAllowedOrigin(originHeader: string | undefined): boolean {
  if (!originHeader) return true;
  const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim().toLowerCase());
  try {
    const parsed = new URL(originHeader);
    const originNormalized = `${parsed.protocol}//${parsed.host}`.toLowerCase();
    return allowedOrigins.includes(originNormalized);
  } catch {
    return false;
  }
}

/**
 * CSRF Protection Middleware for state-changing administrative requests.
 *
 * Enforces:
 * 1. Strict Origin/Referer verification on state-changing requests.
 * 2. Session-bound synchronizer token verification for cookie-authenticated requests.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Safe HTTP methods do not mutate server state
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // 1. Origin header verification for state-changing requests
  const originHeader = req.headers.origin as string | undefined;
  if (originHeader) {
    if (!isAllowedOrigin(originHeader)) {
      res.status(403).json({
        status: 'error',
        error: 'Cross-Site Request Forgery attempt detected: untrusted Origin.',
        message: 'Cross-Site Request Forgery attempt detected: untrusted Origin.',
      });
      return;
    }
  } else if (req.headers.referer) {
    try {
      const refererOrigin = new URL(req.headers.referer as string).origin;
      if (!isAllowedOrigin(refererOrigin)) {
        res.status(403).json({
          status: 'error',
          error: 'Cross-Site Request Forgery attempt detected: untrusted Referer origin.',
          message: 'Cross-Site Request Forgery attempt detected: untrusted Referer origin.',
        });
        return;
      }
    } catch {
      res.status(403).json({
        status: 'error',
        error: 'Cross-Site Request Forgery attempt detected: malformed Referer header.',
        message: 'Cross-Site Request Forgery attempt detected: malformed Referer header.',
      });
      return;
    }
  }

  // 2. Check if request is authenticated via cookie
  const sessionCookie = extractCookie(req, 'axdoro_admin_session');

  // If no session cookie is present, ambient cookie CSRF does not apply
  // (e.g., login request before session exists, or programmatic Bearer token client)
  if (!sessionCookie) {
    return next();
  }

  // 3. For cookie-authenticated requests, enforce synchronizer token verification
  const csrfHeader = (req.headers['x-csrf-token'] || req.headers['X-CSRF-Token']) as string | undefined;
  const csrfCookie = extractCookie(req, 'axdoro_csrf_token');

  if (!csrfHeader) {
    res.status(403).json({
      status: 'error',
      error: 'CSRF token missing in request header (X-CSRF-Token).',
      message: 'CSRF token missing in request header (X-CSRF-Token).',
    });
    return;
  }

  if (!csrfCookie) {
    res.status(403).json({
      status: 'error',
      error: 'CSRF cookie missing.',
      message: 'CSRF cookie missing.',
    });
    return;
  }

  if (csrfHeader.trim() !== csrfCookie.trim()) {
    res.status(403).json({
      status: 'error',
      error: 'CSRF token mismatch between header and cookie.',
      message: 'CSRF token mismatch between header and cookie.',
    });
    return;
  }

  if (!verifyCsrfToken(sessionCookie, csrfHeader.trim())) {
    res.status(403).json({
      status: 'error',
      error: 'Invalid or forged CSRF token.',
      message: 'Invalid or forged CSRF token.',
    });
    return;
  }

  next();
}
