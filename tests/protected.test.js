/**
 * @file /tests/protected.test.js
 * @description Test suite verifying all administrative endpoints return HTTP 401 Unauthorized
 * when accessed without valid credentials.
 */

import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../server/app.js';

describe('Protected Admin Endpoints (Access Control)', () => {
  it('GET /api/auth/me should return 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/admin/enquiries should return 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/admin/enquiries');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/admin/projects should return 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/admin/projects');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/admin/projects should return 401 when unauthenticated', async () => {
    const res = await request(app).post('/api/admin/projects').send({ title: 'Hacked Project' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/admin/stats should return 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/admin/stats');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/admin/enquiries/export.csv should return 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/admin/enquiries/export.csv');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
