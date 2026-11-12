/**
 * @file /api/index.js
 * @description Vercel Serverless Function entry point for the Express application.
 * The shared Express middleware owns database initialization; this entry point
 * must never seed, migrate or mutate production data during a cold start.
 */
import app from '../server/app.js';
import { resolveVercelRequestUrl } from '../server/utils/vercel-path.js';

export default function handler(req, res) {
  req.url = resolveVercelRequestUrl(req);
  return app(req, res);
}
