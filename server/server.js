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
    logger.info('Starting MS Fusion Architects application server...');

    // 1. Initialize SQLite Database and schema migrations
    await initDb();

    // 2. Run initial seed if database is unpopulated
    const adminCheck = db.prepare('SELECT COUNT(*) as count FROM admins').get();
    if (!adminCheck || adminCheck.count === 0) {
      logger.info('Database empty. Running seed...');
      await runSeed();
    }

    // 4. Start HTTP listener
    const server = app.listen(env.PORT, () => {
      logger.info(`🚀 Server running in [${env.NODE_ENV}] mode on port ${env.PORT}`);
      logger.info(`🌐 Public URL: http://localhost:${env.PORT}`);
      logger.info(`🛡️ Admin Portal: http://localhost:${env.PORT}/admin/login.html`);
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
