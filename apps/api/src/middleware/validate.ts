/**
 * Request validation middleware using Zod
 */
import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../lib/errors.js';

/**
 * Validates request body against a Zod schema.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.body);
      if (!result.success) {
        throw result.error;
      }
      req.body = result.data;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(
          new ValidationError('Invalid request body', error.flatten())
        );
      }
      next(error);
    }
  };
}

/**
 * Validates request params against a Zod schema.
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.params);
      if (!result.success) {
        throw result.error;
      }
      req.params = result.data as Record<string, string>;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(
          new ValidationError('Invalid request parameters', error.flatten())
        );
      }
      next(error);
    }
  };
}
