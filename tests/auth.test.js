/**
 * @file /tests/auth.test.js
 * @description Test suite for admin authentication endpoints (POST /api/auth/login, logout, me).
 */

import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../server/app.js';
import env from '../server/config/env.js';

describe('Admin Authentication API', () => {
  let authCookie = null;

  it('should successfully log in with valid credentials and set httpOnly cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: env.ADMIN_EMAIL,
        password: env.ADMIN_PASSWORD,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.admin).toBeDefined();
    expect(res.body.admin.email).toBe(env.ADMIN_EMAIL);

    // Verify Set-Cookie header contains token
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies.some((c) => c.includes('token='))).toBe(true);
    expect(cookies.some((c) => c.includes('HttpOnly'))).toBe(true);

    authCookie = cookies.find((c) => c.startsWith('token='));
  });

  it('should reject login with incorrect password with generic error message', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: env.ADMIN_EMAIL,
        password: 'CompletelyWrongPassword!',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Invalid credentials.');
  });

  it('should reject login with non-existent email with generic error message', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'ghost@nonexistentdomain.com',
        password: 'SomePassword123',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Invalid credentials.');
  });

  it('should return admin profile when accessing /api/auth/me with valid session cookie', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', [authCookie]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.admin.email).toBe(env.ADMIN_EMAIL);
  });

  it('should successfully log out and clear cookie', async () => {
    const res = await request(app)
      .post('/api/auth/logout');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies.some((c) => c.includes('token=;'))).toBe(true);
  });
});
