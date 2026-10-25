import path from 'path';

export const MAX_ARTWORK_BYTES = 4 * 1024 * 1024; // 4 MB

export const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.pdf']);

export const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
]);

export interface ArtworkValidationResult {
  isValid: boolean;
  detectedFormat?: 'png' | 'jpg' | 'webp' | 'pdf';
  sanitizedFilename?: string;
  bytes?: number;
  error?: string;
}

/**
 * Sanitizes an incoming client-provided filename.
 * Strips path traversal characters, directory separators, and control codes.
 */
export function sanitizeFilename(originalName: string): string {
  if (!originalName || typeof originalName !== 'string') {
    return 'artwork_upload';
  }
  const base = path.basename(originalName).trim();
  // Remove control characters, null bytes, backslashes
  const sanitized = base.replace(/[\0\x00-\x1f\x7f\\/:*?"<>|]/g, '_').trim();
  return sanitized.length > 0 ? sanitized.slice(0, 100) : 'artwork_upload';
}

/**
 * Validates an artwork buffer against allowed formats, size limits, and magic bytes.
 *
 * NOTE ON SECURITY GUARANTEES:
 * Magic-byte inspection verifies that the buffer matches known file signatures
 * (PNG, JPEG, WebP, PDF) to reject corrupt files and mismatched file extensions.
 * Magic bytes alone do not guarantee the absence of polyglot or malicious payload
 * content. Defense-in-depth is achieved through:
 * 1. Strict buffer size limit (4 MB).
 * 2. Extension and MIME validation.
 * 3. Ingestion validation by Cloudinary.
 * 4. Private authenticated storage (never publicly executed).
 * 5. Strict download headers (Content-Disposition: attachment, CSP default-src 'none').
 */
export function validateArtworkBuffer(
  buffer: Buffer,
  originalFilename: string,
  mimetype?: string
): ArtworkValidationResult {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return { isValid: false, error: 'No file buffer provided.' };
  }

  const bytes = buffer.length;
  if (bytes === 0) {
    return { isValid: false, error: 'Uploaded file is empty (0 bytes).' };
  }

  if (bytes > MAX_ARTWORK_BYTES) {
    return {
      isValid: false,
      bytes,
      error: `File size exceeds the 4 MB limit (${(bytes / (1024 * 1024)).toFixed(2)} MB uploaded).`,
    };
  }

  const ext = path.extname(originalFilename || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      isValid: false,
      error: `Unsupported file extension '${ext}'. Allowed extensions: PNG, JPG, JPEG, WEBP, PDF.`,
    };
  }

  if (mimetype && !ALLOWED_MIME_TYPES.has(mimetype.toLowerCase())) {
    return {
      isValid: false,
      error: `Unsupported MIME type '${mimetype}'. Allowed types: image/png, image/jpeg, image/webp, application/pdf.`,
    };
  }

  // Magic bytes inspection
  let detectedFormat: 'png' | 'jpg' | 'webp' | 'pdf' | null = null;

  // 1. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    detectedFormat = 'png';
  }
  // 2. JPEG: FF D8 FF
  else if (bytes >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    detectedFormat = 'jpg';
  }
  // 3. WebP: 'RIFF' .... 'WEBP'
  else if (
    bytes >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    detectedFormat = 'webp';
  }
  // 4. PDF: '%PDF-'
  else if (bytes >= 4 && buffer.subarray(0, 4).toString('ascii') === '%PDF') {
    detectedFormat = 'pdf';
  }

  if (!detectedFormat) {
    return {
      isValid: false,
      error: 'File content does not match allowed image or PDF signatures (invalid magic bytes).',
    };
  }

  // Ensure detected format matches extension category
  if (detectedFormat === 'pdf' && ext !== '.pdf') {
    return { isValid: false, error: 'File extension does not match detected PDF content.' };
  }
  if (detectedFormat === 'png' && ext !== '.png') {
    return { isValid: false, error: 'File extension does not match detected PNG content.' };
  }
  if (detectedFormat === 'webp' && ext !== '.webp') {
    return { isValid: false, error: 'File extension does not match detected WebP content.' };
  }
  if (detectedFormat === 'jpg' && ext !== '.jpg' && ext !== '.jpeg') {
    return { isValid: false, error: 'File extension does not match detected JPEG content.' };
  }

  return {
    isValid: true,
    detectedFormat,
    sanitizedFilename: sanitizeFilename(originalFilename),
    bytes,
  };
}
