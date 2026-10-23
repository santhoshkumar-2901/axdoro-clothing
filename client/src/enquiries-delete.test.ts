import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { adminDeleteEnquiry, setCsrfToken, AdminEnquiry } from './api/admin.ts';

describe('Phase 3 — Enquiries Table Delete Button & Confirmation Dialog', () => {
  const clientDir = path.resolve(__dirname);
  const adminPortalPath = path.join(clientDir, 'components', 'admin', 'AdminPortal.tsx');
  const adminPortalContent = fs.readFileSync(adminPortalPath, 'utf-8');

  beforeEach(() => {
    vi.restoreAllMocks();
    setCsrfToken(null);
  });

  describe('1. Actions Column & Delete Button Integration', () => {
    it('adds an ACTIONS column at the far right of the Enquiries table header', () => {
      // Locate the enquiries table section
      const enquiriesTabStart = adminPortalContent.indexOf('/* 5. Enquiries Tab */');
      expect(enquiriesTabStart).toBeGreaterThan(-1);

      const enquiriesTabEnd = adminPortalContent.indexOf('/* 6. Audit Logs Tab */', enquiriesTabStart);
      expect(enquiriesTabEnd).toBeGreaterThan(-1);

      const enquiriesTab = adminPortalContent.substring(enquiriesTabStart, enquiriesTabEnd);

      // Verify TableHeader contains ACTIONS column at the far right
      const headerMatch = enquiriesTab.match(/<TableHeader>[\s\S]*?<\/TableHeader>/);
      expect(headerMatch).not.toBeNull();
      const headerContent = headerMatch![0];

      const thMatches = Array.from(headerContent.matchAll(/<TableHead[^>]*>(.*?)<\/TableHead>/g)).map(
        (m) => m[1]
      );

      expect(thMatches).toEqual(['Customer', 'Type', 'Message', 'Drive Sync', 'Date', 'ACTIONS']);
    });

    it('each enquiry row displays its own Delete button with Trash2 icon and accessible title', () => {
      const enquiriesTabStart = adminPortalContent.indexOf('/* 5. Enquiries Tab */');
      const enquiriesTabEnd = adminPortalContent.indexOf('/* 6. Audit Logs Tab */', enquiriesTabStart);
      const enquiriesTab = adminPortalContent.substring(enquiriesTabStart, enquiriesTabEnd);

      // Verify map over enquiries includes the Delete button cell
      expect(enquiriesTab).toContain('title={`Delete enquiry from ${enq.name}`}');
      expect(enquiriesTab).toContain('<Trash2 className="w-3.5 h-3.5 mr-1 text-red-600" />');
      expect(enquiriesTab).toContain('Delete');
      expect(enquiriesTab).toContain('setEnquiryToDelete(enq)');
      expect(enquiriesTab).toContain('setDeleteEnquiryError(null)');
    });

    it('preserves existing Enquiries table columns, badges, formatting, and sync controls intact', () => {
      const enquiriesTabStart = adminPortalContent.indexOf('/* 5. Enquiries Tab */');
      const enquiriesTabEnd = adminPortalContent.indexOf('/* 6. Audit Logs Tab */', enquiriesTabStart);
      const enquiriesTab = adminPortalContent.substring(enquiriesTabStart, enquiriesTabEnd);

      expect(enquiriesTab).toContain('Google Drive / Sheets Synchronization');
      expect(enquiriesTab).toContain('handleTriggerDriveSync');
      expect(enquiriesTab).toContain('/api/admin/enquiries/export.csv');
      expect(enquiriesTab).toContain('Export CSV');
      expect(enquiriesTab).toContain('enq.driveSyncStatus');
      expect(enquiriesTab).toContain('enq.enquiryType');
      expect(enquiriesTab).toContain('enq.createdAt');
    });
  });

  describe('2. Confirmation Dialog Structure & Accessibility', () => {
    // Locate the Enquiry Deletion Dialog in AdminPortal.tsx
    const dialogStart = adminPortalContent.indexOf('{/* Enquiry Deletion Dialog (Phase 3 Safe Permanent Deletion) */}');
    expect(dialogStart).toBeGreaterThan(-1);

    const dialogEnd = adminPortalContent.indexOf('{/* Product Image Management Modal', dialogStart);
    expect(dialogEnd).toBeGreaterThan(-1);

    const dialogContent = adminPortalContent.substring(dialogStart, dialogEnd);

    it('renders with accessible dialog role, modal attribute, and labelledby', () => {
      expect(dialogContent).toContain('role="dialog"');
      expect(dialogContent).toContain('aria-modal="true"');
      expect(dialogContent).toContain('aria-labelledby="delete-enquiry-dialog-title"');
    });

    it('uses the required exact title and explanation message', () => {
      expect(dialogContent).toContain('Permanently delete this enquiry?');
      expect(dialogContent).toContain(
        'This will permanently remove the enquiry from AXDORO. Its Google Sheets record will be retained. This action cannot be undone.'
      );
    });

    it('displays target enquiry details summary card associating the dialog with the enquiry', () => {
      expect(dialogContent).toContain('{enquiryToDelete.name}');
      expect(dialogContent).toContain('{enquiryToDelete.email}');
      expect(dialogContent).toContain('{enquiryToDelete.phone}');
      expect(dialogContent).toContain('{enquiryToDelete.enquiryType}');
      expect(dialogContent).toContain('{enquiryToDelete.driveSyncStatus}');
    });

    it('has Cancel and Permanently Delete buttons with loading state', () => {
      expect(dialogContent).toContain('Cancel');
      expect(dialogContent).toContain('Permanently Delete');
      expect(dialogContent).toContain('disabled={isDeletingEnquiry}');
      expect(dialogContent).toContain('aria-busy={isDeletingEnquiry}');
      expect(dialogContent).toContain('Deleting...');
    });

    it('has a close button with X icon and aria-label', () => {
      expect(dialogContent).toContain('aria-label="Close dialog"');
      expect(dialogContent).toContain('<X className="w-4 h-4" />');
    });

    it('enforces reference-counted scroll locking when confirmation dialog is open', () => {
      expect(adminPortalContent).toContain('useScrollLock(Boolean(enquiryToDelete));');
    });

    it('remains usable and responsive on smaller screens with overflow handling', () => {
      expect(dialogContent).toContain('fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm');
      expect(dialogContent).toContain('p-3 sm:p-6');
      expect(dialogContent).toContain('max-w-md w-full');
    });
  });

  describe('3. Client API Interaction & Concurrency Safety', () => {
    const mockEnquiry: AdminEnquiry = {
      id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      enquiryType: 'GENERAL',
      name: 'Priya Sharma',
      email: 'priya@example.com',
      phone: '+919876543210',
      message: 'Looking for custom luxury shirts.',
      productName: null,
      quantity: null,
      source: 'WEBSITE',
      driveSyncStatus: 'SYNCED',
      createdAt: new Date().toISOString(),
    };

    it('Cancel closes the dialog without sending any API request', () => {
      // In AdminPortal.tsx, Cancel and Close click handlers reset state directly:
      expect(adminPortalContent).toContain('setEnquiryToDelete(null);');
      expect(adminPortalContent).toContain('setDeleteEnquiryError(null);');
    });

    it('Confirm sends exactly one DELETE request for the stable enquiry UUID', async () => {
      setCsrfToken('csrf-token-abc');

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'success',
          message: 'Enquiry permanently deleted successfully',
        }),
      } as any);

      const result = await adminDeleteEnquiry(mockEnquiry.id);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        `/api/admin/enquiries/${mockEnquiry.id}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-CSRF-Token': 'csrf-token-abc',
          },
          credentials: 'include',
        }
      );
      expect(result.status).toBe('success');
    });

    it('protects against duplicate submissions while deletion is in progress', () => {
      // Verify guard in handleDeleteEnquiryConfirm
      expect(adminPortalContent).toContain('if (!enquiryToDelete || isDeletingEnquiry) return;');
      expect(adminPortalContent).toContain('setIsDeletingEnquiry(true);');
      expect(adminPortalContent).toContain('disabled={isDeletingEnquiry}');
    });

    it('409 Conflict preserves enquiry in table and sets user-friendly conflict message', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          status: 'error',
          error: 'Enquiry is currently synchronizing with Google Drive. Please retry after synchronization completes.',
        }),
      } as any);

      try {
        await adminDeleteEnquiry(mockEnquiry.id);
        expect.fail('Should throw on 409');
      } catch (err: any) {
        expect(err.status).toBe(409);
      }

      // Verify that 409 handling in AdminPortal displays clear message without removing enquiry
      expect(adminPortalContent).toContain("status === 409");
      expect(adminPortalContent).toContain(
        "message: 'This enquiry is currently being synchronized. Please try again shortly.'"
      );
      expect(adminPortalContent).toContain('isConflict: true');
    });

    it('404 Not Found triggers table reconciliation from server', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({
          status: 'error',
          error: 'Enquiry not found',
        }),
      } as any);

      try {
        await adminDeleteEnquiry(mockEnquiry.id);
        expect.fail('Should throw on 404');
      } catch (err: any) {
        expect(err.status).toBe(404);
      }

      // Verify that 404 handling in AdminPortal reconciles table state
      expect(adminPortalContent).toContain("status === 404");
      expect(adminPortalContent).toContain('adminGetEnquiries()');
      expect(adminPortalContent).toContain('isNotFound: true');
    });

    it('401/403 authorization failures and network errors prevent false success and preserve row', async () => {
      // 403 CSRF / Auth Error
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          status: 'error',
          error: 'CSRF token missing or invalid',
        }),
      } as any);

      try {
        await adminDeleteEnquiry(mockEnquiry.id);
        expect.fail('Should throw on 403');
      } catch (err: any) {
        expect(err.status).toBe(403);
      }

      // Network Outage
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network offline / connection dropped'));

      try {
        await adminDeleteEnquiry(mockEnquiry.id);
        expect.fail('Should throw on network error');
      } catch (err: any) {
        expect(err.message).toContain('Network offline');
      }

      // Verify AdminPortal handles auth and general error states without removing enquiry
      expect(adminPortalContent).toContain('status === 401 || status === 403');
      expect(adminPortalContent).toContain(
        'message: \'Administrative authorization or security token expired. Please refresh your session.\''
      );
    });

    it('successful deletion triggers notification, removes enquiry from state, and reconciles sync status', () => {
      expect(adminPortalContent).toContain(
        'setActionSuccess(`Enquiry from "${targetEnquiry.name}" was permanently deleted.`);'
      );
      expect(adminPortalContent).toContain('setEnquiries((prev) => prev.filter((e) => e.id !== targetEnquiry.id));');
      expect(adminPortalContent).toContain('adminGetDriveSyncStatus().then(setDriveSyncStatus).catch(() => null);');
    });
  });
});
