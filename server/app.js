/**
 * @file /server/app.js
 * @description Main Express application setup, security headers, logging, static file
 * distribution, and middleware pipeline.
 */

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import fs from 'fs';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import env from './config/env.js';
import errorHandler from './middleware/errorHandler.js';
import { generalLimiter } from './middleware/rateLimit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

export const app = express();

// 1. Trust proxy for rate limiting behind reverse proxies (Cloud Run / Nginx / Render)
app.set('trust proxy', 1);

// 2. Helmet Security Headers (configured to allow AI Studio iframe embedding)
app.use(
  helmet({
    frameguard: false, // Critical: disables X-Frame-Options so preview iframe can load
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false, // Critical: prevents blank/white page when loaded in iframe
    crossOriginResourcePolicy: false, // Critical: prevents blocking assets in cross-origin preview
    originAgentCluster: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://images.unsplash.com', '*'],
        connectSrc: ["'self'", 'ws:', 'wss:', '*'],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'self'", '*'],
        frameAncestors: ['*'], // Critical: allows embedding in AI Studio iFrame
      },
    },
  })
);

// 3. CORS Configuration
const corsOptions = {
  origin: env.ALLOWED_ORIGIN === '*' ? true : env.ALLOWED_ORIGIN.split(',').map((o) => o.trim()),
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));

// 4. Request Logging (morgan)
if (env.NODE_ENV !== 'test') {
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// 5. Body Parsing with strict size limits (10kb for JSON to prevent payload attacks)
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// 6. Static Asset Hosting
const uploadsPath = path.resolve(projectRoot, 'uploads');
const publicPath = path.resolve(projectRoot, 'public');
const distPath = path.resolve(projectRoot, 'dist');

app.use('/uploads', express.static(uploadsPath));
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}
app.use(express.static(publicPath));

// 7. General API Rate Limiting for /api
app.use('/api', generalLimiter);

// 8. Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: env.NODE_ENV,
  });
});

import adminRoutes from './routes/admin.routes.js';
import authRoutes from './routes/auth.routes.js';
import publicRoutes from './routes/public.routes.js';

// Mount API Routers
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', publicRoutes);

// 404 handler for unmatched API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API route ${req.originalUrl} not found.`,
  });
});

// Central Error Handler
app.use(errorHandler);

export default app;
