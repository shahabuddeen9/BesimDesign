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
              data-lightbox-slug="${escapeAttr(safeSlug)}"
              data-lightbox-index="${imgIdx}"
              tabindex="0"
              role="button"
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
            data-gallery-dot-slug="${escapeAttr(safeSlug)}"
            data-gallery-dot-index="${dIdx}"
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
              <div class="cover-img-wrapper" data-lightbox-slug="${escapeAttr(safeSlug)}" data-lightbox-index="0" tabindex="0" role="button">
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
              <button class="gallery-nav-btn gallery-nav-prev" data-gallery-nav-slug="${escapeAttr(safeSlug)}" data-gallery-dir="-1" aria-label="Previous photograph">‹</button>
              <div class="gallery-track" id="gallery-track-${escapeAttr(safeSlug)}">${galleryItemsHtml}</div>
              <button class="gallery-nav-btn gallery-nav-next" data-gallery-nav-slug="${escapeAttr(safeSlug)}" data-gallery-dir="1" aria-label="Next photograph">›</button>
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

      const clientsHtml = (Array.isArray(clients) && clients.length > 0)
        ? clients
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
            .join('')
        : `<div style="grid-column: 1 / -1; text-align: center; padding: 24px; color: var(--text-dim); font-size: 0.88rem;">Hospitality and architectural partnerships showcase curated by Besim Design Studio.</div>`;

      html = html.replace(
        /(<div\s+class=["']clients-grid["']\s+id=["']clientsGrid["'][^>]*>)[\s\S]*?(<\/div>\s*<div style=["']text-align:\s*center)/i,
        `$1${clientsHtml}$2`
      );

      const testimonialsHtml = (Array.isArray(testimonials) && testimonials.length > 0)
        ? testimonials
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
            .join('')
        : `<div style="grid-column: 1 / -1; text-align: center; padding: 32px; color: var(--text-dim); font-size: 0.9rem;">Client reviews and endorsements from hospitality partners are featured directly across our project portfolio.</div>`;

      html = html.replace(
        /(<div\s+class=["']testimonials-grid["']\s+id=["']testimonialsGrid["'][^>]*>)[\s\S]*?(<\/div>\s*<\/div>\s*<\/section>)/i,
        `$1${testimonialsHtml}$2`
      );
    } catch (dbErr) {
      logger.warn('Homepage SSR data hydration skipped:', dbErr.message);
      const fallbackClientsHtml = `<div style="grid-column: 1 / -1; text-align: center; padding: 24px; color: var(--text-dim); font-size: 0.88rem;">Hospitality and architectural partnerships showcase curated by Besim Design Studio.</div>`;
      html = html.replace(
        /(<div\s+class=["']clients-grid["']\s+id=["']clientsGrid["'][^>]*>)[\s\S]*?(<\/div>\s*<div style=["']text-align:\s*center)/i,
        `$1${fallbackClientsHtml}$2`
      );
      const fallbackTestimonialsHtml = `<div style="grid-column: 1 / -1; text-align: center; padding: 32px; color: var(--text-dim); font-size: 0.9rem;">Client reviews and endorsements from hospitality partners are featured directly across our project portfolio.</div>`;
      html = html.replace(
        /(<div\s+class=["']testimonials-grid["']\s+id=["']testimonialsGrid["'][^>]*>)[\s\S]*?(<\/div>\s*<\/div>\s*<\/section>)/i,
        `$1${fallbackTestimonialsHtml}$2`
      );
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
          const listItems = projects
            .filter((p) => p.slug)
            .map((p, idx) => {
              const catPrefix = normalizeCategoryForUrl(p.category) || routeCat;
              return {
                '@type': 'ListItem',
                position: idx + 1,
                name: p.title || 'Architectural Project',
                url: `${DOMAIN}/${catPrefix}/${p.slug}`,
              };
            });

          if (listItems.length > 0) {
            const itemListSchema = {
              '@context': 'https://schema.org',
              '@type': 'ItemList',
              name: cfg.listName,
              url: `${DOMAIN}/${routeCat}`,
              numberOfItems: listItems.length,
              itemListElement: listItems,
            };

            const jsonLdTag = `<script type="application/ld+json">\n${JSON.stringify(itemListSchema, null, 2)}\n</script>`;
            html = html.replace('</head>', `  ${jsonLdTag}\n</head>`);
          }
          const hydrationTag = `<script>window.__INITIAL_CATEGORY_PROJECTS__ = ${JSON.stringify(projects).replace(/</g, '\\u003c')};</script>`;
          html = html.replace('</body>', `  ${hydrationTag}\n</body>`);
        } else {
          const emptyHtml = `<div style="text-align: center; padding: 48px 20px; color: #6b7280; background: #f9fafb; border-radius: 8px; border: 1px dashed #e5e7eb;"><p style="font-size: 1.05rem; margin-bottom: 8px; color: #111827; font-weight: 600;">No ${escapeHtml(routeCat.replace(/-/g, ' '))} projects are currently published.</p></div>`;
          html = replaceContainerInnerHtml(html, cfg.containerId, emptyHtml);
        }
      } catch (dbErr) {
        logger.warn(`Category SSR data hydration skipped for ${routeCat}:`, dbErr.message);
        const fallbackHtml = `<div style="text-align: center; padding: 48px 20px; color: #6b7280; background: #f9fafb; border-radius: 8px; border: 1px dashed #e5e7eb;"><p style="font-size: 1.05rem; margin-bottom: 8px; color: #111827; font-weight: 600;">Turnkey ${escapeHtml(routeCat.replace(/-/g, ' '))} architectural portfolio — explore project inquiries below.</p></div>`;
        html = replaceContainerInnerHtml(html, cfg.containerId, fallbackHtml);
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

const SHOWCASE_CATEGORY_META = {
  hotels: {
    name: 'Hotels & Boutique Resorts',
    badge: '★ Architectural Showcase • Hotels & Resorts',
    title: 'Hotels & Boutique Resorts Portfolio',
    subtitle: 'Explore our turnkey hotel fit-outs, luxury suites, grand double-height lobbies, acoustic guest corridors, and coastal resort developments executed across India.',
  },
  hospitality: {
    name: 'Hospitality & Fine Dining',
    badge: '★ Architectural Showcase • Hospitality & F&B',
    title: 'Hospitality & Fine Dining Portfolio',
    subtitle: 'Discover Mumbai’s most celebrated restaurants, high-energy cocktail lounges, artisan cafes, and culinary theatres delivered on schedule with flawless finishes.',
  },
  residential: {
    name: 'Luxury Residential',
    badge: '★ Architectural Showcase • Luxury Living',
    title: 'Luxury Residential Portfolio',
    subtitle: 'Step into bespoke duplex sky villas, panoramic sea-facing penthouses, and private estates featuring Italian marble and custom factory joinery.',
  },
  central_kitchen: {
    name: 'Central Kitchens',
    badge: '★ Architectural Showcase • Culinary Infrastructure',
    title: 'Central Kitchens & Commissaries Portfolio',
    subtitle: 'High-capacity industrial commissaries, blast freezing chambers, stainless steel fabrication, fresh air makeup, and HACCP compliance.',
  },
  all: {
    name: 'All Sectors',
    badge: '★ Comprehensive Architectural Portfolio',
    title: 'Complete Turnkey Architectural Portfolio',
    subtitle: 'Browse all executed landmarks across Hotels, Hospitality, Luxury Residential, and Central Kitchens delivered by Besim Design.',
  },
};

function matchesShowcaseCategory(projectCat, activeCat) {
  const c = String(projectCat || '').toLowerCase();
  if (activeCat === 'all') return true;
  if (activeCat === 'hotels') return c === 'hotels' || c === 'hotel';
  if (activeCat === 'hospitality') return c === 'hospitality' || c === 'restaurant' || c === 'bar' || c === 'cafe';
  if (activeCat === 'residential') return c === 'residential';
  if (activeCat === 'central_kitchen') return c === 'central_kitchen' || c === 'central-kitchen' || c === 'cloud_kitchen' || c === 'industrial';
  return c === activeCat;
}

/**
 * SSR controller for the Architectural Showcase page (/showcase).
 */
export async function renderShowcasePage(req, res, next) {
  try {
    const filePath = resolveHtmlFile('showcase.html');
    if (!filePath) return next();

    let html = fs.readFileSync(filePath, 'utf-8');

    const rawCat = typeof req.query?.category === 'string' ? req.query.category.trim().toLowerCase() : '';
    let activeCat = 'hotels';
    if (rawCat === 'hotel') activeCat = 'hotels';
    else if (rawCat === 'restaurant') activeCat = 'hospitality';
    else if (rawCat === 'central-kitchen') activeCat = 'central_kitchen';
    else if (SHOWCASE_CATEGORY_META[rawCat]) activeCat = rawCat;

    const meta = SHOWCASE_CATEGORY_META[activeCat] || SHOWCASE_CATEGORY_META.hotels;
    html = html
      .replace(/(<div\s+class=["']section-badge["']\s+id=["']showcaseBadge["'][^>]*>)[\s\S]*?(<\/div>)/i, `$1${escapeHtml(meta.badge)}$2`)
      .replace(/(<h1\s+class=["']hero-title["']\s+id=["']showcaseTitle["'][^>]*>)[\s\S]*?(<\/h1>)/i, `$1${escapeHtml(meta.title)}$2`)
      .replace(/(<p\s+class=["']hero-description["']\s+id=["']showcaseSubtitle["'][^>]*>)[\s\S]*?(<\/p>)/i, `$1${escapeHtml(meta.subtitle)}$2`)
      .replace(/(<span\s+id=["']breadcrumbCategory["'][^>]*>)[\s\S]*?(<\/span>)/i, `$1${escapeHtml(meta.name)}$2`)
      .replace(/<button\s+class=["']showcase-tab(?:\s+active)?["']\s+data-category=["']([^"']+)["']>/gi, (m, cat) => {
        return `<button class="showcase-tab${cat === activeCat ? ' active' : ''}" data-category="${cat}">`;
      });

    try {
      const rows = await db.all(
        `SELECT id, title, slug, category, client_name, location, area_sqft, description, scope, image_url, gallery, is_featured, sort_order
         FROM projects
         WHERE is_published = 1
           AND id NOT IN (SELECT project_id FROM deleted_projects WHERE project_id IS NOT NULL)
           AND (slug IS NULL OR slug NOT IN (SELECT slug FROM deleted_projects WHERE slug IS NOT NULL))
         ORDER BY sort_order ASC, created_at DESC`
      );

      const allProjects = (rows || []).map((p) => ({
        ...p,
        scope: parseJsonList(p.scope),
        gallery: parseJsonList(p.gallery),
      }));

      let filtered = allProjects.filter((p) => matchesShowcaseCategory(p.category, activeCat));
      if (filtered.length === 0 && !rawCat && allProjects.length > 0) {
        filtered = allProjects;
      }

      const cardsHtml = filtered.length > 0
        ? filtered
            .map((p) => {
              const scopes = parseJsonList(p.scope);
              const safeTitle = p.title || 'Architectural Landmark';
              const catPrefix = normalizeCategoryForUrl(p.category) || 'hospitality';
              const detailHref = p.slug ? `/${catPrefix}/${p.slug}` : null;
              const catLabel = (SHOWCASE_CATEGORY_META[p.category]?.name || p.category || 'Architecture').toUpperCase();
              const scopeBadges = scopes.slice(0, 3).map((s) => `<span class="project-scope-item">${escapeHtml(s)}</span>`).join('');
              return `
      <div class="project-card" data-category="${escapeAttr(p.category)}">
        <div class="project-img-wrap">
          <img src="${escapeAttr(p.image_url)}" alt="${escapeAttr(safeTitle)}" loading="lazy">
          <span class="project-cat-badge">${escapeHtml(catLabel)}</span>
        </div>
        <div class="project-body">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;">
            <span style="font-size: 0.75rem; color: var(--accent-gold); font-weight: 600; text-transform: uppercase;">
              ${escapeHtml(p.client_name || 'Bespoke Architectural Landmark')}
            </span>
          </div>
          <h3 class="project-title">${detailHref ? `<a href="${escapeAttr(detailHref)}" style="color: inherit; text-decoration: none;">${escapeHtml(safeTitle)}</a>` : escapeHtml(safeTitle)}</h3>
          ${p.location ? `<div style="font-size: 0.8rem; color: var(--text-dim); margin-bottom: 8px;">📍 ${escapeHtml(p.location)}</div>` : ''}
          <p class="project-desc">${escapeHtml(p.description)}</p>
          <div class="project-scope-list">${scopeBadges}</div>
          <div class="project-card-footer">
            ${detailHref ? `<a href="${escapeAttr(detailHref)}" class="btn-link" style="text-decoration: none;">View Case Study →</a>` : `<span class="btn-link">Turnkey Project</span>`}
            <a href="#uploadSection" class="btn btn-gold btn-xs" style="text-decoration: none;">Upload Similar Brief ↗</a>
          </div>
        </div>
      </div>`;
            })
            .join('')
        : `<div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: var(--bg-card); border: 1px dashed var(--border-gold); border-radius: var(--radius-md);"><h3 style="font-family: var(--font-serif); font-size: 1.4rem; color: #fff; margin-bottom: 8px;">Architectural Projects in ${escapeHtml(meta.name)}</h3><p style="color: var(--text-muted); max-width: 500px; margin: 0 auto 20px;">Additional project landmarks are currently under confidential execution or ready to be initiated with your brief.</p><a href="#uploadSection" class="btn btn-primary btn-sm">Upload Your Project Brief Here ↓</a></div>`;

      html = replaceContainerInnerHtml(html, 'showcaseGrid', cardsHtml);

      if (allProjects.length > 0) {
        const listForSchema = (filtered.length > 0 ? filtered : allProjects).filter((p) => p.slug);
        if (listForSchema.length > 0) {
          const itemListSchema = {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: `${meta.name} | Besim Design Showcase`,
            url: `${DOMAIN}/showcase`,
            numberOfItems: listForSchema.length,
            itemListElement: listForSchema.map((p, idx) => {
              const catPrefix = normalizeCategoryForUrl(p.category) || 'hospitality';
              return {
                '@type': 'ListItem',
                position: idx + 1,
                name: p.title || 'Architectural Project',
                url: `${DOMAIN}/${catPrefix}/${p.slug}`,
              };
            }),
          };
          const jsonLdTag = `<script type="application/ld+json">\n${JSON.stringify(itemListSchema, null, 2)}\n</script>`;
          html = html.replace('</head>', `  ${jsonLdTag}\n</head>`);
        }
        const hydrationTag = `<script>window.__INITIAL_SHOWCASE_PROJECTS__ = ${JSON.stringify(allProjects).replace(/</g, '\\u003c')};</script>`;
        html = html.replace('</body>', `  ${hydrationTag}\n</body>`);
      }
    } catch (dbErr) {
      logger.warn('Showcase SSR data hydration skipped:', dbErr.message);
      const fallbackHtml = `<div style="grid-column: 1 / -1; text-align: center; padding: 48px 20px; color: var(--text-dim);">Explore our dedicated portfolios across <a href="/hotels" style="color: var(--accent-gold);">Hotels</a>, <a href="/hospitality" style="color: var(--accent-gold);">Hospitality</a>, <a href="/residential" style="color: var(--accent-gold);">Residential</a>, and <a href="/central-kitchen" style="color: var(--accent-gold);">Central Kitchens</a>.</div>`;
      html = replaceContainerInnerHtml(html, 'showcaseGrid', fallbackHtml);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, must-revalidate');
    res.setHeader('X-Robots-Tag', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
    return res.status(200).send(html);
  } catch (err) {
    logger.error('Error rendering showcase page:', err);
    return next(err);
  }
}

export default {
  renderHomePage,
  renderCategoryPage,
  renderShowcasePage,
};
