import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

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
