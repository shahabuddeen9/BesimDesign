/**
 * @file /server/controllers/auth.controller.js
 * @description Controller for administrator authentication, JWT issuance in httpOnly cookies,
 * session status checks, and secure logout.
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import env from '../config/env.js';
import { db } from '../db/index.js';
import AppError from '../utils/AppError.js';
import logger from '../utils/logger.js';

export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const COOKIE_NAME = 'token';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Admin Login: validates credentials, sets httpOnly cookie, updates last_login_at
 */
export async function login(req, res, next) {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email.toLowerCase().trim());
    if (!admin) {
      // Intentionally generic error message to prevent account enumeration
      throw new AppError('Invalid credentials.', 401);
    }

    const isMatch = await bcrypt.compare(password, admin.password_hash);
    if (!isMatch) {
      throw new AppError('Invalid credentials.', 401);
    }

    // Update last_login_at
    db.prepare("UPDATE admins SET last_login_at = datetime('now') WHERE id = ?").run(admin.id);

    // Sign JWT
    const token = jwt.sign(
      { id: admin.id, email: admin.email },
      env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set secure httpOnly cookie
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: SEVEN_DAYS_MS,
    });

    logger.info(`Administrator logged in: ${admin.email}`);

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      admin: {
        id: admin.id,
        email: admin.email,
        last_login_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin Logout: Clears the authentication cookie
 */
export function logout(req, res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
  });

  return res.status(200).json({
    success: true,
    message: 'Logged out successfully.',
  });
}

/**
 * Verify current session (GET /api/auth/me)
 */
export function getMe(req, res, next) {
  try {
    const admin = db.prepare('SELECT id, email, created_at, last_login_at FROM admins WHERE id = ?').get(req.admin.id);
    if (!admin) {
      throw new AppError('Administrator account not found', 404);
    }

    return res.status(200).json({
      success: true,
      admin,
    });
  } catch (error) {
    next(error);
  }
}

export default {
  login,
  logout,
  getMe,
};
