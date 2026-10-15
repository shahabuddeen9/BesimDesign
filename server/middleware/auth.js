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

  // 1. Check httpOnly cookie
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }
  // 2. Check Authorization Bearer header as fallback
  else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new AppError('Authentication required. Please log in as an administrator.', 401));
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (!decoded || !decoded.id) {
      return next(new AppError('Invalid authentication token.', 401));
    }

    const admin = db.prepare('SELECT id, email, created_at, last_login_at FROM admins WHERE id = ?').get(decoded.id);
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
