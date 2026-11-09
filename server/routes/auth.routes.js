/**
 * @file /server/routes/auth.routes.js
 * @description Authentication routes for studio administrators.
 * Includes rate-limited login, secure logout, and session profile checks.
 */

import { Router } from 'express';
import { getMe, login, logout, refreshSession } from '../controllers/auth.controller.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { verifyCsrf } from '../middleware/csrf.js';
import { loginLimiter } from '../middleware/rateLimit.js';

export const authRouter = Router();

// POST /api/auth/login (Limited to 30 attempts per 15 minutes)
authRouter.post('/login', loginLimiter, login);

// POST /api/auth/refresh (Rotate refresh token and issue fresh access token)
authRouter.post('/refresh', refreshSession);

// POST /api/auth/logout (Protected against CSRF)
authRouter.post('/logout', verifyCsrf, logout);

// GET /api/auth/me (Protected, checks current admin session)
authRouter.get('/me', authenticateAdmin, getMe);

export default authRouter;
