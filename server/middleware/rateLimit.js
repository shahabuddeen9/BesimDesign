/**
 * @file /server/middleware/rateLimit.js
 * @description Configures granular rate-limiting rules using express-rate-limit.
 * Prevents spam, brute-force attacks, and denial of service.
 */

import rateLimit from 'express-rate-limit';
import env from '../config/env.js';

/**
 * Standardized rate limit error response generator
 */
function createRateLimitHandler(message) {
  return (req, res) => {
    res.status(429).json({
      success: false,
      message,
      errors: [{ message }],
    });
  };
}

// 1. Enquiry & Lead Submission: 5 requests per IP per hour
export const enquiryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many enquiries submitted from this IP. Please try again after 1 hour.'),
  skip: () => process.env.NODE_ENV === 'test' || env.NODE_ENV === 'test',
});

// 2. Admin Login: 5 attempts per 15 minutes per IP
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many login attempts. Please wait 15 minutes before retrying.'),
  skip: () => process.env.NODE_ENV === 'test' || env.NODE_ENV === 'test',
});

// 3. General Public API: 100 requests per 15 minutes
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Request rate limit exceeded. Please try again later.'),
  skip: () => process.env.NODE_ENV === 'test' || env.NODE_ENV === 'test',
});

export default {
  enquiryLimiter,
  loginLimiter,
  generalLimiter,
};
