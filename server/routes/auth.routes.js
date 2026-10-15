/**
 * @file /server/routes/auth.routes.js
 * @description Authentication routes for studio administrators.
 * Includes rate-limited login, secure logout, and session profile checks.
 */

import { Router } from 'express';
import { getMe, login, logout } from '../controllers/auth.controller.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/rateLimit.js';

export const authRouter = Router();

// POST /api/auth/login (Limited to 5 attempts per 15 minutes)
authRouter.post('/login', loginLimiter, login);

// POST /api/auth/logout
authRouter.post('/logout', logout);

// GET /api/auth/me (Protected, checks current admin session)
authRouter.get('/me', authenticateAdmin, getMe);

export default authRouter;
