/**
 * @file /tests/projects.test.js
 * @description Test suite for full CRUD lifecycle of commercial architecture projects,
 * including public category filtering and administrative modifications.
 */

import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import app from '../server/app.js';
import env from '../server/config/env.js';
import { transformSqlForPostgres } from '../server/db/index.js';

describe('Projects Lifecycle & Public Filtering', () => {
  let authCookie = null;
  let createdProjectId = null;
  const uniqueSlug = `test-luxury-bistro-${Date.now()}`;

  beforeAll(async () => {
    // Authenticate as admin to obtain cookie
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: env.ADMIN_EMAIL,
        password: env.ADMIN_PASSWORD,
      });

    const cookies = loginRes.headers['set-cookie'];
    authCookie = cookies.find((c) => c.startsWith('token='));
  });

  it('should allow admin to create a new commercial project', async () => {
    const payload = {
      title: 'Aura Modern Bistronomy',
      slug: uniqueSlug,
      category: 'restaurant',
      description: 'A 5,000 sq.ft state-of-the-art culinary destination with acoustic ceilings.',
      scope: ['Space Planning', 'Kitchen MEP', 'Interior Architecture'],
      image_url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80',
      gallery: [
        'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=800&q=80'
      ],
      is_featured: 1,
      sort_order: 10,
      is_published: 1,
    };

    const res = await request(app)
      .post('/api/admin/projects')
      .set('Cookie', [authCookie])
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.slug).toBe(uniqueSlug);

    createdProjectId = res.body.data.id;
  });

  it('should fetch published projects via public API', async () => {
    const res = await request(app).get('/api/projects');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.some((p) => p.slug === uniqueSlug)).toBe(true);
  });

  it('should filter projects by category in public API', async () => {
    const res = await request(app).get('/api/projects?category=restaurant');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.every((p) => p.category === 'restaurant')).toBe(true);
  });

  it('should filter projects exclusively by category=central_kitchen', async () => {
    const res = await request(app).get('/api/projects?category=central_kitchen');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((p) => p.category === 'central_kitchen')).toBe(true);
  });

  it('should exclude central_kitchen projects when ?exclude=central_kitchen is passed', async () => {
    const res = await request(app).get('/api/projects?exclude=central_kitchen');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((p) => p.category !== 'central_kitchen')).toBe(true);
  });

  it('should serve /central-kitchen clean route returning 200 HTML', async () => {
    const res = await request(app).get('/central-kitchen');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('should retrieve single project by slug', async () => {
    const res = await request(app).get(`/api/projects/${uniqueSlug}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.slug).toBe(uniqueSlug);
    expect(Array.isArray(res.body.data.scope)).toBe(true);
  });

  it('should allow admin to update a project', async () => {
    const res = await request(app)
      .patch(`/api/admin/projects/${createdProjectId}`)
      .set('Cookie', [authCookie])
      .send({
        title: 'Aura Modern Bistronomy & Rooftop Lounge (Updated)',
        is_featured: 0,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toContain('(Updated)');
    expect(res.body.data.is_featured).toBe(0);
  });

  it('should allow admin to reorder projects', async () => {
    const res = await request(app)
      .post('/api/admin/projects/reorder')
      .set('Cookie', [authCookie])
      .send({
        orders: [
          { id: createdProjectId, sort_order: 99 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should allow admin to add multiple photos to a selected project (supporting 4-5 photos)', async () => {
    const photosToAdd = [
      'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=800&q=80',
    ];

    const res = await request(app)
      .post(`/api/admin/projects/${createdProjectId}/photos`)
      .set('Cookie', [authCookie])
      .send({ urls: photosToAdd });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.gallery.length).toBeGreaterThanOrEqual(4);
  });

  it('should allow admin to set a specific photo as primary cover', async () => {
    const newCoverUrl = 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80';

    const res = await request(app)
      .patch(`/api/admin/projects/${createdProjectId}/photos/cover`)
      .set('Cookie', [authCookie])
      .send({ url: newCoverUrl });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.image_url).toBe(newCoverUrl);
  });

  it('should allow admin to delete a photo from the selected project', async () => {
    const photoToDelete = 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=800&q=80';

    const res = await request(app)
      .delete(`/api/admin/projects/${createdProjectId}/photos`)
      .set('Cookie', [authCookie])
      .send({ url: photoToDelete });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.gallery.includes(photoToDelete)).toBe(false);
  });

  it('should transform SQLite deleted_projects queries into valid PostgreSQL with WHERE slug IS NOT NULL', () => {
    const replaceSql = transformSqlForPostgres('INSERT OR REPLACE INTO deleted_projects (project_id, slug, title) VALUES (?, ?, ?)');
    expect(replaceSql).toContain('ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET deleted_at = NOW()');

    const ignoreSql = transformSqlForPostgres('INSERT OR IGNORE INTO deleted_projects (project_id, slug, title) VALUES (?, ?, ?)');
    expect(ignoreSql).toContain('ON CONFLICT (slug) WHERE slug IS NOT NULL DO NOTHING');
  });

  it('should allow admin to delete a project and verify removal while preserving unrelated projects', async () => {
    // 1. Get initial project list to verify other projects exist
    const initialList = await request(app).get('/api/projects');
    expect(initialList.status).toBe(200);
    const otherProjects = initialList.body.data.filter((p) => p.id !== createdProjectId);
    expect(otherProjects.length).toBeGreaterThan(0);

    // 2. Perform deletion
    const res = await request(app)
      .delete(`/api/admin/projects/${createdProjectId}`)
      .set('Cookie', [authCookie]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.deletedId).toBe(createdProjectId);
    expect(res.body.deletedSlug).toBe(uniqueSlug);

    // 3. Verify deleted project is no longer retrievable by slug or in public list
    const checkRes = await request(app).get(`/api/projects/${uniqueSlug}`);
    expect(checkRes.status).toBe(404);

    const publicList = await request(app).get('/api/projects');
    expect(publicList.body.data.some((p) => p.slug === uniqueSlug)).toBe(false);

    // 4. Verify unrelated projects are preserved
    expect(publicList.body.data.length).toBe(otherProjects.length);
    for (const other of otherProjects) {
      expect(publicList.body.data.some((p) => p.id === other.id)).toBe(true);
    }

    // 5. Verify deleted project is removed from admin portal list as well
    const adminList = await request(app)
      .get('/api/admin/projects')
      .set('Cookie', [authCookie]);
    expect(adminList.status).toBe(200);
    expect(adminList.body.data.some((p) => p.slug === uniqueSlug)).toBe(false);
  });

  it('should allow admin to create a project with empty/null title and empty/null slug', async () => {
    const payload = {
      title: '',
      slug: '',
      category: 'hotels',
      description: 'A boutique luxury hotel property with turnkey architectural execution.',
      scope: ['Lobby Millwork', 'Executive Suites'],
      image_url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
      is_published: 1,
    };

    const res = await request(app)
      .post('/api/admin/projects')
      .set('Cookie', [authCookie])
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.title).toBeNull();
    expect(res.body.data.slug).toBeNull();
    expect(res.body.data.id).toBeDefined();

    const emptySlugProjectId1 = res.body.data.id;

    // Verify it appears in published projects
    const pubRes = await request(app).get('/api/projects');
    expect(pubRes.status).toBe(200);
    const found1 = pubRes.body.data.find((p) => p.id === emptySlugProjectId1);
    expect(found1).toBeDefined();
    expect(found1.title).toBeNull();
    expect(found1.slug).toBeNull();

    // Clean up
    await request(app)
      .delete(`/api/admin/projects/${emptySlugProjectId1}`)
      .set('Cookie', [authCookie]);
  });

  it('should allow multiple projects with empty/null slug simultaneously without constraint violation', async () => {
    const p1 = {
      title: 'Project Without Slug 1',
      slug: null,
      category: 'hospitality',
      description: 'Exclusive lounge fit-out without slug.',
      image_url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80',
      is_published: 1,
    };

    const p2 = {
      title: 'Project Without Slug 2',
      slug: '',
      category: 'residential',
      description: 'Sea-facing penthouse without slug.',
      image_url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
      is_published: 1,
    };

    const res1 = await request(app)
      .post('/api/admin/projects')
      .set('Cookie', [authCookie])
      .send(p1);
    expect(res1.status).toBe(201);
    expect(res1.body.data.slug).toBeNull();

    const res2 = await request(app)
      .post('/api/admin/projects')
      .set('Cookie', [authCookie])
      .send(p2);
    expect(res2.status).toBe(201);
    expect(res2.body.data.slug).toBeNull();

    // Both projects must coexist in database
    const pubRes = await request(app).get('/api/projects');
    expect(pubRes.status).toBe(200);
    expect(pubRes.body.data.some((p) => p.id === res1.body.data.id)).toBe(true);
    expect(pubRes.body.data.some((p) => p.id === res2.body.data.id)).toBe(true);

    // Update project 1 to clear its title
    const updateRes = await request(app)
      .patch(`/api/admin/projects/${res1.body.data.id}`)
      .set('Cookie', [authCookie])
      .send({ title: '', slug: '' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.title).toBeNull();
    expect(updateRes.body.data.slug).toBeNull();

    // Clean up
    await request(app).delete(`/api/admin/projects/${res1.body.data.id}`).set('Cookie', [authCookie]);
    await request(app).delete(`/api/admin/projects/${res2.body.data.id}`).set('Cookie', [authCookie]);
  });

  it('should reject creation only when actual required fields (description, category) are missing', async () => {
    // Missing description
    const resNoDesc = await request(app)
      .post('/api/admin/projects')
      .set('Cookie', [authCookie])
      .send({
        title: '',
        slug: '',
        category: 'hotels',
        description: '',
        image_url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
      });
    expect(resNoDesc.status).toBe(400);
    expect(resNoDesc.body.message).not.toContain('Please provide a project title and narrative description');
    const descError = resNoDesc.body.errors?.find((e) => e.field === 'description');
    expect(descError).toBeDefined();

    // Missing category
    const resNoCat = await request(app)
      .post('/api/admin/projects')
      .set('Cookie', [authCookie])
      .send({
        category: '',
        description: 'Valid description here',
        image_url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
      });
    expect(resNoCat.status).toBe(400);
    expect(resNoCat.body.message).not.toContain('Please provide a project title and narrative description');
    const catError = resNoCat.body.errors?.find((e) => e.field === 'category');
    expect(catError).toBeDefined();
  });
});
