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
  minComparisonPricePaise?: number | null;
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
    setCsrfToken(null);
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

export interface AdminCategory {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  displayOrder: number;
  isActive: boolean;
  productCount: number;
  createdAt: string;
}

export async function adminGetCategories(): Promise<AdminCategory[]> {
  const res = await fetch('/api/admin/categories', {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error || 'Failed to fetch categories');
  return json.data || json.categories || [];
}

export interface CreateProductVariantPayload {
  size: string;
  color: string;
  colorHex?: string;
  sku: string;
  pricePaise: number;
  comparisonPricePaise?: number | null;
  stockQuantity: number;
  isActive: boolean;
}

export interface CreateProductImagePayload {
  imageUrl: string;
  altText?: string | null;
  displayOrder: number;
  isPrimary: boolean;
  publicId?: string | null;
  width?: number | null;
  height?: number | null;
  format?: string | null;
  bytes?: number | null;
}

export interface CreateProductPayload {
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  status: 'draft' | 'published' | 'archived';
  isFeatured: boolean;
  isNewArrival: boolean;
  fabricSpec?: string | null;
  variants: CreateProductVariantPayload[];
  images?: CreateProductImagePayload[];
}

export interface UpdateProductPayload {
  name?: string;
  slug?: string;
  description?: string;
  categoryId?: string;
  status?: 'draft' | 'published' | 'archived';
  isFeatured?: boolean;
  isNewArrival?: boolean;
  fabricSpec?: string | null;
}

export interface UpdateProductVariantPayload {
  size?: string;
  color?: string;
  colorHex?: string;
  sku?: string;
  pricePaise?: number;
  comparisonPricePaise?: number | null;
  stockQuantity?: number;
  isActive?: boolean;
}

export async function adminCreateProduct(
  payload: CreateProductPayload
): Promise<{ id: string; slug: string }> {
  const res = await fetch('/api/admin/products', {
    method: 'POST',
    headers: csrfHeaders(),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || json.message || 'Failed to create product');
  }
  return json.data || json.product;
}

export async function adminUpdateProduct(
  id: string,
  payload: UpdateProductPayload
): Promise<AdminProductDetail> {
  const res = await fetch(`/api/admin/products/${id}`, {
    method: 'PUT',
    headers: csrfHeaders(),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || json.message || 'Failed to update product');
  }
  return json.data || json.product;
}

export async function adminCreateVariant(
  productId: string,
  payload: CreateProductVariantPayload
): Promise<{ id: string }> {
  const res = await fetch(`/api/admin/products/${productId}/variants`, {
    method: 'POST',
    headers: csrfHeaders(),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || json.message || 'Failed to create variant');
  }
  return json.data || json.variant;
}

export async function adminUpdateVariant(
  productId: string,
  variantId: string,
  payload: UpdateProductVariantPayload
): Promise<void> {
  const res = await fetch(`/api/admin/products/${productId}/variants/${variantId}`, {
    method: 'PUT',
    headers: csrfHeaders(),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || json.message || 'Failed to update variant');
  }
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

export async function adminUnarchiveProduct(id: string): Promise<void> {
  const res = await fetch(`/api/admin/products/${id}/unarchive`, {
    method: 'POST',
    headers: csrfHeaders(),
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Failed to unarchive product');
}

export async function adminDeleteProduct(
  id: string
): Promise<{ success: boolean; deletedPublicIds?: string[] }> {
  const res = await fetch(`/api/admin/products/${id}`, {
    method: 'DELETE',
    headers: csrfHeaders(),
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) {
    const error: any = new Error(json.error || json.message || 'Failed to delete product');
    error.status = res.status;
    error.canArchive = Boolean(json.canArchive);
    throw error;
  }
  return { success: true, ...json };
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

// -------------------------------------------------------------
// Product Image Management Client APIs
// -------------------------------------------------------------

export interface ProductImage {
  id: string;
  productId: string;
  imageUrl: string;
  altText?: string | null;
  displayOrder: number;
  isPrimary: boolean;
  publicId?: string | null;
  width?: number | null;
  height?: number | null;
  format?: string | null;
  bytes?: number | null;
  createdAt?: string;
}

export interface AdminProductDetail extends AdminProduct {
  images: ProductImage[];
  variants: {
    id: string;
    productId: string;
    size: string;
    color: string;
    colorHex?: string | null;
    sku: string;
    pricePaise: number;
    comparisonPricePaise?: number | null;
    stockQuantity: number;
    isActive: boolean;
  }[];
}

export interface CloudinarySignature {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  publicId: string;
  uploadUrl: string;
}

export async function adminGetProductDetails(id: string): Promise<AdminProductDetail> {
  const res = await fetch(`/api/admin/products/${id}`, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Failed to fetch product details');
  return json.data;
}

export async function adminGetUploadSignature(productId: string): Promise<CloudinarySignature> {
  const res = await fetch(`/api/admin/products/${productId}/images/signature`, {
    method: 'POST',
    headers: csrfHeaders(),
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) {
    const err = new Error(json.message || 'Failed to generate image upload signature');
    (err as any).code = json.code;
    throw err;
  }
  return json.data;
}

export async function adminAddProductImage(
  productId: string,
  imageData: {
    imageUrl: string;
    publicId?: string;
    altText?: string;
    displayOrder?: number;
    isPrimary?: boolean;
    width?: number;
    height?: number;
    format?: string;
    bytes?: number;
  }
): Promise<ProductImage> {
  const res = await fetch(`/api/admin/products/${productId}/images`, {
    method: 'POST',
    headers: csrfHeaders(),
    credentials: 'include',
    body: JSON.stringify(imageData),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || json.message || 'Failed to add product image');
  return json.data;
}

export async function adminSetPrimaryProductImage(
  productId: string,
  imageId: string
): Promise<void> {
  const res = await fetch(`/api/admin/products/${productId}/images/${imageId}/primary`, {
    method: 'PATCH',
    headers: csrfHeaders(),
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Failed to set primary image');
}

export async function adminReorderProductImages(
  productId: string,
  images: { id: string; displayOrder: number }[]
): Promise<void> {
  const res = await fetch(`/api/admin/products/${productId}/images/reorder`, {
    method: 'PUT',
    headers: csrfHeaders(),
    credentials: 'include',
    body: JSON.stringify({ images }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Failed to reorder images');
}

export async function adminDeleteProductImage(
  productId: string,
  imageId: string
): Promise<void> {
  const res = await fetch(`/api/admin/products/${productId}/images/${imageId}`, {
    method: 'DELETE',
    headers: csrfHeaders(),
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Failed to delete product image');
}
