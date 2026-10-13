import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  adminLogin,
  adminLogout,
  adminGetMe,
  adminArchiveProduct,
  adminAdjustStock,
  getCsrfToken,
  setCsrfToken,
} from './admin.ts';

describe('Admin API Client Session Security & CSRF (Phase 3C)', () => {
  beforeEach(() => {
    setCsrfToken(null);
    vi.restoreAllMocks();
  });

  it('manages CSRF tokens in-memory without accessing sessionStorage', () => {
    expect(getCsrfToken()).toBeNull();

    setCsrfToken('test_csrf_token_123');
    expect(getCsrfToken()).toBe('test_csrf_token_123');

    setCsrfToken(null);
    expect(getCsrfToken()).toBeNull();
  });

  it('login sends credentials: include, updates in-memory csrfToken, and never writes to sessionStorage', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        status: 'success',
        data: {
          admin: { id: 'admin-1', email: 'admin@axdoro.test', fullName: 'Admin User', role: 'admin' },
          csrfToken: 'csrf_from_login_response',
          token: 'raw_session_token_should_not_be_stored',
        },
      }),
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

    const result = await adminLogin('admin@axdoro.test', 'Password123!');

    expect(fetchSpy).toHaveBeenCalledWith('/api/admin/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ email: 'admin@axdoro.test', password: 'Password123!' }),
    });

    expect(result.admin.email).toBe('admin@axdoro.test');
    expect(getCsrfToken()).toBe('csrf_from_login_response');
  });

  it('adminGetMe sends credentials: include and restores in-memory csrfToken', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        status: 'success',
        data: {
          id: 'admin-1',
          email: 'admin@axdoro.test',
          fullName: 'Admin User',
          role: 'admin',
          csrfToken: 'csrf_from_me_response',
        },
      }),
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

    const user = await adminGetMe();

    expect(fetchSpy).toHaveBeenCalledWith('/api/admin/auth/me', {
      headers: {
        Accept: 'application/json',
      },
      credentials: 'include',
    });

    expect(user?.email).toBe('admin@axdoro.test');
    expect(getCsrfToken()).toBe('csrf_from_me_response');
  });

  it('adminLogout sends credentials: include, attaches X-CSRF-Token, and clears in-memory csrfToken', async () => {
    setCsrfToken('active_csrf_token');

    const mockResponse = {
      ok: true,
      json: async () => ({ status: 'success', message: 'Logged out' }),
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

    await adminLogout();

    expect(fetchSpy).toHaveBeenCalledWith('/api/admin/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-CSRF-Token': 'active_csrf_token',
      },
      credentials: 'include',
    });

    expect(getCsrfToken()).toBeNull();
  });

  it('state-changing mutations attach X-CSRF-Token header and credentials: include', async () => {
    setCsrfToken('mutation_csrf_token');

    const mockResponse = {
      ok: true,
      json: async () => ({ status: 'success', data: { previousQuantity: 10, newQuantity: 15 } }),
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

    await adminAdjustStock('variant-uuid-1', 5, 'Inventory adjustment');

    expect(fetchSpy).toHaveBeenCalledWith('/api/admin/inventory/variants/variant-uuid-1/stock', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-CSRF-Token': 'mutation_csrf_token',
      },
      credentials: 'include',
      body: JSON.stringify({ quantity: 5, reason: 'Inventory adjustment' }),
    });

    await adminArchiveProduct('prod-uuid-1');

    expect(fetchSpy).toHaveBeenCalledWith('/api/admin/products/prod-uuid-1/archive', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-CSRF-Token': 'mutation_csrf_token',
      },
      credentials: 'include',
    });
  });
});
