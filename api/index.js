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
      if (typeof runSeed === 'function') {
        await runSeed();
      }
      initialized = true;
    } catch (err) {
      console.error('Failed to initialize database in serverless function:', err);
    }
  }

  // 1. Recover full path from Vercel headers or slug parameters if req.url was truncated or rewritten
  let incomingUrl = req.url || '/';
  const [pathname, search] = incomingUrl.split('?');
  const querySuffix = search ? `?${search}` : '';

  let resolvedPath = pathname;
  if (req.headers && typeof req.headers['x-matched-path'] === 'string' && req.headers['x-matched-path'].startsWith('/api')) {
    resolvedPath = req.headers['x-matched-path'];
  } else if (req.query && (req.query.slug || req.query.match)) {
    const slug = req.query.slug || req.query.match;
    const parts = Array.isArray(slug) ? slug : [slug];
    resolvedPath = `/api/${parts.join('/')}`;
  } else if (pathname === '/' || pathname === '/api' || pathname === '/api/') {
    const originalUri = req.headers && (req.headers['x-forwarded-url'] || req.headers['x-forwarded-uri']);
    if (typeof originalUri === 'string' && originalUri.startsWith('/api')) {
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
