import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { enquiryCreateSchema } from '../schemas/enquiries.js';
import { createEnquiry, generateWhatsAppShareUrl } from '../services/enquiry.service.js';

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

// POST /api/enquiries - Public Contact / Bulk enquiry submission
enquiriesRouter.post('/', enquiryLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Silent Honeypot Trap: if filled, quietly return 201 without writing to DB
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

    const enquiry = await createEnquiry(parseResult.data);
    const whatsappShareUrl = generateWhatsAppShareUrl({
      enquiryType: enquiry.enquiryType,
      name: enquiry.name,
      quantity: enquiry.quantity,
      productName: enquiry.productName,
      message: enquiry.message,
    });

    res.status(201).json({
      status: 'success',
      success: true,
      message: 'Enquiry submitted successfully and recorded for coordination',
      data: {
        id: enquiry.id,
        driveSyncStatus: enquiry.driveSyncStatus,
        enquiry,
        whatsappShareUrl,
      },
      enquiry,
      whatsappShareUrl,
    });
  } catch (err) {
    next(err);
  }
});
