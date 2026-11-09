/**
 * @file /server.ts
 * @description Full-stack dev & production server entry point.
 * Mounts Express API routes (/api/*, /uploads/*) with Vite middlewares in development.
 */

import { createServer as createViteServer } from 'vite';
import app from './server/app.js';
import env from './server/config/env.js';
import { db, initDb } from './server/db/index.js';
import { runSeed } from './server/db/seed.js';
import logger from './server/utils/logger.js';

async function bootstrap() {
  try {
    // 1. Initialize SQLite Database & Migrations
    await initDb();

    // 2. Ensure seed & admin credentials are in sync
    await runSeed();

    // 3. Mount Vite middlewares in development mode
    if (env.NODE_ENV !== 'production') {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      logger.info('Vite middlewares mounted in development mode.');
    }

    // 4. Start HTTP Server on PORT 3000 (respecting CLI --port flag if provided)
    const portArgIdx = process.argv.indexOf('--port');
    const portFromArg = portArgIdx !== -1 && process.argv[portArgIdx + 1] ? parseInt(process.argv[portArgIdx + 1], 10) : null;
    const listenPort = portFromArg || (process.env.NODE_ENV === 'production' && process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);

    app.listen(listenPort, '0.0.0.0', () => {
      logger.info(`🚀 Full-stack application active at http://0.0.0.0:${listenPort}`);
      logger.info(`📋 API available at http://0.0.0.0:${listenPort}/api`);
      logger.info(`🛡️ Admin Portal at http://0.0.0.0:${listenPort}/admin/login.html`);
    });
  } catch (error) {
    logger.error('Failed to start full-stack server:', error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  }
}

bootstrap();
