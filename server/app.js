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
import { db, initDb } from './db/index.js';
import { csrfCookieSetter } from './middleware/csrf.js';
import errorHandler from './middleware/errorHandler.js';
import { generalLimiter } from './middleware/rateLimit.js';
import { getSitemapXml } from './controllers/sitemap.controller.js';
import { renderProjectPage } from './controllers/project-render.controller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const uploadsPath = process.env.VERCEL ? '/tmp/uploads' : path.resolve(projectRoot, 'uploads');
const projectUploadsPath = path.resolve(projectRoot, 'uploads');
const publicPath = path.resolve(projectRoot, 'public');
const distPath = path.resolve(projectRoot, 'dist');

export const app = express();

// 1. Trust proxy for rate limiting behind reverse proxies (Cloud Run / Nginx / Render)
app.set('trust proxy', 1);

// 2. Helmet Security Headers (Adaptive to Production and Development/Preview)
app.use((req, res, next) => {
  const host = req.headers.host || '';
  const isProd = process.env.NODE_ENV === 'production' || env.NODE_ENV === 'production';
  const isPreviewHost = host.includes('.run.app') || host.includes('localhost') || host.includes('127.0.0.1');
  const isStrictProduction = isProd && !isPreviewHost;

  return helmet({
    // Production strictly enforces SAMEORIGIN; preview environments allow iframe rendering
    frameguard: isStrictProduction ? { action: 'sameorigin' } : false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: isStrictProduction ? { policy: 'same-origin' } : false,
    crossOriginResourcePolicy: isStrictProduction ? { policy: 'same-origin' } : false,
    originAgentCluster: isStrictProduction,
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
        frameAncestors: isStrictProduction ? ["'self'"] : ['*'],
      },
    },
  })(req, res, next);
});

// 3. Ensure database is initialized before any route executes; fails safely with 503 on database unavailability
app.use(async (req, res, next) => {
  try {
    await initDb();
    next();
  } catch (err) {
    if (req.path.startsWith('/api')) {
      return res.status(503).json({
        success: false,
        status: 'unhealthy',
        database: 'disconnected',
        message: 'Database service is temporarily unavailable. Please try again later.',
        error: (process.env.NODE_ENV === 'production' || env.NODE_ENV === 'production')
          ? 'Database connection failure'
          : err.message,
      });
    }
    next(err);
  }
});

// Set CSRF token cookie on all requests
app.use(csrfCookieSetter);

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

// 6. Canonical Host & URL Normalization (Phase 2 SEO & Routing)
app.use((req, res, next) => {
  const host = (req.headers.host || '').toLowerCase();

  // Canonical Domain: Redirect apex besimdesign.com to preferred https://www.besimdesign.com
  if (host === 'besimdesign.com') {
    return res.redirect(301, `https://www.besimdesign.com${req.originalUrl}`);
  }

  // Bypass API, static uploads, and asset paths from URL reshaping
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/assets')) {
    return next();
  }

  let cleanPath = req.path;
  let needsRedirect = false;

  // Trailing slash 301 redirect (ensures single canonical URL without trailing slash, except root '/' and /admin/)
  if (cleanPath.length > 1 && cleanPath.endsWith('/') && !cleanPath.startsWith('/admin')) {
    cleanPath = cleanPath.replace(/\/+$/, '');
    needsRedirect = true;
  }

  // Lowercase 301 redirect if uppercase characters exist in public path (e.g. /Hotels -> /hotels)
  if (/[A-Z]/.test(cleanPath) && !cleanPath.startsWith('/admin')) {
    cleanPath = cleanPath.toLowerCase();
    needsRedirect = true;
  }

  if (needsRedirect) {
    const query = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    return res.redirect(301, cleanPath + query);
  }

  next();
});

// 7. Legacy .html 301 Permanent Redirects (Preserve SEO equity and prevent duplicate indexing)
app.get('/index.html', (req, res) => res.redirect(301, '/'));
app.get('/about.html', (req, res) => res.redirect(301, '/about'));
app.get('/central-kitchen.html', (req, res) => res.redirect(301, '/central-kitchen'));
app.get('/hotels.html', (req, res) => res.redirect(301, '/hotels'));
app.get('/hospitality.html', (req, res) => res.redirect(301, '/hospitality'));
app.get('/residential.html', (req, res) => res.redirect(301, '/residential'));
app.get('/showcase.html', (req, res) => res.redirect(301, '/showcase'));
app.get('/privacy.html', (req, res) => res.redirect(301, '/privacy'));
app.get(['/contact', '/contact.html'], (req, res) => res.redirect(301, '/#contact'));

// 8. Admin Portal Entry Routes (Must precede static middleware)
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

// 9. Static Asset Hosting
try {
  if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });
} catch (_) {}
app.use('/uploads', express.static(uploadsPath));

if (process.env.VERCEL && fs.existsSync(projectUploadsPath)) {
  app.use('/uploads', express.static(projectUploadsPath));
}

// Fallback serving for uploaded assets from disk and persistent DB storage (if disk was cleared in serverless)
app.get(['/uploads/:filename', '/api/uploads/:filename'], async (req, res, next) => {
  try {
    const filename = path.basename(req.params.filename);

    // 1. Check physical disk locations
    const candidatePaths = [
      path.resolve(projectUploadsPath, filename),
      path.resolve(uploadsPath, filename),
      path.resolve(publicPath, 'uploads', filename),
      path.resolve('/tmp/uploads', filename),
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        return res.sendFile(p);
      }
    }

    // 2. Query persistent DB storage (uploaded_assets)
    const row = await db.get('SELECT mimetype, data FROM uploaded_assets WHERE filename = ?', filename);
    if (row && row.data) {
      const buffer = Buffer.from(row.data, 'base64');
      const ext = path.extname(filename).toLowerCase();
      const detectedMime = ext === '.png' ? 'image/png' : (ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : (ext === '.webp' ? 'image/webp' : 'application/octet-stream'));
      res.setHeader('Content-Type', row.mimetype || detectedMime);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(buffer);
    }
    return res.status(404).json({ error: 'Uploaded file not found' });
  } catch (err) {
    next(err);
  }
});

