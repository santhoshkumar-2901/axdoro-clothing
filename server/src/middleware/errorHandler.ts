import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

export interface AppError extends Error {
  statusCode?: number;
  details?: unknown;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const isDev = env.NODE_ENV === 'development';

  // Log error internally (without secrets or PII)
  console.error(`[API Error] [${statusCode}] ${err.message}`);
  if (isDev && err.stack) {
    console.error(err.stack);
  }

  // Safe client response: in production, never leak internal error or SQL details
  const response = {
    status: 'error',
    message: statusCode === 500 && !isDev ? 'An unexpected internal error occurred' : err.message,
    ...(isDev && { stack: err.stack, details: err.details }),
  };

  res.status(statusCode).json(response);
}
