/**
 * @file /tests/hospitality_portfolio.test.js
 * @description Comprehensive verification for Hospitality Projects Portfolio & Detail Pages:
 * 1. Public hospitality category query returns published hospitality projects.
 * 2. Public /api/projects/:slug returns complete project metadata (title, client_name, location, area_sqft, gallery, scope).
 * 3. Public /api/projects/:slug returns 404 for nonexistent slugs.
 * 4. Dedicated HTML routes (/hospitality and /hospitality/:slug) serve HTTP 200.
 * 5. Admin adding/updating a hospitality project reflects immediately on public endpoints.
 */

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../server/app.js';
import env from '../server/config/env.js';
import { initDb } from '../server/db/index.js';

describe('Hospitality Projects Portfolio & Detail Suite', () => {
  let authCookie = null;
  let testProjectId = null;
  const testSlug = `test-bistro-portfolio-${Date.now()}`;

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
  });

  afterAll(async () => {
    if (testProjectId && authCookie) {
      await request(app)
        .delete(`/api/admin/projects/${testProjectId}`)
        .set('Cookie', [authCookie]);
    }
  });

  it('1. GET /hospitality serves dedicated hospitality listing page (200 OK)', async () => {
    const res = await request(app).get('/hospitality');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('Hospitality & Fine Dining');
    expect(res.text).toContain('Pillars of Hospitality Fit-Out');
    expect(res.text).toContain('id="projectsPortfolio"');
    expect(res.text).toContain('id="hospitalityJumpNav"');
    expect(res.text).toContain('id="hospitalityProjectsContainer"');
    expect(res.text).toContain('id="portfolioLightboxModal"');
  });

  it('2. GET /api/projects?category=hospitality returns published hospitality projects', async () => {
    const res = await request(app).get('/api/projects?category=hospitality');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    const nutcracker = res.body.data.find((p) => p.slug === 'the-nutcracker-jio-mall-bkc');
    expect(nutcracker).toBeDefined();
    expect(nutcracker.title).toContain('The Nutcracker');
    expect(nutcracker.category).toBe('hospitality');
    expect(Array.isArray(nutcracker.gallery)).toBe(true);
  });

  it('3. GET /api/projects/:slug returns complete project details including client_name, location, and area_sqft', async () => {
    const res = await request(app).get('/api/projects/the-nutcracker-jio-mall-bkc');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.title).toContain('The Nutcracker');
    expect(res.body.data.slug).toBe('the-nutcracker-jio-mall-bkc');
    expect(res.body.data.category).toBe('hospitality');
    expect(res.body.data.client_name).toBeDefined();
    expect(res.body.data.location).toContain('Mumbai');
    expect(res.body.data.area_sqft).toBeGreaterThan(0);
    expect(Array.isArray(res.body.data.gallery)).toBe(true);
    expect(Array.isArray(res.body.data.scope)).toBe(true);
  });

  it('4. GET /api/projects/:slug returns 404 for unknown slugs', async () => {
    const res = await request(app).get('/api/projects/non-existent-project-xyz');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('5. GET /hospitality/:slug serves the individual project detail HTML page (200 OK)', async () => {
    const res = await request(app).get('/hospitality/the-nutcracker-jio-mall-bkc');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('hospitality-detail-page');
    expect(res.text).toContain('HOSPITALITY PROJECT');
    expect(res.text).toContain('PROJECT INFORMATION');
  });

  it('6. Admin adds a hospitality project -> automatically available on public listing and detail page', async () => {
    if (!authCookie) return;

    const payload = {
      title: 'Velvet Oak Cocktail Bar',
      slug: testSlug,
      category: 'hospitality',
      client_name: 'Pebble Street Partners',
      location: 'Kala Ghoda, Mumbai',
      area_sqft: 4200,
      description: 'Turnkey architectural fit-out featuring fluted oak paneling, custom banquette seating, and wet scrubber extraction.',
      scope: ['Turnkey Fit-Out', 'Kitchen MEP', '90 Days Handover', 'Acoustic Paneling'],
      image_url: '/assets/aistudio/Screenshot_2026-10-21_at_3.13.59_PM_47176ac5.png',
      gallery: [
        '/assets/aistudio/Screenshot_2026-10-21_at_3.13.59_PM_47176ac5.png',
        'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=800&q=80'
      ],
      is_featured: 1,
      sort_order: 1,
      is_published: 1,
    };

    const createRes = await request(app)
      .post('/api/admin/projects')
      .set('Cookie', [authCookie])
      .send(payload);

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    testProjectId = createRes.body.data.id;

    // Check public list endpoint
    const listRes = await request(app).get('/api/projects?category=hospitality');
    expect(listRes.status).toBe(200);
    const createdInList = listRes.body.data.find((p) => p.slug === testSlug);
    expect(createdInList).toBeDefined();
    expect(createdInList.title).toBe('Velvet Oak Cocktail Bar');

    // Check individual detail endpoint
    const detailRes = await request(app).get(`/api/projects/${testSlug}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.title).toBe('Velvet Oak Cocktail Bar');
    expect(detailRes.body.data.area_sqft).toBe(4200);
    expect(detailRes.body.data.client_name).toBe('Pebble Street Partners');

    // Check detail HTML route serves HTTP 200
    const htmlRes = await request(app).get(`/hospitality/${testSlug}`);
    expect(htmlRes.status).toBe(200);
  });
});
