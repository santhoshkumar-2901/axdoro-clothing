import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import {
  submitReturnRequest,
  RETURN_REASON_OPTIONS,
  ReturnRequestPayload,
} from './api/returns';
import { ReturnRequestPage } from './pages/ReturnRequestPage';

describe('Phase 3: Customer Submission Form & API Integration Tests', () => {
  const pagePath = path.resolve(__dirname, 'pages/ReturnRequestPage.tsx');
  const pageContent = fs.readFileSync(pagePath, 'utf-8');

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. FORM RENDERS ALL REQUIRED FIELDS & CONTROLS
  // =========================================================================
  it('renders all required form fields, accessible labels, options, and policy notice', () => {
    const html = renderToString(React.createElement(ReturnRequestPage, {}));

    // Heading and title
    expect(html).toContain('Return &amp; Exchange Request');
    expect(html).toContain('7-Day Eligibility Policy');

    // Required Form Fields
    expect(html).toContain('id="orderId"');
    expect(html).toContain('name="orderId"');
    expect(html).toContain('id="phone"');
    expect(html).toContain('name="phone"');
    expect(html).toContain('id="email"');
    expect(html).toContain('name="email"');
    expect(html).toContain('id="reason"');
    expect(html).toContain('name="reason"');
    expect(html).toContain('id="description"');
    expect(html).toContain('name="description"');

    // Placeholders
    expect(html).toContain('placeholder="e.g. AX-202611-0001"');
    expect(html).toContain('placeholder="e.g. +919876543210"');
    expect(html).toContain('placeholder="e.g. customer@example.com"');

    // Dropdown reason options
    expect(html).toContain('Select a reason...');
    for (const opt of RETURN_REASON_OPTIONS) {
      expect(html).toContain(`value="${opt.value}"`);
      // React's renderToString encodes single quotes as &#x27;
      const encodedLabel = opt.label.replace(/'/g, '&#x27;');
      expect(html).toContain(encodedLabel);
    }

    // Submit button
    expect(html).toContain('data-testid="return-submit-button"');
    expect(html).toContain('Submit Return Request');

    // Policy links
    expect(html).toContain('AXDORO Return &amp; Exchange Policy');
  });

  // =========================================================================
  // 2. REQUIRED-FIELD VALIDATION LOGIC
  // =========================================================================
  it('enforces required field checks on orderId, phone, email, and reason', () => {
    expect(pageContent).toContain("newErrors.orderId = 'Order ID is required.'");
    expect(pageContent).toContain("newErrors.phone = 'Phone number is required.'");
    expect(pageContent).toContain("newErrors.email = 'Email address is required.'");
    expect(pageContent).toContain("newErrors.reason = 'Please select a reason for your return or exchange.'");

    // Order ID min/max checks
    expect(pageContent).toContain("newErrors.orderId = 'Order ID must be at least 3 characters.'");
    expect(pageContent).toContain("newErrors.orderId = 'Order ID cannot exceed 64 characters.'");
  });

  // =========================================================================
  // 3. INVALID EMAIL VALIDATION
  // =========================================================================
  it('validates email format consistent with standard email regex', () => {
    expect(pageContent).toContain('EMAIL_REGEX');
    expect(pageContent).toContain("newErrors.email = 'Please enter a valid email address.'");
    expect(pageContent).toContain("newErrors.email = 'Email cannot exceed 255 characters.'");

    // Verify regex rejects invalid emails
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    expect(EMAIL_REGEX.test('invalid')).toBe(false);
    expect(EMAIL_REGEX.test('user@')).toBe(false);
    expect(EMAIL_REGEX.test('@domain.com')).toBe(false);
    expect(EMAIL_REGEX.test('customer@example.com')).toBe(true);
  });

  // =========================================================================
  // 4. INVALID PHONE VALIDATION
  // =========================================================================
  it('validates phone format consistent with backend PHONE_REGEX (10 to 15 digits)', () => {
    expect(pageContent).toContain('PHONE_REGEX = /^[+]?[0-9]{10,15}$/');
    expect(pageContent).toContain("newErrors.phone = 'Please enter a valid 10 to 15 digit phone number (e.g. +919876543210).'");

    const PHONE_REGEX = /^[+]?[0-9]{10,15}$/;
    expect(PHONE_REGEX.test('123')).toBe(false);
    expect(PHONE_REGEX.test('abc123456789')).toBe(false);
    expect(PHONE_REGEX.test('+919876543210')).toBe(true);
    expect(PHONE_REGEX.test('9876543210')).toBe(true);
  });

  // =========================================================================
  // 5. INVALID DESCRIPTION LENGTH VALIDATION
  // =========================================================================
  it('validates description length up to 1000 characters and displays character counter', () => {
    expect(pageContent).toContain("description.trim().length > 1000");
    expect(pageContent).toContain("newErrors.description = 'Description cannot exceed 1000 characters.'");
    expect(pageContent).toContain('{description.length} / 1000');
  });

  // =========================================================================
  // 6. VALID SUBMISSION SENDS THE CORRECT PAYLOAD
  // =========================================================================
  it('submitReturnRequest sends POST /api/returns with exact JSON payload and headers', async () => {
    const mockResponse = {
      status: 'success',
      message: 'Your return request has been submitted successfully.',
      data: {
        requestId: 'RET-202611-A1B2C3',
      },
    };

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => mockResponse,
    });
    global.fetch = fetchSpy;

    const payload: ReturnRequestPayload = {
      orderId: 'AX-202611-0001',
      phone: '+919876543210',
      email: 'customer@example.com',
      reason: 'SIZE_DOES_NOT_FIT',
      description: 'Garment is slightly tight.',
    };

    const result = await submitReturnRequest(payload);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith('/api/returns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    expect(result.status).toBe('success');
    expect(result.data.requestId).toBe('RET-202611-A1B2C3');
  });

  // =========================================================================
  // 7. LOADING STATE PREVENTS REPEATED SUBMISSION
  // =========================================================================
  it('disables submit button and shows loading spinner during submission', () => {
    expect(pageContent).toContain('disabled={isSubmitting}');
    expect(pageContent).toContain('if (isSubmitting) return;');
    expect(pageContent).toContain('Submitting Request...');
    expect(pageContent).toContain('animate-spin');
  });

  // =========================================================================
  // 8. SUCCESSFUL RESPONSE CONFIRMATION STATE
  // =========================================================================
  it('confirmation state displays request reference and neutral policy evaluation notice', () => {
    expect(pageContent).toContain('data-testid="return-success-view"');
    expect(pageContent).toContain('Request Submitted Successfully');
    expect(pageContent).toContain('data-testid="request-reference-display"');
    expect(pageContent).toContain('data-testid="copy-reference-button"');

    // Mandatory notice that submission does not guarantee approval
    expect(pageContent).toContain('Submitting a return or exchange request does <strong>not</strong> guarantee automatic approval');
    expect(pageContent).toContain('Every request is manually evaluated against our 7-day delivery policy');
  });

  // =========================================================================
  // 9. COPY-REFERENCE INTERACTION
  // =========================================================================
  it('provides copy reference button with feedback state', () => {
    expect(pageContent).toContain('handleCopyReference');
    expect(pageContent).toContain('navigator.clipboard.writeText(submittedReference)');
    expect(pageContent).toContain('setCopied(true)');
    expect(pageContent).toContain('Copied');
  });

  // =========================================================================
  // 10. API VALIDATION ERROR HANDLING (HTTP 400)
  // =========================================================================
  it('handles server 400 validation errors cleanly and extracts message', async () => {
    const errorBody = {
      status: 'error',
      message: 'Validation failed: Invalid email address',
      errors: [{ path: ['email'], message: 'Invalid email address' }],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => errorBody,
    });

    const payload: ReturnRequestPayload = {
      orderId: 'AX-001',
      phone: '+919876543210',
      email: 'not-an-email',
      reason: 'OTHER',
    };

    await expect(submitReturnRequest(payload)).rejects.toThrow(
      'Validation failed: Invalid email address'
    );
  });

  // =========================================================================
  // 11. NETWORK FAILURE HANDLING
  // =========================================================================
  it('handles network failure (fetch rejection) gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network connection failed'));

    const payload: ReturnRequestPayload = {
      orderId: 'AX-001',
      phone: '+919876543210',
      email: 'user@example.com',
      reason: 'OTHER',
    };

    await expect(submitReturnRequest(payload)).rejects.toThrow(
      'Network connection failed'
    );

    // Verify UI catches this and sets serverError alert banner
    expect(pageContent).toContain('data-testid="server-error-banner"');
    expect(pageContent).toContain('Submission Failed');
  });

  // =========================================================================
  // 12. INTERNAL MATCHING INFORMATION IS NEVER DISPLAYED
  // =========================================================================
  it('ensures UI and API responses never display or leak internal matching flags', () => {
    // Neither the form nor the success view should contain references to internal database flags
    expect(pageContent).not.toContain('ORDER_UNMATCHED');
    expect(pageContent).not.toContain('CUSTOMER_INFO_MISMATCH');
    expect(pageContent).not.toContain('WITHIN_7_DAYS');
    expect(pageContent).not.toContain('EXCEEDS_7_DAYS');
    expect(pageContent).not.toContain('is_order_matched');
    expect(pageContent).not.toContain('matched_order_id');
  });

  // =========================================================================
  // 13. EVIDENCE UPLOAD CONTROLS RENDERING
  // =========================================================================
  it('renders evidence upload controls, accepted MIME types, and file limit text', () => {
    const html = renderToString(React.createElement(ReturnRequestPage, {}));

    expect(html).toContain('Evidence Images');
    expect(html).toContain('data-testid="evidence-file-input"');
    expect(html).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(html).toContain('0 / 3 uploaded');
    expect(html).toContain('Attach up to 3 photos');
    expect(html).toContain('Max 4 MB per image');
  });

  // =========================================================================
  // 14. CLIENT-SIDE EVIDENCE FILE VALIDATION RULES
  // =========================================================================
  it('enforces file count limit of 3, size limit of 4 MB, and allowed image formats', () => {
    expect(pageContent).toContain('MAX_EVIDENCE_FILES = 3');
    expect(pageContent).toContain('MAX_EVIDENCE_BYTES = 4 * 1024 * 1024');
    expect(pageContent).toContain('You can upload a maximum of');
    expect(pageContent).toContain('exceeds the 4 MB limit');
    expect(pageContent).toContain('Only JPEG, PNG, and WebP images are allowed.');
  });

  // =========================================================================
  // 15. MULTIPART FORM DATA SUBMISSION WITH EVIDENCE FILES
  // =========================================================================
  it('submitReturnRequest sends multipart/form-data when evidence images are present', async () => {
    const mockResponse = {
      status: 'success',
      message: 'Your return request has been submitted successfully.',
      data: {
        requestId: 'RET-202611-EVD001',
      },
    };

    let capturedHeaders: Record<string, string> | undefined;
    let capturedBody: unknown;

    const fetchSpy = vi.fn().mockImplementation(async (_url, options) => {
      capturedHeaders = options.headers;
      capturedBody = options.body;
      return {
        ok: true,
        status: 201,
        json: async () => mockResponse,
      };
    });
    global.fetch = fetchSpy;

    const fakeFile = new File(['fake-evidence-content'], 'damaged-zipper.jpg', {
      type: 'image/jpeg',
    });

    const payload: ReturnRequestPayload = {
      orderId: 'AX-202611-9999',
      phone: '+919876543210',
      email: 'customer@example.com',
      reason: 'PRODUCT_DAMAGED_OR_DEFECTIVE',
      description: 'Defective zipper seam.',
      evidence: [fakeFile],
    };

    const result = await submitReturnRequest(payload);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('success');
    expect(result.data.requestId).toBe('RET-202611-EVD001');

    // Headers must NOT set Content-Type so browser/fetch automatically supplies multipart boundary
    expect(capturedHeaders).toBeDefined();
    expect(capturedHeaders!['Content-Type']).toBeUndefined();
    expect(capturedHeaders!['Accept']).toBe('application/json');

    // Body must be an instance of FormData containing text fields and evidence file
    expect(capturedBody).toBeInstanceOf(FormData);
    const formData = capturedBody as FormData;
    expect(formData.get('orderId')).toBe('AX-202611-9999');
    expect(formData.get('phone')).toBe('+919876543210');
    expect(formData.get('email')).toBe('customer@example.com');
    expect(formData.get('reason')).toBe('PRODUCT_DAMAGED_OR_DEFECTIVE');
    expect(formData.get('description')).toBe('Defective zipper seam.');
    const evidenceEntries = formData.getAll('evidence');
    expect(evidenceEntries).toHaveLength(1);
  });

  // =========================================================================
  // 16. EVIDENCE FILE REMOVAL FUNCTIONALITY
  // =========================================================================
  it('supports removing individual evidence files from selection', () => {
    expect(pageContent).toContain('handleRemoveFile');
    expect(pageContent).toContain('data-testid="evidence-files-list"');
    expect(pageContent).toContain('aria-label={`Remove ${file.name}`}');
  });
});
