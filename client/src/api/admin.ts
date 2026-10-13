// AXDORO Admin API Client

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: 'admin';
}

export interface AdminMetrics {
  products: {
    total: number;
    published: number;
    draft: number;
    archived: number;
  };
  categories: {
    total: number;
    active: number;
    inactive: number;
  };
  variants: {
    total: number;
    active: number;
    totalStockUnits: number;
  };
  inventoryAlerts: {
    lowStockCount: number;
    outOfStockCount: number;
    criticalVariants: {
      variantId: string;
      productName: string;
      productSlug: string;
      sku: string;
      size: string;
      color: string;
      stockQuantity: number;
    }[];
  };
  auditLogsCount: number;
  enquiries: {
    available: boolean;
    message: string;
  };
  orders: {
    available: boolean;
    message: string;
  };
}

export interface AdminProduct {
  id: string;
  slug: string;
  name: string;
  description: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  status: 'draft' | 'published' | 'archived';
  isFeatured: boolean;
  isNewArrival: boolean;
  fabricSpec?: string | null;
  minPricePaise: number;
  totalStock: number;
  variantCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAuditLog {
  id: string;
  adminId: string | null;
  adminEmail: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}

let inMemoryCsrfToken: string | null = null;

export function getCsrfToken(): string | null {
  if (inMemoryCsrfToken) return inMemoryCsrfToken;
  if (typeof document !== 'undefined') {
    const match = document.cookie.match(/axdoro_csrf_token=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

export function setCsrfToken(token: string | null): void {
  inMemoryCsrfToken = token;
}

function csrfHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const csrf = getCsrfToken();
  if (csrf) {
    headers['X-CSRF-Token'] = csrf;
  }
  return headers;
}

export async function adminLogin(
  email: string,
  password: string
): Promise<{ admin: AdminUser; csrfToken?: string }> {
  const res = await fetch('/api/admin/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || 'Login failed');
  }

  if (json.data?.csrfToken) {
    setCsrfToken(json.data.csrfToken);
  }
  return { admin: json.data.admin, csrfToken: json.data?.csrfToken };
}

export async function adminLogout(): Promise<void> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    const csrf = getCsrfToken();
    if (csrf) {
      headers['X-CSRF-Token'] = csrf;
    }

    await fetch('/api/admin/auth/logout', {
      method: 'POST',
      headers,
      credentials: 'include',
    });
  } finally {
    setCsrfToken(null);
  }
}

export async function adminGetMe(): Promise<AdminUser | null> {
  try {
    const res = await fetch('/api/admin/auth/me', {
      headers: {
        Accept: 'application/json',
      },
      credentials: 'include',
    });
    if (!res.ok) {
      setCsrfToken(null);
      return null;
    }
    const json = await res.json();
    if (json.data?.csrfToken) {
      setCsrfToken(json.data.csrfToken);
    }
    return json.data;
  } catch {
    return null;
  }
}

export async function adminGetMetrics(): Promise<AdminMetrics> {
  const res = await fetch('/api/admin/metrics', {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Failed to fetch metrics');
  return json.data;
}

export async function adminGetProducts(status = 'all'): Promise<AdminProduct[]> {
  const res = await fetch(`/api/admin/products?status=${encodeURIComponent(status)}`, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Failed to fetch products');
  return json.data;
}

export async function adminArchiveProduct(id: string): Promise<void> {
  const res = await fetch(`/api/admin/products/${id}/archive`, {
    method: 'POST',
    headers: csrfHeaders(),
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Failed to archive product');
}

export async function adminAdjustStock(
  variantId: string,
  quantity: number,
  reason: string
): Promise<{ previousQuantity: number; newQuantity: number }> {
  const res = await fetch(`/api/admin/inventory/variants/${variantId}/stock`, {
    method: 'POST',
    headers: csrfHeaders(),
    credentials: 'include',
    body: JSON.stringify({ quantity, reason }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Failed to adjust stock');
  return json.data;
}

export async function adminGetAuditLogs(): Promise<AdminAuditLog[]> {
  const res = await fetch('/api/admin/audit-logs?limit=25', {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Failed to fetch audit logs');
  return json.data;
}

export interface AdminOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingCity: string;
  shippingState: string;
  totalPaise: number;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  createdAt: string;
}

export interface AdminEnquiry {
  id: string;
  enquiryType: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  productName: string | null;
  quantity: number | null;
  source: string;
  driveSyncStatus: string;
  createdAt: string;
}

export async function adminGetOrders(status?: string): Promise<AdminOrder[]> {
  const url = status ? `/api/admin/orders?status=${encodeURIComponent(status)}` : '/api/admin/orders';
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Failed to fetch orders');
  return json.data;
}

export async function adminUpdateOrderStatus(orderId: string, status: string, reason?: string): Promise<AdminOrder> {
  const res = await fetch(`/api/admin/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: csrfHeaders(),
    credentials: 'include',
    body: JSON.stringify({ status, reason }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Failed to update order status');
  return json.data;
}

export async function adminGetEnquiries(enquiryType?: string): Promise<AdminEnquiry[]> {
  const url = enquiryType ? `/api/admin/enquiries?enquiryType=${encodeURIComponent(enquiryType)}` : '/api/admin/enquiries';
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Failed to fetch enquiries');
  return json.data;
}

export async function adminGetDriveSyncStatus(): Promise<{
  totalEnquiries: number;
  syncedCount: number;
  pendingCount: number;
  failedCount: number;
  isConfigured: boolean;
}> {
  const res = await fetch('/api/admin/enquiries/sync-status', {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Failed to fetch drive sync status');
  return json.data;
}

export async function adminTriggerDriveSync(): Promise<{ synced: number; failed: number }> {
  const res = await fetch('/api/admin/enquiries/sync', {
    method: 'POST',
    headers: csrfHeaders(),
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Failed to trigger drive sync');
  return json.data;
}
