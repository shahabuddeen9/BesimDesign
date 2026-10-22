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

// 3. CORS Configuration (Resilient to AI Studio preview iframes, sandboxed origins, and cross-origin tools)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || origin === 'null') {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, X-Content-Range');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// 4. Request Logging (morgan)
if (env.NODE_ENV !== 'test') {
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// 5. Body Parsing with strict size limits (10kb for JSON to prevent payload attacks)
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// 6. Admin Portal Entry Routes (Must precede static middleware)
app.get(['/admin', '/admin/', '/admin/index.html'], (req, res) => {
  const query = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  return res.redirect(302, `/admin/dashboard.html${query}`);
});

app.get(['/admin/login', '/admin/login.html'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  return res.sendFile(path.resolve(publicPath, 'admin/login.html'));
});

app.get(['/admin/dashboard', '/admin/dashboard.html'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  return res.sendFile(path.resolve(publicPath, 'admin/dashboard.html'));
});

app.get('/admin/projects', (req, res) => {
  const query = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  const sep = query ? '&' : '?';
  return res.redirect(302, `/admin/dashboard.html${query}${sep}tab=projects`);
});

// 7. Static Asset Hosting
const uploadsPath = path.resolve(projectRoot, 'uploads');
const publicPath = path.resolve(projectRoot, 'public');
const distPath = path.resolve(projectRoot, 'dist');

app.use('/uploads', express.static(uploadsPath));
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}
app.use(express.static(publicPath, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.includes('/admin/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  },
}));

// Clean routes for dedicated showcase experiences
app.get(['/about', '/about.html'], (req, res) => {
  const distFile = path.resolve(distPath, 'about.html');
  const pubFile = path.resolve(publicPath, 'about.html');
  const rootFile = path.resolve(projectRoot, 'about.html');
  const target = fs.existsSync(distFile) ? distFile : (fs.existsSync(pubFile) ? pubFile : rootFile);
  res.sendFile(target);
});

app.get(['/central-kitchen', '/central-kitchen.html'], (req, res) => {
  const distFile = path.resolve(distPath, 'central-kitchen.html');
  const pubFile = path.resolve(publicPath, 'central-kitchen.html');
  const target = fs.existsSync(distFile) ? distFile : pubFile;
  res.sendFile(target);
});

app.get(['/hotels', '/hotels.html'], (req, res) => {
  const distFile = path.resolve(distPath, 'hotels.html');
  const pubFile = path.resolve(publicPath, 'hotels.html');
  const target = fs.existsSync(distFile) ? distFile : pubFile;
  res.sendFile(target);
});

app.get(['/hospitality', '/hospitality.html'], (req, res) => {
  const distFile = path.resolve(distPath, 'hospitality.html');
  const pubFile = path.resolve(publicPath, 'hospitality.html');
  const target = fs.existsSync(distFile) ? distFile : pubFile;
  res.sendFile(target);
});

app.get(['/residential', '/residential.html'], (req, res) => {
  const distFile = path.resolve(distPath, 'residential.html');
  const pubFile = path.resolve(publicPath, 'residential.html');
  const target = fs.existsSync(distFile) ? distFile : pubFile;
  res.sendFile(target);
});

app.get(['/showcase', '/showcase.html'], (req, res) => {
  const distFile = path.resolve(distPath, 'showcase.html');
  const pubFile = path.resolve(publicPath, 'showcase.html');
  const target = fs.existsSync(distFile) ? distFile : pubFile;
  res.sendFile(target);
});

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
