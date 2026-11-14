/**
 * @file /server/controllers/sitemap.controller.js
 * @description Dynamic SEO sitemap generator for Besim Design.
 * Queries PostgreSQL/SQLite for currently published, active, non-tombstoned projects
 * with valid canonical category routes, excluding deleted, unpublished, or aliased items.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db/index.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const publicPath = path.resolve(projectRoot, 'public');
const distPath = path.resolve(projectRoot, 'dist');

export const DOMAIN = 'https://besimdesign.com';

// Canonical slug aliases (for mapping old/short aliases to canonical URLs)
export const SLUG_ALIASES = {
  'the-nutcracker': 'the-nutcracker-jio-mall-bkc',
  'the-nutcracker-cafe': 'the-nutcracker-jio-mall-bkc',
  'foo': 'foo-asian-tapas-bkc',
  'foo-asian-tapas': 'foo-asian-tapas-bkc',
  'royal-china': 'royal-china-bandra',
  'grand-pavilion': 'grand-pavilion-luxury-hotel',
  'solstice-bay': 'solstice-bay-boutique-hotel',
  'sky-villa': 'sky-villa-parinee-bkc',
  'sea-facing-penthouse': 'sea-facing-penthouse-worli',
  'cloud-culinary': 'cloud-culinary-central-kitchen',
  'artisan-confectionery': 'artisan-confectionery-central-kitchen',
};

// Static public pages that always exist and return HTTP 200
export const STATIC_PAGES = [
  { path: '', priority: '1.0', changefreq: 'weekly' },
  { path: '/about', priority: '0.8', changefreq: 'monthly' },
  { path: '/hotels', priority: '0.8', changefreq: 'monthly' },
  { path: '/hospitality', priority: '0.8', changefreq: 'monthly' },
  { path: '/central-kitchen', priority: '0.8', changefreq: 'monthly' },
  { path: '/residential', priority: '0.8', changefreq: 'monthly' },
  { path: '/showcase', priority: '0.7', changefreq: 'weekly' },
  { path: '/privacy', priority: '0.3', changefreq: 'yearly' },
];

/**
 * Normalizes database category values to their public canonical URL route prefix.
 * Returns null if the category has no valid public URL route.
 */
export function normalizeCategoryForUrl(category) {
  if (!category) return null;
  const cat = String(category).toLowerCase().trim().replace(/_/g, '-');
  if (cat === 'hotels' || cat === 'hotel') return 'hotels';
  if (cat === 'hospitality') return 'hospitality';
  if (cat === 'residential') return 'residential';
  if (cat === 'central-kitchen' || cat === 'centralkitchen') return 'central-kitchen';
  return null;
}

/**
 * Formats a date value into YYYY-MM-DD format for XML sitemaps,
 * ensuring no future dates are ever emitted.
 */
function formatDate(dateVal, maxDateStr) {
  const todayStr = maxDateStr || new Date().toISOString().split('T')[0];
  if (!dateVal) {
    return todayStr;
  }
  try {
    const d = new Date(dateVal);
    if (!isNaN(d.getTime())) {
      const iso = d.toISOString().split('T')[0];
      return iso > todayStr ? todayStr : iso;
    }
  } catch (_) {}
  const fallback = String(dateVal).split(' ')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(fallback)) {
    return fallback > todayStr ? todayStr : fallback;
  }
  return todayStr;
}

/**
 * Resolves the filesystem modification date for a static HTML template,
 * clamped to today's date.
 */
function getStaticPageMtime(pagePath, todayStr) {
  const filename = pagePath === '' ? 'index.html' : `${pagePath.replace(/^\//, '')}.html`;
  const candidates = [
    path.resolve(publicPath, filename),
    path.resolve(projectRoot, filename),
  ];
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        if (stat && stat.mtime && stat.mtime.getUTCFullYear() >= 2024) {
          return formatDate(stat.mtime, todayStr);
        }
      }
    } catch (_) {}
  }
  return todayStr;
}

/**
 * Queries active, published, non-tombstoned projects from the active database.
 * Supports both PostgreSQL and SQLite via the unified db adapter.
 */
export async function getActivePublishedProjects() {
  const sql = `
    SELECT id, title, slug, category, updated_at, created_at, is_published
    FROM projects
    WHERE is_published = 1
      AND slug IS NOT NULL
      AND slug != ''
      AND id NOT IN (SELECT project_id FROM deleted_projects WHERE project_id IS NOT NULL)
      AND slug NOT IN (SELECT slug FROM deleted_projects WHERE slug IS NOT NULL)
    ORDER BY sort_order ASC, created_at DESC
  `;
  const rows = await db.all(sql);
  return rows || [];
}

