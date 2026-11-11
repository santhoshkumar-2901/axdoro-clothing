import express, { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { returnCreateSchema } from '../schemas/returns.js';
import {
  createReturnRequest,
  ReturnEvidenceItem,
} from '../services/return.service.js';
import {
  validateReturnEvidenceBuffer,
  MAX_EVIDENCE_BYTES,
  MAX_EVIDENCE_FILES,
  MAX_TOTAL_PAYLOAD_BYTES,
} from '../utils/file-validator.js';
import {
  uploadReturnEvidenceBuffer,
  deleteCloudinaryAsset,
  tagCloudinaryAsset,
} from '../services/cloudinary.service.js';
import { enqueueCleanupJob } from '../services/cloudinary-cleanup.service.js';

export const returnsRouter = Router();

// Concurrency & Resource Guard
export let activeEvidenceUploads = 0;
export const MAX_CONCURRENT_UPLOADS = 4;

export function getActiveEvidenceUploads(): number {
  return activeEvidenceUploads;
}

export function resetActiveEvidenceUploads(): void {
  activeEvidenceUploads = 0;
}

export function setActiveEvidenceUploads(count: number): void {
  activeEvidenceUploads = count;
}

// Dedicated rate limiter for public return requests to prevent automated spam & probing
export const returnSubmissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'test' ? 1000 : 5, // 5 requests per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many return requests. Please try again later.',
  },
});

// Enforce strict 16 KB payload limit for return submission JSON to prevent memory exhaustion attacks
const returnPayloadLimiter = express.json({ limit: '16kb' });

// Multer memory storage configured with strict limits
const evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_EVIDENCE_BYTES, // 4 * 1024 * 1024
    files: MAX_EVIDENCE_FILES, // 3
    fields: 10,
    fieldSize: 16 * 1024,
  },
}).array('evidence', MAX_EVIDENCE_FILES);

/**
 * Compensating deletion helper: immediately deletes uncommitted Cloudinary assets.
 * If deletion fails or returns false, enqueues durable job into cloudinary_cleanup_jobs.
 */
async function compensateCleanup(
  assets: { publicId: string }[],
  reasonText: string
): Promise<void> {
  for (const asset of assets) {
    try {
      const deleted = await deleteCloudinaryAsset(asset.publicId, {
        type: 'authenticated',
        resourceType: 'image',
      });
      if (!deleted) {
        await enqueueCleanupJob(null, {
          publicId: asset.publicId,
          assetType: 'authenticated',
          resourceType: 'image',
          reason: 'COMPENSATING_FAILURE',
        });
      }
    } catch (cleanupErr) {
      console.error(
        `[Compensating Cleanup] Error deleting asset ${asset.publicId} (${reasonText}):`,
        cleanupErr
      );
      try {
        await enqueueCleanupJob(null, {
          publicId: asset.publicId,
          assetType: 'authenticated',
          resourceType: 'image',
          reason: 'COMPENSATING_FAILURE',
        });
      } catch (enqueueErr) {
        console.error(
          `[Compensating Cleanup] Failed to enqueue fallback job for ${asset.publicId}:`,
          enqueueErr
        );
      }
    }
  }
}

/**
 * Promotes asset tags from 'pending_commit' to 'committed' upon successful DB commit.
 * Non-blocking: logs warnings if tag promotion fails.
 */
async function promoteEvidenceTags(publicIds: string[]): Promise<void> {
  for (const publicId of publicIds) {
    try {
      await tagCloudinaryAsset({
        publicId,
        tag: 'committed',
        command: 'add',
        type: 'authenticated',
      });
      await tagCloudinaryAsset({
        publicId,
        tag: 'pending_commit',
        command: 'remove',
        type: 'authenticated',
      });
    } catch (tagErr) {
      console.warn(
        `[Return Request] Tag promotion failed for asset ${publicId}:`,
        tagErr
      );
    }
  }
}

