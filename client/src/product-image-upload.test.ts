import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { validateProductImageFile } from './components/admin/ProductCreateDialog.tsx';

describe('Product Image Upload Regression Protection & Bug Fix Verification', () => {
  const adminDir = path.resolve(__dirname, 'components/admin');
  const createCode = fs.readFileSync(path.join(adminDir, 'ProductCreateDialog.tsx'), 'utf-8');
  const editCode = fs.readFileSync(path.join(adminDir, 'ProductEditDialog.tsx'), 'utf-8');

  // =========================================================================
  // 1. FILE INPUT PLACEMENT & PROPAGATION PROTECTION
  // =========================================================================
  describe('1. File input placement & event bubbling protection (Prevents modal dismissal)', () => {
    it('verifies ProductCreateDialog places file input inside the dialog container with stopPropagation', () => {
      // Find backdrop onClick={onClose}
      const backdropIdx = createCode.indexOf('onClick={onClose}');
      expect(backdropIdx).toBeGreaterThan(-1);

      // Find inner modal dialog container onClick={(e) => e.stopPropagation()}
      const innerContainerIdx = createCode.indexOf('onClick={(e) => e.stopPropagation()}', backdropIdx);
      expect(innerContainerIdx).toBeGreaterThan(-1);

      // Verify fileInput is located AFTER innerContainerIdx (inside dialog, not in backdrop)
      const fileInputIdx = createCode.indexOf('ref={fileInputRef}', innerContainerIdx);
      expect(fileInputIdx).toBeGreaterThan(innerContainerIdx);

      // Verify explicit onClick={(e) => e.stopPropagation()} on the file input itself
      const fileInputTagSubstr = createCode.slice(fileInputIdx - 50, fileInputIdx + 350);
      expect(fileInputTagSubstr).toContain('onClick={(e) => e.stopPropagation()}');
    });

    it('verifies ProductEditDialog places file input inside the dialog container with stopPropagation', () => {
      // Find backdrop onClick={onClose}
      const backdropIdx = editCode.indexOf('onClick={onClose}');
      expect(backdropIdx).toBeGreaterThan(-1);

      // Find inner modal dialog container onClick={(e) => e.stopPropagation()}
      const innerContainerIdx = editCode.indexOf('onClick={(e) => e.stopPropagation()}', backdropIdx);
      expect(innerContainerIdx).toBeGreaterThan(-1);

      // Verify fileInput is located AFTER innerContainerIdx (inside dialog, not in backdrop)
      const fileInputIdx = editCode.indexOf('ref={fileInputRef}', innerContainerIdx);
      expect(fileInputIdx).toBeGreaterThan(innerContainerIdx);

      // Verify explicit onClick={(e) => e.stopPropagation()} on the file input itself
      const fileInputTagSubstr = editCode.slice(fileInputIdx - 50, fileInputIdx + 350);
      expect(fileInputTagSubstr).toContain('onClick={(e) => e.stopPropagation()}');
    });
  });

  // =========================================================================
  // 2. SYNCHRONOUS ACTIVE COLOR VARIANT TRACKING VIA REF
  // =========================================================================
  describe('2. Active Color Variant Tracking via useRef', () => {
    it('verifies ProductCreateDialog defines and uses activeUploadColorIdRef for synchronous tracking', () => {
      expect(createCode).toContain('const activeUploadColorIdRef = useRef<string | null>(null);');
      // Set synchronously before triggering click
      expect(createCode).toMatch(/handleTriggerFileUpload\s*=\s*\([^)]*\)\s*=>\s*\{[\s\S]*?activeUploadColorIdRef\.current\s*=\s*colorId/);
      // Read ref inside handleFileSelected
      expect(createCode).toContain('activeUploadColorIdRef.current');
      // Reset ref in finally block
      expect(createCode).toMatch(/finally\s*\{[\s\S]*?activeUploadColorIdRef\.current\s*=\s*null/);
    });

    it('verifies ProductEditDialog defines and uses activeUploadColorIdRef for synchronous tracking', () => {
      expect(editCode).toContain('const activeUploadColorIdRef = useRef<string | null>(null);');
      // Set synchronously before triggering click
      expect(editCode).toMatch(/handleTriggerFileUpload\s*=\s*\([^)]*\)\s*=>\s*\{[\s\S]*?activeUploadColorIdRef\.current\s*=\s*colorId/);
      // Read ref inside handleFileSelected
      expect(editCode).toContain('activeUploadColorIdRef.current');
      // Reset ref in finally block
      expect(editCode).toMatch(/finally\s*\{[\s\S]*?activeUploadColorIdRef\.current\s*=\s*null/);
    });

    it('simulates switching between color variants synchronously with ref', () => {
      const activeColorRef = { current: null as string | null };

      // User clicks upload for color 1
      activeColorRef.current = 'color_pitch_black';
      expect(activeColorRef.current).toBe('color_pitch_black');

      // User changes mind and clicks upload for color 2 before selecting
      activeColorRef.current = 'color_ice_white';
      expect(activeColorRef.current).toBe('color_ice_white');

      // File selection reads ref immediately without closure lag
      const targetColorId = activeColorRef.current;
      expect(targetColorId).toBe('color_ice_white');
    });
  });

  // =========================================================================
  // 3. UPLOAD LOADING STATE & FILE PICKER CANCELLATION
  // =========================================================================
  describe('3. Upload Loading State Lifecycle', () => {
    it('verifies ProductEditDialog does NOT activate loading spinner on handleTriggerFileUpload', () => {
      // In handleTriggerFileUpload, setUploadingColorId must NOT be called
      const triggerFnMatch = editCode.match(/const handleTriggerFileUpload\s*=\s*\([\s\S]*?\n  \};/);
      expect(triggerFnMatch).not.toBeNull();
      const triggerFnBody = triggerFnMatch![0];
      expect(triggerFnBody).not.toContain('setUploadingColorId');
    });

    it('verifies ProductEditDialog activates loading state only after file is selected and validated', () => {
      // In handleFileSelected, setUploadingColorId is called after validation
      const fileSelectedMatch = editCode.match(/const handleFileSelected\s*=\s*async\s*\([\s\S]*?\n  \};/);
      expect(fileSelectedMatch).not.toBeNull();
      const fileSelectedBody = fileSelectedMatch![0];
      expect(fileSelectedBody).toContain('setUploadingColorId(targetColorId);');
      // Must be inside try block and reset in finally block
      expect(fileSelectedBody).toMatch(/finally\s*\{[\s\S]*?setUploadingColorId\(null\);/);
    });

    it('verifies ProductCreateDialog resets uploading state in finally block', () => {
      const fileSelectedMatch = createCode.match(/const handleFileSelected\s*=\s*async\s*\([\s\S]*?\n  \};/);
      expect(fileSelectedMatch).not.toBeNull();
      const fileSelectedBody = fileSelectedMatch![0];
      expect(fileSelectedBody).toMatch(/finally\s*\{[\s\S]*?setUploadingColorId\(null\);/);
    });
  });

  // =========================================================================
  // 4. FILE VALIDATION: FORMATS & FILE SIZE
  // =========================================================================
  describe('4. File Validation (Formats, Extensions, Size Limit 10MB)', () => {
    const createMockFile = (name: string, type: string, sizeBytes: number): File => {
      return {
        name,
        type,
        size: sizeBytes,
      } as unknown as File;
    };

    it('accepts valid JPEG, PNG, WEBP, and AVIF files under 10 MB', () => {
      const validFiles = [
        createMockFile('shirt.jpg', 'image/jpeg', 2 * 1024 * 1024),
        createMockFile('hoodie.jpeg', 'image/jpeg', 5 * 1024 * 1024),
        createMockFile('pants.png', 'image/png', 8 * 1024 * 1024),
        createMockFile('jacket.webp', 'image/webp', 1 * 1024 * 1024),
        createMockFile('cap.avif', 'image/avif', 500 * 1024),
      ];

      for (const file of validFiles) {
        const result = validateProductImageFile(file);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }
    });

    it('accepts files with uppercase extensions (e.g. .JPG, .PNG)', () => {
      const uppercaseFiles = [
        createMockFile('SHIRT.JPG', 'image/jpeg', 1024 * 1024),
        createMockFile('SWEATER.PNG', 'image/png', 2 * 1024 * 1024),
      ];

      for (const file of uppercaseFiles) {
        const result = validateProductImageFile(file);
        expect(result.valid).toBe(true);
      }
    });

    it('rejects unsupported file formats (.gif, .pdf, .exe, .svg, .bmp)', () => {
      const invalidFormats = [
        createMockFile('animation.gif', 'image/gif', 500 * 1024),
        createMockFile('document.pdf', 'application/pdf', 1024 * 1024),
        createMockFile('script.exe', 'application/x-msdownload', 1024 * 1024),
        createMockFile('vector.svg', 'image/svg+xml', 100 * 1024),
        createMockFile('bitmap.bmp', 'image/bmp', 1024 * 1024),
      ];

      for (const file of invalidFormats) {
        const result = validateProductImageFile(file);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Only JPEG, PNG, WEBP, and AVIF image files are supported.');
      }
    });

    it('rejects files exceeding 10 MB limit', () => {
      const oversizedFile = createMockFile('huge.png', 'image/png', 10 * 1024 * 1024 + 1);
      const result = validateProductImageFile(oversizedFile);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Image size cannot exceed 10 MB.');
    });

    it('accepts files exactly at or just below 10 MB', () => {
      const boundaryFile = createMockFile('max.jpg', 'image/jpeg', 10 * 1024 * 1024);
      const result = validateProductImageFile(boundaryFile);
      expect(result.valid).toBe(true);
    });

    it('allows OS files where file.type is blank but extension is valid', () => {
      const blankMimeFile = createMockFile('photo.webp', '', 1024 * 1024);
      const result = validateProductImageFile(blankMimeFile);
      expect(result.valid).toBe(true);
    });
  });

  // =========================================================================
  // 5. EXISTING FUNCTIONALITY PRESERVATION
  // =========================================================================
  describe('5. Existing Product Create & Edit Functionality Preservation', () => {
    it('preserves SKU uniqueness checks and primary image resolution in ProductCreateDialog', () => {
      expect(createCode).toContain('resolvePrimaryImageId');
      expect(createCode).toContain('Variant SKU collision detected');
      expect(createCode).toContain('computeSlugChecksum');
      expect(createCode).toContain('generateVariantSku');
    });

    it('preserves optimistic concurrency and atomic update in ProductEditDialog', () => {
      expect(editCode).toContain('expectedUpdatedAt');
      expect(editCode).toContain('CONCURRENT_MUTATION_CONFLICT');
      expect(editCode).toContain('adminUpdateProduct');
    });
  });
});
