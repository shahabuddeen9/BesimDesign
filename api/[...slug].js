/**
 * @file /api/[...slug].js
 * @description Catch-all Vercel Serverless Function entry point for all /api/* routes.
 * Re-exports the main API handler from api/index.js.
 */

export { default } from './index.js';
