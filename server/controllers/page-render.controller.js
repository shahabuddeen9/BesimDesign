/**
 * @file /server/controllers/page-render.controller.js
 * @description Server-Side Rendering / HTML Hydration controller for public landing and sector pages
 * (/, /hotels, /hospitality, /residential, /central-kitchen).
 *
 * Ensures search engines (Googlebot) immediately receive complete rendered clients, testimonials,
 * project portfolios, internal links to /<category>/<slug> detail pages, and ItemList JSON-LD
 * in the initial HTTP 200 HTML response.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db/index.js';
import logger from '../utils/logger.js';
import { normalizeCategoryForUrl } from './sitemap.controller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const publicPath = path.resolve(projectRoot, 'public');
const distPath = path.resolve(projectRoot, 'dist');

const DOMAIN = 'https://besimdesign.com';

const CATEGORY_SSR_CONFIG = {
  hotels: {
    filename: 'hotels.html',
    containerId: 'hotelsProjectsContainer',
    kicker: 'HOTEL PROJECT',
    defaultLocation: 'Goa / Mumbai',
    defaultDuration: '120 Days (Turnkey Architectural Handover)',
    listName: 'Besim Design Hotels Architecture Portfolio',
    dbCategories: ['hotels', 'hotel'],
  },
  hospitality: {
    filename: 'hospitality.html',
    containerId: 'hospitalityProjectsContainer',
    kicker: 'HOSPITALITY PROJECT',
    defaultLocation: 'Mumbai, Maharashtra',
    defaultDuration: '90 Days (Turnkey Fast-Track Handover)',
    listName: 'Besim Design Hospitality, Restaurant & Bar Portfolio',
    dbCategories: ['hospitality', 'restaurant', 'bar', 'cafe'],
  },
  residential: {
    filename: 'residential.html',
    containerId: 'residentialProjectsContainer',
    kicker: 'LUXURY RESIDENTIAL PROJECT',
    defaultLocation: 'Mumbai, Maharashtra',
    defaultDuration: '150 Days (Turnkey Architectural Handover)',
    listName: 'Besim Design Luxury Residential Architecture Portfolio',
    dbCategories: ['residential'],
  },
  'central-kitchen': {
    filename: 'central-kitchen.html',
    containerId: 'centralKitchenProjectsContainer',
    kicker: 'CENTRAL KITCHEN PROJECT',
    defaultLocation: 'Mumbai, Maharashtra',
    defaultDuration: '90 Days (Turnkey Industrial Handover)',
    listName: 'Besim Design Central Kitchens Engineering Portfolio',
    dbCategories: ['central_kitchen', 'central-kitchen', 'cloud_kitchen', 'industrial'],
  },
};

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str) {
  return escapeHtml(str);
}

function resolveHtmlFile(filename) {
  const candidates = [
    path.resolve(distPath, filename),
    path.resolve(publicPath, filename),
    path.resolve(projectRoot, filename),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }
  return null;
}

function parseJsonList(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.trim()) {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {
      return val.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

function replaceContainerInnerHtml(html, containerId, innerHtml) {
  const regex = new RegExp(
    `(<div\\s+[^>]*id=["']${containerId}["'][^>]*>)[\\s\\S]*?(<\\/div>\\s*<\\/div>\\s*<\\/section>)`,
    'i'
  );
  if (regex.test(html)) {
    return html.replace(regex, `$1${innerHtml}$2`);
  }
  return html;
}

function buildCategoryProjectBlock(p, pIdx, cfg, routeCat) {
  const scopes = parseJsonList(p.scope);
  const safeTitle = p.title || 'Architectural Project';
  const safeSlug = p.slug || `proj-${p.id}`;
  const catPrefix = normalizeCategoryForUrl(p.category) || routeCat;
  const detailHref = p.slug ? `/${catPrefix}/${p.slug}` : null;

  let displayHeading = safeTitle;
  if (p.location && p.title && !p.title.toLowerCase().includes(p.location.toLowerCase().split(',')[0])) {
    const city = p.location.split(',')[0].trim();
    displayHeading = `${p.title} – ${city}`;
  }

  const durationMatch = scopes.find((s) => /day|month|week|handover|schedule|fast-track/i.test(s));
  const durationText = durationMatch || cfg.defaultDuration;

  const allPhotos = [];
  if (p.image_url) allPhotos.push(p.image_url);
  for (const img of parseJsonList(p.gallery)) {
    if (img && typeof img === 'string' && !allPhotos.includes(img)) {
      allPhotos.push(img);
    }
  }

  const galleryItemsHtml = allPhotos
    .map(
      (imgUrl, imgIdx) => `
          <div class="gallery-item" data-project="${escapeAttr(safeSlug)}" data-index="${imgIdx}">
            <img
              src="${escapeAttr(imgUrl)}"
              alt="${escapeAttr(safeTitle)} – Photograph ${imgIdx + 1}"
              class="gallery-img"
              loading="lazy"
              onclick="openPortfolioLightbox('${escapeAttr(safeSlug)}', ${imgIdx})"
            >
            <span style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.72); color: #fff; font-size: 0.72rem; padding: 2px 6px; border-radius: 3px; pointer-events: none;">
              ${imgIdx + 1}/${allPhotos.length}
            </span>
          </div>`
    )
    .join('');

  const dotsHtml = Array.from({ length: Math.max(1, allPhotos.length) })
    .map(
      (_, dIdx) => `
          <button
            class="gallery-dot ${dIdx === 0 ? 'active' : ''}"
            id="dot-${escapeAttr(safeSlug)}-${dIdx}"
            aria-label="Go to photo ${dIdx + 1}"
            onclick="scrollProjectGalleryToIndex('${escapeAttr(safeSlug)}', ${dIdx})"
          ></button>`
    )
    .join('');

  const headingMarkup = detailHref
    ? `<a href="${escapeAttr(detailHref)}" style="color: inherit; text-decoration: none;">${escapeHtml(displayHeading)}</a>`
    : escapeHtml(displayHeading);

  const detailLinkHtml = detailHref
    ? `<a href="${escapeAttr(detailHref)}" style="font-size: 0.84rem; color: #111827; text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; margin-right: 20px;">View Project Case Study →</a>`
    : '';

  return `
        <article class="hospitality-project-block" id="${escapeAttr(safeSlug)}" data-slug="${escapeAttr(safeSlug)}">
          <div class="hospitality-detail-grid">
            <div class="col-identity">
              <span class="hospitality-kicker">${escapeHtml(cfg.kicker)}</span>
              <h2 class="hospitality-main-title">${headingMarkup}</h2>
              <div class="hospitality-green-line"></div>
              ${p.description ? `<p style="color: #4b5563; font-size: 0.9rem; line-height: 1.65; margin-top: 12px;">${escapeHtml(p.description)}</p>` : ''}
            </div>
            <div class="col-info">
              <div class="project-info-header">PROJECT INFORMATION</div>
              <div class="project-info-item">
                <span class="project-info-label">EXECUTED BY:</span>
                <span class="project-info-accent"></span>
                <span class="project-info-value">Besim Design (Turnkey Architectural Execution)</span>
              </div>
              <div class="project-info-item">
                <span class="project-info-label">DESIGNED BY:</span>
                <span class="project-info-accent"></span>
                <span class="project-info-value">${escapeHtml(p.client_name || 'Besim Design Architecture Studio')}</span>
              </div>
              <div class="project-info-item">
                <span class="project-info-label">AREA:</span>
                <span class="project-info-accent"></span>
                <span class="project-info-value">${p.area_sqft ? Number(p.area_sqft).toLocaleString() + ' Sq. Ft.' : '—'}</span>
              </div>
              <div class="project-info-item">
                <span class="project-info-label">LOCATION:</span>
                <span class="project-info-accent"></span>
                <span class="project-info-value">${escapeHtml(p.location || cfg.defaultLocation)}</span>
              </div>
              <div class="project-info-item">
                <span class="project-info-label">PROJECT DURATION:</span>
                <span class="project-info-accent"></span>
                <span class="project-info-value">${escapeHtml(durationText)}</span>
              </div>
            </div>
            <div class="col-cover">
              <div class="cover-img-wrapper" onclick="openPortfolioLightbox('${escapeAttr(safeSlug)}', 0)">
                <img
                  src="${escapeAttr(p.image_url)}"
                  alt="${escapeAttr(safeTitle)} – Featured Cover Photograph"
                  class="project-featured-cover"
                  loading="${pIdx === 0 ? 'eager' : 'lazy'}"
                >
                <div class="cover-zoom-hint">🔍 View Fullscreen</div>
              </div>
            </div>
          </div>
          <div class="hospitality-gallery-section" style="padding: 36px 0 20px 0;">
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px; border-bottom: 1px solid #f3f4f6; padding-bottom: 10px;">
              <span style="font-size: 0.82rem; font-weight: 700; color: #16a34a; letter-spacing: 0.08em; text-transform: uppercase;">
                PROJECT PHOTOGRAPHIC GALLERY
              </span>
              <span style="font-size: 0.82rem; color: #6b7280;">
                ${allPhotos.length} High-Resolution Photographs
              </span>
            </div>
            <div class="gallery-carousel-wrapper" data-slug="${escapeAttr(safeSlug)}">
              <button class="gallery-nav-btn gallery-nav-prev" onclick="scrollProjectGallery('${escapeAttr(safeSlug)}', -1)" aria-label="Previous photograph">‹</button>
              <div class="gallery-track" id="gallery-track-${escapeAttr(safeSlug)}">${galleryItemsHtml}</div>
              <button class="gallery-nav-btn gallery-nav-next" onclick="scrollProjectGallery('${escapeAttr(safeSlug)}', 1)" aria-label="Next photograph">›</button>
            </div>
            <div class="gallery-dots" id="gallery-dots-${escapeAttr(safeSlug)}">${dotsHtml}</div>
          </div>
          <div style="display: flex; justify-content: flex-end; align-items: center; padding: 12px 0; margin-top: 8px; flex-wrap: wrap; gap: 10px;">
            ${detailLinkHtml}
            <a
              href="https://wa.me/919892699850?text=${encodeURIComponent(`Hello Besim Design, I am interested in a turnkey architectural fit-out inspired by ${safeTitle}.`)}"
              target="_blank"
              rel="noopener noreferrer"
              style="font-size: 0.84rem; color: #16a34a; text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"
            >
              Discuss ${escapeHtml(safeTitle)} on WhatsApp 💬
            </a>
          </div>
        </article>`;
}

/**
 * SSR controller for the Homepage (/).
 * Hydrates featured clients & testimonials into the initial HTML for Googlebot indexing
 * while keeping disk index.html untouched for unit tests.
 */
