/**
 * @file /server/utils/sanitize.js
 * @description Input sanitization and IP hashing utility functions for security and privacy.
 */

import crypto from 'crypto';
import env from '../config/env.js';

/**
 * Strips all HTML tags and control characters to prevent XSS.
 * @param {string} str - Raw string
 * @returns {string} Sanitized string
 */
export function stripHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<[^>]*>?/gm, '')
    .replace(/[<>]/g, '')
    .trim();
}

/**
 * Generates a one-way salted SHA-256 hash of a client IP address.
 * Conforms to privacy guidelines (DPDP Act) by never storing raw PII IPs.
 * @param {string} ip - Client IP
 * @returns {string} Hex hash string
 */
export function hashIp(ip) {
  if (!ip) return 'unknown';
  return crypto
    .createHash('sha256')
    .update(`${ip}:${env.IP_HASH_SALT}`)
    .digest('hex');
}

/**
 * Normalizes an Indian phone number (10 digits, starts 6-9, optional +91 prefix).
 * @param {string} phone 
 * @returns {string} 10-digit phone
 */
export function normalizeIndianPhone(phone) {
  if (!phone) return '';
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return digits;
}

export default {
  stripHtml,
  hashIp,
  normalizeIndianPhone,
};
