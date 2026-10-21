// AXDORO Admin WhatsApp Notification Utility — Phase 2
// Generates pre-filled, status-specific WhatsApp click-to-chat links with safe phone normalization

export interface WhatsAppPhoneNormalizationResult {
  isValid: boolean;
  normalizedNumber: string;
  error?: string;
}

export interface WhatsAppOrderNotificationResult {
  isEligible: boolean;
  url: string;
  tooltip: string;
  message: string;
}

/**
 * Normalizes customer phone numbers strictly for WhatsApp click-to-chat (https://wa.me/<number>).
 * WhatsApp requires digits only with international country code.
 *
 * Rules:
 * 1. Rejects illegal characters (letters, symbols). Accepts digits, spaces, hyphens, and optional leading '+'.
 * 2. If the number has an explicit leading '+' (e.g. +919876543210 or +14155552671), strips non-digits and uses as-is.
 * 3. If no leading '+':
 *    - 10 digits (e.g. 9876543210): standard Indian mobile number -> prepends '91'.
 *    - 11 digits starting with '0' (e.g. 09876543210): Indian trunk prefix -> strips '0' and prepends '91'.
 *    - 12 digits starting with '91' (e.g. 919876543210): Indian number already with country code -> retains as-is.
 *    - Any other length without explicit '+': considered ambiguous without country code prefix -> rejected safely.
 */
export function normalizeWhatsAppPhone(rawInput?: string | null): WhatsAppPhoneNormalizationResult {
  if (!rawInput || !rawInput.trim()) {
    return {
      isValid: false,
      normalizedNumber: '',
      error: 'Customer phone number is missing',
    };
  }

  const trimmed = rawInput.trim();

  // Validate allowed characters: digits, spaces, hyphens, optional leading '+'
  const hasValidChars = /^\+?[0-9\s-]+$/.test(trimmed);
  if (!hasValidChars) {
    return {
      isValid: false,
      normalizedNumber: '',
      error: 'Phone number contains invalid characters',
    };
  }

  // Ensure '+' only appears once at the very beginning
  if (trimmed.indexOf('+') > 0 || (trimmed.match(/\+/g) || []).length > 1) {
    return {
      isValid: false,
      normalizedNumber: '',
      error: 'The "+" country code prefix can only appear once at the beginning',
    };
  }

  const hasLeadingPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/\D/g, '');

  if (digitsOnly.length < 10) {
    return {
      isValid: false,
      normalizedNumber: '',
      error: 'Phone number must contain at least 10 digits',
    };
  }

  if (digitsOnly.length > 15) {
    return {
      isValid: false,
      normalizedNumber: '',
      error: 'Phone number cannot exceed 15 digits',
    };
  }

  let finalNumber = '';

  if (hasLeadingPlus) {
    // Explicit international number provided with leading '+'
    finalNumber = digitsOnly;
  } else {
    // No leading '+' provided
    if (digitsOnly.length === 10) {
      // 10-digit Indian mobile number
      finalNumber = `91${digitsOnly}`;
    } else if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
      // 11-digit Indian number with leading trunk prefix '0'
      finalNumber = `91${digitsOnly.slice(1)}`;
    } else if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
      // 12-digit Indian number with country code already present
      finalNumber = digitsOnly;
    } else {
      // Ambiguous country code without leading '+'
      return {
        isValid: false,
        normalizedNumber: '',
        error: 'Ambiguous country code. Format international numbers with a leading "+"',
      };
    }
  }

  // Final verification against WhatsApp requirements: 10 to 15 digits
  if (!/^[0-9]{10,15}$/.test(finalNumber)) {
    return {
      isValid: false,
      normalizedNumber: '',
      error: 'Normalized phone number must be 10 to 15 digits',
    };
  }

  return {
    isValid: true,
    normalizedNumber: finalNumber,
  };
}

/**
 * Generates an AXDORO-branded WhatsApp status notification message and click-to-chat URL.
 * Only supports confirmed/active order statuses: CONFIRMED, PROCESSING, SHIPPED, DELIVERED, CANCELLED.
 * PENDING orders are not eligible.
 */
export function getOrderWhatsAppNotification(order: {
  customerName?: string | null;
  orderNumber?: string | null;
  customerPhone?: string | null;
  orderStatus?: string | null;
}): WhatsAppOrderNotificationResult {
  const status = (order.orderStatus || '').toUpperCase();

  // PENDING orders must be confirmed first
  if (status === 'PENDING') {
    return {
      isEligible: false,
      url: '',
      tooltip: 'Order must be confirmed before sending status notifications',
      message: '',
    };
  }

  // Supported statuses check
  const supportedStatuses = ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
  if (!supportedStatuses.includes(status)) {
    return {
      isEligible: false,
      url: '',
      tooltip: `Notifications are not supported for status "${order.orderStatus || 'UNKNOWN'}"`,
      message: '',
    };
  }

  // Phone validation & normalization
  const phoneResult = normalizeWhatsAppPhone(order.customerPhone);
  if (!phoneResult.isValid) {
    return {
      isEligible: false,
      url: '',
      tooltip: phoneResult.error || 'Invalid customer phone number',
      message: '',
    };
  }

  const name = order.customerName ? order.customerName.trim() : 'Customer';
  const orderNum = order.orderNumber ? order.orderNumber.trim() : 'N/A';

  let message = '';
  switch (status) {
    case 'CONFIRMED':
      message = `Hi ${name}, your AXDORO order #${orderNum} has been confirmed. Thank you for shopping with us!`;
      break;
    case 'PROCESSING':
      message = `Hi ${name}, your AXDORO order #${orderNum} is now being processed. We'll keep you updated.`;
      break;
    case 'SHIPPED':
      // Tracking details omitted because tracking/carrier fields do not exist in the current schema
      message = `Hi ${name}, your AXDORO order #${orderNum} has been shipped. Thank you for choosing AXDORO!`;
      break;
    case 'DELIVERED':
      message = `Hi ${name}, your AXDORO order #${orderNum} has been delivered. Thank you for choosing AXDORO!`;
      break;
    case 'CANCELLED':
      message = `Hi ${name}, your AXDORO order #${orderNum} has been cancelled. Please contact us if you have any questions.`;
      break;
  }

  const encodedMessage = encodeURIComponent(message);
  const url = `https://wa.me/${phoneResult.normalizedNumber}?text=${encodedMessage}`;

  return {
    isEligible: true,
    url,
    tooltip: `Notify ${name} on WhatsApp (${status})`,
    message,
  };
}
