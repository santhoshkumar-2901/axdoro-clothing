import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { validateSessionToken, AdminUserDTO } from '../services/admin-auth.service.js';

import { env } from '../config/env.js';

// Extend Express Request type to include authenticated admin user
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminUserDTO;
    }
  }
}

/**
 * Extracts session token from Authorization header or HttpOnly cookie.
 */
function extractToken(req: Request): string | null {
  // 1. Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  // 2. Cookie header: axdoro_admin_session=<token>
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map((c) => c.trim());
    const sessionCookie = cookies.find((c) => c.startsWith('axdoro_admin_session='));
    if (sessionCookie) {
      return decodeURIComponent(sessionCookie.substring('axdoro_admin_session='.length));
    }
  }

  return null;
}

/**
 * Enforces admin authentication on protected endpoints.
 * Rejects anonymous requests with 401 and non-admins with 403.
 */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({
      status: 'error',
      error: 'Authentication required. Please sign in as administrator.',
      message: 'Authentication required. Please sign in as administrator.',
    });
    return;
  }

  try {
    const admin = await validateSessionToken(token);

    if (!admin) {
      res.status(401).json({
        status: 'error',
        error: 'Invalid or expired session. Please sign in again.',
        message: 'Invalid or expired session. Please sign in again.',
      });
      return;
    }

    if (admin.role !== 'admin') {
      res.status(403).json({
        status: 'error',
        error: 'Access denied. Insufficient administrative privileges.',
        message: 'Access denied. Insufficient administrative privileges.',
      });
      return;
    }

    req.admin = admin;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Strict rate limiter for administrative authentication endpoints.
 * Prevents brute-force credential stuffing.
 */
export const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'test' ? 1000 : 10, // Strict 10 in production/dev, relaxed for automated integration tests
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many authentication attempts. Please try again after 15 minutes.',
  },
});
