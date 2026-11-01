/**
 * @file /tests/client_logo_upload.test.js
 * @description Verifies:
 * 1. Logo upload to image storage system returns clean URL path (/uploads/...) and never raw Base64 dataUri.
 * 2. Adding Brand Client with uploaded logo URL succeeds (201) without Request Entity Too Large (413).
 * 3. Editing Brand Client with new uploaded logo URL succeeds (200) without Request Entity Too Large (413).
 * 4. Image is retrievable via GET /uploads/:filename.
 * 5. Existing clients (The Nutcracker, FOO Asian Tapas) remain completely unchanged.
 * 6. Proper error handling for invalid upload types and missing files.
 */

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../server/app.js';
import env from '../server/config/env.js';
import { db, initDb } from '../server/db/index.js';

describe('Brand Client Logo Upload & 413 Payload Protection', () => {
  let authCookie = null;
  let testClientId = null;
  let uploadedLogoUrl1 = null;
  let uploadedLogoUrl2 = null;
  let uploadedFilename1 = null;
  const uniqueClientName = `Luxury Cafe & Lounge ${Date.now()}`;

  // Small valid 1x1 transparent PNG buffer
  const validPngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );

  beforeAll(async () => {
    await initDb();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: env.ADMIN_EMAIL,
        password: env.ADMIN_PASSWORD,
      });

    const cookies = loginRes.headers['set-cookie'];
    authCookie = cookies ? cookies.find((c) => c.startsWith('token=')) : null;
    expect(authCookie).toBeTruthy();
  });

  afterAll(async () => {
    // Clean up temporary test client
    if (testClientId) {
      await request(app)
        .delete(`/api/admin/clients/${testClientId}`)
        .set('Cookie', [authCookie]);
    }
  });

  it('1. Uploads client logo separately and returns clean URL path (NEVER raw Base64)', async () => {
    const res = await request(app)
      .post('/api/admin/upload')
      .set('Cookie', [authCookie])
      .attach('image', validPngBuffer, 'client-logo-1.png');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.url).toBeTruthy();
    expect(res.body.url).not.toMatch(/^data:image\//);
    expect(res.body.url).toMatch(/^\/uploads\/|^https?:\/\//);
    expect(res.body.filename).toBeTruthy();

    uploadedLogoUrl1 = res.body.url;
    uploadedFilename1 = res.body.filename;
  });

  it('2. Retrieves uploaded logo via /uploads/:filename endpoint', async () => {
    expect(uploadedFilename1).toBeTruthy();
    const res = await request(app).get(`/uploads/${uploadedFilename1}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/(png|jpeg|webp)/);
  });

  it('3. Adds new brand client using the uploaded image URL without 413 error', async () => {
    const payload = {
      name: uniqueClientName,
      category: 'Hospitality & Luxury Dining',
      logo_url: uploadedLogoUrl1,
      website_url: 'https://luxurycafelounge.example.com',
      description: 'Architectural interior planning and hospitality bar execution.',
      sort_order: 10,
      is_featured: 1,
    };

    const res = await request(app)
      .post('/api/admin/clients')
      .set('Cookie', [authCookie])
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeTruthy();
    expect(res.body.data.name).toBe(uniqueClientName);
    expect(res.body.data.logo_url).toBe(uploadedLogoUrl1);

    testClientId = res.body.data.id;
  });

  it('4. Uploads replacement logo for editing client', async () => {
    const res = await request(app)
      .post('/api/admin/upload')
      .set('Cookie', [authCookie])
      .attach('image', validPngBuffer, 'client-logo-2-replacement.png');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.url).not.toMatch(/^data:image\//);
    expect(res.body.url).toMatch(/^\/uploads\/|^https?:\/\//);

    uploadedLogoUrl2 = res.body.url;
  });

  it('5. Edits existing brand client with new uploaded logo URL without 413 error', async () => {
    expect(testClientId).toBeTruthy();

    const updatePayload = {
      name: `${uniqueClientName} (Updated)`,
      logo_url: uploadedLogoUrl2,
      category: 'Fine Dining & Lounge',
    };

    const res = await request(app)
      .patch(`/api/admin/clients/${testClientId}`)
      .set('Cookie', [authCookie])
      .send(updatePayload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe(`${uniqueClientName} (Updated)`);
    expect(res.body.data.logo_url).toBe(uploadedLogoUrl2);

    // Verify persistence via GET /api/admin/clients
    const listRes = await request(app)
      .get('/api/admin/clients')
      .set('Cookie', [authCookie]);

    expect(listRes.status).toBe(200);
    const found = listRes.body.data.find((c) => c.id.toString() === testClientId.toString());
    expect(found).toBeTruthy();
    expect(found.logo_url).toBe(uploadedLogoUrl2);
    expect(found.logo_url).not.toMatch(/^data:image\//);
  });

  it('6. Existing client records (The Nutcracker, FOO Asian Tapas) remain unchanged', async () => {
    const res = await request(app)
      .get('/api/admin/clients')
      .set('Cookie', [authCookie]);

    expect(res.status).toBe(200);
    const clients = res.body.data;

    const nutcracker = clients.find((c) => c.name === 'The Nutcracker');
    expect(nutcracker).toBeTruthy();
    expect(nutcracker.logo_url).toBe('https://green-square.co.in/wp-content/uploads/2025/07/Nutcracker.jpg');

    const foo = clients.find((c) => c.name === 'FOO Asian Tapas');
    expect(foo).toBeTruthy();
    expect(foo.logo_url).toBe('https://green-square.co.in/wp-content/uploads/2022/05/FOO.jpg');
  });

  it('7. Error handling: rejects invalid file upload types (e.g. txt)', async () => {
    const textBuffer = Buffer.from('This is a text file, not an image');
    const res = await request(app)
      .post('/api/admin/upload')
      .set('Cookie', [authCookie])
      .attach('image', textBuffer, 'test.txt');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('8. Error handling: rejects upload when no file is attached', async () => {
    const res = await request(app)
      .post('/api/admin/upload')
      .set('Cookie', [authCookie]);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('9. Cafe Niloufer is present in public and admin clients with accessible permanent logo', async () => {
    // Check public endpoint
    const pubRes = await request(app).get('/api/clients');
    expect(pubRes.status).toBe(200);
    expect(pubRes.body.success).toBe(true);

    const nilouferPub = pubRes.body.data.find((c) => c.name === 'Cafe Niloufer');
    expect(nilouferPub).toBeTruthy();
    expect(nilouferPub.logo_url).toBeTruthy();
    expect(nilouferPub.logo_url).not.toMatch(/^data:image\//);

    // Verify logo URL responds with valid 200 and image mime type
    const logoRes = await request(app).get(nilouferPub.logo_url);
    expect(logoRes.status).toBe(200);
    expect(logoRes.headers['content-type']).toMatch(/^image\//);

    // Check admin endpoint and ensure exactly ONE record exists (no duplicates)
    const adminRes = await request(app)
      .get('/api/admin/clients')
      .set('Cookie', [authCookie]);
    expect(adminRes.status).toBe(200);

    const matchingAdminRecords = adminRes.body.data.filter((c) => c.name.toLowerCase() === 'cafe niloufer');
    expect(matchingAdminRecords.length).toBe(1);
    expect(matchingAdminRecords[0].logo_url).toBe(nilouferPub.logo_url);
  });
});
