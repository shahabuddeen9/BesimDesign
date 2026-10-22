/**
 * @file /api/index.js
 * @description Vercel Serverless Function entry point.
 * Wraps Express application to handle API requests (/api/*) in serverless environments.
 */

import app from '../server/app.js';
import { initDb } from '../server/db/index.js';
import runSeed from '../server/db/seed.js';

let initialized = false;

export default async function handler(req, res) {
  if (!initialized) {
    try {
      await initDb();
      await runSeed();
      initialized = true;
    } catch (err) {
      console.error('Failed to initialize database in serverless function:', err);
    }
  }

  // Ensure path prefix matches Express route mountpoints
  if (req.url && !req.url.startsWith('/api') && !req.url.startsWith('/uploads')) {
    req.url = `/api${req.url}`;
  }

  return app(req, res);
}
