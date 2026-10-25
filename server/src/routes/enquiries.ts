import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { env } from '../config/env.js';
import { enquiryCreateSchema } from '../schemas/enquiries.js';
import { createEnquiry, generateWhatsAppShareUrl } from '../services/enquiry.service.js';
import { uploadArtworkBuffer, deleteCloudinaryAsset, tagCloudinaryAsset, UploadArtworkResult } from '../services/cloudinary.service.js';
import { validateArtworkBuffer, MAX_ARTWORK_BYTES } from '../utils/file-validator.js';
import { enqueueCleanupJob } from '../services/cloudinary-cleanup.service.js';

export const enquiriesRouter = Router();

// Rate limiter for public enquiry submissions to prevent bot spam
export const enquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'test' ? 1000 : 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many enquiry requests. Please try again later.',
  },
});

// Configure memory storage multer for multipart enquiry requests
const artworkUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_ARTWORK_BYTES, // 4 MB
    fieldSize: 64 * 1024,        // 64 KB per text field
    fields: 20,                  // max 20 non-file form fields
    files: 1,                    // max 1 file field
  },
}).single('artwork');

/**
 * Middleware that selectively applies multer only to multipart/form-data requests.
 * Standard JSON requests bypass multer completely and are parsed by express.json().
 */
function handleMultipartOrJson(req: Request, res: Response, next: NextFunction): void {
  if (req.is('multipart/form-data')) {
    artworkUpload(req, res, (err) => {
      if (res.headersSent) return;

      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({
              status: 'error',
              error: 'File size exceeds the 4 MB limit',
              message: 'File size exceeds the 4 MB limit',
              code: 'PAYLOAD_TOO_LARGE',
            });
            return;
          }
          if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            res.status(400).json({
              status: 'error',
              error: 'Unexpected field. Artwork file must be uploaded under the field name "artwork".',
              message: 'Unexpected field. Artwork file must be uploaded under the field name "artwork".',
              code: 'UNEXPECTED_FIELD',
            });
            return;
          }
          if (err.code === 'LIMIT_FIELD_COUNT') {
            res.status(400).json({
              status: 'error',
              error: 'Too many form fields provided.',
              message: 'Too many form fields provided.',
              code: 'TOO_MANY_FIELDS',
            });
            return;
          }
        }

        res.status(400).json({
          status: 'error',
          error: err.message || 'Malformed multipart request',
          message: err.message || 'Malformed multipart request',
          code: 'INVALID_MULTIPART_PAYLOAD',
        });
        return;
      }

      // Check for empty field names in form data
      if (req.body && typeof req.body === 'object') {
        const keys = Object.keys(req.body);
        if (keys.some((k) => k.trim() === '')) {
          res.status(400).json({
            status: 'error',
            error: 'Empty field names are not allowed in multipart submissions.',
            message: 'Empty field names are not allowed in multipart submissions.',
            code: 'INVALID_FIELD_NAME',
          });
          return;
        }
      }

      next();
    });
  } else {
    next();
  }
}

