/**
 * @file /server/middleware/validate.js
 * @description Zod schema validation middleware factory.
 * Validates request body, query, or params and formats clear, actionable error messages.
 */

import { ZodError } from 'zod';
import AppError from '../utils/AppError.js';

/**
 * Creates an Express middleware that validates req[source] with the provided Zod schema.
 * @param {import('zod').ZodSchema} schema 
 * @param {'body'|'query'|'params'} [source='body']
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    try {
      const parsed = schema.parse(req[source]);
      req[source] = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const errors = err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        return next(new AppError('Validation failed. Please verify your input.', 400, errors));
      }
      next(err);
    }
  };
}

export default validate;
