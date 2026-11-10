/**
 * @file /tests/url_routing_audit.test.js
 * @description Technical audit tests for URL optimization, routing, 301 redirects,
 * slug alias handling, trailing slashes, and multi-category project pages.
 */

import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import app from '../server/app.js';
import env from '../server/config/env.js';
import { initDb } from '../server/db/index.js';

describe('URL Optimization, Routing & SEO Audit Suite', () => {
  beforeAll(async () => {
    await initDb();
  });

  describe('1. Canonical Domain & Host Redirects', () => {
    it('301 redirects apex domain besimdesign.com to www.besimdesign.com', async () => {
      const res = await request(app)
        .get('/hospitality')
        .set('Host', 'besimdesign.com');
      
      expect(res.status).toBe(301);
      expect(res.headers.location).toBe('https://www.besimdesign.com/hospitality');
    });

    it('Preserves query strings on canonical domain redirect', async () => {
      const res = await request(app)
        .get('/about?ref=social')
        .set('Host', 'besimdesign.com');
      
      expect(res.status).toBe(301);
      expect(res.headers.location).toBe('https://www.besimdesign.com/about?ref=social');
    });
  });

  describe('2. Trailing Slash & Lowercase Normalization', () => {
    it('301 redirects /hospitality/ to /hospitality', async () => {
      const res = await request(app).get('/hospitality/');
      expect(res.status).toBe(301);
      expect(res.headers.location).toBe('/hospitality');
    });

    it('301 redirects /hotels/ to /hotels', async () => {
      const res = await request(app).get('/hotels/');
      expect(res.status).toBe(301);
      expect(res.headers.location).toBe('/hotels');
    });

    it('301 redirects uppercase path /Hotels to /hotels', async () => {
      const res = await request(app).get('/Hotels');
      expect(res.status).toBe(301);
      expect(res.headers.location).toBe('/hotels');
    });

    it('301 redirects /Residential/ to /residential', async () => {
      const res = await request(app).get('/Residential/');
      expect(res.status).toBe(301);
      expect(res.headers.location).toBe('/residential');
    });
  });

  describe('3. Legacy .html Extensions 301 Permanent Redirects', () => {
    it('301 redirects /index.html to /', async () => {
      const res = await request(app).get('/index.html');
      expect(res.status).toBe(301);
      expect(res.headers.location).toBe('/');
    });

    it('301 redirects /about.html to /about', async () => {
      const res = await request(app).get('/about.html');
      expect(res.status).toBe(301);
      expect(res.headers.location).toBe('/about');
    });

    it('301 redirects /hospitality.html to /hospitality', async () => {
      const res = await request(app).get('/hospitality.html');
      expect(res.status).toBe(301);
      expect(res.headers.location).toBe('/hospitality');
    });

    it('301 redirects /hotels.html to /hotels', async () => {
      const res = await request(app).get('/hotels.html');
      expect(res.status).toBe(301);
      expect(res.headers.location).toBe('/hotels');
    });

    it('301 redirects /residential.html to /residential', async () => {
      const res = await request(app).get('/residential.html');
      expect(res.status).toBe(301);
      expect(res.headers.location).toBe('/residential');
    });

    it('301 redirects /central-kitchen.html to /central-kitchen', async () => {
      const res = await request(app).get('/central-kitchen.html');
      expect(res.status).toBe(301);
      expect(res.headers.location).toBe('/central-kitchen');
    });

    it('301 redirects /showcase.html to /showcase', async () => {
      const res = await request(app).get('/showcase.html');
      expect(res.status).toBe(301);
      expect(res.headers.location).toBe('/showcase');
    });

    it('301 redirects /privacy.html to /privacy', async () => {
      const res = await request(app).get('/privacy.html');
      expect(res.status).toBe(301);
      expect(res.headers.location).toBe('/privacy');
    });

    it('301 redirects /contact and /contact.html to /#contact', async () => {
      const res1 = await request(app).get('/contact');
      expect(res1.status).toBe(301);
      expect(res1.headers.location).toBe('/#contact');

      const res2 = await request(app).get('/contact.html');
      expect(res2.status).toBe(301);
      expect(res2.headers.location).toBe('/#contact');
    });
  });

  describe('4. Multi-Category Project Detail Routing', () => {
    it('Serves project detail template on /hospitality/:slug', async () => {
      const res = await request(app).get('/hospitality/the-nutcracker-jio-mall-bkc');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('id="projectContentState"');
      expect(res.text).toContain('id="projectBreadcrumbCategory"');
    });

    it('Serves project detail template on /hotels/:slug', async () => {
      const res = await request(app).get('/hotels/grand-pavilion-luxury-hotel');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('id="projectContentState"');
    });

    it('Serves project detail template on /residential/:slug', async () => {
      const res = await request(app).get('/residential/sky-villa-parinee-bkc');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('id="projectContentState"');
    });

    it('Serves project detail template on /central-kitchen/:slug', async () => {
      const res = await request(app).get('/central-kitchen/cloud-culinary-central-kitchen');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('id="projectContentState"');
    });

    it('301 redirects /hospitality/:slug.html to /hospitality/:slug', async () => {
      const res = await request(app).get('/hospitality/the-nutcracker-jio-mall-bkc.html');
      expect(res.status).toBe(301);
      expect(res.headers.location).toBe('/hospitality/the-nutcracker-jio-mall-bkc');
    });

    it('301 redirects shortened project aliases to canonical slug URL on frontend', async () => {
      const res1 = await request(app).get('/hospitality/the-nutcracker');
      expect(res1.status).toBe(301);
      expect(res1.headers.location).toBe('/hospitality/the-nutcracker-jio-mall-bkc');

      const res2 = await request(app).get('/hotels/grand-pavilion');
      expect(res2.status).toBe(301);
      expect(res2.headers.location).toBe('/hotels/grand-pavilion-luxury-hotel');

      const res3 = await request(app).get('/residential/sky-villa');
      expect(res3.status).toBe(301);
      expect(res3.headers.location).toBe('/residential/sky-villa-parinee-bkc');

      const res4 = await request(app).get('/central-kitchen/cloud-culinary');
      expect(res4.status).toBe(301);
      expect(res4.headers.location).toBe('/central-kitchen/cloud-culinary-central-kitchen');
    });
  });

  describe('5. Slug Alias Resolution in API', () => {
    it('Resolves exact slug via /api/projects/:slug', async () => {
      const res = await request(app).get('/api/projects/the-nutcracker-jio-mall-bkc');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.slug).toBe('the-nutcracker-jio-mall-bkc');
    });

    it('Resolves short alias "the-nutcracker" to full slug', async () => {
      const res = await request(app).get('/api/projects/the-nutcracker');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.slug).toBe('the-nutcracker-jio-mall-bkc');
    });

    it('Resolves short alias "foo-asian-tapas" to full slug', async () => {
      const res = await request(app).get('/api/projects/foo-asian-tapas');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.slug).toBe('foo-asian-tapas-bkc');
    });

    it('Resolves short alias "royal-china" to full slug', async () => {
      const res = await request(app).get('/api/projects/royal-china');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.slug).toBe('royal-china-bandra');
    });

    it('Resolves short alias "sky-villa" to full slug', async () => {
      const res = await request(app).get('/api/projects/sky-villa');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.slug).toBe('sky-villa-parinee-bkc');
    });

    it('Returns 404 for unknown slug', async () => {
      const res = await request(app).get('/api/projects/non-existent-project-xyz');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('6. SEO Assets: robots.txt and sitemap.xml', () => {
    it('GET /robots.txt serves valid directives and sitemap reference', async () => {
      const res = await request(app).get('/robots.txt');
      expect(res.status).toBe(200);
      expect(res.text).toContain('Disallow: /admin/');
      expect(res.text).toContain('Disallow: /api/');
      expect(res.text).toContain('Sitemap: https://www.besimdesign.com/sitemap.xml');
    });

    it('GET /sitemap.xml serves valid XML with canonical URLs', async () => {
      const res = await request(app).get('/sitemap.xml');
      expect(res.status).toBe(200);
      expect(res.text).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(res.text).toContain('<loc>https://www.besimdesign.com/</loc>');
      expect(res.text).toContain('<loc>https://www.besimdesign.com/hospitality</loc>');
      expect(res.text).toContain('<loc>https://www.besimdesign.com/hotels</loc>');
      expect(res.text).toContain('<loc>https://www.besimdesign.com/central-kitchen</loc>');
      expect(res.text).toContain('<loc>https://www.besimdesign.com/residential</loc>');
    });
  });

  describe('7. Administrator Credential Security & JWT Cookie Transmission', () => {
    it('Login does NOT expose access or refresh tokens in JSON response body', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin',
          password: env.ADMIN_PASSWORD,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeUndefined();
      expect(res.body.refreshToken).toBeUndefined();
      expect(res.body.admin).toBeDefined();

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies.some((c) => c.includes('token=') && c.includes('HttpOnly'))).toBe(true);
      expect(cookies.some((c) => c.includes('refreshToken=') && c.includes('HttpOnly'))).toBe(true);
    });

    it('Logout revokes session cookie persistently', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin',
          password: env.ADMIN_PASSWORD,
        });

      const cookies = loginRes.headers['set-cookie'];
      const authCookie = cookies.find((c) => c.startsWith('token='));

      // Access protected endpoint with cookie
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', [authCookie]);
      expect(meRes.status).toBe(200);

      // Perform logout
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', [authCookie]);
      expect(logoutRes.status).toBe(200);

      // Verify revoked token is now rejected
      const revokedMeRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', [authCookie]);
      expect(revokedMeRes.status).toBe(401);
    });
  });
});

