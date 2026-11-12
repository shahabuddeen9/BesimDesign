/**
 * @file /server.ts
 * @description Full-stack dev & production server entry point.
 * Mounts Express API routes (/api/*, /uploads/*) with Vite middlewares in development.
 */

import { createServer as createViteServer } from 'vite';
import app from './server/app.js';
import env from './server/config/env.js';
import { db, initDb } from './server/db/index.js';
import logger from './server/utils/logger.js';

async function bootstrap() {
  try {
    // 1. Initialize Database & Migrations safely
    try {
      await initDb();
      // Production startup initializes the existing database connection only.
      // Seed data is never applied automatically during server startup.
      logger.info('Database connection initialized.');
    } catch (dbErr) {
      logger.warn('Database startup warning (will retry on incoming request):', dbErr instanceof Error ? dbErr.message : String(dbErr));
    }

    // 3. Mount Vite middlewares in development mode
    if (process.env.NODE_ENV !== 'production' && env.NODE_ENV !== 'production') {
      try {
        const vite = await createViteServer({
          server: { middlewareMode: true, hmr: false },
          appType: 'custom',
        });
        app.use(vite.middlewares);
        logger.info('Vite middlewares mounted in development mode.');
      } catch (viteErr) {
        logger.warn('Vite middleware initialization warning:', viteErr instanceof Error ? viteErr.message : String(viteErr));
      }
    }

    // 4. Start HTTP Server on PORT 3000 (respecting CLI --port flag if provided)
    const portArgIdx = process.argv.indexOf('--port');
    const portFromArg = portArgIdx !== -1 && process.argv[portArgIdx + 1] ? parseInt(process.argv[portArgIdx + 1], 10) : null;
    const listenPort = portFromArg || 3000;

    const server = app.listen(listenPort, '0.0.0.0', () => {
      logger.info(`🚀 Full-stack application active at http://0.0.0.0:${listenPort}`);
      logger.info(`📋 API available at http://0.0.0.0:${listenPort}/api`);
      logger.info(`🛡️ Admin Portal at http://0.0.0.0:${listenPort}/admin/login.html`);
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${listenPort} is already in use.`);
      } else {
        logger.error('Server listen error:', err);
      }
    });

    const shutdown = () => {
      logger.info('Shutting down server gracefully...');
      server.close(() => {
        try { db.close(); } catch (_) {}
        process.exit(0);
      });
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    logger.error('Failed to start full-stack server:', error instanceof Error ? error : new Error(String(error)));
  }
}

bootstrap();
