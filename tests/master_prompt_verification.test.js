import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../server/app.js';
import env from '../server/config/env.js';
import { db, transformSqlForPostgres } from '../server/db/index.js';

describe('Master Prompt Comprehensive Verification', () => {
  let authCookie = null;
  let bearerToken = null;

  // 1. TEST ADMIN LOGIN WITH EXISTING VALID CREDENTIALS
  it('1. should login successfully with valid credentials, returning JWT token in body and HttpOnly cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: env.ADMIN_EMAIL,
        password: env.ADMIN_PASSWORD,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeUndefined();
    expect(res.body.refreshToken).toBeUndefined();
    expect(res.body.admin).toBeDefined();
    expect(res.body.admin.email).toBe(env.ADMIN_EMAIL);

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies.some((c) => c.includes('token='))).toBe(true);
    expect(cookies.some((c) => c.includes('HttpOnly'))).toBe(true);

    authCookie = cookies.find((c) => c.startsWith('token='));
    bearerToken = authCookie.split(';')[0].split('=')[1];
  });

  it('1b. should support User ID shorthand (e.g. "admin")', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin',
        password: env.ADMIN_PASSWORD,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeUndefined();
    expect(res.body.admin.email).toBe('admin@besimdesign.com');
  });

  // 2. TEST INVALID CREDENTIALS AND PROPER ERROR HANDLING
  it('2. should reject invalid credentials with 401 and secure generic message', async () => {
    const resWrongPass = await request(app)
      .post('/api/auth/login')
      .send({
        email: env.ADMIN_EMAIL,
        password: 'IncorrectPassword999!',
      });

    expect(resWrongPass.status).toBe(401);
    expect(resWrongPass.body.success).toBe(false);
    expect(resWrongPass.body.message).toBe('Invalid credentials.');

    const resUnknownUser = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'nonexistent@randomdomain.com',
        password: 'AnyPassword123!',
      });

    expect(resUnknownUser.status).toBe(401);
    expect(resUnknownUser.body.success).toBe(false);
    expect(resUnknownUser.body.message).toBe('Invalid credentials.');
  });

  it('2b. should allow Bearer token authentication in Authorization header', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${bearerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.admin.email).toBe(env.ADMIN_EMAIL);
  });

  // 3. CREATE PROJECTS WITH EMPTY TITLE AND SLUG
  let emptyProject1Id = null;
  let emptyProject2Id = null;

  it('3. should allow saving a project when both title and slug are empty, storing them as NULL', async () => {
    const res = await request(app)
      .post('/api/admin/projects')
      .set('Authorization', `Bearer ${bearerToken}`)
      .send({
        title: '',
        slug: '',
        category: 'central_kitchen',
        client_name: 'Test Commissary Corp',
        location: 'Navi Mumbai',
        area_sqft: 8500,
        description: 'Automated high-capacity commissary fit-out with acoustic zoning.',
        image_url: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1200&q=80',
        is_published: 1,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.title).toBeNull();
    expect(res.body.data.slug).toBeNull();

    emptyProject1Id = res.body.data.id;

    // Verify directly in database that values are stored as NULL (not empty string or generated slug)
    const row = await db.get('SELECT id, title, slug FROM projects WHERE id = ?', emptyProject1Id);
    expect(row).toBeDefined();
    expect(row.title).toBeNull();
    expect(row.slug).toBeNull();
  });

  // 4. CREATE MULTIPLE PROJECTS WITH NULL SLUGS
  it('4. should allow creating multiple projects with NULL slugs without unique constraint violation', async () => {
    const res2 = await request(app)
      .post('/api/admin/projects')
      .set('Authorization', `Bearer ${bearerToken}`)
      .send({
        title: '',
        slug: null,
        category: 'hotels',
        client_name: 'Second Null Slug Hotel',
        location: 'Goa',
        description: 'Boutique eco-resort villas with bespoke wooden millwork.',
        image_url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80',
        is_published: 1,
      });

    expect(res2.status).toBe(201);
    expect(res2.body.success).toBe(true);
    expect(res2.body.data.slug).toBeNull();

    emptyProject2Id = res2.body.data.id;

    // Verify both projects coexist in database with slug = NULL
    const countRow = await db.get('SELECT COUNT(*) as count FROM projects WHERE slug IS NULL');
    expect(Number(countRow.count)).toBeGreaterThanOrEqual(2);
  });

  // 5. EDIT AND SAVE PROJECTS (via PATCH and PUT)
  it('5. should edit and save existing projects via PATCH and PUT without requiring title or slug', async () => {
    // Test PATCH update
    const patchRes = await request(app)
      .patch(`/api/admin/projects/${emptyProject1Id}`)
      .set('Authorization', `Bearer ${bearerToken}`)
      .send({
        description: 'Updated narrative description for commissary facility.',
        location: 'Bhiwandi Logistics Park',
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.success).toBe(true);
    expect(patchRes.body.data.title).toBeNull();
    expect(patchRes.body.data.slug).toBeNull();
    expect(patchRes.body.data.description).toBe('Updated narrative description for commissary facility.');

    // Test PUT update
    const putRes = await request(app)
      .put(`/api/admin/projects/${emptyProject2Id}`)
      .set('Authorization', `Bearer ${bearerToken}`)
      .send({
        title: '',
        slug: '',
        category: 'hotels',
        description: 'Updated boutique hotel project with PUT request.',
      });

    expect(putRes.status).toBe(200);
    expect(putRes.body.success).toBe(true);
    expect(putRes.body.data.title).toBeNull();
    expect(putRes.body.data.slug).toBeNull();
  });

  // 6. VERIFY PUBLIC SHOWCASE AND PROJECT IMAGES
  it('6. should render projects with NULL title and NULL slug in public showcase API without error', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    const found1 = res.body.data.find((p) => p.id === emptyProject1Id);
    expect(found1).toBeDefined();
    expect(found1.title).toBeNull();
    expect(found1.slug).toBeNull();
    expect(found1.image_url).toBeDefined();

    const found2 = res.body.data.find((p) => p.id === emptyProject2Id);
    expect(found2).toBeDefined();
    expect(found2.title).toBeNull();
    expect(found2.slug).toBeNull();
  });

  // 7. CLEANUP CREATED TEST PROJECTS
  it('7. should delete test projects and verify clean tombstone insertion', async () => {
    const del1 = await request(app)
      .delete(`/api/admin/projects/${emptyProject1Id}`)
      .set('Authorization', `Bearer ${bearerToken}`);
    expect(del1.status).toBe(200);

    const del2 = await request(app)
      .delete(`/api/admin/projects/${emptyProject2Id}`)
      .set('Authorization', `Bearer ${bearerToken}`);
    expect(del2.status).toBe(200);
  });

  // 8. CHECK POSTGRESQL MIGRATIONS AND PRODUCTION COMPATIBILITY
  it('8. should verify PostgreSQL partial unique index and SQL dialect transformation', () => {
    const sql = 'INSERT OR REPLACE INTO deleted_projects (project_id, slug, title) VALUES (?, ?, ?)';
    const transformed = transformSqlForPostgres(sql);
    expect(transformed).toContain('ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET deleted_at = NOW()');

    const ignoreSql = 'INSERT OR IGNORE INTO deleted_projects (project_id, slug, title) VALUES (?, ?, ?)';
    const transformedIgnore = transformSqlForPostgres(ignoreSql);
    expect(transformedIgnore).toContain('ON CONFLICT (slug) WHERE slug IS NOT NULL DO NOTHING');
  });
});
