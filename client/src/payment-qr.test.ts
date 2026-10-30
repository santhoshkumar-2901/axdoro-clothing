import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  adminGetPaymentQr,
  adminGetPaymentQrUploadSignature,
  adminUpdatePaymentQr,
} from './api/admin.ts';
import { fetchPaymentQrSettings } from './api/orders.ts';

describe('Admin-Managed Payment QR, Copyable UPI ID & QR Lightbox Client Verification', () => {
  const clientDir = path.resolve(__dirname);

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. CheckoutModal.tsx Dynamic QR & Unavailable Prevention', () => {
    const modalPath = path.join(clientDir, 'components', 'CheckoutModal.tsx');
    const modalContent = fs.readFileSync(modalPath, 'utf-8');

    it('fetches dynamic payment QR settings on modal open', () => {
      expect(modalContent).toContain('fetchPaymentQrSettings');
      expect(modalContent).toContain('setPaymentSettings');
    });

    it('prevents order submission when payment settings are unconfigured', () => {
      expect(modalContent).toContain('!paymentSettings || !paymentSettings.imageUrl || !paymentSettings.upiId');
      expect(modalContent).toContain('disabled={isSubmitting || !paymentSettings?.imageUrl || !paymentSettings?.upiId}');
    });

    it('renders a clear unavailable error banner when settings cannot be loaded', () => {
      expect(modalContent).toContain('UPI Payment Unavailable');
      expect(modalContent).toContain('settingsError');
    });

    it('resets confirmedOrder and lightbox states when modal closes or reopens', () => {
      expect(modalContent).toContain('setConfirmedOrder(null);');
      expect(modalContent).toContain('setIsQrLightboxOpen(false);');
    });
  });

  describe('2. Copyable UPI ID in Checkout & Confirmation Screens', () => {
    const modalPath = path.join(clientDir, 'components', 'CheckoutModal.tsx');
    const modalContent = fs.readFileSync(modalPath, 'utf-8');

    it('implements handleCopyUpi copying trimmed UPI ID to clipboard', () => {
      expect(modalContent).toContain('handleCopyUpi');
      expect(modalContent).toContain('const textToCopy = upiId.trim();');
      expect(modalContent).toContain('navigator.clipboard.writeText');
    });

    it('includes clipboard fallback mechanism for environments without navigator.clipboard', () => {
      expect(modalContent).toContain('document.execCommand');
    });

    it('displays brief "UPI ID copied" feedback upon successful copy', () => {
      expect(modalContent).toContain('UPI ID copied');
      expect(modalContent).toContain('copiedUpi');
    });

    it('renders copy button in both checkout payment card and confirmation view', () => {
      const copyMatches = modalContent.match(/handleCopyUpi\(paymentSettings\.upiId/g);
      expect(copyMatches).not.toBeNull();
      expect(copyMatches?.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('3. Click-to-Enlarge QR Image (Lightbox)', () => {
    const modalPath = path.join(clientDir, 'components', 'CheckoutModal.tsx');
    const modalContent = fs.readFileSync(modalPath, 'utf-8');

    it('renders a centered lightbox overlay above the checkout modal with white background', () => {
      expect(modalContent).toContain('isQrLightboxOpen');
      expect(modalContent).toContain('role="dialog"');
      expect(modalContent).toContain('aria-modal="true"');
      expect(modalContent).toContain('aria-label="Enlarged QR Code"');
      expect(modalContent).toContain('bg-white');
      expect(modalContent).toContain('object-contain');
    });

    it('binds background scroll lock to lightbox open state', () => {
      expect(modalContent).toContain('useScrollLock(isQrLightboxOpen);');
    });

    it('supports closing enlarged QR via close button, Escape key, and backdrop click', () => {
      expect(modalContent).toContain("e.key === 'Escape'");
      expect(modalContent).toContain('onClick={() => setIsQrLightboxOpen(false)}');
      expect(modalContent).toContain('e.stopPropagation()');
    });

    it('uses the same active dynamic image in both checkout card and enlarged view', () => {
      expect(modalContent).toContain('src={paymentSettings.imageUrl}');
    });
  });

  describe('4. Dedicated PaymentSettingsView Component', () => {
    const viewPath = path.join(clientDir, 'components', 'admin', 'PaymentSettingsView.tsx');
    const viewContent = fs.readFileSync(viewPath, 'utf-8');

    it('includes Storefront UPI Payment QR Code card with active QR preview and UPI ID', () => {
      expect(viewContent).toContain('Storefront UPI Payment QR Code');
      expect(viewContent).toContain('Configured UPI ID:');
      expect(viewContent).toContain('Configure Payment QR');
    });

    it('provides replacement modal with file upload, direct URL, preview, and UPI ID editing', () => {
      expect(viewContent).toContain('Configure UPI Payment QR &amp; ID');
      expect(viewContent).toContain('qrPreviewUrl');
      expect(viewContent).toContain('qrUpiId');
      expect(viewContent).toContain('handleSaveQr');
      expect(viewContent).toContain('useQrManualUrl');
    });

    it('retains previous active settings if upload or update fails', () => {
      expect(viewContent).toContain('setQrModalError');
      expect(viewContent).toContain('isSavingQr');
    });

    it('appends public_id to formData matching the signed publicId and uses sig.uploadUrl', () => {
      expect(viewContent).toContain("formData.append('public_id', sig.publicId);");
      expect(viewContent).toContain("formData.append('folder', sig.folder);");
      expect(viewContent).toContain("formData.append('timestamp', String(sig.timestamp));");
      expect(viewContent).toContain("formData.append('signature', sig.signature);");
      expect(viewContent).toContain('sig.uploadUrl');
    });

    it('ensures payment QR modal is scrollable and Direct URL preview does not get shadowed', () => {
      expect(viewContent).toContain('overflow-y-auto');
      expect(viewContent).toContain('useQrManualUrl ? qrManualUrl.trim() : qrPreviewUrl');
      expect(viewContent).toContain("setQrUpiId(paymentQrSetting?.upiId || '');");
    });
  });

  describe('5. Extraction from CollectionManagementView.tsx', () => {
    const collectionViewPath = path.join(clientDir, 'components', 'admin', 'CollectionManagementView.tsx');
    const collectionContent = fs.readFileSync(collectionViewPath, 'utf-8');

    it('confirms the old QR management card is removed from Homepage Content', () => {
      expect(collectionContent).not.toContain('Storefront UPI Payment QR Code');
      expect(collectionContent).not.toContain('Configure UPI Payment QR');
    });

    it('confirms payment QR state and handlers are removed from CollectionManagementView', () => {
      expect(collectionContent).not.toContain('paymentQrSetting');
      expect(collectionContent).not.toContain('handleSaveQr');
      expect(collectionContent).not.toContain('isQrModalOpen');
    });
  });

  describe('6. AdminSidebar Navigation & Preservation of Existing Items', () => {
    const sidebarPath = path.join(clientDir, 'components', 'admin', 'AdminSidebar.tsx');
    const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');

    it('includes payments in AdminTab type definition', () => {
      expect(sidebarContent).toContain("'payments'");
    });

    it('contains Payment Settings item with QrCode icon', () => {
      expect(sidebarContent).toContain("id: 'payments'");
      expect(sidebarContent).toContain("label: 'Payment Settings'");
      expect(sidebarContent).toContain('icon: QrCode');
    });

    it('preserves all seven existing navigation sections in their exact order', () => {
      const metricsIdx = sidebarContent.indexOf("id: 'metrics'");
      const productsIdx = sidebarContent.indexOf("id: 'products'");
      const categoriesIdx = sidebarContent.indexOf("id: 'categories'");
      const collectionsIdx = sidebarContent.indexOf("id: 'collections'");
      const ordersIdx = sidebarContent.indexOf("id: 'orders'");
      const enquiriesIdx = sidebarContent.indexOf("id: 'enquiries'");
      const auditIdx = sidebarContent.indexOf("id: 'audit'");
      const paymentsIdx = sidebarContent.indexOf("id: 'payments'");

      expect(metricsIdx).toBeGreaterThan(-1);
      expect(productsIdx).toBeGreaterThan(metricsIdx);
      expect(categoriesIdx).toBeGreaterThan(productsIdx);
      expect(collectionsIdx).toBeGreaterThan(categoriesIdx);
      expect(ordersIdx).toBeGreaterThan(collectionsIdx);
      expect(enquiriesIdx).toBeGreaterThan(ordersIdx);
      expect(auditIdx).toBeGreaterThan(enquiriesIdx);
      expect(paymentsIdx).toBeGreaterThan(auditIdx);
    });
  });

  describe('7. AdminPortal Routing & URL Path Resolution', () => {
    const portalPath = path.join(clientDir, 'components', 'admin', 'AdminPortal.tsx');
    const portalContent = fs.readFileSync(portalPath, 'utf-8');

    it('resolves both /admin/payments and /admin/payment-settings to payments tab', () => {
      expect(portalContent).toContain("normalized.endsWith('/payments') || normalized.endsWith('/payment-settings')");
      expect(portalContent).toContain("return 'payments'");
    });

    it('renders PaymentSettingsView component when activeTab is payments', () => {
      expect(portalContent).toContain("activeTab === 'payments'");
      expect(portalContent).toContain('<PaymentSettingsView />');
    });
  });

  describe('8. Client API functions', () => {
    it('fetchPaymentQrSettings calls GET /api/payment-settings/qr', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'success',
          data: { imageUrl: '/test-qr.png', upiId: 'test@upi' },
        }),
      });
      global.fetch = mockFetch;

      const result = await fetchPaymentQrSettings();
      expect(mockFetch).toHaveBeenCalledWith('/api/payment-settings/qr', expect.any(Object));
      expect(result).toEqual({ imageUrl: '/test-qr.png', upiId: 'test@upi' });
    });

    it('adminGetPaymentQr calls GET /api/admin/payment-settings/qr with credentials', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'success',
          data: { imageUrl: '/admin-qr.png', upiId: 'admin@upi' },
        }),
      });
      global.fetch = mockFetch;

      const result = await adminGetPaymentQr();
      expect(mockFetch).toHaveBeenCalledWith('/api/admin/payment-settings/qr', expect.objectContaining({
        credentials: 'include',
      }));
      expect(result).toEqual({ imageUrl: '/admin-qr.png', upiId: 'admin@upi' });
    });

    it('adminUpdatePaymentQr sends PUT with CSRF and payload', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'success',
          data: { imageUrl: '/updated-qr.png', upiId: 'updated@upi' },
        }),
      });
      global.fetch = mockFetch;

      const payload = { imageUrl: '/updated-qr.png', upiId: 'updated@upi' };
      const result = await adminUpdatePaymentQr(payload);
      expect(mockFetch).toHaveBeenCalledWith('/api/admin/payment-settings/qr', expect.objectContaining({
        method: 'PUT',
        credentials: 'include',
        body: JSON.stringify(payload),
      }));
      expect(result).toEqual({ imageUrl: '/updated-qr.png', upiId: 'updated@upi' });
    });

    it('adminGetPaymentQrUploadSignature calls POST /api/admin/payment-settings/qr/upload-signature', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'success',
          data: {
            signature: 'sig123',
            timestamp: 12345,
            apiKey: 'key',
            cloudName: 'axdoro-cloud',
            folder: 'axdoro/payment',
            publicId: 'payment_qr_12345_abc123',
            uploadUrl: 'https://api.cloudinary.com/v1_1/axdoro-cloud/image/upload',
          },
        }),
      });
      global.fetch = mockFetch;

      const result = await adminGetPaymentQrUploadSignature();
      expect(mockFetch).toHaveBeenCalledWith('/api/admin/payment-settings/qr/upload-signature', expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }));
      expect(result.signature).toBe('sig123');
      expect(result.publicId).toBe('payment_qr_12345_abc123');
      expect(result.folder).toBe('axdoro/payment');
      expect(result.timestamp).toBe(12345);
      expect(result.uploadUrl).toBe('https://api.cloudinary.com/v1_1/axdoro-cloud/image/upload');
    });

    it('verifies Cloudinary upload form payload contains all signed parameters matching the server contract', () => {
      const sig = {
        signature: 'c3aad718df6ae362efff4251bd643351ae560713',
        timestamp: 1793083504,
        apiKey: '123456789012345',
        cloudName: 'axdoro-cloud',
        folder: 'axdoro/payment',
        publicId: 'asset_1793083504_abcd1234',
        uploadUrl: 'https://api.cloudinary.com/v1_1/axdoro-cloud/image/upload',
      };

      const formData = new FormData();
      formData.append('file', new Blob(['test-qr'], { type: 'image/png' }), 'test-qr.png');
      formData.append('api_key', sig.apiKey);
      formData.append('timestamp', String(sig.timestamp));
      formData.append('signature', sig.signature);
      formData.append('folder', sig.folder);
      formData.append('public_id', sig.publicId);

      expect(formData.get('api_key')).toBe(sig.apiKey);
      expect(formData.get('timestamp')).toBe(String(sig.timestamp));
      expect(formData.get('signature')).toBe(sig.signature);
      expect(formData.get('folder')).toBe('axdoro/payment');
      expect(formData.get('public_id')).toBe('asset_1793083504_abcd1234');
      expect(formData.get('public_id')).toBe(sig.publicId);
      expect(sig.uploadUrl).toBe('https://api.cloudinary.com/v1_1/axdoro-cloud/image/upload');
    });
  });
});
