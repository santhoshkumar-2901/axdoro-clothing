// AXDORO Returns Client API

export const RETURN_REASONS = [
  'WRONG_PRODUCT_RECEIVED',
  'PRODUCT_DAMAGED_OR_DEFECTIVE',
  'SIZE_DOES_NOT_FIT',
  'CHANGED_MY_MIND',
  'PRODUCT_NOT_AS_EXPECTED',
  'OTHER',
] as const;

export type ReturnReason = (typeof RETURN_REASONS)[number];

export const RETURN_REASON_OPTIONS: Array<{ value: ReturnReason; label: string }> = [
  { value: 'WRONG_PRODUCT_RECEIVED', label: 'Wrong product received' },
  { value: 'PRODUCT_DAMAGED_OR_DEFECTIVE', label: 'Product damaged or defective' },
  { value: 'SIZE_DOES_NOT_FIT', label: "Size doesn't fit" },
  { value: 'CHANGED_MY_MIND', label: 'Changed my mind' },
  { value: 'PRODUCT_NOT_AS_EXPECTED', label: 'Product not as expected' },
  { value: 'OTHER', label: 'Other' },
];

export interface ReturnRequestPayload {
  orderId: string;
  phone: string;
  email: string;
  reason: ReturnReason;
  description?: string | null;
  evidence?: File[];
}

export interface ReturnRequestResponse {
  status: 'success' | 'error';
  message: string;
  data: {
    requestId: string;
  };
  errors?: Array<{ path?: (string | number)[]; message: string }>;
}

/**
 * Submits a customer return or exchange request to POST /api/returns.
 * Supports both JSON (text-only) and multipart/form-data (with optional evidence images).
 * Strictly adheres to backend validation constraints and response formatting.
 */
export async function submitReturnRequest(
  payload: ReturnRequestPayload
): Promise<ReturnRequestResponse> {
  let response: Response;

  if (payload.evidence && payload.evidence.length > 0) {
    const formData = new FormData();
    formData.append('orderId', payload.orderId.trim());
    formData.append('phone', payload.phone.trim());
    formData.append('email', payload.email.trim());
    formData.append('reason', payload.reason);
    if (payload.description) {
      formData.append('description', payload.description.trim());
    }
    for (const file of payload.evidence) {
      formData.append('evidence', file);
    }

    response = await fetch('/api/returns', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        // Content-Type is intentionally omitted so browser sets multipart/form-data with boundary
      },
      body: formData,
    });
  } else {
    response = await fetch('/api/returns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        orderId: payload.orderId.trim(),
        phone: payload.phone.trim(),
        email: payload.email.trim(),
        reason: payload.reason,
        description: payload.description ? payload.description.trim() : null,
      }),
    });
  }

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg =
      json.message ||
      json.error ||
      `Return request submission failed (HTTP ${response.status})`;
    const error = new Error(errorMsg);
    (error as Error & { status?: number; errors?: unknown }).status = response.status;
    (error as Error & { status?: number; errors?: unknown }).errors = json.errors;
    throw error;
  }

  return json as ReturnRequestResponse;
}
