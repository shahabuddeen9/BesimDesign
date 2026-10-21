/**
 * @file /tests/projects.test.js
 * @description Test suite for full CRUD lifecycle of commercial architecture projects,
 * including public category filtering and administrative modifications.
 */

import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import app from '../server/app.js';
import env from '../server/config/env.js';

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

  it('should allow admin to delete a project', async () => {
    const res = await request(app)
      .delete(`/api/admin/projects/${createdProjectId}`)
      .set('Cookie', [authCookie]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify it is no longer retrievable
    const checkRes = await request(app).get(`/api/projects/${uniqueSlug}`);
    expect(checkRes.status).toBe(404);
  });
});
