import { Router, Request, Response, NextFunction } from 'express';
import { adminLoginSchema } from '../../schemas/admin.js';
import { loginAdmin, logoutAdmin } from '../../services/admin-auth.service.js';
import { requireAdmin, adminLoginLimiter } from '../../middleware/adminAuth.js';
import { generateCsrfToken, extractCookie } from '../../middleware/csrf.js';
import { env } from '../../config/env.js';

export const adminAuthRouter = Router();

// POST /api/admin/auth/login
adminAuthRouter.post('/login', adminLoginLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = adminLoginSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        status: 'error',
        error: 'Invalid request: email and password are required',
        message: 'Invalid request: email and password are required',
      });
      return;
    }

    const { email, password } = parseResult.data;
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    const result = await loginAdmin({
      email,
      password,
      ipAddress,
      userAgent,
    });

    // 1. Set secure HttpOnly session cookie
    const isProd = env.NODE_ENV === 'production';
    res.cookie('axdoro_admin_session', result.token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/',
    });

    // 2. Set readable double-submit CSRF cookie
    const csrfToken = generateCsrfToken(result.token);
    res.cookie('axdoro_csrf_token', csrfToken, {
      httpOnly: false,
      secure: isProd,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({
      status: 'success',
      data: {
        admin: result.admin,
        csrfToken,
        token: result.token,
        expiresAt: result.expiresAt.toISOString(),
      },
      user: result.admin,
      token: result.token,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Invalid email or password') {
      res.status(401).json({
        status: 'error',
        error: 'Invalid email or password',
        message: 'Invalid email or password',
      });
      return;
    }
    next(err);
  }
});

// POST /api/admin/auth/logout
adminAuthRouter.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Extract token from header or cookie
    let token: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else {
      token = extractCookie(req, 'axdoro_admin_session');
    }

    if (token) {
      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null;
      await logoutAdmin(token, ipAddress);
    }

    res.clearCookie('axdoro_admin_session', {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
    });
    res.clearCookie('axdoro_csrf_token', {
      httpOnly: false,
      sameSite: 'strict',
      path: '/',
    });

    res.json({
      status: 'success',
      success: true,
      message: 'Logged out successfully',
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/auth/me - Verify current session
adminAuthRouter.get('/me', requireAdmin, (req: Request, res: Response) => {
  const sessionCookie = extractCookie(req, 'axdoro_admin_session');
  let csrfToken: string | undefined;
  if (sessionCookie) {
    csrfToken = generateCsrfToken(sessionCookie);
    res.cookie('axdoro_csrf_token', csrfToken, {
      httpOnly: false,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });
  }

  res.json({
    status: 'success',
    data: {
      ...req.admin,
      csrfToken,
    },
    user: req.admin,
  });
});
