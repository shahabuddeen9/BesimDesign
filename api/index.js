/**
 * @file /api/index.js
 * @description Vercel Serverless Function entry point.
 * Wraps Express application to handle API requests (/api/*) in serverless environments.
 */

import app from '../server/app.js';
import { initDb } from '../server/db/index.js';
import { runSeed } from '../server/db/seed.js';

let initialized = false;

export default async function handler(req, res) {
  if (!initialized) {
    try {
      await initDb();
      initialized = true;
    } catch (err) {
      console.error('Failed to initialize database in serverless function:', err);
    }
  }

  // 1. Recover full path from Vercel headers or slug parameters if req.url was truncated or rewritten
  let incomingUrl = req.url || '/';
  const [pathname, search] = incomingUrl.split('?');
  const querySuffix = search ? `?${search}` : '';

  const matchedPath = req.headers && typeof req.headers['x-matched-path'] === 'string' ? req.headers['x-matched-path'] : '';
  const originalUri = req.headers && typeof req.headers['x-forwarded-url'] === 'string'
    ? req.headers['x-forwarded-url']
    : (req.headers && typeof req.headers['x-forwarded-uri'] === 'string' ? req.headers['x-forwarded-uri'] : '');

  let resolvedPath = pathname;

  // Detect /uploads request from vercel.json rewrite or direct URI
  const isUploadReq =
    pathname.startsWith('/uploads') ||
    matchedPath.startsWith('/uploads') ||
    originalUri.includes('/uploads/') ||
    (req.query && req.query.match && !req.query.slug);

  if (isUploadReq) {
    if (pathname.startsWith('/uploads')) {
      resolvedPath = pathname;
    } else if (originalUri && originalUri.includes('/uploads/')) {
      const match = originalUri.match(/\/uploads\/[^?]+/);
      resolvedPath = match ? match[0] : pathname;
    } else if (req.query && req.query.match) {
      const parts = Array.isArray(req.query.match) ? req.query.match : [req.query.match];
      resolvedPath = `/uploads/${parts.join('/')}`;
    } else {
      resolvedPath = pathname;
    }
  } else if (matchedPath.startsWith('/api')) {
    resolvedPath = matchedPath;
  } else if (req.query && (req.query.slug || req.query.match)) {
    const slug = req.query.slug || req.query.match;
    const parts = Array.isArray(slug) ? slug : [slug];
    resolvedPath = `/api/${parts.join('/')}`;
  } else if (pathname === '/' || pathname === '/api' || pathname === '/api/') {
    if (originalUri.startsWith('/api')) {
      resolvedPath = originalUri.split('?')[0];
    }
  }

  // Ensure path starts with /api if not an upload or public file
  if (!resolvedPath.startsWith('/api') && !resolvedPath.startsWith('/uploads')) {
    resolvedPath = `/api${resolvedPath.startsWith('/') ? '' : '/'}${resolvedPath}`;
  }

  req.url = `${resolvedPath}${querySuffix}`;

  return app(req, res);
}
