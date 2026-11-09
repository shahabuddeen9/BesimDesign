import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';
import db from '../server/db/index.js';
import AppError from '../server/utils/AppError.js';

describe('Production Database Safety & Non-Fallback Guarantees', () => {
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    await db.close();
  });

  afterEach(async () => {
    await db.close();
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    await db.initialize();
  });

  it('should fail with HTTP 503 if DATABASE_URL is missing in production and never switch to SQLite', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;

    // Direct invocation check
    await expect(db.initialize()).rejects.toThrow();

    try {
      await db.initialize();
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(503);
      expect(err.message).toMatch(/SQLite fallback is disabled in production/i);
    }
  });

  it('should return HTTP 503 from /api/health when database is unavailable in production', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;

    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.database).toBe('disconnected');
  });

  it('should return HTTP 503 from public API endpoints when database is unavailable in production', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;

    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/database|unavailable|required in production/i);
  });
});
