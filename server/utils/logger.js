/**
 * @file /server/utils/logger.js
 * @description Standardized application logger with log level support and timestamps.
 */

import env from '../config/env.js';

export const logger = {
  info: (msg, meta = {}) => {
    console.log(`[INFO]  [${new Date().toISOString()}] ${msg}`, Object.keys(meta).length ? meta : '');
  },
  warn: (msg, meta = {}) => {
    console.warn(`[WARN]  [${new Date().toISOString()}] ${msg}`, Object.keys(meta).length ? meta : '');
  },
  error: (msg, err = {}) => {
    console.error(`[ERROR] [${new Date().toISOString()}] ${msg}`, err);
  },
  debug: (msg, meta = {}) => {
    if (env.NODE_ENV !== 'production') {
      console.debug(`[DEBUG] [${new Date().toISOString()}] ${msg}`, Object.keys(meta).length ? meta : '');
    }
  },
};

export default logger;
