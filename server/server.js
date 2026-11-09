/**
 * @file /server/server.js
 * @description Application server entry point.
 * Initializes the SQLite database, runs seeds if needed, and starts the Express HTTP server.
 */

import app from './app.js';
import env from './config/env.js';
import { db, initDb } from './db/index.js';
import runSeed from './db/seed.js';
import logger from './utils/logger.js';

async function startServer() {
  try {
    logger.info('Starting Besim Design application server...');

    // 1. Initialize SQLite Database and schema migrations
    await initDb();

    // 2. Ensure seed & admin credentials are in sync
    await runSeed();

    // 4. Start HTTP listener (respecting CLI --port flag if provided)
    const portArgIdx = process.argv.indexOf('--port');
    const portFromArg = portArgIdx !== -1 && process.argv[portArgIdx + 1] ? parseInt(process.argv[portArgIdx + 1], 10) : null;
    const listenPort = portFromArg || (process.env.NODE_ENV === 'production' && process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);

    const server = app.listen(listenPort, '0.0.0.0', () => {
      logger.info(`🚀 Server running in [${env.NODE_ENV}] mode on port ${listenPort}`);
      logger.info(`🌐 Public URL: http://localhost:${listenPort}`);
      logger.info(`🛡️ Admin Portal: http://localhost:${listenPort}/admin/login.html`);
    });

    // Graceful shutdown handling
    const shutdown = () => {
      logger.info('Received shutdown signal. Gracefully closing HTTP server and database...');
      server.close(() => {
        db.close();
        logger.info('Server and SQLite database cleanly closed.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
