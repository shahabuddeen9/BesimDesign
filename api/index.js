/**
 * @file /api/index.js
 * @description Vercel Serverless Function entry point.
 * Wraps Express application to handle API requests (/api/*) in serverless environments.
 */

import app from '../server/app.js';
import { initDb } from '../server/db/index.js';
import { runSeed } from '../server/db/seed.js';

let initialized = false;
let initPromise = null;

export default async function handler(req, res) {
  if (!initialized) {
    if (!initPromise) {
      initPromise = (async () => {
        try {
          await initDb();
          await runSeed();
          initialized = true;
        } catch (err) {
          console.error('Failed to initialize database in serverless function:', err);
        } finally {
          initPromise = null;
        }
      })();
    }
    await initPromise;
  }

  // 1. Recover full path from incoming URL or Vercel forwarding headers
  const rawOriginal = req.headers && (req.headers['x-forwarded-url'] || req.headers['x-forwarded-uri']);
  let incomingUrl = (typeof rawOriginal === 'string' && rawOriginal.length > 0) ? rawOriginal : (req.url || '/');

  const [pathname, search] = incomingUrl.split('?');
  const querySuffix = search ? `?${search}` : (req.url && req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '');

  let resolvedPath = '';

  const isDirectWebRoute = (p) => {
    return p === '/' ||
           p === '/about' ||
           p === '/showcase' ||
           p === '/privacy' ||
           p === '/robots.txt' ||
           p === '/favicon.svg' ||
           p === '/sitemap.xml' ||
           p === '/contact' ||
           p.endsWith('.html') ||
           p.startsWith('/hospitality') ||
           p.startsWith('/hotels') ||
           p.startsWith('/residential') ||
           p.startsWith('/central-kitchen') ||
           p.startsWith('/uploads') ||
           p.startsWith('/admin');
  };

  // 2. Resolve true concrete request path (avoiding any Vercel internal wildcard template strings)
  if (typeof rawOriginal === 'string' && rawOriginal.startsWith('/')) {
    resolvedPath = rawOriginal.split('?')[0];
  } else if (isDirectWebRoute(pathname) || pathname.startsWith('/api/')) {
    resolvedPath = pathname;
  } else if (req.query && (req.query.slug || req.query.match || req.query.path)) {
    const rawParts = req.query.slug || req.query.match || req.query.path;
    const parts = Array.isArray(rawParts) ? rawParts : [rawParts];
    const isUpload = pathname.includes('uploads') || (rawOriginal && rawOriginal.includes('uploads'));
    resolvedPath = isUpload ? `/uploads/${parts.join('/')}` : `/api/${parts.join('/')}`;
  } else if (pathname.startsWith('/auth/')) {
    resolvedPath = `/api${pathname}`;
  } else {
    resolvedPath = pathname;
  }

  // Ensure path starts with leading slash
  if (!resolvedPath.startsWith('/')) {
    resolvedPath = `/${resolvedPath}`;
  }

  // Ensure /api prefix exists if not a direct web route, upload, or sitemap
  if (!resolvedPath.startsWith('/api') && !isDirectWebRoute(resolvedPath)) {
    resolvedPath = `/api${resolvedPath.startsWith('/') ? '' : '/'}${resolvedPath}`;
  }

  req.url = `${resolvedPath}${querySuffix}`;

  return app(req, res);
}
