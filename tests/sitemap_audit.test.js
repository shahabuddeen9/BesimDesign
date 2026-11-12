import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// Set test mode before loading the application/database modules. The DB adapter
// guarantees NODE_ENV=test always uses a fresh in-memory SQLite database.
process.env.NODE_ENV = 'test';

const [{ default: app }, databaseModule, sitemapModule, pathModule] = await Promise.all([
  import('../server/app.js'),
  import('../server/db/index.js'),
  import('../server/controllers/sitemap.controller.js'),
  import('../server/utils/vercel-path.js'),
]);

const { db, initDb, getIsPostgres } = databaseModule;
const { buildSitemapEntries, DOMAIN } = sitemapModule;
const { resolveVercelRequestUrl } = pathModule;

const fixtures = [
  {
    id: 805,
    title: 'The Foo Kitchen',
    slug: 'the-foo-central-kitchen',
    category: 'central_kitchen',
    path: '/central-kitchen/the-foo-central-kitchen',
  },
  {
    id: 806,
    title: 'Grand Pavilion Luxury Hotel',
    slug: 'grand-pavilion-luxury-hotel',
    category: 'hotels',
    path: '/hotels/grand-pavilion-luxury-hotel',
  },
  {
    id: 809,
    title: 'FOO Asian Tapas',
    slug: 'foo-asian-tapas-bkc',
    category: 'hospitality',
    path: '/hospitality/foo-asian-tapas-bkc',
  },
  {
    id: 812,
    title: 'Sea-Facing Penthouse',
    slug: 'sea-facing-penthouse-worli',
    category: 'residential',
    path: '/residential/sea-facing-penthouse-worli',
  },
];

async function insertProject(project) {
  await db.run(
    "INSERT INTO projects (id, title, slug, category, client_name, location, area_sqft, description, scope, image_url, gallery, is_featured, sort_order, is_published, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
    project.id,
    project.title,
    project.slug,
    project.category,
    project.client_name || 'Besim Design Client',
    project.location || 'Mumbai, Maharashtra',
    project.area_sqft || 1200,
    project.description || ('Unique description for ' + project.title + ' by Besim Design.'),
    JSON.stringify(project.scope || ['Architecture', 'Interior Execution']),
    project.image_url || 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c',
    JSON.stringify(project.gallery || []),
    0,
    project.sort_order || 0,
    project.is_published === undefined ? 1 : project.is_published
  );
}

beforeAll(async () => {
  await initDb();
  expect(getIsPostgres()).toBe(false);

  // This cleanup is confined to the fresh in-memory test database above.
  await db.run('DELETE FROM projects');
  await db.run('DELETE FROM deleted_projects');

  for (const project of fixtures) await insertProject(project);

  await insertProject({
    id: 900,
    title: 'Tombstoned Project',
    slug: 'tombstoned-project',
    category: 'hospitality',
  });
  await db.run(
    "INSERT INTO deleted_projects (project_id, slug, title, deleted_at) VALUES (?, ?, ?, datetime('now'))",
    900,
    'tombstoned-project',
    'Tombstoned Project'
  );

  await insertProject({
    id: 901,
    title: 'Draft Project',
    slug: 'draft-project',
    category: 'hospitality',
    is_published: 0,
  });
  await insertProject({
    id: 902,
    title: null,
    slug: 'project-without-title',
    category: 'hospitality',
  });
});