// Dynamic SEO Sitemap endpoint (Serves fresh database-backed sitemap with 200 OK)
app.get(['/sitemap.xml', '/api/sitemap.xml'], getSitemapXml);

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
app.get('/about', (req, res) => {
  const distFile = path.resolve(distPath, 'about.html');
  const pubFile = path.resolve(publicPath, 'about.html');
  const rootFile = path.resolve(projectRoot, 'about.html');
  const target = fs.existsSync(distFile) ? distFile : (fs.existsSync(pubFile) ? pubFile : rootFile);
  res.sendFile(target);
});

app.get('/central-kitchen', (req, res) => {
  const distFile = path.resolve(distPath, 'central-kitchen.html');
  const pubFile = path.resolve(publicPath, 'central-kitchen.html');
  const target = fs.existsSync(distFile) ? distFile : pubFile;
  res.sendFile(target);
});

app.get('/hotels', (req, res) => {
  const distFile = path.resolve(distPath, 'hotels.html');
  const pubFile = path.resolve(publicPath, 'hotels.html');
  const target = fs.existsSync(distFile) ? distFile : pubFile;
  res.sendFile(target);
});

app.get('/hospitality', (req, res) => {
  const distFile = path.resolve(distPath, 'hospitality.html');
  const pubFile = path.resolve(publicPath, 'hospitality.html');
  const target = fs.existsSync(distFile) ? distFile : pubFile;
  res.sendFile(target);
});

const SLUG_ALIASES = {
  'the-nutcracker': 'the-nutcracker-jio-mall-bkc',
  'the-nutcracker-cafe': 'the-nutcracker-jio-mall-bkc',
  'foo': 'foo-asian-tapas-bkc',
  'foo-asian-tapas': 'foo-asian-tapas-bkc',
  'royal-china': 'royal-china-bandra',
  'grand-pavilion': 'grand-pavilion-luxury-hotel',
  'solstice-bay': 'solstice-bay-boutique-hotel',
  'sky-villa': 'sky-villa-parinee-bkc',
  'sea-facing-penthouse': 'sea-facing-penthouse-worli',
  'cloud-culinary': 'cloud-culinary-central-kitchen',
  'artisan-confectionery': 'artisan-confectionery-central-kitchen',
};

// Multi-category project detail route supporting /hospitality/:slug, /hotels/:slug, /residential/:slug, /central-kitchen/:slug
app.get([
  '/hospitality/:slug',
  '/hotels/:slug',
  '/residential/:slug',
  '/central-kitchen/:slug',
  '/api/hospitality/:slug',
  '/api/hotels/:slug',
  '/api/residential/:slug',
  '/api/central-kitchen/:slug',
], renderProjectPage);

app.get('/residential', (req, res) => {
  const distFile = path.resolve(distPath, 'residential.html');
  const pubFile = path.resolve(publicPath, 'residential.html');
  const target = fs.existsSync(distFile) ? distFile : pubFile;
  res.sendFile(target);
});

app.get('/showcase', (req, res) => {
  const distFile = path.resolve(distPath, 'showcase.html');
  const pubFile = path.resolve(publicPath, 'showcase.html');
  const target = fs.existsSync(distFile) ? distFile : pubFile;
  res.sendFile(target);
});

app.get('/privacy', (req, res) => {
  const distFile = path.resolve(distPath, 'privacy.html');
  const pubFile = path.resolve(publicPath, 'privacy.html');
  const rootFile = path.resolve(projectRoot, 'privacy.html');
  const target = fs.existsSync(distFile) ? distFile : (fs.existsSync(pubFile) ? pubFile : rootFile);
  res.sendFile(target);
});

// 7. General API Rate Limiting for /api
app.use('/api', generalLimiter);

// 8. Health Check Endpoint
app.get('/api/health', async (req, res) => {
  try {
    await initDb();
    res.status(200).json({
      success: true,
      status: 'healthy',
      database: (process.env.DATABASE_URL || env.DATABASE_URL) ? 'postgresql' : 'sqlite',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      env: env.NODE_ENV,
    });
  } catch (err) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: 'Database connection unavailable',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      env: env.NODE_ENV,
    });
  }
});

import adminRoutes from './routes/admin.routes.js';
import authRoutes from './routes/auth.routes.js';
import publicRoutes from './routes/public.routes.js';

// Mount API Routers (supporting both /api/ prefix and Vercel serverless / prefix)
app.use(['/api/auth', '/auth'], authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', publicRoutes);

// 404 handler for unmatched API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API route ${req.originalUrl} not found.`,
  });
});

// 404 handler for unmatched public routes (serving branded 404.html for HTML requests)
app.use((req, res) => {
  if (req.accepts('html')) {
    const dist404 = path.resolve(distPath, '404.html');
    const pub404 = path.resolve(publicPath, '404.html');
    const root404 = path.resolve(projectRoot, '404.html');
    const target404 = fs.existsSync(dist404) ? dist404 : (fs.existsSync(pub404) ? pub404 : root404);
    if (fs.existsSync(target404)) {
      return res.status(404).sendFile(target404);
    }
  }
  res.status(404).json({
    success: false,
    message: 'Resource not found',
  });
});

// Central Error Handler
app.use(errorHandler);

export default app;
