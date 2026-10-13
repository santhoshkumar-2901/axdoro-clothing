import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { orderCreateSchema } from '../schemas/orders.js';
import { createOrder, getOrderByToken, IdempotencyConflictError } from '../services/order.service.js';

export const ordersRouter = Router();

// Rate limiter for checkout submissions to prevent automated order flooding
export const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'test' ? 1000 : 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many order requests. Please try again later.',
  },
});

// Dedicated rate limiter for public order token lookups
export const orderLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'test' ? 1000 : 30, // 30 per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many order lookup requests. Please try again later.',
  },
});

// Exact regex pattern for customer order token (48-char hex)
const ORDER_TOKEN_REGEX = /^[a-f0-9]{48}$/;

// POST /api/orders - Public Cash on Delivery checkout
ordersRouter.post('/', checkoutLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = orderCreateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        status: 'error',
        error: 'Invalid order request: ' + parseResult.error.errors.map((e) => e.message).join(', '),
        message: 'Invalid order request',
        errors: parseResult.error.errors,
      });
      return;
    }

    const order = await createOrder(parseResult.data);
    const orderData = {
      ...order,
      grandTotalPaise: order.totalPaise,
    };

    if (order.isReplay) {
      res.status(200).json({
        status: 'success',
        success: true,
        message: 'Order previously placed with this idempotency key',
        isReplay: true,
        data: orderData,
        order: orderData,
      });
      return;
    }

    res.status(201).json({
      status: 'success',
      success: true,
      message: 'Order created successfully with Cash on Delivery (COD)',
      data: orderData,
      order: orderData,
    });
  } catch (err: unknown) {
    if (err instanceof IdempotencyConflictError) {
      res.status(409).json({
        status: 'error',
        error: err.message,
        message: err.message,
      });
      return;
    }

    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('Insufficient stock') ||
      msg.includes('unavailable') ||
      msg.includes('not found or no longer available') ||
      msg.includes('Duplicate variant ID')
    ) {
      const statusCode = msg.includes('Insufficient stock') ? 409 : 400;
      res.status(statusCode).json({
        status: 'error',
        error: msg,
        message: msg,
      });
      return;
    }
    next(err);
  }
});

// GET /api/orders/:token - Customer confirmation lookup by secure crypto token
ordersRouter.get('/:token', orderLookupLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.params.token;

    // Reject malformed tokens before querying database to prevent scanning/DoS
    if (!ORDER_TOKEN_REGEX.test(token)) {
      res.status(404).json({
        status: 'error',
        error: 'Order not found',
        message: 'Order not found',
      });
      return;
    }

    const order = await getOrderByToken(token);
    if (!order) {
      res.status(404).json({
        status: 'error',
        error: 'Order not found',
        message: 'Order not found',
      });
      return;
    }

    res.json({
      status: 'success',
      data: order,
      order,
    });
  } catch (err) {
    next(err);
  }
});
