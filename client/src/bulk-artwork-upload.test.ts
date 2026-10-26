import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { adminDownloadArtwork } from './api/admin.ts';

describe('Bulk Order Custom Artwork Upload & Admin Download — Frontend Tests', () => {
  const clientDir = path.resolve(__dirname);
  const modalPath = path.join(clientDir, 'components', 'BulkEnquiryModal.tsx');
  const modalContent = fs.readFileSync(modalPath, 'utf-8');

  const adminPortalPath = path.join(clientDir, 'components', 'admin', 'AdminPortal.tsx');
  const adminPortalContent = fs.readFileSync(adminPortalPath, 'utf-8');

  const adminApiPath = path.join(clientDir, 'api', 'admin.ts');
  const adminApiContent = fs.readFileSync(adminApiPath, 'utf-8');

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. BulkEnquiryModal — File Selection, Validation & Dropzone UI', () => {
    it('defines 4 MiB (4 * 1024 * 1024) file size limit and accepted file formats', () => {
      expect(modalContent).toContain('const MAX_ARTWORK_BYTES = 4 * 1024 * 1024');
      expect(modalContent).toContain("const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'pdf']");
    });

    it('implements normal file picker and drag-and-drop support', () => {
      // Hidden file input with correct accept and accessibility
      expect(modalContent).toContain('type="file"');
      expect(modalContent).toContain('accept=".png,.jpg,.jpeg,.webp,.pdf');
      expect(modalContent).toContain('ref={fileInputRef}');

      // Drag and drop handlers
      expect(modalContent).toContain('onDrop={handleDrop}');
      expect(modalContent).toContain('onDragOver={handleDragOver}');
      expect(modalContent).toContain('onDragLeave={handleDragLeave}');
    });

    it('validates file size and shows clear error message when file exceeds 4 MiB', () => {
      expect(modalContent).toContain('if (file.size > MAX_ARTWORK_BYTES)');
      expect(modalContent).toContain('File size exceeds the 4 MB limit (maximum 4 MiB).');
    });

    it('validates file extension and shows clear error message for unsupported formats', () => {
      expect(modalContent).toContain('if (!ext || !ALLOWED_EXTENSIONS.includes(ext))');
      expect(modalContent).toContain('Invalid file format. Accepted formats: PNG, JPG, JPEG, WEBP, PDF.');
    });

    it('formats file size in human-readable B, KB, or MB', () => {
      expect(modalContent).toContain('function formatFileSize(bytes: number): string');
      expect(modalContent).toContain('formatFileSize(selectedFile.size)');
    });

    it('displays selected filename, size, and provides a remove/replace action', () => {
      expect(modalContent).toContain('handleRemoveFile');
      expect(modalContent).toContain('data-testid="remove-artwork-button"');
      expect(modalContent).toContain('<Trash2 className="w-4 h-4" />');
      expect(modalContent).toContain('{selectedFile.name}');
    });

    it('manages image preview URL and revokes Object URLs on unmount, close, or file change', () => {
      expect(modalContent).toContain('URL.createObjectURL(selectedFile)');
      expect(modalContent).toContain('URL.revokeObjectURL(url)');
      expect(modalContent).toContain('URL.revokeObjectURL(prev)');
      // Does not create image preview for PDF or untrusted SVG
      expect(modalContent).toContain("selectedFile.type.startsWith('image/')");
    });
  });

  describe('2. BulkEnquiryModal — Form Submission & Backward Compatibility', () => {
    it('prevents duplicate submissions while a request is in progress', () => {
      expect(modalContent).toContain('if (submitting) return;');
      expect(modalContent).toContain('disabled={submitting}');
      expect(modalContent).toContain("submitting ? 'Submitting Enquiry...' : 'Submit Bulk Order Enquiry'");
    });

    it('preserves existing JSON enquiry submission when NO file is selected', () => {
      // Must submit application/json with JSON.stringify
      expect(modalContent).toContain("'Content-Type': 'application/json'");
      expect(modalContent).toContain('body: JSON.stringify({');
      expect(modalContent).toContain("enquiryType: 'BULK'");
      expect(modalContent).toContain('quantity: parsedQuantity');
      expect(modalContent).toContain('sizeBreakdown: sizeBreakdown.trim()');
      expect(modalContent).toContain('productId: prefilledProduct?.id || null');
      expect(modalContent).toContain("source: 'WEBSITE'");
      expect(modalContent).toContain('website_hp: honeypot || undefined');
    });

    it('submits FormData with backend field name "artwork" when file is selected and omits Content-Type header', () => {
      expect(modalContent).toContain("formData.append('artwork', selectedFile)");
      expect(modalContent).toContain("fetch('/api/enquiries'");
      expect(modalContent).toContain('body: formData');
      // Content-Type is explicitly NOT set in the FormData branch headers
      const formDataStartIndex = modalContent.indexOf('const formData = new FormData()');
      const formDataEndIndex = modalContent.indexOf('} else {', formDataStartIndex);
      const formDataBranch = modalContent.substring(formDataStartIndex, formDataEndIndex);
      expect(formDataBranch).not.toContain("'Content-Type'");
      expect(formDataBranch).toContain("Accept: 'application/json'");
    });

    it('preserves honeypot anti-spam protection in both JSON and FormData submissions', () => {
      expect(modalContent).toContain("formData.append('website_hp', honeypot)");
      expect(modalContent).toContain('website_hp: honeypot || undefined');
    });

    it('never sends Cloudinary credentials or internal URLs to the browser', () => {
      expect(modalContent).not.toContain('CLOUDINARY');
      expect(modalContent).not.toContain('api_secret');
      expect(modalContent).not.toContain('upload_preset');
      expect(modalContent).not.toContain('api.cloudinary.com');
    });
  });

  describe('3. Admin Portal — Artwork Indicator & Actions Column Integration', () => {
    it('AdminEnquiry type interface supports custom artwork fields', () => {
      expect(adminApiContent).toContain('hasArtwork?: boolean;');
      expect(adminApiContent).toContain('designFileName?: string | null;');
      expect(adminApiContent).toContain('designFileFormat?: string | null;');
      expect(adminApiContent).toContain('designFileBytes?: number | null;');
    });

    it('displays Artwork indicator badge with Paperclip icon in Enquiries table when enquiry has artwork', () => {
      const enquiriesTabStart = adminPortalContent.indexOf('/* 5. Enquiries Tab */');
      const enquiriesTabEnd = adminPortalContent.indexOf('/* 6. Audit Logs Tab */', enquiriesTabStart);
      const enquiriesTab = adminPortalContent.substring(enquiriesTabStart, enquiriesTabEnd);

      expect(enquiriesTab).toContain('enq.hasArtwork && (');
      expect(enquiriesTab).toContain('Artwork');
      expect(enquiriesTab).toContain('Paperclip');
      expect(enquiriesTab).toContain("title={enq.designFileName ? `Artwork: ${enq.designFileName}` : 'Custom artwork attached'}");
    });

    it('displays Download Artwork action button in Actions column only when enquiry has artwork', () => {
      const enquiriesTabStart = adminPortalContent.indexOf('/* 5. Enquiries Tab */');
      const enquiriesTabEnd = adminPortalContent.indexOf('/* 6. Audit Logs Tab */', enquiriesTabStart);
      const enquiriesTab = adminPortalContent.substring(enquiriesTabStart, enquiriesTabEnd);

      expect(enquiriesTab).toContain('{enq.hasArtwork && (');
      expect(enquiriesTab).toContain('handleDownloadArtwork(enq)');
      expect(enquiriesTab).toContain("title={enq.designFileName ? `Download ${enq.designFileName}` : 'Download custom artwork'}");
      expect(enquiriesTab).toContain('<Download className="w-3.5 h-3.5 mr-1" />');
    });

    it('shows loading spinner and disables button during artwork download to prevent duplicate clicks', () => {
      const enquiriesTabStart = adminPortalContent.indexOf('/* 5. Enquiries Tab */');
      const enquiriesTabEnd = adminPortalContent.indexOf('/* 6. Audit Logs Tab */', enquiriesTabStart);
      const enquiriesTab = adminPortalContent.substring(enquiriesTabStart, enquiriesTabEnd);

      expect(enquiriesTab).toContain('disabled={downloadingArtworkId === enq.id}');
      expect(enquiriesTab).toContain('downloadingArtworkId === enq.id ? (');
      expect(enquiriesTab).toContain('animate-spin');
    });
  });

  describe('4. Admin API Client — adminDownloadArtwork Function', () => {
    let mockElement: any;
    let clickSpy: any;
    let appendChildSpy: any;
    let removeChildSpy: any;

    beforeEach(() => {
      clickSpy = vi.fn();
      mockElement = {
        href: '',
        download: '',
        click: clickSpy,
      };

      appendChildSpy = vi.fn();
      removeChildSpy = vi.fn();

      (globalThis as any).document = {
        body: {
          appendChild: appendChildSpy,
          removeChild: removeChildSpy,
        },
        createElement: vi.fn((tag: string) => {
          if (tag === 'a') return mockElement;
          return {};
        }),
      };

      if (!globalThis.URL) {
        (globalThis as any).URL = {};
      }
      (globalThis.URL as any).createObjectURL = vi.fn().mockReturnValue('blob:http://localhost:5173/mock-uuid');
      (globalThis.URL as any).revokeObjectURL = vi.fn();
    });

    it('calls GET /api/admin/enquiries/:id/artwork with credentials: include and triggers download', async () => {
      const fakeBlob = new Blob(['mock-pdf-content'], { type: 'application/pdf' });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-disposition': 'attachment; filename="team-logo.png"',
          'content-type': 'image/png',
        }),
        blob: async () => fakeBlob,
      } as any);

      await adminDownloadArtwork('enquiry-123', 'team-logo.png');

      expect(fetchSpy).toHaveBeenCalledWith('/api/admin/enquiries/enquiry-123/artwork', {
        headers: { Accept: '*/*' },
        credentials: 'include',
      });

      expect(globalThis.URL.createObjectURL).toHaveBeenCalledWith(fakeBlob);
      expect(mockElement.download).toBe('team-logo.png');
      expect(clickSpy).toHaveBeenCalled();
      expect(appendChildSpy).toHaveBeenCalledWith(mockElement);
      expect(removeChildSpy).toHaveBeenCalledWith(mockElement);
    });

    it('extracts filename from Content-Disposition header when preferredFilename is omitted', async () => {
      const fakeBlob = new Blob(['mock-bytes'], { type: 'application/pdf' });

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-disposition': 'attachment; filename="custom-spec.pdf"',
        }),
        blob: async () => fakeBlob,
      } as any);

      await adminDownloadArtwork('enquiry-456');

      expect(mockElement.download).toBe('custom-spec.pdf');
    });

    it('propagates error when download endpoint returns 404 Not Found', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          status: 'error',
          error: 'No custom artwork attachment associated with this enquiry',
        }),
      } as any);

      await expect(adminDownloadArtwork('enquiry-789')).rejects.toThrow(
        'No custom artwork attachment associated with this enquiry'
      );
    });

    it('propagates error when download endpoint returns 401 Unauthorized', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          status: 'error',
          error: 'Unauthorized: Admin authentication required',
        }),
      } as any);

      await expect(adminDownloadArtwork('enquiry-unauth')).rejects.toThrow(
        'Unauthorized: Admin authentication required'
      );
    });
  });
});
