// AXDORO Orders Client API (Cash on Delivery & Customer Token Lookup)

export interface OrderItemPayload {
  variantId: string;
  quantity: number;
}

export interface CreateOrderPayload {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddressLine1: string;
  shippingAddressLine2?: string;
  shippingCity: string;
  shippingState: string;
  shippingPincode: string;
  items: OrderItemPayload[];
  paymentMethod: 'COD';
  idempotencyKey?: string;
  notes?: string;
}

export interface CreatedOrderData {
  id: string;
  orderNumber: string;
  customerOrderToken: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  totalPaise: number;
  grandTotalPaise: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingCity: string;
  shippingState: string;
  shippingPincode: string;
  shippingAddressLine1: string;
  shippingAddressLine2?: string | null;
  createdAt: string;
  isReplay?: boolean;
}

export interface OrderResponse {
  status: 'success' | 'error';
  success: boolean;
  message: string;
  data?: CreatedOrderData;
  error?: string;
  isReplay?: boolean;
}

export async function submitOrder(payload: CreateOrderPayload): Promise<OrderResponse> {
  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = json.error || json.message || `Order creation failed (HTTP ${response.status})`;
    throw new Error(errorMsg);
  }

  return json;
}

export async function fetchOrderByToken(token: string): Promise<CreatedOrderData> {
  const response = await fetch(`/api/orders/${encodeURIComponent(token)}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = json.error || json.message || `Order lookup failed (HTTP ${response.status})`;
    throw new Error(errorMsg);
  }

  return json.data;
}
