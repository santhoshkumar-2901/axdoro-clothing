// AXDORO Checkout Reliability Utilities — Phase 5.2 (F-01 Phone Normalization & F-02 Stable Idempotency)

export interface PhoneValidationResult {
  isValid: boolean;
  normalized: string;
  error?: string;
}

/**
 * Normalizes customer phone number and validates against Indian & international E.164 requirements.
 * Accepts digits, spaces, and hyphens with an optional leading '+'.
 * Rejects illegal characters (letters, symbols) rather than silently sanitizing them.
 * Normalized output matches server schema: /^[+]?[0-9]{10,15}$/
 */
export function normalizeAndValidatePhone(input: string): PhoneValidationResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      isValid: false,
      normalized: '',
      error: 'Please enter your phone number',
    };
  }

  // Must only contain digits, spaces, hyphens, and at most one leading '+'
  const hasValidCharacters = /^\+?[0-9\s-]+$/.test(trimmed);
  if (!hasValidCharacters) {
    return {
      isValid: false,
      normalized: '',
      error: 'Phone number can only contain digits, spaces, hyphens, and an optional leading "+"',
    };
  }

  // Ensure '+' only appears at the very beginning (index 0)
  if (trimmed.indexOf('+') > 0 || (trimmed.match(/\+/g) || []).length > 1) {
    return {
      isValid: false,
      normalized: '',
      error: 'The "+" country code prefix can only appear once at the beginning',
    };
  }

  const hasLeadingPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/[^0-9]/g, '');

  if (digitsOnly.length < 10) {
    return {
      isValid: false,
      normalized: '',
      error: 'Phone number must contain at least 10 digits',
    };
  }

  if (digitsOnly.length > 15) {
    return {
      isValid: false,
      normalized: '',
      error: 'Phone number cannot exceed 15 digits',
    };
  }

  const normalized = hasLeadingPlus ? `+${digitsOnly}` : digitsOnly;

  // Strict verification against authoritative server schema regex
  if (!/^[+]?[0-9]{10,15}$/.test(normalized)) {
    return {
      isValid: false,
      normalized: '',
      error: 'Phone must be a valid 10 to 15 digit number',
    };
  }

  return {
    isValid: true,
    normalized,
  };
}

export interface CanonicalOrderPayloadInput {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddressLine1: string;
  shippingAddressLine2?: string | null;
  shippingCity: string;
  shippingState: string;
  shippingPincode: string;
  paymentMethod: 'COD';
  notes?: string | null;
  items: { variantId: string; quantity: number }[];
}

/**
 * Computes canonical payload string consistent with server fingerprinting logic.
 * Normalizes customer fields and sorts items deterministically by lowercase variant ID.
 */
export function computeClientOrderFingerprint(payload: CanonicalOrderPayloadInput): string {
  const normalizedCustomer = {
    customerName: payload.customerName.trim(),
    customerEmail: payload.customerEmail.trim().toLowerCase(),
    customerPhone: payload.customerPhone.trim(),
    shippingAddressLine1: payload.shippingAddressLine1.trim(),
    shippingAddressLine2: (payload.shippingAddressLine2 || '').trim() || null,
    shippingCity: payload.shippingCity.trim(),
    shippingState: payload.shippingState.trim(),
    shippingPincode: payload.shippingPincode.trim(),
    paymentMethod: payload.paymentMethod,
    notes: (payload.notes || '').trim() || null,
  };

  const normalizedItems = [...payload.items]
    .map((it) => ({
      variantId: it.variantId.toLowerCase(),
      quantity: it.quantity,
    }))
    .sort((a, b) => a.variantId.localeCompare(b.variantId));

  return JSON.stringify({
    customer: normalizedCustomer,
    items: normalizedItems,
  });
}

/**
 * Computes deterministic SHA-256 hex string from canonical string.
 * Uses Web Crypto API with synchronous deterministic fallback for testing environments.
 */
export async function hashCanonicalPayload(canonicalStr: string): Promise<string> {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    try {
      const msgBuffer = new TextEncoder().encode(canonicalStr);
      const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fall through to deterministic fallback if subtle digest fails
    }
  }

  // Deterministic FNV-1a 64-bit style string hash fallback
  let h1 = 0x811c9dc5;
  let h2 = 0x27d4eb2f;
  for (let i = 0; i < canonicalStr.length; i++) {
    const c = canonicalStr.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x000001b3);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

export function generateRandomIdempotencyKey(): string {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 10);
  return `ord-${timestamp}-${randomSuffix}`;
}

const IDEMPOTENCY_STORAGE_KEY = 'axdoro_checkout_idempotency_v1';

// In-memory fallback session holder
let inMemorySession: { key: string; fingerprintHash: string } | null = null;

function readStoredSession(): { key: string; fingerprintHash: string } | null {
  if (inMemorySession) {
    return inMemorySession;
  }
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const item = window.sessionStorage.getItem(IDEMPOTENCY_STORAGE_KEY);
      if (item) {
        const parsed = JSON.parse(item);
        if (parsed?.key && parsed?.fingerprintHash) {
          inMemorySession = parsed;
          return parsed;
        }
      }
    }
  } catch {
    // Ignore storage parse exceptions
  }
  return null;
}

function writeStoredSession(session: { key: string; fingerprintHash: string } | null): void {
  inMemorySession = session;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      if (session) {
        window.sessionStorage.setItem(IDEMPOTENCY_STORAGE_KEY, JSON.stringify(session));
      } else {
        window.sessionStorage.removeItem(IDEMPOTENCY_STORAGE_KEY);
      }
    }
  } catch {
    // Ignore storage write exceptions
  }
}

/**
 * Returns an existing idempotency key if the payload fingerprint matches the active attempt,
 * or generates a fresh key if no session exists or the logical payload has changed.
 * Zero customer PII is persisted (only random key and hash string).
 */
export async function getOrGenerateIdempotencyKey(payload: CanonicalOrderPayloadInput): Promise<{
  idempotencyKey: string;
  isRetry: boolean;
}> {
  const canonicalStr = computeClientOrderFingerprint(payload);
  const currentHash = await hashCanonicalPayload(canonicalStr);

  const existing = readStoredSession();

  if (existing && existing.fingerprintHash === currentHash) {
    // Exact same logical order payload -> reuse key across retries and modal reopenings
    return {
      idempotencyKey: existing.key,
      isRetry: true,
    };
  }

  // Logical payload has changed or this is a fresh attempt -> generate new key
  const newKey = generateRandomIdempotencyKey();
  writeStoredSession({
    key: newKey,
    fingerprintHash: currentHash,
  });

  return {
    idempotencyKey: newKey,
    isRetry: false,
  };
}

/**
 * Clears active idempotency session upon confirmed order placement success.
 */
export function clearIdempotencySession(): void {
  writeStoredSession(null);
}

/**
 * Reset helper for test suites.
 */
export function resetIdempotencySessionForTesting(): void {
  writeStoredSession(null);
}