/**
 * Builds the complete list of valid canonical sitemap entries.
 */
export async function buildSitemapEntries() {
  const entries = [];
  const seenUrls = new Set();
  const todayStr = new Date().toISOString().split('T')[0];

  // Fetch active published projects first so sector/showcase lastmod reflects real DB content updates
  const activeProjects = await getActivePublishedProjects();

  const latestByCategory = {};
  let latestOverall = '';

  for (const proj of activeProjects) {
    const routeCategory = normalizeCategoryForUrl(proj.category);
    if (!routeCategory) continue;
    const projDate = formatDate(proj.updated_at || proj.created_at, todayStr);
    if (!latestOverall || projDate > latestOverall) {
      latestOverall = projDate;
    }
    if (!latestByCategory[routeCategory] || projDate > latestByCategory[routeCategory]) {
      latestByCategory[routeCategory] = projDate;
    }
  }

  // 1. Static public category & informational pages
  for (const page of STATIC_PAGES) {
    const loc = `${DOMAIN}${page.path === '' ? '/' : page.path}`;
    if (!seenUrls.has(loc)) {
      seenUrls.add(loc);
      const fileMtime = getStaticPageMtime(page.path, todayStr);
      const sectorKey = page.path.replace(/^\//, '');
      let lastmod = fileMtime;
      if (latestByCategory[sectorKey]) {
        lastmod = latestByCategory[sectorKey] > fileMtime ? latestByCategory[sectorKey] : fileMtime;
      } else if ((page.path === '' || page.path === '/showcase') && latestOverall) {
        lastmod = latestOverall > fileMtime ? latestOverall : fileMtime;
      }
      entries.push({
        loc,
        lastmod: lastmod > todayStr ? todayStr : lastmod,
        changefreq: page.changefreq,
        priority: page.priority,
      });
    }
  }

  // 2. Active published project detail pages
  for (const proj of activeProjects) {
    const routeCategory = normalizeCategoryForUrl(proj.category);
    // Exclude projects whose category does not map to a public route (e.g. 'restaurant')
    if (!routeCategory) {
      continue;
    }

    // Resolve canonical slug if this is an alias
    let cleanSlug = String(proj.slug).trim().toLowerCase();
    if (SLUG_ALIASES[cleanSlug]) {
      cleanSlug = SLUG_ALIASES[cleanSlug];
    }

    const loc = `${DOMAIN}/${routeCategory}/${cleanSlug}`;
    if (!seenUrls.has(loc)) {
      seenUrls.add(loc);
      entries.push({
        loc,
        lastmod: formatDate(proj.updated_at || proj.created_at, todayStr),
        changefreq: 'monthly',
        priority: '0.7',
      });
    }
  }

  return entries;
}

/**
 * Generates valid XML sitemap string from entries.
 */
export function formatSitemapXml(entries) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  for (const entry of entries) {
    xml += '  <url>\n';
    xml += `    <loc>${entry.loc}</loc>\n`;
    xml += `    <lastmod>${entry.lastmod}</lastmod>\n`;
    xml += `    <changefreq>${entry.changefreq}</changefreq>\n`;
    xml += `    <priority>${entry.priority}</priority>\n`;
    xml += '  </url>\n';
  }

  xml += '</urlset>\n';
  return xml;
}

/**
 * Express Controller: GET /sitemap.xml
 */
export async function getSitemapXml(req, res, next) {
  try {
    const entries = await buildSitemapEntries();
    const xml = formatSitemapXml(entries);

    // Sync disk sitemap asynchronously to keep static backups pristine
    try {
      const publicSitemap = path.resolve(publicPath, 'sitemap.xml');
      fs.writeFileSync(publicSitemap, xml, 'utf-8');
      if (fs.existsSync(distPath)) {
        fs.writeFileSync(path.resolve(distPath, 'sitemap.xml'), xml, 'utf-8');
      }
    } catch (_) {}

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    return res.status(200).send(xml);
  } catch (error) {
    logger.error('Error generating sitemap XML due to database failure:', error);
    res.status(503);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    const safeMsg = String(error?.message || 'Database connection failure').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<error><status>503</status><message>Database unavailable for sitemap generation: ${safeMsg}</message></error>`);
  }
}

export default {
  DOMAIN,
  STATIC_PAGES,
  SLUG_ALIASES,
  normalizeCategoryForUrl,
  getActivePublishedProjects,
  buildSitemapEntries,
  formatSitemapXml,
  getSitemapXml,
};
