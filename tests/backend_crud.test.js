/**
 * @file /tests/backend_crud.test.js
 * @description Comprehensive test suite for clients, FAQs, testimonials,
 * company profile download, and CSV export filtering.
 */

import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import app from '../server/app.js';
import env from '../server/config/env.js';
import db from '../server/db/index.js';

describe('Backend CRUD, Downloads & Filtered Export', () => {
  let authCookie = null;
  let clientId = null;
  let faqId = null;
  let testimonialId = null;

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

  // 1. Clients API
  describe('Clients API', () => {
    it('GET /api/clients returns list of published clients', async () => {
      const res = await request(app).get('/api/clients');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('POST /api/admin/clients creates a new client brand', async () => {
      const res = await request(app)
        .post('/api/admin/clients')
        .set('Cookie', [authCookie])
        .send({
          name: 'Grand Hyatt Turnkey Test',
          category: 'Hospitality & Hotels',
          logo_url: 'https://example.com/logo.jpg',
          website_url: 'https://hyatt.com',
          description: 'Luxury hotel project',
          is_featured: 1,
          sort_order: 5,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Grand Hyatt Turnkey Test');
      clientId = res.body.data.id;
    });

    it('PATCH /api/admin/clients/:id updates client brand', async () => {
      const res = await request(app)
        .patch(`/api/admin/clients/${clientId}`)
        .set('Cookie', [authCookie])
        .send({
          name: 'Grand Hyatt Turnkey Test (Updated)',
          sort_order: 1,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toContain('(Updated)');
    });

    it('DELETE /api/admin/clients/:id deletes client brand', async () => {
      const res = await request(app)
        .delete(`/api/admin/clients/${clientId}`)
        .set('Cookie', [authCookie]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // 2. FAQs API
  describe('FAQs API', () => {
    it('GET /api/faqs returns published FAQs', async () => {
      const res = await request(app).get('/api/faqs');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('POST /api/admin/faqs creates a new FAQ', async () => {
      const res = await request(app)
        .post('/api/admin/faqs')
        .set('Cookie', [authCookie])
        .send({
          question: 'What is the standard turnaround time for preliminary drawings?',
          answer: 'Preliminary architectural plans and layouts are typically prepared within 5 to 7 working days.',
          sort_order: 10,
          is_published: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      faqId = res.body.data.id;
    });

    it('PATCH /api/admin/faqs/:id updates FAQ', async () => {
      const res = await request(app)
        .patch(`/api/admin/faqs/${faqId}`)
        .set('Cookie', [authCookie])
        .send({
          answer: 'Preliminary architectural plans and layouts are completed within 3 to 5 business days for expedited briefs.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.answer).toContain('3 to 5 business days');
    });

    it('DELETE /api/admin/faqs/:id deletes FAQ', async () => {
      const res = await request(app)
        .delete(`/api/admin/faqs/${faqId}`)
        .set('Cookie', [authCookie]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // 3. Testimonials API
  describe('Testimonials API', () => {
    it('GET /api/testimonials returns published testimonials', async () => {
      const res = await request(app).get('/api/testimonials');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('POST /api/admin/testimonials creates a new testimonial', async () => {
      const res = await request(app)
        .post('/api/admin/testimonials')
        .set('Cookie', [authCookie])
        .send({
          client_name: 'Anil Kapoor',
          business_type: 'Central Kitchen Operations',
          rating: 5,
          review: 'Besim Design transformed our 15,000 sq.ft commissary with impeccable MEP and hygiene layouts.',
          is_published: 1,
          sort_order: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      testimonialId = res.body.data.id;
    });

    it('PATCH /api/admin/testimonials/:id updates testimonial', async () => {
      const res = await request(app)
        .patch(`/api/admin/testimonials/${testimonialId}`)
        .set('Cookie', [authCookie])
        .send({
          rating: 5,
          is_published: 1,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('DELETE /api/admin/testimonials/:id deletes testimonial', async () => {
      const res = await request(app)
        .delete(`/api/admin/testimonials/${testimonialId}`)
        .set('Cookie', [authCookie]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // 4. Download Company Profile
  describe('Public Downloads & PDF Generation', () => {
    it('GET /api/download/company-profile downloads PDF deck and records metric', async () => {
      const res = await request(app).get('/api/download/company-profile');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('Besim-Design-Company-Profile.pdf');
    });
  });

  // 5. Filtered CSV Export
  describe('Filtered CSV Export', () => {
    it('GET /api/admin/enquiries/export.csv returns CSV with headers and records', async () => {
      const res = await request(app)
        .get('/api/admin/enquiries/export.csv?status=new')
        .set('Cookie', [authCookie]);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('"Client Name"');
      expect(res.text).toContain('"Business Type"');
    });
  });

  // 6. DB Transaction Test
  describe('Database Transaction Support', () => {
    it('rolls back on error and commits on success', () => {
      const initialCount = db.prepare('SELECT COUNT(*) as c FROM faqs').get().c;

      // Failed transaction
      expect(() => {
        const failingTx = db.transaction(() => {
          db.prepare('INSERT INTO faqs (question, answer, created_at, updated_at) VALUES (?, ?, datetime("now"), datetime("now"))')
            .run('Temporary Question', 'Temporary Answer');
          throw new Error('Forced rollback test');
        });
        failingTx();
      }).toThrow('Forced rollback test');

      const countAfterRollback = db.prepare('SELECT COUNT(*) as c FROM faqs').get().c;
      expect(countAfterRollback).toBe(initialCount);

      // Successful transaction
      const successTx = db.transaction(() => {
        db.prepare('INSERT INTO faqs (question, answer, created_at, updated_at) VALUES (?, ?, datetime("now"), datetime("now"))')
          .run('Tx Question Success', 'Tx Answer Success');
      });
      successTx();

      const countAfterCommit = db.prepare('SELECT COUNT(*) as c FROM faqs').get().c;
      expect(countAfterCommit).toBe(initialCount + 1);

      // Clean up
      db.prepare('DELETE FROM faqs WHERE question = ?').run('Tx Question Success');
    });
  });

  // 7. Central Kitchen Dedicated Route & Filtering Test
  describe('Central Kitchen Dedicated Page & Filtering API', () => {
    it('GET /central-kitchen serves dedicated Central Kitchen showcase page', async () => {
      const res = await request(app).get('/central-kitchen');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('Central Kitchen & Commissary Architecture');
      expect(res.text).toContain('centralKitchenGrid');
    });

    it('GET /api/projects?exclude=central_kitchen excludes central kitchen projects from main page', async () => {
      const res = await request(app).get('/api/projects?exclude=central_kitchen');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.every((p) => p.category !== 'central_kitchen')).toBe(true);
    });

    it('GET /api/projects?category=central_kitchen returns ONLY central kitchen projects for dedicated page', async () => {
      const res = await request(app).get('/api/projects?category=central_kitchen');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.every((p) => p.category === 'central_kitchen')).toBe(true);
    });
  });
});
