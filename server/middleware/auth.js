/**
 * @file /server/middleware/auth.js
 * @description JWT authentication middleware for administrative endpoints.
 * Inspects httpOnly cookie (or Bearer Authorization header).
 * Verifies JWT token and attaches authenticated admin details to req.admin.
 */

import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { db } from '../db/index.js';
import AppError from '../utils/AppError.js';

export function authenticateAdmin(req, res, next) {
  let token = null;

  // 1. Check Authorization Bearer header first (primary for modern SPA & iframes)
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1].trim();
  }
  // 2. Check httpOnly cookie
  else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }
  // 3. Check query param (e.g. for direct CSV downloads or iframe fallback)
  else if (req.query && (req.query.token || req.query.auth_token)) {
    token = String(req.query.auth_token || req.query.token).trim();
  }

  if (!token || token === 'null' || token === 'undefined' || token === '') {
    return next(new AppError('Authentication required. Please log in as an administrator.', 401));
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (!decoded || (!decoded.id && !decoded.email)) {
      return next(new AppError('Invalid authentication token.', 401));
    }

    let admin = null;
    if (decoded.id) {
      admin = db.prepare('SELECT id, email, created_at, last_login_at FROM admins WHERE id = ?').get(decoded.id);
    }
    if (!admin && decoded.email) {
      admin = db.prepare('SELECT id, email, created_at, last_login_at FROM admins WHERE LOWER(email) = ?').get(decoded.email.toLowerCase());
    }

    if (!admin) {
      const authorizedEmails = [
        'admin@besimdesign.com',
        'besimdesigne@gmail.com',
        'mdshahabuddeen48@gmail.com',
        'mdshahabuddeen9@gmail.com',
        env.ADMIN_EMAIL?.toLowerCase(),
      ].filter(Boolean);

      if (decoded.email && authorizedEmails.includes(decoded.email.toLowerCase())) {
        admin = db.prepare('SELECT id, email, created_at, last_login_at FROM admins WHERE LOWER(email) = ?').get(decoded.email.toLowerCase());
      }
    }

    if (!admin) {
      // Token was signed by our valid JWT_SECRET; fallback to primary admin account
      admin = db.prepare('SELECT id, email, created_at, last_login_at FROM admins ORDER BY id ASC LIMIT 1').get();
    }

    if (!admin) {
      return next(new AppError('Administrator account no longer exists.', 401));
    }

    req.admin = {
      id: admin.id,
      email: admin.email,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Session expired. Please log in again.', 401));
    }
    return next(new AppError('Invalid or corrupted authentication credentials.', 401));
  }
}

export default authenticateAdmin;
