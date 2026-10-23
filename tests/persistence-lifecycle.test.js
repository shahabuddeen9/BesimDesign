/**
 * @file /tests/persistence-lifecycle.test.js
 * @description Comprehensive persistence, synchronization, and re-seed protection test suite.
 * Verifies that Create, Edit, Unpublish, Publish, and Delete operations for
 * Projects, Clients, and Testimonials correctly persist and synchronize
 * between the admin API and public website endpoints, and that re-seeding/server-restarts
 * NEVER overwrite user changes or restore deleted items.
 */

import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import app from '../server/app.js';
import env from '../server/config/env.js';
import db from '../server/db/index.js';
import runSeed from '../server/db/seed.js';

describe('Admin-to-Website Persistence and Lifecycle Verification', () => {
  let authCookie = null;

  beforeAll(async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: env.ADMIN_EMAIL,
        password: env.ADMIN_PASSWORD,
      });

    const cookies = loginRes.headers['set-cookie'];
    authCookie = cookies.find((c) => c.startsWith('token='));
  });

  // =========================================================================
  // 1. PROJECTS LIFECYCLE & PERSISTENCE
  // =========================================================================
  describe('Projects: Full Lifecycle & No-Overwrite Guarantee', () => {
    let testProjId = null;
    const testSlug = `persistence-test-hotel-${Date.now()}`;

    it('1. Admin creates a published project -> visible publicly', async () => {
      const res = await request(app)
        .post('/api/admin/projects')
        .set('Cookie', [authCookie])
        .send({
          title: 'Aura Luxury Hotel & Sky Bar',
          slug: testSlug,
          category: 'hotels',
          client_name: 'Aura Hospitality Group',
          location: 'Marine Drive, Mumbai',
          area_sqft: 18000,
          description: 'A bespoke 50-key boutique hotel with panoramic ocean views.',
          scope: ['MEP Engineering', 'Acoustic Ceilings', 'Turnkey Fitout'],
          image_url: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=800&q=80',
          is_featured: 1,
          is_published: 1,
          sort_order: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      testProjId = res.body.data.id;

      // Verify public API returns it
      const pubRes = await request(app).get('/api/projects?category=hotels');
      expect(pubRes.status).toBe(200);
      const found = pubRes.body.data.find((p) => p.slug === testSlug);
      expect(found).toBeDefined();
      expect(found.title).toBe('Aura Luxury Hotel & Sky Bar');
    });

    it('2. Admin edits project title and location -> reflected publicly immediately', async () => {
      const res = await request(app)
        .patch(`/api/admin/projects/${testProjId}`)
        .set('Cookie', [authCookie])
        .send({
          title: 'Aura Luxury Hotel & Sky Bar — Phase 2',
          location: 'Nariman Point, Mumbai',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Aura Luxury Hotel & Sky Bar — Phase 2');

      const pubRes = await request(app).get('/api/projects?category=hotels');
      const found = pubRes.body.data.find((p) => p.slug === testSlug);
      expect(found).toBeDefined();
      expect(found.title).toBe('Aura Luxury Hotel & Sky Bar — Phase 2');
      expect(found.location).toBe('Nariman Point, Mumbai');
    });

    it('3. Admin unpublishes project (is_published: 0) -> hidden from public, retained in admin', async () => {
      const res = await request(app)
        .patch(`/api/admin/projects/${testProjId}`)
        .set('Cookie', [authCookie])
        .send({ is_published: 0 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify hidden on public website
      const pubRes = await request(app).get('/api/projects?category=hotels');
      const foundInPublic = pubRes.body.data.find((p) => p.slug === testSlug);
      expect(foundInPublic).toBeUndefined();

      // Verify retained in admin panel
      const adminRes = await request(app)
        .get('/api/admin/projects')
        .set('Cookie', [authCookie]);
      const foundInAdmin = adminRes.body.data.find((p) => p.id === testProjId);
      expect(foundInAdmin).toBeDefined();
      expect(foundInAdmin.is_published).toBe(0);
    });

    it('4. Admin republishes project (is_published: 1) -> reappears on public website', async () => {
      const res = await request(app)
        .patch(`/api/admin/projects/${testProjId}`)
        .set('Cookie', [authCookie])
        .send({ is_published: 1 });

      expect(res.status).toBe(200);

      const pubRes = await request(app).get('/api/projects?category=hotels');
      const found = pubRes.body.data.find((p) => p.slug === testSlug);
      expect(found).toBeDefined();
    });

    it('5. Simulated server restart / re-seed -> does NOT overwrite project changes', async () => {
      await runSeed();

      const pubRes = await request(app).get('/api/projects?category=hotels');
      const found = pubRes.body.data.find((p) => p.slug === testSlug);
      expect(found).toBeDefined();
      expect(found.title).toBe('Aura Luxury Hotel & Sky Bar — Phase 2');
    });

    it('6. Admin deletes project -> removed from database and public website', async () => {
      const delRes = await request(app)
        .delete(`/api/admin/projects/${testProjId}`)
        .set('Cookie', [authCookie]);

      expect(delRes.status).toBe(200);

      // Verify gone from public API
      const pubRes = await request(app).get('/api/projects');
      const foundPublic = pubRes.body.data.find((p) => p.id === testProjId);
      expect(foundPublic).toBeUndefined();

      // Verify gone from admin API
      const adminRes = await request(app)
        .get('/api/admin/projects')
        .set('Cookie', [authCookie]);
      const foundAdmin = adminRes.body.data.find((p) => p.id === testProjId);
      expect(foundAdmin).toBeUndefined();
    });

    it('7. Simulated server restart / re-seed -> does NOT resurrect deleted project', async () => {
      await runSeed();

      const pubRes = await request(app).get('/api/projects');
      const found = pubRes.body.data.find((p) => p.slug === testSlug);
      expect(found).toBeUndefined();
    });
  });

  // =========================================================================
  // 2. CLIENTS LIFECYCLE & PERSISTENCE
  // =========================================================================
  describe('Clients: Full Lifecycle & Visibility Filtering', () => {
    let testClientId = null;
    const clientName = `Persistence Client Brand ${Date.now()}`;

    it('1. Admin creates featured client -> visible publicly', async () => {
      const res = await request(app)
        .post('/api/admin/clients')
        .set('Cookie', [authCookie])
        .send({
          name: clientName,
          category: 'Hospitality',
          logo_url: 'https://example.com/logo.png',
          website_url: 'https://example.com',
          description: 'Client partnership test',
          is_featured: 1,
          sort_order: 10,
        });

      expect(res.status).toBe(201);
      testClientId = res.body.data.id;

      const pubRes = await request(app).get('/api/clients');
      const found = pubRes.body.data.find((c) => c.id === testClientId);
      expect(found).toBeDefined();
      expect(found.name).toBe(clientName);
    });

    it('2. Admin hides client (is_featured: 0) -> hidden from public, retained in admin', async () => {
      const res = await request(app)
        .patch(`/api/admin/clients/${testClientId}`)
        .set('Cookie', [authCookie])
        .send({ is_featured: 0 });

      expect(res.status).toBe(200);

      const pubRes = await request(app).get('/api/clients');
      const foundPublic = pubRes.body.data.find((c) => c.id === testClientId);
      expect(foundPublic).toBeUndefined();

      const adminRes = await request(app)
        .get('/api/admin/clients')
        .set('Cookie', [authCookie]);
      const foundAdmin = adminRes.body.data.find((c) => c.id === testClientId);
      expect(foundAdmin).toBeDefined();
      expect(foundAdmin.is_featured).toBe(0);
    });

    it('3. Admin deletes client -> removed from database and does not resurrect on re-seed', async () => {
      const delRes = await request(app)
        .delete(`/api/admin/clients/${testClientId}`)
        .set('Cookie', [authCookie]);
      expect(delRes.status).toBe(200);

      await runSeed();

      const adminRes = await request(app)
        .get('/api/admin/clients')
        .set('Cookie', [authCookie]);
      const found = adminRes.body.data.find((c) => c.id === testClientId);
      expect(found).toBeUndefined();
    });
  });

  // =========================================================================
  // 3. TESTIMONIALS LIFECYCLE & PERSISTENCE
  // =========================================================================
  describe('Testimonials: Full Lifecycle & Visibility Filtering', () => {
    let testTestimonialId = null;
    const authorName = `Testimonial Author ${Date.now()}`;

    it('1. Admin creates published testimonial -> visible publicly', async () => {
      const res = await request(app)
        .post('/api/admin/testimonials')
        .set('Cookie', [authCookie])
        .send({
          client_name: authorName,
          business_type: 'Boutique Resort',
          rating: 5,
          review: 'Besim Design delivered exceptional architecture and turnkey fit-out on schedule.',
          is_published: 1,
          sort_order: 2,
        });

      expect(res.status).toBe(201);
      testTestimonialId = res.body.data.id;

      const pubRes = await request(app).get('/api/testimonials');
      const found = pubRes.body.data.find((t) => t.id === testTestimonialId);
      expect(found).toBeDefined();
      expect(found.client_name).toBe(authorName);
    });

    it('2. Admin unpublishes testimonial (is_published: 0) -> hidden from public, retained in admin', async () => {
      const res = await request(app)
        .patch(`/api/admin/testimonials/${testTestimonialId}`)
        .set('Cookie', [authCookie])
        .send({ is_published: 0 });

      expect(res.status).toBe(200);

      const pubRes = await request(app).get('/api/testimonials');
      const foundPublic = pubRes.body.data.find((t) => t.id === testTestimonialId);
      expect(foundPublic).toBeUndefined();

      const adminRes = await request(app)
        .get('/api/admin/testimonials')
        .set('Cookie', [authCookie]);
      const foundAdmin = adminRes.body.data.find((t) => t.id === testTestimonialId);
      expect(foundAdmin).toBeDefined();
      expect(foundAdmin.is_published).toBe(0);
    });

    it('3. Admin deletes testimonial -> permanently removed and preserved across re-seeds', async () => {
      const delRes = await request(app)
        .delete(`/api/admin/testimonials/${testTestimonialId}`)
        .set('Cookie', [authCookie]);
      expect(delRes.status).toBe(200);

      await runSeed();

      const adminRes = await request(app)
        .get('/api/admin/testimonials')
        .set('Cookie', [authCookie]);
      const found = adminRes.body.data.find((t) => t.id === testTestimonialId);
      expect(found).toBeUndefined();
    });
  });
});

