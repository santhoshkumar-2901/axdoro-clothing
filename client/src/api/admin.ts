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
  imageUrl?: string | null;
  publicId?: string | null;
  section?: {
    id: string;
    isEnabled: boolean;
    displayOrder: number;
    heading: string;
  } | null;
}

export interface CategorySectionCard {
  id: string;
  label: string;
  sublabel?: string | null;
  imageUrl: string;
  destinationType: 'category' | 'query';
  destinationCategorySlug?: string | null;
  query?: string | null;
}

export interface AdminCategorySection {
  id: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  categoryIsActive: boolean;
  isEnabled: boolean;
  displayOrder: number;
  heading: string;
  subtitle: string | null;
  categoryCards: CategorySectionCard[];
  posterImageUrl: string | null;
  posterHeading: string | null;
  posterSubtitle: string | null;
  posterDestinationUrl: string | null;
  productLimit: number;
  viewAllLabel: string;
  viewAllDestination: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertCategorySectionPayload {
  isEnabled: boolean;
  displayOrder: number;
  heading: string;
  subtitle?: string | null;
  categoryCards: CategorySectionCard[];
  posterImageUrl?: string | null;
  posterHeading?: string | null;
  posterSubtitle?: string | null;
  posterDestinationUrl?: string | null;
  productLimit: number;
  viewAllLabel: string;
  viewAllDestination?: string | null;
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

export async function adminGetCategorySection(categoryId: string): Promise<AdminCategorySection | null> {
  const res = await fetch(`/api/admin/categories/${categoryId}/section`, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  if (res.status === 404) {
    return null;
  }
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error || 'Failed to fetch category section');
  return json.data || json.section;
}

export async function adminUpsertCategorySection(
  categoryId: string,
  payload: UpsertCategorySectionPayload
): Promise<AdminCategorySection> {
  const res = await fetch(`/api/admin/categories/${categoryId}/section`, {
    method: 'PUT',
    headers: csrfHeaders(),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error || 'Failed to save category section');
  return json.data || json.section;
}

export async function adminDeleteCategorySection(categoryId: string): Promise<void> {
  const res = await fetch(`/api/admin/categories/${categoryId}/section`, {
    method: 'DELETE',
    headers: csrfHeaders(),
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error || 'Failed to delete category section');
}

export async function adminReorderCategorySections(orderedSectionIds: string[]): Promise<void> {
  const res = await fetch('/api/admin/categories/sections/reorder', {
    method: 'PUT',
    headers: csrfHeaders(),
    credentials: 'include',
    body: JSON.stringify({ orderedSectionIds }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error || 'Failed to reorder category sections');
}

export interface CreateCategoryPayload {
  slug: string;
  name: string;
  description?: string;
  displayOrder?: number;
  isActive?: boolean;
  imageUrl?: string | null;
  publicId?: string | null;
}

export interface UpdateCategoryPayload {
  slug?: string;
  name?: string;
  description?: string | null;
  displayOrder?: number;
  isActive?: boolean;
  imageUrl?: string | null;
  publicId?: string | null;
}

export async function adminCreateCategory(
  payload: CreateCategoryPayload
): Promise<AdminCategory> {
  const res = await fetch('/api/admin/categories', {
    method: 'POST',
    headers: csrfHeaders(),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error || 'Failed to create category');
  return json.data || json.category;
}

export async function adminUpdateCategory(
  id: string,
  payload: UpdateCategoryPayload
): Promise<void> {
  const res = await fetch(`/api/admin/categories/${id}`, {
    method: 'PUT',
    headers: csrfHeaders(),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error || 'Failed to update category');
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
  color?: string | null;
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
  stagingSessionId?: string | null;
  variants: CreateProductVariantPayload[];
  images?: CreateProductImagePayload[];
}

export interface UpdateProductVariantItemPayload {
  id?: string;
  size: string;
  color: string;
  colorHex?: string | null;
  sku?: string;
  pricePaise: number;
  comparisonPricePaise?: number | null;
  stockQuantity: number;
  isActive: boolean;
}

export interface UpdateProductImageItemPayload {
  id?: string;
  imageUrl: string;
  publicId?: string | null;
  altText?: string | null;
  displayOrder: number;
  isPrimary: boolean;
  width?: number | null;
  height?: number | null;
  format?: string | null;
  bytes?: number | null;
  color?: string | null;
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
  expectedUpdatedAt?: string | null;
  stagingSessionId?: string | null;
  variants?: UpdateProductVariantItemPayload[];
  images?: UpdateProductImageItemPayload[];
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
  acknowledgedAt?: string | null;
}

export interface AdminBadgeCounts {
  orders: {
    unacknowledgedCount: number;
  };
  inventory: {
    lowStockProductCount: number;
  };
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
  hasArtwork?: boolean;
  designFileName?: string | null;
  designFileFormat?: string | null;
  designFileBytes?: number | null;
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

export async function adminAcknowledgeOrder(orderId: string): Promise<AdminOrder> {
  const res = await fetch(`/api/admin/orders/${orderId}/acknowledge`, {
    method: 'POST',
    headers: csrfHeaders(),
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Failed to acknowledge order');
  return json.data;
}

export async function adminGetBadgeCounts(): Promise<AdminBadgeCounts> {
  const res = await fetch('/api/admin/notifications/badge-counts', {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Failed to fetch notification badge counts');
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

/**
 * Downloads custom artwork attachment securely through the authenticated admin proxy endpoint.
 * Ensures the response is saved as a file and cleans up generated object URLs.
 */
export async function adminDownloadArtwork(enquiryId: string, preferredFilename?: string | null): Promise<void> {
  const res = await fetch(`/api/admin/enquiries/${enquiryId}/artwork`, {
    headers: { Accept: '*/*' },
    credentials: 'include',
  });

  if (!res.ok) {
    const errJson = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    throw new Error(errJson.message || errJson.error || `Download failed with HTTP ${res.status}`);
  }

  // Derive filename from Content-Disposition header if available
  let filename = preferredFilename || `artwork-${enquiryId}`;
  const disposition = res.headers.get('content-disposition');
  if (disposition) {
    const filenameMatch = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    if (filenameMatch && filenameMatch[1]) {
      filename = filenameMatch[1].replace(/['"]/g, '').trim();
    }
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    // Revoke object URL after use to prevent memory leaks
    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 1000);
  }
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

export interface DeleteEnquiryResponse {
  status: 'success' | 'error';
  message: string;
}

export async function adminDeleteEnquiry(id: string): Promise<DeleteEnquiryResponse> {
  const res = await fetch(`/api/admin/enquiries/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: csrfHeaders(),
    credentials: 'include',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error: any = new Error(json.error || json.message || 'Failed to delete enquiry');
    error.status = res.status;
    throw error;
  }
  return json;
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
  color?: string | null;
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

export async function adminCreateStagingSession(): Promise<{ sessionId: string; expiresAt: string }> {
  const res = await fetch('/api/admin/products/staging-sessions', {
    method: 'POST',
    headers: csrfHeaders(),
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || 'Failed to create product staging session');
  }
  return json.data;
}

export async function adminHeartbeatStagingSession(sessionId: string): Promise<{ sessionId: string; expiresAt: string }> {
  const res = await fetch(`/api/admin/products/staging-sessions/${encodeURIComponent(sessionId)}/heartbeat`, {
    method: 'POST',
    headers: csrfHeaders(),
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) {
    const err = new Error(json.message || 'Failed to heartbeat product staging session');
    (err as any).status = res.status;
    throw err;
  }
  return json.data;
}

export async function adminAbandonStagingSession(sessionId: string): Promise<void> {
  try {
    await fetch(`/api/admin/products/staging-sessions/${encodeURIComponent(sessionId)}/abandon`, {
      method: 'POST',
      headers: csrfHeaders(),
      credentials: 'include',
    });
  } catch {
    // Fire-and-forget: ignore network errors when abandoning on dialog close
  }
}

export async function adminGetProductUploadSignature(
  options?: string | { productId?: string; sessionId?: string }
): Promise<CloudinarySignature> {
  const productId = typeof options === 'string' ? options : options?.productId;
  const sessionId = typeof options === 'object' ? options?.sessionId : undefined;

  const endpoint = productId
    ? `/api/admin/products/${productId}/images/signature`
    : '/api/admin/products/upload-signature';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: csrfHeaders(),
    credentials: 'include',
    body: sessionId ? JSON.stringify({ sessionId }) : undefined,
  });
  const json = await res.json();
  if (!res.ok) {
    const err = new Error(json.message || 'Failed to generate product image upload signature');
    (err as any).code = json.code;
    throw err;
  }
  return json.data;
}

export async function adminGetUploadSignature(productId: string): Promise<CloudinarySignature> {
  return adminGetProductUploadSignature(productId);
}

export async function adminGetCategoryUploadSignature(categoryId?: string): Promise<CloudinarySignature> {
  const endpoint = categoryId
    ? `/api/admin/categories/${categoryId}/images/signature`
    : '/api/admin/categories/upload-signature';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: csrfHeaders(),
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) {
    const err = new Error(json.message || 'Failed to generate category image upload signature');
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
    color?: string | null;
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

export async function adminUpdateProductImage(
  productId: string,
  imageId: string,
  data: {
    color?: string | null;
    altText?: string | null;
  }
): Promise<ProductImage> {
  const res = await fetch(`/api/admin/products/${productId}/images/${imageId}`, {
    method: 'PATCH',
    headers: csrfHeaders(),
    credentials: 'include',
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || json.message || 'Failed to update product image');
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

export interface UpdateHomepageCollectionPayload {
  title?: string;
  description?: string | null;
  isEnabled?: boolean;
  displayOrder?: number;
}

export async function adminGetHomepageCollections(): Promise<import('../types/product.js').AdminHomepageCollection[]> {
  const res = await fetch('/api/admin/collections', {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error || 'Failed to fetch homepage collections');
  return json.data || json.collections || [];
}

export async function adminUpdateHomepageCollection(
  id: string,
  payload: UpdateHomepageCollectionPayload
): Promise<import('../types/product.js').AdminHomepageCollection> {
  const res = await fetch(`/api/admin/collections/${id}`, {
    method: 'PUT',
    headers: csrfHeaders(),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error || 'Failed to update homepage collection');
  return json.data || json.collection;
}

export async function adminUpdateCollectionProducts(
  collectionId: string,
  productIds: string[]
): Promise<import('../types/product.js').AdminHomepageCollection> {
  const res = await fetch(`/api/admin/collections/${collectionId}/products`, {
    method: 'PUT',
    headers: csrfHeaders(),
    credentials: 'include',
    body: JSON.stringify({ productIds }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error || 'Failed to update collection products');
  return json.data || json.collection;
}

// -------------------------------------------------------------
// Homepage Hero Banner Management Client APIs
// -------------------------------------------------------------

export interface UpdateHomepageHeroPayload {
  imageUrl?: string | null;
  publicId?: string | null;
  slides?: import('../types/product.js').HeroSlide[];
}

export async function adminGetHomepageHero(): Promise<import('../types/product.js').HomepageHeroSetting> {
  const res = await fetch('/api/admin/homepage/hero', {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error || 'Failed to fetch homepage hero configuration');
  return json.data;
}

export async function adminGetHeroUploadSignature(): Promise<CloudinarySignature> {
  const res = await fetch('/api/admin/homepage/hero/upload-signature', {
    method: 'POST',
    headers: csrfHeaders(),
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error || 'Failed to get hero upload signature');
  return json.data;
}

export async function adminUpdateHomepageHero(
  payload: UpdateHomepageHeroPayload
): Promise<import('../types/product.js').HomepageHeroSetting> {
  const res = await fetch('/api/admin/homepage/hero', {
    method: 'PUT',
    headers: csrfHeaders(),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error || 'Failed to update homepage hero image');
  return json.data;
}

// -------------------------------------------------------------
// Payment QR Code Settings Client APIs
// -------------------------------------------------------------

export interface UpdatePaymentQrPayload {
  imageUrl?: string | null;
  publicId?: string | null;
  upiId?: string | null;
}

export async function adminGetPaymentQr(): Promise<import('../types/product.js').PaymentQrSetting> {
  const res = await fetch('/api/admin/payment-settings/qr', {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error || 'Failed to fetch payment QR configuration');
  return json.data;
}

export async function adminGetPaymentQrUploadSignature(): Promise<CloudinarySignature> {
  const res = await fetch('/api/admin/payment-settings/qr/upload-signature', {
    method: 'POST',
    headers: csrfHeaders(),
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error || 'Failed to get payment QR upload signature');
  return json.data;
}

export async function adminUpdatePaymentQr(
  payload: UpdatePaymentQrPayload
): Promise<import('../types/product.js').PaymentQrSetting> {
  const res = await fetch('/api/admin/payment-settings/qr', {
    method: 'PUT',
    headers: csrfHeaders(),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error || 'Failed to update payment QR settings');
  return json.data;
}