// POST /api/enquiries - Public Contact / Bulk enquiry submission with optional artwork
enquiriesRouter.post(
  '/',
  enquiryLimiter,
  handleMultipartOrJson,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 1. Silent Honeypot Trap: if filled, quietly return 201 without writing to DB or storage
      if (req.body.website_hp && typeof req.body.website_hp === 'string' && req.body.website_hp.length > 0) {
        res.status(201).json({
          status: 'success',
          success: true,
          message: 'Enquiry submitted successfully and recorded for coordination',
          data: {
            id: '00000000-0000-0000-0000-000000000000',
            driveSyncStatus: 'DISCARDED',
          },
        });
        return;
      }

      // 2. Validate form fields against Zod schema
      const parseResult = enquiryCreateSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          status: 'error',
          error: 'Invalid enquiry: ' + parseResult.error.errors.map((e) => e.message).join(', '),
          message: 'Invalid enquiry payload',
          errors: parseResult.error.errors,
        });
        return;
      }

      // 3. Optional artwork attachment processing
      let uploadedArtwork: UploadArtworkResult | null = null;
      let sanitizedArtworkName: string | null = null;

      if (req.file) {
        const fileValidation = validateArtworkBuffer(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype
        );

        if (!fileValidation.isValid) {
          res.status(400).json({
            status: 'error',
            error: fileValidation.error || 'Invalid artwork attachment.',
            message: fileValidation.error || 'Invalid artwork attachment.',
            code: 'INVALID_FILE',
          });
          return;
        }

        sanitizedArtworkName = fileValidation.sanitizedFilename!;

        // Upload buffer to Cloudinary using authenticated private storage
        try {
          uploadedArtwork = await uploadArtworkBuffer({
            buffer: req.file.buffer,
            filename: sanitizedArtworkName,
            format: fileValidation.detectedFormat!,
          });
        } catch (uploadErr) {
          res.status(502).json({
            status: 'error',
            error: uploadErr instanceof Error ? uploadErr.message : 'Artwork storage upload failed',
            message: 'Failed to upload custom artwork. Please try again or submit enquiry without attachment.',
            code: 'STORAGE_UPLOAD_FAILED',
          });
          return;
        }
      }

      // 4. Persist enquiry into PostgreSQL with compensating failure recovery
      let enquiry;
      try {
        enquiry = await createEnquiry(
          parseResult.data,
          uploadedArtwork
            ? {
                designFileUrl: uploadedArtwork.secureUrl,
                designFilePublicId: uploadedArtwork.publicId,
                designFileName: sanitizedArtworkName,
                designFileFormat: uploadedArtwork.format,
                designFileBytes: uploadedArtwork.bytes,
              }
            : undefined
        );

        // Lifecycle transition: promote asset tag from pending_commit to committed
        if (uploadedArtwork?.publicId) {
          tagCloudinaryAsset({
            publicId: uploadedArtwork.publicId,
            tag: 'committed',
            command: 'add',
            type: 'authenticated',
          }).catch((tagErr) => {
            console.warn('[Cloudinary Tag Transition Warning]', tagErr);
          });
          tagCloudinaryAsset({
            publicId: uploadedArtwork.publicId,
            tag: 'pending_commit',
            command: 'remove',
            type: 'authenticated',
          }).catch((tagErr) => {
            console.warn('[Cloudinary Tag Transition Warning]', tagErr);
          });
        }
      } catch (dbErr) {
        // Compensating Cleanup with durable recovery:
        // 1. Attempt immediate compensating Cloudinary deletion
        if (uploadedArtwork?.publicId) {
          let immediateDeleted = false;
          try {
            immediateDeleted = await deleteCloudinaryAsset(uploadedArtwork.publicId, { type: 'authenticated' });
          } catch {
            immediateDeleted = false;
          }

          if (!immediateDeleted) {
            // 2. If immediate deletion fails, persist a cleanup job in PostgreSQL if DB is reachable
            try {
              await enqueueCleanupJob(null, {
                publicId: uploadedArtwork.publicId,
                assetType: 'authenticated',
                reason: 'COMPENSATING_FAILURE',
              });
            } catch (queueErr) {
              // 3. If DB is unavailable, asset remains tagged 'pending_commit' in Cloudinary
              // and will be durably recovered and reconciled by reconcileCloudinaryPendingTags().
              // No local disk reliance is needed.
              console.warn(
                `[Cloudinary Cleanup Compensating Enqueue Failed] Asset '${uploadedArtwork.publicId}' remains tagged 'pending_commit' for lifecycle reconciliation.`,
                queueErr instanceof Error ? queueErr.message : String(queueErr)
              );
            }
          }
        }
        throw dbErr;
      }

      const whatsappShareUrl = generateWhatsAppShareUrl({
        enquiryType: enquiry.enquiryType,
        name: enquiry.name,
        quantity: enquiry.quantity,
        productName: enquiry.productName,
        message: enquiry.message,
        hasArtwork: enquiry.hasArtwork,
      });

      // Public response: does not leak internal Cloudinary URLs or storage credentials
      res.status(201).json({
        status: 'success',
        success: true,
        message: 'Enquiry submitted successfully and recorded for coordination',
        data: {
          id: enquiry.id,
          driveSyncStatus: enquiry.driveSyncStatus,
          hasArtwork: enquiry.hasArtwork,
          enquiry: {
            id: enquiry.id,
            enquiryType: enquiry.enquiryType,
            name: enquiry.name,
            email: enquiry.email,
            phone: enquiry.phone,
            message: enquiry.message,
            productId: enquiry.productId,
            productName: enquiry.productName,
            quantity: enquiry.quantity,
            sizeBreakdown: enquiry.sizeBreakdown,
            targetDate: enquiry.targetDate,
            organization: enquiry.organization,
            source: enquiry.source,
            driveSyncStatus: enquiry.driveSyncStatus,
            hasArtwork: enquiry.hasArtwork,
            designFileName: enquiry.designFileName,
            designFileFormat: enquiry.designFileFormat,
            designFileBytes: enquiry.designFileBytes,
            createdAt: enquiry.createdAt,
            updatedAt: enquiry.updatedAt,
          },
          whatsappShareUrl,
        },
        enquiry,
        whatsappShareUrl,
      });
    } catch (err) {
      next(err);
    }
  }
);
