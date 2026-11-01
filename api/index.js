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

  // 1. Recover full path from incoming URL or Vercel forwarding headers
  const rawOriginal = req.headers && (req.headers['x-forwarded-url'] || req.headers['x-forwarded-uri']);
  let incomingUrl = (typeof rawOriginal === 'string' && rawOriginal.length > 0) ? rawOriginal : (req.url || '/');

  const [pathname, search] = incomingUrl.split('?');
  const querySuffix = search ? `?${search}` : (req.url && req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '');

  let resolvedPath = '';

  // 2. Resolve true concrete request path (avoiding any Vercel internal wildcard template strings)
  if (typeof rawOriginal === 'string' && (rawOriginal.startsWith('/api') || rawOriginal.startsWith('/uploads'))) {
    resolvedPath = rawOriginal.split('?')[0];
  } else if (pathname.startsWith('/api/') || pathname.startsWith('/uploads/')) {
    resolvedPath = pathname;
  } else if (req.query && (req.query.slug || req.query.match || req.query.path)) {
    const rawParts = req.query.slug || req.query.match || req.query.path;
    const parts = Array.isArray(rawParts) ? rawParts : [rawParts];
    const isUpload = pathname.includes('uploads') || (rawOriginal && rawOriginal.includes('uploads'));
    resolvedPath = isUpload ? `/uploads/${parts.join('/')}` : `/api/${parts.join('/')}`;
  } else if (pathname.startsWith('/auth/') || pathname.startsWith('/admin/')) {
    resolvedPath = `/api${pathname}`;
  } else {
    resolvedPath = pathname;
  }

  // Ensure path starts with leading slash
  if (!resolvedPath.startsWith('/')) {
    resolvedPath = `/${resolvedPath}`;
  }

  // Ensure /api prefix exists if not an upload or admin html page
  if (!resolvedPath.startsWith('/api') && !resolvedPath.startsWith('/uploads') && !resolvedPath.startsWith('/admin')) {
    resolvedPath = `/api${resolvedPath.startsWith('/') ? '' : '/'}${resolvedPath}`;
  }

  req.url = `${resolvedPath}${querySuffix}`;

  return app(req, res);
}
