/**
 * @file /tests/client_deletion_persistence.test.js
 * @description Thorough verification of client deletion persistence across:
 * - Admin deletion endpoint
 * - Public GET /api/clients endpoint
 * - Admin GET /api/admin/clients endpoint
 * - Direct database query verification
 * - Server re-initialization (restarting initDb & runSeed)
 * - Anti-resurrection / tombstone guarantees
 * - Unrelated client record protection
 */

import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import app from '../server/app.js';
import env from '../server/config/env.js';
import { db, initDb } from '../server/db/index.js';
import { runSeed } from '../server/db/seed.js';

describe('Permanent Client Deletion Lifecycle & Anti-Resurrection', () => {
  let authCookie = null;
  let testClientId = null;
  const testClientName = `Test Brand Unique ${Date.now()}`;
  let initialClientCount = 0;

  beforeAll(async () => {
    await initDb();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: env.ADMIN_EMAIL,
        password: env.ADMIN_PASSWORD,
      });

    const cookies = loginRes.headers['set-cookie'];
    authCookie = cookies.find((c) => c.startsWith('token='));

    const countRow = db.prepare('SELECT COUNT(*) as c FROM clients').get();
    initialClientCount = countRow ? countRow.c : 0;
  });

  it('Step 1: Creates a new test client', async () => {
    const res = await request(app)
      .post('/api/admin/clients')
      .set('Cookie', [authCookie])
      .send({
        name: testClientName,
        category: 'Hospitality Testing',
        logo_url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4',
        website_url: 'https://testbrand.example.com',
        description: 'Temporary testing brand verification',
        is_featured: 1,
        sort_order: 99,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe(testClientName);
    testClientId = res.body.data.id;
  });

  it('Step 2: Appears in both admin and public endpoints', async () => {
    // Admin endpoint
    const adminRes = await request(app)
      .get('/api/admin/clients')
      .set('Cookie', [authCookie]);
    expect(adminRes.status).toBe(200);
    const foundInAdmin = adminRes.body.data.some((c) => c.id === testClientId);
    expect(foundInAdmin).toBe(true);

    // Public endpoint
    const pubRes = await request(app).get('/api/clients');
    expect(pubRes.status).toBe(200);
    const foundInPub = pubRes.body.data.some((c) => c.id === testClientId);
    expect(foundInPub).toBe(true);

    // Anti-cache headers present
    expect(pubRes.headers['cache-control']).toContain('no-store');
  });

  it('Step 3: Permanently deletes the test client', async () => {
    const delRes = await request(app)
      .delete(`/api/admin/clients/${testClientId}`)
      .set('Cookie', [authCookie]);

    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);
  });

  it('Step 4: Confirms the backend database directly reflects deletion', () => {
    const inDb = db.prepare('SELECT id FROM clients WHERE id = ?').get(testClientId);
    expect(inDb).toBeUndefined();

    // Check tombstone record exists
    const tombstone = db.prepare('SELECT * FROM deleted_clients WHERE client_name = ?').get(testClientName);
    expect(tombstone).toBeDefined();
    expect(tombstone.client_name).toBe(testClientName);
  });

  it('Step 5: Verifies deletion persists on public and admin page refreshes', async () => {
    const pubRes = await request(app).get('/api/clients');
    expect(pubRes.status).toBe(200);
    const foundInPub = pubRes.body.data.some((c) => c.id === testClientId || c.name === testClientName);
    expect(foundInPub).toBe(false);

    const adminRes = await request(app)
      .get('/api/admin/clients')
      .set('Cookie', [authCookie]);
    expect(adminRes.status).toBe(200);
    const foundInAdmin = adminRes.body.data.some((c) => c.id === testClientId || c.name === testClientName);
    expect(foundInAdmin).toBe(false);
  });

  it('Step 6: Verifies unrelated client records remain intact', async () => {
    const pubRes = await request(app).get('/api/clients');
    expect(pubRes.status).toBe(200);
    // Unrelated clients should still exist
    expect(pubRes.body.data.length).toBeGreaterThan(0);
    const nutcracker = pubRes.body.data.find((c) => c.name === 'The Nutcracker');
    expect(nutcracker).toBeDefined();
  });

  it('Step 7: Verifies restarting server / re-seeding does not recreate the deleted client', async () => {
    // Simulate server reboot by running initDb and runSeed
    await initDb();
    await runSeed();

    const inDbAfterRestart = db.prepare('SELECT id FROM clients WHERE name = ?').get(testClientName);
    expect(inDbAfterRestart).toBeUndefined();

    const pubRes = await request(app).get('/api/clients');
    const found = pubRes.body.data.some((c) => c.name === testClientName);
    expect(found).toBe(false);
  });

  it('Step 8: Verifies historical deleted brands (Saudia Airlines & White Oak) also do not return', async () => {
    const pubRes = await request(app).get('/api/clients');
    const saudiaFound = pubRes.body.data.some((c) => c.name.toLowerCase().includes('saudia'));
    const whiteOakFound = pubRes.body.data.some((c) => c.name.toLowerCase() === 'white oak');
    expect(saudiaFound).toBe(false);
    expect(whiteOakFound).toBe(false);
  });
});
