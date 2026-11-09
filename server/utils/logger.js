/**
 * @file /server/utils/logger.js
 * @description Standardized application logger with log level support and timestamps.
 */

import env from '../config/env.js';

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'token',
  'refreshtoken',
  'jwt',
  'secret',
  'authorization',
  'cookie',
  'apikey',
  'database_url',
  'postgres_url',
]);

/**
 * Recursively redacts sensitive keys from objects and error payloads.
 */
export function sanitizeForLogging(data) {
  if (!data || typeof data !== 'object') return data;
  if (data instanceof Error) {
    const cleanErr = { message: data.message, name: data.name };
    if (data.stack && env.NODE_ENV !== 'production') cleanErr.stack = data.stack;
    return cleanErr;
  }
  if (Array.isArray(data)) {
    return data.map(sanitizeForLogging);
  }
  const copy = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      copy[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      copy[key] = sanitizeForLogging(value);
    } else {
      copy[key] = value;
    }
  }
  return copy;
}

export const logger = {
  info: (msg, meta = {}) => {
    console.log(`[INFO]  [${new Date().toISOString()}] ${msg}`, Object.keys(meta).length ? sanitizeForLogging(meta) : '');
  },
  warn: (msg, meta = {}) => {
    console.warn(`[WARN]  [${new Date().toISOString()}] ${msg}`, Object.keys(meta).length ? sanitizeForLogging(meta) : '');
  },
  error: (msg, err = {}) => {
    console.error(`[ERROR] [${new Date().toISOString()}] ${msg}`, sanitizeForLogging(err));
  },
  debug: (msg, meta = {}) => {
    if (env.NODE_ENV !== 'production') {
      console.debug(`[DEBUG] [${new Date().toISOString()}] ${msg}`, Object.keys(meta).length ? sanitizeForLogging(meta) : '');
    }
  },
};

export default logger;