describe('Technical SEO project rendering and sitemap', () => {
  it('uses an isolated in-memory test database, never PostgreSQL', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(getIsPostgres()).toBe(false);
  });

  it('generates exactly 12 URLs: eight static pages and four active project pages', async () => {
    const entries = await buildSitemapEntries();
    expect(entries).toHaveLength(12);
    expect(entries.filter((entry) => /\/(hospitality|hotels|residential|central-kitchen)\//.test(entry.loc))).toHaveLength(4);
    expect(entries.every((entry) => entry.loc.startsWith(DOMAIN))).toBe(true);
    expect(entries.some((entry) => entry.loc.includes('tombstoned-project'))).toBe(false);
    expect(entries.some((entry) => entry.loc.includes('draft-project'))).toBe(false);
    expect(entries.some((entry) => entry.loc.includes('project-without-title'))).toBe(false);
  });

  it('returns project-specific SEO metadata and H1 in each initial HTML response', async () => {
    for (const project of fixtures) {
      const response = await request(app).get(project.path);
      const canonical = DOMAIN + project.path;

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('<title>' + project.title + ' |');
      expect(response.text).toContain('<meta name="description" content="Unique description for ' + project.title);
      expect(response.text).toContain('<link rel="canonical" href="' + canonical + '">');
      expect(response.text).toContain('property="og:title"');
      expect(response.text).toContain('property="og:description"');
      expect(response.text).toContain('property="og:url" content="' + canonical + '"');
      expect(response.text).toContain('id="projectTitle"');
      expect(response.text).toContain('id="projectNarrative"');
      expect(response.text).toContain(project.title);
      expect(response.text).toContain('id="projectContentState" style="display:block;"');
      expect(response.text).toContain('application/ld+json');
    }
  });

  it('returns HTTP 404 for unknown, tombstoned, unpublished, invalid and title-less slugs', async () => {
    const cases = [
      '/hospitality/this-project-does-not-exist',
      '/hospitality/tombstoned-project',
      '/hospitality/draft-project',
      '/hospitality/project-without-title',
      '/hospitality/invalid_slug',
    ];
    for (const url of cases) {
      const response = await request(app).get(url);
      expect(response.status).toBe(404);
    }
  });

  it('keeps 301 redirects only for aliases whose target is currently active', async () => {
    const fooAlias = await request(app).get('/hospitality/foo');
    expect(fooAlias.status).toBe(301);
    expect(fooAlias.headers.location).toBe('/hospitality/foo-asian-tapas-bkc');

    const hotelAlias = await request(app).get('/hotels/grand-pavilion');
    expect(hotelAlias.status).toBe(301);
    expect(hotelAlias.headers.location).toBe('/hotels/grand-pavilion-luxury-hotel');

    const removedAlias = await request(app).get('/hospitality/the-nutcracker');
    expect(removedAlias.status).toBe(404);
  });

  it('serves exact active project JSON and returns 404 for unknown or partial slugs', async () => {
    const active = await request(app).get('/api/projects/foo-asian-tapas-bkc');
    expect(active.status).toBe(200);
    expect(active.body.data.slug).toBe('foo-asian-tapas-bkc');

    const unknown = await request(app).get('/api/projects/unknown-project-slug');
    expect(unknown.status).toBe(404);

    const partial = await request(app).get('/api/projects/foo-asian');
    expect(partial.status).toBe(404);
  });

  it('returns a complete 200 sitemap with eight static pages and four active project pages', async () => {
    const response = await request(app).get('/sitemap.xml');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('xml');
    expect(response.text).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(response.text).toContain('<loc>' + DOMAIN + '/</loc>');
    expect(response.text).toContain('<loc>' + DOMAIN + '/hospitality/foo-asian-tapas-bkc</loc>');
    expect(response.text).not.toContain('tombstoned-project');
  });

  it('returns a server error instead of a successful stale sitemap when the database fails', async () => {
    const spy = vi.spyOn(db, 'all').mockRejectedValueOnce(new Error('simulated database failure'));
    try {
      const response = await request(app).get('/sitemap.xml');
      expect(response.status).toBe(500);
      expect(response.text).not.toContain('<urlset');
    } finally {
      spy.mockRestore();
    }
  });

  it('restores public project paths after Vercel rewrites and preserves visitor query parameters', () => {
    const projectPath = resolveVercelRequestUrl({
      url: '/api/index?__page=%2Fhospitality%2Ffoo-asian-tapas-bkc&utm_source=test',
      query: { __page: '/hospitality/foo-asian-tapas-bkc' },
      headers: {},
    });
    expect(projectPath).toBe('/hospitality/foo-asian-tapas-bkc?utm_source=test');

    expect(resolveVercelRequestUrl({
      url: '/api/index?__page=%2Fsitemap.xml',
      query: { __page: '/sitemap.xml' },
      headers: {},
    })).toBe('/api/sitemap.xml');

    expect(resolveVercelRequestUrl({
      url: '/api/projects/foo-asian-tapas-bkc',
      query: {},
      headers: {},
    })).toBe('/api/projects/foo-asian-tapas-bkc');
  });

  it('allows public projects GET routes in robots.txt but keeps private API routes disallowed', () => {
    const robots = fs.readFileSync(path.resolve(process.cwd(), 'public/robots.txt'), 'utf8');
    expect(robots).toContain('Disallow: /api/');
    expect(robots).toContain('Allow: /api/projects$');
    expect(robots).toContain('Allow: /api/projects/');
    expect(robots).toContain('Disallow: /admin/');
  });

  it('routes Vercel project URLs and sitemap requests through the database-aware handler', () => {
    const config = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8'));
    const expectedRoutes = [
      ['/sitemap.xml', '/api/index?__page=%2Fsitemap.xml'],
      ['/hospitality/:slug', '/api/index?__page=%2Fhospitality%2F:slug'],
      ['/hotels/:slug', '/api/index?__page=%2Fhotels%2F:slug'],
      ['/residential/:slug', '/api/index?__page=%2Fresidential%2F:slug'],
      ['/central-kitchen/:slug', '/api/index?__page=%2Fcentral-kitchen%2F:slug'],
    ];
    for (const [source, destination] of expectedRoutes) {
      const rule = config.rewrites.find((item) => item.source === source);
      expect(rule).toBeTruthy();
      expect(rule.destination).toBe(destination);
    }
  });
});