/**
 * Core submission handler processing validated body and optional files.
 */
async function handleReturnSubmission(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // 1. Validate form fields against strict Zod schema
    const parseResult = returnCreateSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        status: 'error',
        message:
          'Validation failed: ' +
          parseResult.error.errors.map((e) => e.message).join(', '),
        errors: parseResult.error.errors,
      });
      return;
    }

    // 2. Validate uploaded files (if any)
    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length > MAX_EVIDENCE_FILES) {
      res.status(400).json({
        status: 'error',
        message: `A maximum of ${MAX_EVIDENCE_FILES} evidence images may be uploaded.`,
      });
      return;
    }

    const validatedFiles: {
      buffer: Buffer;
      filename: string;
      format: 'png' | 'jpg' | 'webp';
      mimeType: string;
      byteSize: number;
    }[] = [];

    for (const file of files) {
      const validation = validateReturnEvidenceBuffer(
        file.buffer,
        file.originalname,
        file.mimetype
      );

      if (
        !validation.isValid ||
        !validation.detectedFormat ||
        !validation.detectedMime
      ) {
        res.status(400).json({
          status: 'error',
          message:
            validation.error || 'Invalid evidence image format or contents.',
        });
        return;
      }

      validatedFiles.push({
        buffer: file.buffer,
        filename: validation.sanitizedFilename || file.originalname,
        format: validation.detectedFormat,
        mimeType: validation.detectedMime,
        byteSize: file.buffer.length,
      });
    }

    // 3. Upload validated files to Cloudinary (if any)
    const uploadedAssets: {
      publicId: string;
      format: string;
      byteSize: number;
      mimeType: string;
      originalFilename: string;
    }[] = [];

    if (validatedFiles.length > 0) {
      for (const vf of validatedFiles) {
        try {
          const uploadResult = await uploadReturnEvidenceBuffer({
            buffer: vf.buffer,
            filename: vf.filename,
            format: vf.format,
          });

          uploadedAssets.push({
            publicId: uploadResult.publicId,
            format: uploadResult.format,
            byteSize: uploadResult.bytes,
            mimeType: vf.mimeType,
            originalFilename: vf.filename,
          });
        } catch (uploadErr) {
          console.error('[Return Request] Evidence upload failed:', uploadErr);
          await compensateCleanup(
            uploadedAssets,
            'COMPENSATING_FAILURE: return request evidence partial upload failure'
          );
          res.status(502).json({
            status: 'error',
            message: 'Failed to upload evidence image. Please try again.',
          });
          return;
        }
      }
    }

    // 4. Persist return request and evidence metadata to PostgreSQL
    let result;
    try {
      const evidenceItems: ReturnEvidenceItem[] = uploadedAssets.map(
        (asset) => ({
          cloudinaryPublicId: asset.publicId,
          originalFilename: asset.originalFilename,
          mimeType: asset.mimeType,
          fileSizeBytes: asset.byteSize,
          format: asset.format as 'jpg' | 'jpeg' | 'png' | 'webp',
        })
      );

      result = await createReturnRequest(
        parseResult.data,
        evidenceItems.length > 0 ? evidenceItems : undefined
      );
    } catch (dbErr) {
      console.error(
        '[Return Request] Database insertion failed after evidence upload:',
        dbErr
      );
      if (uploadedAssets.length > 0) {
        await compensateCleanup(
          uploadedAssets,
          'COMPENSATING_FAILURE: return request DB insertion failure'
        );
      }
      throw dbErr;
    }

    // 5. Handle duplicate submission cleanup or promote tags
    if (result.isDuplicate && uploadedAssets.length > 0) {
      await compensateCleanup(
        uploadedAssets,
        'COMPENSATING_FAILURE: deduplicated return request submission'
      );
    } else if (uploadedAssets.length > 0) {
      promoteEvidenceTags(uploadedAssets.map((a) => a.publicId)).catch(
        (err) => {
          console.warn(
            '[Return Request] Background tag promotion encountered an error:',
            err
          );
        }
      );
    }

    // 6. Generic success response (zero internal metadata leaked)
    res.status(201).json({
      status: 'success',
      message:
        'Your return request has been submitted successfully. Our team will review your request and contact you with an update.',
      data: {
        requestId: result.requestId,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/returns
 * Public customer return request submission endpoint.
 *
 * CRITICAL SECURITY & PRIVACY SPECIFICATIONS:
 * 1. Zero customer authentication required (guest-friendly).
 * 2. Never exposes whether an Order ID exists or returns order details.
 * 3. Never returns internal eligibility flags or admin notes.
 * 4. Never exposes Cloudinary public IDs, URLs, or storage details.
 * 5. Returns identical generic 201 Created response for all valid submissions.
 */
returnsRouter.post(
  '/',
  returnSubmissionLimiter,
  (req: Request, res: Response, next: NextFunction) => {
    // 1. Preflight Content-Length check for ALL requests
    const contentLength = req.headers['content-length'];
    if (contentLength) {
      const parsedLength = parseInt(contentLength, 10);
      if (!isNaN(parsedLength) && parsedLength > MAX_TOTAL_PAYLOAD_BYTES) {
        res.status(413).json({
          status: 'error',
          message: `File upload payload exceeds maximum allowed size (${
            MAX_TOTAL_PAYLOAD_BYTES / (1024 * 1024)
          } MB).`,
        });
        return;
      }
    }

    if (req.is('multipart/form-data')) {
      // 2. Concurrency guard for multipart upload requests
      if (activeEvidenceUploads >= MAX_CONCURRENT_UPLOADS) {
        res.setHeader('Retry-After', '5');
        res.status(429).json({
          status: 'error',
          message:
            'Server is currently handling peak upload traffic. Please retry in a few moments.',
        });
        return;
      }

      activeEvidenceUploads++;
      let released = false;
      const releaseGuard = () => {
        if (!released) {
          released = true;
          activeEvidenceUploads = Math.max(0, activeEvidenceUploads - 1);
        }
      };
      res.on('finish', releaseGuard);
      res.on('close', releaseGuard);

      // 3. Stream byte counter for chunked transfers
      let bytesReceived = 0;
      const onData = (chunk: Buffer) => {
        bytesReceived += chunk.length;
        if (bytesReceived > MAX_TOTAL_PAYLOAD_BYTES) {
          req.removeListener('data', onData);
          req.destroy(new Error('PAYLOAD_TOO_LARGE'));
        }
      };
      req.on('data', onData);

      evidenceUpload(req, res, (err) => {
        req.removeListener('data', onData);
        if (err) {
          if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
              res.status(400).json({
                status: 'error',
                message: 'Each evidence image must not exceed 4 MB.',
              });
              return;
            }
            if (
              err.code === 'LIMIT_FILE_COUNT' ||
              err.code === 'LIMIT_UNEXPECTED_FILE'
            ) {
              res.status(400).json({
                status: 'error',
                message:
                  'A maximum of 3 evidence images may be uploaded under the "evidence" field.',
              });
              return;
            }
            res.status(400).json({
              status: 'error',
              message: `Upload error: ${err.message}`,
            });
            return;
          }
          if (err.message === 'PAYLOAD_TOO_LARGE') {
            res.status(413).json({
              status: 'error',
              message: `File upload payload exceeds maximum allowed size (${
                MAX_TOTAL_PAYLOAD_BYTES / (1024 * 1024)
              } MB).`,
            });
            return;
          }
          res.status(400).json({
            status: 'error',
            message: err.message || 'Invalid upload request',
          });
          return;
        }

        handleReturnSubmission(req, res, next);
      });
    } else {
      // Standard JSON request
      returnPayloadLimiter(req, res, (err) => {
        if (err) return next(err);
        handleReturnSubmission(req, res, next);
      });
    }
  }
);
