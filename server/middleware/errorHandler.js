/**
 * @file /server/middleware/errorHandler.js
 * @description Centralized Express error handler.
 * Formats all operational and internal errors into clean JSON responses.
 * Never leaks stack traces or sensitive internal paths in production.
 */

import multer from 'multer';
import env from '../config/env.js';
import logger from '../utils/logger.js';

export function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'An unexpected internal server error occurred.';
  let errors = err.errors || [];

  // Handle Zod validation errors
  if (err.name === 'ZodError' || (err.errors && Array.isArray(err.errors) && err.issues)) {
    statusCode = 400;
    message = 'Validation failed. Please verify your input.';
    errors = (err.errors || err.issues || []).map((e) => ({
      field: Array.isArray(e.path) ? e.path.join('.') : e.path,
      message: e.message,
    }));
  }

  // Handle Multer-specific errors
  if (err instanceof multer.MulterError) {
    statusCode = 400;
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'Image upload exceeds the maximum allowed size limit of 5 MB.';
    } else {
      message = `File upload error: ${err.message}`;
    }
  }

  // Handle JSON parse errors from express.json()
  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Malformed JSON body payload received.';
  }

  // Log server errors
  if (statusCode >= 500) {
    logger.error(`[500 Internal Error] ${req.method} ${req.originalUrl}:`, err);
  } else {
    logger.debug(`[${statusCode} Handled Error] ${req.method} ${req.originalUrl}: ${message}`);
  }

  const responsePayload = {
    success: false,
    message,
    errors: Array.isArray(errors) && errors.length > 0 ? errors : undefined,
  };

  // Only include stack trace in non-production environments for debugging
  if (env.NODE_ENV !== 'production' && statusCode >= 500) {
    responsePayload.stack = err.stack;
  }

  res.status(statusCode).json(responsePayload);
}

export default errorHandler;
