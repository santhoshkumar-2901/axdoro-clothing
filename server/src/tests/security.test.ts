import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { isAllowedOrigin } from '../middleware/csrf.js';

describe('Security Baseline Middleware', () => {
  it('includes standard Helmet security headers', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('handles CORS allowed origin properly', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('rejects disallowed CORS origins with an error', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://malicious-attacker-site.com');
    expect(res.status).toBe(500);
    expect(res.body.status).toBe('error');
  });

  it('returns structured 404 response for unknown routes', async () => {
    const res = await request(app).get('/api/unknown-endpoint');
    expect(res.status).toBe(404);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toContain('Route not found');
  });
});

describe('CSRF and Preview Origin Security Validation', () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalVercelUrl = process.env.VERCEL_URL;

  afterEach(() => {
    if (originalVercelEnv !== undefined) {
      process.env.VERCEL_ENV = originalVercelEnv;
    } else {
      delete process.env.VERCEL_ENV;
    }
    if (originalVercelUrl !== undefined) {
      process.env.VERCEL_URL = originalVercelUrl;
    } else {
      delete process.env.VERCEL_URL;
    }
  });

  it('accepts explicitly configured production and local origins', () => {
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
  });

  it('accepts exact authorized preview origin only in preview mode', () => {
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_URL = 'axdoro-clothing-git-preview-test.vercel.app';

    expect(isAllowedOrigin('https://axdoro-clothing-git-preview-test.vercel.app')).toBe(true);
    // Case insensitivity check
    expect(isAllowedOrigin('HTTPS://AXDORO-CLOTHING-GIT-PREVIEW-TEST.VERCEL.APP')).toBe(true);

    // If not in preview mode, preview origin is rejected
    process.env.VERCEL_ENV = 'production';
    expect(isAllowedOrigin('https://axdoro-clothing-git-preview-test.vercel.app')).toBe(false);

    delete process.env.VERCEL_ENV;
    expect(isAllowedOrigin('https://axdoro-clothing-git-preview-test.vercel.app')).toBe(false);
  });

  it('rejects untrusted third-party origins and generic Vercel wildcards', () => {
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_URL = 'axdoro-clothing-git-preview-test.vercel.app';

    expect(isAllowedOrigin('https://malicious-attacker.com')).toBe(false);
    expect(isAllowedOrigin('https://another-tenant.vercel.app')).toBe(false);
    expect(isAllowedOrigin('https://axdoro-clothing-attacker.vercel.app')).toBe(false);
  });

  it('prevents attacker-controlled Host headers from authorizing an untrusted origin', async () => {
    // Attacker crafts request with Host: evil-attacker.com and Origin: https://evil-attacker.com
    const res = await request(app)
      .post('/api/admin/auth/login')
      .set('Host', 'evil-attacker.com')
      .set('Origin', 'https://evil-attacker.com')
      .send({ email: 'admin@axdoro.com', password: 'password' });

    // Must be blocked by CORS or CSRF (HTTP 403 or 500)
    expect([403, 500]).toContain(res.status);
    if (res.status === 403) {
      expect(res.body.error).toContain('Cross-Site Request Forgery attempt detected');
    }
  });

  it('handles missing or malformed origin headers safely', () => {
    // Missing origin returns true (e.g. server-to-server or non-browser client without ambient cookies)
    expect(isAllowedOrigin(undefined)).toBe(true);
    // Malformed origin string safely rejected
    expect(isAllowedOrigin('not-a-valid-url')).toBe(false);
    expect(isAllowedOrigin('http://')).toBe(false);
  });
});