export async function renderHomePage(req, res, next) {
  try {
    const filePath = resolveHtmlFile('index.html');
    if (!filePath) return next();

    let html = fs.readFileSync(filePath, 'utf-8');

    try {
      const [clients, testimonials] = await Promise.all([
        db.all(
          `SELECT id, name, category, logo_url, website_url, is_featured, sort_order
           FROM clients
           WHERE is_featured = 1
           ORDER BY sort_order ASC, created_at DESC`
        ),
        db.all(
          `SELECT id, client_name, business_type, rating, review
           FROM testimonials
           WHERE is_published = 1
           ORDER BY sort_order ASC, created_at DESC`
        ),
      ]);

      if (Array.isArray(clients) && clients.length > 0) {
        const clientsHtml = clients
          .map((c) => {
            const rawUrl = (c.logo_url || '').trim();
            let logoSrc = rawUrl;
            if (logoSrc && !logoSrc.startsWith('http://') && !logoSrc.startsWith('https://') && !logoSrc.startsWith('//') && !logoSrc.startsWith('/')) {
              logoSrc = '/' + logoSrc;
            }
            const escapedName = escapeHtml(c.name);
            const escapedCat = escapeHtml(c.category || '');
            return `
            <div class="client-logo-card" data-client-name="${escapedName}">
              <div class="client-logo-wrap" style="min-height: 52px; display: flex; align-items: center; justify-content: center; width: 100%;">
                ${logoSrc ? `<img src="${escapeAttr(logoSrc)}" alt="${escapedName} Logo" class="client-logo-img" loading="lazy" />` : `<span class="client-logo-text">${escapedName}</span>`}
              </div>
              <span class="client-name-label">${escapedName}</span>
              ${escapedCat ? `<span class="client-cat-label">${escapedCat}</span>` : ''}
            </div>`;
          })
          .join('');

        html = html.replace(
          /(<div\s+class=["']clients-grid["']\s+id=["']clientsGrid["'][^>]*>)[\s\S]*?(<\/div>\s*<div style=["']text-align:\s*center)/i,
          `$1${clientsHtml}$2`
        );
      }

      if (Array.isArray(testimonials) && testimonials.length > 0) {
        const testimonialsHtml = testimonials
          .map((t) => {
            const ratingNum = Math.min(5, Math.max(1, parseInt(t.rating, 10) || 5));
            return `
            <div class="testimonial-card">
              <div>
                <div class="testimonial-rating">${'★'.repeat(ratingNum)}</div>
                <p class="testimonial-text">"${escapeHtml(t.review)}"</p>
              </div>
              <div class="testimonial-author">
                <h5>${escapeHtml(t.client_name)}</h5>
                <p>${escapeHtml(t.business_type)}</p>
              </div>
            </div>`;
          })
          .join('');

        html = html.replace(
          /(<div\s+class=["']testimonials-grid["']\s+id=["']testimonialsGrid["'][^>]*>)[\s\S]*?(<\/div>\s*<\/div>\s*<\/section>)/i,
          `$1${testimonialsHtml}$2`
        );
      }
    } catch (dbErr) {
      logger.warn('Homepage SSR data hydration skipped:', dbErr.message);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, must-revalidate');
    res.setHeader('X-Robots-Tag', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
    return res.status(200).send(html);
  } catch (err) {
    logger.error('Error serving homepage:', err);
    return next(err);
  }
}

/**
 * SSR controller for Category Showcase pages:
 * /hotels, /hospitality, /residential, /central-kitchen
 */
export function renderCategoryPage(routeCat) {
  const cfg = CATEGORY_SSR_CONFIG[routeCat];
  return async (req, res, next) => {
    try {
      const filePath = resolveHtmlFile(cfg.filename);
      if (!filePath) return next();

      let html = fs.readFileSync(filePath, 'utf-8');

      try {
        const placeholders = cfg.dbCategories.map(() => '?').join(', ');
        const rows = await db.all(
          `SELECT id, title, slug, category, client_name, location, area_sqft, description, scope, image_url, gallery, is_featured, sort_order
           FROM projects
           WHERE is_published = 1
             AND LOWER(category) IN (${placeholders})
             AND id NOT IN (SELECT project_id FROM deleted_projects WHERE project_id IS NOT NULL)
             AND (slug IS NULL OR slug NOT IN (SELECT slug FROM deleted_projects WHERE slug IS NOT NULL))
           ORDER BY sort_order ASC, created_at DESC`,
          ...cfg.dbCategories
        );

        const projects = (rows || []).map((p) => ({
          ...p,
          scope: parseJsonList(p.scope),
          gallery: parseJsonList(p.gallery),
        }));

        if (projects.length > 0) {
          const cardsHtml = projects
            .map((p, idx) => buildCategoryProjectBlock(p, idx, cfg, routeCat))
            .join('');
          html = replaceContainerInnerHtml(html, cfg.containerId, cardsHtml);

          // Inject ItemList Schema.org structured data for the category portfolio
          const itemListSchema = {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: cfg.listName,
            url: `${DOMAIN}/${routeCat}`,
            numberOfItems: projects.length,
            itemListElement: projects
              .filter((p) => p.slug)
              .map((p, idx) => {
                const catPrefix = normalizeCategoryForUrl(p.category) || routeCat;
                return {
                  '@type': 'ListItem',
                  position: idx + 1,
                  name: p.title || 'Architectural Project',
                  url: `${DOMAIN}/${catPrefix}/${p.slug}`,
                };
              }),
          };

          const jsonLdTag = `<script type="application/ld+json">\n${JSON.stringify(itemListSchema, null, 2)}\n</script>`;
          const hydrationTag = `<script>window.__INITIAL_CATEGORY_PROJECTS__ = ${JSON.stringify(projects).replace(/</g, '\\u003c')};</script>`;
          html = html.replace('</head>', `  ${jsonLdTag}\n</head>`);
          html = html.replace('</body>', `  ${hydrationTag}\n</body>`);
        }
      } catch (dbErr) {
        logger.warn(`Category SSR data hydration skipped for ${routeCat}:`, dbErr.message);
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, must-revalidate');
      res.setHeader('X-Robots-Tag', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
      return res.status(200).send(html);
    } catch (err) {
      logger.error(`Error rendering category page ${routeCat}:`, err);
      return next(err);
    }
  };
}

export default {
  renderHomePage,
  renderCategoryPage,
};
