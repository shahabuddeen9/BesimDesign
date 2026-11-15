/**
 * @file /tests/seo_comprehensive.test.js
 * @description Comprehensive technical, structural, SSR, and Schema.org SEO verification.
 */

import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import app from '../server/app.js';
import { initDb } from '../server/db/index.js';

describe('Comprehensive Technical & On-Page SEO Audit', () => {
  beforeAll(async () => {
    await initDb();
  });

  const publicRoutes = [
    '/',
    '/about',
    '/hotels',
    '/hospitality',
    '/residential',
    '/central-kitchen',
    '/showcase',
    '/privacy',
  ];

  it('1. All public pages return HTTP 200, indexable headers, canonical URLs, social cards, and valid JSON-LD', async () => {
    for (const route of publicRoutes) {
      const res = await request(app).get(route);
      expect(res.status, `${route} status`).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.headers['x-robots-tag']).toContain('index, follow');
      expect(res.headers['cache-control']).not.toContain('no-store');

      expect(res.text, `${route} meta robots`).toContain('name="robots" content="index, follow');
      expect(res.text, `${route} favicon`).toContain('href="/favicon.svg"');
      const expectedCanonical = `https://besimdesign.com${route === '/' ? '/' : route}`;
      const canonicalMatches = [...res.text.matchAll(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
      expect(canonicalMatches, `${route} canonical uniqueness`).toEqual([expectedCanonical]);
      expect(res.text, `${route} og:image`).toContain('property="og:image"');
      expect(res.text, `${route} twitter:card`).toContain('name="twitter:card" content="summary_large_image"');

      // Validate all JSON-LD scripts parse cleanly
      const jsonLdMatches = [...res.text.matchAll(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)];
      expect(jsonLdMatches.length, `${route} JSON-LD count`).toBeGreaterThanOrEqual(1);
      for (const m of jsonLdMatches) {
        expect(() => JSON.parse(m[1].trim()), `${route} JSON-LD valid JSON`).not.toThrow();
      }

      // Ensure no internal public .html links remain in href attributes
      const htmlLinks = [...res.text.matchAll(/href=["'](\/[^"'#?]+\.html)/gi)].map((m) => m[1]);
      const unexpectedHtmlLinks = htmlLinks.filter((href) => !href.startsWith('/admin/'));
      expect(unexpectedHtmlLinks, `${route} unexpected .html links`).toEqual([]);
    }
  });

  it('2. Homepage SSR hydrates clients, testimonials, and Organization details in initial HTML', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('data-client-name=');
    expect(res.text).toContain('class="testimonial-card"');
    expect(res.text).toContain('Shahnawaz Shaikh');
    expect(res.text).toContain('Ar. Shahzeb');
    expect(res.text).toContain('+91-98926-99850');
  });

  it('3. Sector pages SSR-render project articles, case study links, and ItemList JSON-LD', async () => {
    const sectors = [
      { route: '/hospitality', prefix: '/hospitality/' },
      { route: '/hotels', prefix: '/hotels/' },
      { route: '/residential', prefix: '/residential/' },
      { route: '/central-kitchen', prefix: '/central-kitchen/' },
    ];

    for (const s of sectors) {
      const res = await request(app).get(s.route);
      expect(res.status).toBe(200);
      expect(res.text).toContain('"@type": "ItemList"');
      expect(res.text).toContain('<article class="hospitality-project-block"');
      expect(res.text).toContain(`href="${s.prefix}`);
    }
  });

  it('4. Project detail SSR page includes Article & BreadcrumbList JSON-LD without duplicate OG tags', async () => {
    const res = await request(app).get('/hospitality/the-nutcracker-jio-mall-bkc');
    expect(res.status).toBe(200);
    expect(res.headers['x-robots-tag']).toContain('index, follow');
    expect(res.text).toContain('"@type": "Article"');
    expect(res.text).toContain('"@type": "BreadcrumbList"');

    const ogTitleMatches = [...res.text.matchAll(/property=["']og:title["']/gi)];
    expect(ogTitleMatches.length).toBe(1);
  });

  it('5. 404, admin, and API endpoints emit noindex directives and 404 has no canonical link', async () => {
    const res404 = await request(app).get('/this-page-definitely-does-not-exist');
    expect(res404.status).toBe(404);
    expect(res404.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(res404.text).toContain('name="robots" content="noindex, nofollow"');
    expect(res404.text).not.toContain('rel="canonical"');

    const resAdmin = await request(app).get('/admin/login.html');
    expect(resAdmin.status).toBe(200);
    expect(resAdmin.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(resAdmin.text).toContain('name="robots" content="noindex, nofollow"');

    const resApi = await request(app).get('/api/projects');
    expect(resApi.status).toBe(200);
    expect(resApi.headers['x-robots-tag']).toBe('noindex, nofollow');
  });

  it('6. robots.txt and favicon.svg are served cleanly with expected content-types', async () => {
    const robots = await request(app).get('/robots.txt');
    expect(robots.status).toBe(200);
    expect(robots.headers['content-type']).toContain('text/plain');
    expect(robots.text).toContain('Disallow: /hospitality-detail.html');
    expect(robots.text).toContain('Sitemap: https://besimdesign.com/sitemap.xml');

    const favicon = await request(app).get('/favicon.svg');
    expect(favicon.status).toBe(200);
    expect(favicon.headers['content-type']).toContain('image/svg+xml');
  });

  it('7. Root HTML templates and public HTML mirrors remain identical', () => {
    const files = [
      'index.html',
      'about.html',
      'hotels.html',
      'hospitality.html',
      'residential.html',
      'central-kitchen.html',
      'showcase.html',
      'hospitality-detail.html',
      'privacy.html',
      '404.html',
    ];
    for (const file of files) {
      const rootContent = fs.readFileSync(path.resolve(process.cwd(), file), 'utf-8');
      const pubContent = fs.readFileSync(path.resolve(process.cwd(), 'public', file), 'utf-8');
      expect(pubContent, `${file} synced with public/${file}`).toBe(rootContent);
    }
  });

  it('8. All SSR and public HTML pages contain zero loading placeholders and zero inline event attributes under strict CSP', async () => {
    const routesToCheck = [
      '/',
      '/about',
      '/hotels',
      '/hospitality',
      '/residential',
      '/central-kitchen',
      '/showcase',
      '/showcase?category=hospitality',
      '/hospitality/the-nutcracker-jio-mall-bkc',
      '/privacy',
    ];

    const loadingPatterns = [
      /Loading featured clients/i,
      /Loading client endorsements/i,
      /Loading hotels projects/i,
      /Loading hospitality projects/i,
      /Loading residential projects/i,
      /Loading central kitchen projects/i,
      /Loading architecture portfolio/i,
      /Loading project detail/i,
    ];

    const inlineAttrRegex = /\son(?:click|load|error|change|submit|keyup|keydown|focus|blur|mouseover|mouseout|mouseenter|mouseleave)=/i;

    for (const route of routesToCheck) {
      const res = await request(app).get(route);
      expect(res.status, `${route} HTTP 200`).toBe(200);

      const csp = res.headers['content-security-policy'] || '';
      expect(csp, `${route} has CSP header`).toContain("default-src 'self'");
      expect(csp, `${route} must not weaken script-src-attr with unsafe-inline`).not.toMatch(/script-src-attr[^;]*'unsafe-inline'/i);

      for (const pat of loadingPatterns) {
        expect(res.text, `${route} must not expose placeholder ${pat}`).not.toMatch(pat);
      }

      expect(res.text, `${route} must not contain inline on*= event attributes`).not.toMatch(inlineAttrRegex);
    }
  });

  it('9. /showcase SSR renders category metadata, crawlable project links, and ItemList JSON-LD', async () => {
    const res = await request(app).get('/showcase?category=hospitality');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Hospitality &amp; Fine Dining Portfolio');
    expect(res.text).toContain('"@type": "ItemList"');
    expect(res.text).toContain('href="/hospitality/');
    expect(res.text).toContain('class="showcase-tab active" data-category="hospitality"');
    expect(res.text).toContain('window.__INITIAL_SHOWCASE_PROJECTS__');
  });

  it('10. Empty DB / DB fallback never leaves SSR loading placeholders on homepage, sector, or showcase routes', async () => {
    const { db } = await import('../server/db/index.js');
    const origAll = db.all.bind(db);
    db.all = async () => [];
    try {
      for (const route of ['/', '/hotels', '/hospitality', '/residential', '/central-kitchen', '/showcase']) {
        const res = await request(app).get(route);
        expect(res.status, `${route} empty DB status`).toBe(200);
        expect(res.text).not.toMatch(/Loading (featured clients|client endorsements|hotels projects|hospitality projects|residential projects|central kitchen projects|architecture portfolio)/i);
      }
    } finally {
      db.all = origAll;
    }
  });

  it('11. Vercel serverless entry (api/index.js) routes SSR paths, query params, detail pages, sitemap, and API cleanly', async () => {
    const http = await import('http');
    const { default: vercelHandler } = await import('../api/index.js');
    const vercelApp = http.createServer((req, res) => {
      vercelHandler(req, res);
    });

    const showcaseRes = await request(vercelApp).get('/api/index?__ssr=/showcase&category=hospitality');
    expect(showcaseRes.status).toBe(200);
    expect(showcaseRes.text).toContain('Hospitality &amp; Fine Dining Portfolio');

    const homeRes = await request(vercelApp).get('/api/index?__ssr=/');
    expect(homeRes.status).toBe(200);
    expect(homeRes.text).toContain('Shahnawaz Shaikh');

    const hotelsRes = await request(vercelApp).get('/api/index?__ssr=/hotels');
    expect(hotelsRes.status).toBe(200);
    expect(hotelsRes.text).toContain('"@type": "ItemList"');

    const detailRes = await request(vercelApp).get('/hospitality/foo-asian-tapas-bkc');
    expect(detailRes.status).toBe(200);
    expect(detailRes.text).toContain('FOO Asian Tapas');

    const sitemapRes = await request(vercelApp).get('/sitemap.xml');
    expect(sitemapRes.status).toBe(200);
    expect(sitemapRes.text).toContain('https://besimdesign.com/showcase');

    const apiRes = await request(vercelApp).get('/api/projects');
    expect(apiRes.status).toBe(200);
    expect(apiRes.body.success).toBe(true);
  });
});

