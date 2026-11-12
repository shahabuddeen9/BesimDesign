import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import app from '../server/app.js';
import { db, initDb } from '../server/db/index.js';
import { buildSitemapEntries, formatSitemapXml, DOMAIN } from '../server/controllers/sitemap.controller.js';

describe('Sitemap Audit & Lifecycle Verification Suite', () => {
  beforeAll(async () => {
    await initDb();
  });

  describe('1. Live Endpoint Structure & Validity', () => {
    it('GET /sitemap.xml serves XML with 200 OK and correct headers', async () => {
      const res = await request(app).get('/sitemap.xml');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('xml');
      expect(res.headers['cache-control']).toContain('public');
      expect(res.text).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(res.text).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    });

    it('GET /api/sitemap.xml is also accessible and serves identical sitemap', async () => {
      const res = await request(app).get('/api/sitemap.xml');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('xml');
      expect(res.text).toContain('<loc>https://www.besimdesign.com/</loc>');
    });
  });

  describe('2. Public Category & Static Pages Inclusion', () => {
    it('Includes all 8 canonical public pages', async () => {
      const res = await request(app).get('/sitemap.xml');
      const expectedPages = [
        'https://www.besimdesign.com/',
        'https://www.besimdesign.com/about',
        'https://www.besimdesign.com/hotels',
        'https://www.besimdesign.com/hospitality',
        'https://www.besimdesign.com/central-kitchen',
        'https://www.besimdesign.com/residential',
        'https://www.besimdesign.com/showcase',
        'https://www.besimdesign.com/privacy',
      ];

      for (const page of expectedPages) {
        expect(res.text).toContain(`<loc>${page}</loc>`);
      }
    });

    it('Does NOT include internal or non-indexable routes in sitemap', async () => {
      const res = await request(app).get('/sitemap.xml');
      expect(res.text).not.toContain('/admin');
      expect(res.text).not.toContain('/api');
      expect(res.text).not.toContain('/404');
      expect(res.text).not.toContain('.html');
    });
  });

  describe('3. Active Published Projects Inclusion', () => {
    it('Includes all 9 verified canonical active projects', async () => {
      const res = await request(app).get('/sitemap.xml');
      const canonicalProjects = [
        'https://www.besimdesign.com/central-kitchen/cloud-culinary-central-kitchen',
        'https://www.besimdesign.com/central-kitchen/artisan-confectionery-central-kitchen',
        'https://www.besimdesign.com/hotels/grand-pavilion-luxury-hotel',
        'https://www.besimdesign.com/hotels/solstice-bay-boutique-hotel',
        'https://www.besimdesign.com/hospitality/the-nutcracker-jio-mall-bkc',
        'https://www.besimdesign.com/hospitality/foo-asian-tapas-bkc',
        'https://www.besimdesign.com/hospitality/royal-china-bandra',
        'https://www.besimdesign.com/residential/sky-villa-parinee-bkc',
        'https://www.besimdesign.com/residential/sea-facing-penthouse-worli',
      ];

      for (const url of canonicalProjects) {
        expect(res.text).toContain(`<loc>${url}</loc>`);
      }
    });
  });

  describe('4. Exclusion of Deleted & Tombstoned Projects', () => {
    it('Excludes all deleted_projects tombstones from sitemap', async () => {
      const res = await request(app).get('/sitemap.xml');
      const deletedRows = await db.all('SELECT slug FROM deleted_projects WHERE slug IS NOT NULL');

      for (const row of deletedRows) {
        if (row.slug) {
          expect(res.text).not.toContain(row.slug);
        }
      }
    });

    it('Returns HTTP 404 for deleted/tombstoned project URLs on frontend', async () => {
      const tombstoneRes = await request(app).get('/hospitality/persistence-test-hotel-1792819838447');
      expect(tombstoneRes.status).toBe(404);
    });
  });

  describe('5. Exclusion of Unpublished Projects', () => {
    it('Excludes unpublished projects (is_published = 0) from sitemap', async () => {
      // Create a test unpublished project
      const testSlug = `draft-project-${Date.now()}`;
      await db.run(`
        INSERT INTO projects (title, slug, category, description, image_url, is_published, created_at, updated_at)
        VALUES (?, ?, 'hospitality', 'Draft test description', 'https://images.unsplash.com/photo-draft.jpg', 0, datetime('now'), datetime('now'))
      `, 'Unpublished Draft Project', testSlug);

      const res = await request(app).get('/sitemap.xml');
      expect(res.text).not.toContain(testSlug);

      // Verify URL returns 404
      const pageRes = await request(app).get(`/hospitality/${testSlug}`);
      expect(pageRes.status).toBe(404);

      // Clean up test draft
      await db.run('DELETE FROM projects WHERE slug = ?', testSlug);
    });
  });

  describe('6. Exclusion of Redirected Aliases & Preservation of 301s', () => {
    it('Excludes shortened aliases from sitemap but preserves 301 redirects', async () => {
      const res = await request(app).get('/sitemap.xml');

      // The alias 'the-nutcracker' must NOT appear as a sitemap URL
      expect(res.text).not.toContain('<loc>https://www.besimdesign.com/hospitality/the-nutcracker</loc>');
      expect(res.text).not.toContain('<loc>https://www.besimdesign.com/hotels/grand-pavilion</loc>');
      expect(res.text).not.toContain('<loc>https://www.besimdesign.com/residential/sky-villa</loc>');

      // But requesting the alias MUST 301 redirect to the canonical URL
      const redirRes1 = await request(app).get('/hospitality/the-nutcracker');
      expect(redirRes1.status).toBe(301);
      expect(redirRes1.headers.location).toBe('/hospitality/the-nutcracker-jio-mall-bkc');

      const redirRes2 = await request(app).get('/hotels/grand-pavilion');
      expect(redirRes2.status).toBe(301);
      expect(redirRes2.headers.location).toBe('/hotels/grand-pavilion-luxury-hotel');
    });
  });

  describe('7. Every URL in the Sitemap returns HTTP 200', () => {
    it('All URLs listed in sitemap are publicly accessible and return 200 OK', async () => {
      const entries = await buildSitemapEntries();
      expect(entries.length).toBeGreaterThanOrEqual(17);

      for (const entry of entries) {
        const pathPart = entry.loc.replace('https://www.besimdesign.com', '') || '/';
        const res = await request(app).get(pathPart);
        expect(res.status).toBe(200);
      }
    });
  });
});
