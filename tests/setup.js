/**
 * @file /tests/setup.js
 * @description Global test setup and teardown for Vitest.
 * Configures test environment variables and in-memory test database.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll } from 'vitest';
import env from '../server/config/env.js';
import { db, initDb } from '../server/db/index.js';
import runSeed from '../server/db/seed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  // Initialize test database
  await initDb();
  await runSeed();
});

afterAll(() => {
  // Clean up
  try {
    db.close();
  } catch (_) {}
});
