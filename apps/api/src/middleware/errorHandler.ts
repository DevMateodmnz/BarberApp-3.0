/**
 * Global error handler middleware
 */
import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError } from '../lib/errors.js';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err instanceof ValidationError && err.details
          ? { details: err.details }
          : {}),
      },
    });
    return;
  }

  // Unknown/unexpected errors
  // eslint-disable-next-line no-console
  console.error('Unhandled error:', err);

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message:
        process.env.NODE_ENV === 'production'
          ? 'An unexpected error occurred'
          : err.message,
    },
  });
}
