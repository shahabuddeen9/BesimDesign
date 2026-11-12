/**
 * @file /server/controllers/project-render.controller.js
 * @description Server-Side Prerendering / SSR controller for project detail pages:
 * /hospitality/:slug, /hotels/:slug, /residential/:slug, /central-kitchen/:slug
 *
 * Guarantees:
 * 1. Server-rendered title, meta description, canonical URL, OG tags, Twitter cards, and H1 in initial HTML.
 * 2. HTTP 404 for unknown, deleted, tombstoned, unpublished or invalid project slugs.
 * 3. Never swallows database errors (passes to error handler / 503 on database unavailability).
 * 4. Preserves genuine 301 redirects for aliases, .html extensions, and wrong-category requests.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db/index.js';
import logger from '../utils/logger.js';
import { normalizeCategoryForUrl, SLUG_ALIASES } from './sitemap.controller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const publicPath = path.resolve(projectRoot, 'public');
const distPath = path.resolve(projectRoot, 'dist');

const DOMAIN = 'https://www.besimdesign.com';

const CATEGORY_MAP = {
  'hospitality': {
    name: 'Hospitality & Dining',
    kicker: 'HOSPITALITY PROJECT',
    url: '/hospitality',
  },
  'hotels': {
    name: 'Hotels & Resorts',
    kicker: 'HOTEL & RESORT ARCHITECTURE',
    url: '/hotels',
  },
  'residential': {
    name: 'Luxury Residential',
    kicker: 'RESIDENTIAL ARCHITECTURE',
    url: '/residential',
  },
  'central-kitchen': {
    name: 'Central Kitchens',
    kicker: 'COMMISSARY & CENTRAL KITCHEN',
    url: '/central-kitchen',
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
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Loads the raw HTML template for project detail.
 */
function getTemplateHtml() {
  const candidates = [
    path.resolve(distPath, 'hospitality-detail.html'),
    path.resolve(publicPath, 'hospitality-detail.html'),
    path.resolve(projectRoot, 'hospitality-detail.html'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return fs.readFileSync(c, 'utf-8');
    }
  }
  throw new Error('Template hospitality-detail.html not found');
}

/**
 * Serves branded 404 response.
 */
function serve404(req, res) {
  res.status(404);
  const candidates = [
    path.resolve(distPath, '404.html'),
    path.resolve(publicPath, '404.html'),
    path.resolve(projectRoot, '404.html'),
  ];
  const target = candidates.find((c) => fs.existsSync(c));
  if (req.accepts('html') && target) {
    return res.sendFile(target);
  }
  return res.send('Project Not Found');
}

/**
 * Controller: Render project detail page with server-side rendered SEO metadata and H1.
 */
export async function renderProjectPage(req, res, next) {
  const { slug } = req.params;
  if (!slug) return next();

  // Strip leading /api if routed via serverless rewrite
  const cleanPath = req.path.replace(/^\/api\//, '/');
  const pathSegments = cleanPath.split('/').filter(Boolean);
  const requestedCategory = pathSegments[0]?.toLowerCase();
  const cleanSlug = slug.toLowerCase().replace(/\.html$/, '');

  // 1. If slug is an alias, 301 redirect to canonical destination URL
  if (SLUG_ALIASES[cleanSlug]) {
    const canonicalSlug = SLUG_ALIASES[cleanSlug];
    return res.redirect(301, `/${requestedCategory}/${canonicalSlug}`);
  }

  // 2. If request ends with .html, 301 redirect to clean URL
  if (slug.endsWith('.html')) {
    return res.redirect(301, `/${requestedCategory}/${cleanSlug}`);
  }

  // If slug has an extension other than .html (e.g. image or asset), pass to next middleware
  if (slug.includes('.')) return next();

  // 3. Database lookup for tombstone or active project
  // CRITICAL: Errors are NOT swallowed; any DB connection error propagates to next(err) -> 503
  let isDeleted = null;
  let projectRecord = null;

  try {
    isDeleted = await db.get(
      'SELECT project_id, slug FROM deleted_projects WHERE LOWER(slug) = ?',
      cleanSlug
    );

    if (isDeleted) {
      return serve404(req, res);
    }

    projectRecord = await db.get(
      `SELECT id, title, slug, category, client_name, location, area_sqft, description, scope,
              image_url, gallery, is_published, created_at, updated_at
       FROM projects
       WHERE LOWER(slug) = ?`,
      cleanSlug
    );
  } catch (dbErr) {
    logger.error(`Database error during project detail SSR for slug "${cleanSlug}":`, dbErr);
    // Do NOT swallow database errors; propagate to central error handler for HTTP 503
    return next(dbErr);
  }

  // 4. Return HTTP 404 for unknown, deleted, or unpublished project slugs
  if (!projectRecord || Number(projectRecord.is_published) === 0) {
    return serve404(req, res);
  }

  // 5. Canonical Category Check: Ensure URL category matches project's canonical category
  const canonicalCategory = normalizeCategoryForUrl(projectRecord.category);
  if (!canonicalCategory) {
    return serve404(req, res);
  }

  if (requestedCategory !== canonicalCategory) {
    // 301 redirect to the correct canonical category URL
    return res.redirect(301, `/${canonicalCategory}/${projectRecord.slug}`);
  }

  // 6. Server-Side Prerendering / SSR
  try {
    const template = getTemplateHtml();
    const catInfo = CATEGORY_MAP[canonicalCategory] || CATEGORY_MAP['hospitality'];

    const cleanTitle = projectRecord.title ? projectRecord.title.trim() : 'Architectural Project';
    const pageTitle = `${cleanTitle} | ${catInfo.name} | Besim Design`;
    const metaDescription = projectRecord.description
      ? projectRecord.description.slice(0, 155).trim()
      : `Explore ${cleanTitle} turnkey ${catInfo.name.toLowerCase()} fit-out by Besim Design Mumbai.`;
    const canonicalUrl = `${DOMAIN}/${canonicalCategory}/${projectRecord.slug}`;

    const rawImg = projectRecord.image_url || '/assets/aistudio/Screenshot_2026-10-21_at_3.13.59_PM_47176ac5.png';
    const imageUrl = rawImg.startsWith('http') ? rawImg : `${DOMAIN}${rawImg.startsWith('/') ? '' : '/'}${rawImg}`;

    // Compute H1 heading (e.g. "Title – Location")
    let displayHeading = cleanTitle;
    if (projectRecord.location && !cleanTitle.toLowerCase().includes(projectRecord.location.toLowerCase().split(',')[0])) {
      const city = projectRecord.location.split(',')[0].trim();
      displayHeading = `${cleanTitle} – ${city}`;
    }

    // Parse scopes
    let scopes = [];
    if (Array.isArray(projectRecord.scope)) {
      scopes = projectRecord.scope;
    } else if (typeof projectRecord.scope === 'string') {
      try {
        scopes = JSON.parse(projectRecord.scope);
      } catch (_) {
        scopes = projectRecord.scope.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }

    const scopeTagsHtml = scopes.length > 0
      ? scopes
          .map(
            (s) => `<span style="display: inline-block; font-size: 0.8rem; background: #f3f4f6; color: #374151; padding: 4px 10px; border-radius: 4px; margin-right: 6px; margin-bottom: 6px; border: 1px solid #e5e7eb;">✓ ${escapeHtml(s)}</span>`
          )
          .join('')
      : '';

    // Project Info values
    const executedByFormatted = 'Besim Design (Turnkey Architectural Execution)';
    const designedByFormatted = projectRecord.client_name ? projectRecord.client_name : 'Besim Design Architecture Studio';
    const areaFormatted = projectRecord.area_sqft ? `${Number(projectRecord.area_sqft).toLocaleString()} Sq. Ft.` : '—';
    const locationFormatted = projectRecord.location || 'Mumbai, Maharashtra';

    const durationMatch = scopes.find((s) => /day|month|week|handover|schedule|fast-track/i.test(s));
    const durationFormatted = durationMatch || '90 Days (Fast-Track Turnkey Handover)';

    // Build photo gallery
    const allPhotos = [];
    if (projectRecord.image_url) allPhotos.push(projectRecord.image_url);

    let rawGallery = [];
    if (Array.isArray(projectRecord.gallery)) {
      rawGallery = projectRecord.gallery;
    } else if (typeof projectRecord.gallery === 'string') {
      try {
        rawGallery = JSON.parse(projectRecord.gallery);
      } catch (_) {
        rawGallery = [projectRecord.gallery];
      }
    }

    for (const img of rawGallery) {
      if (img && typeof img === 'string' && !allPhotos.includes(img)) {
        allPhotos.push(img);
      }
    }

    const galleryItemsHtml = allPhotos.length > 0
      ? allPhotos
          .map(
            (url, index) => `
      <div class="gallery-item" data-index="${index}">
        <img
          src="${escapeAttr(url)}"
          alt="${escapeAttr(cleanTitle)} – View ${index + 1}"
          class="gallery-img"
          loading="lazy"
          onclick="openLightbox(${index})"
        >
        <span style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.7); color: #fff; font-size: 0.72rem; padding: 2px 6px; border-radius: 3px; pointer-events: none;">
          ${index + 1}/${allPhotos.length}
        </span>
      </div>`
          )
          .join('')
      : `<div style="padding: 32px; color: #6b7280; text-align: center; width: 100%;">Additional gallery photographs for this project are currently being curated.</div>`;

    // JSON-LD Structured Data
    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: cleanTitle,
      name: cleanTitle,
      description: metaDescription,
      image: imageUrl,
      url: canonicalUrl,
      author: {
        '@type': 'Organization',
        name: 'Besim Design',
        url: DOMAIN,
      },
      publisher: {
        '@type': 'Organization',
        name: 'Besim Design',
        url: DOMAIN,
        logo: {
          '@type': 'ImageObject',
          url: `${DOMAIN}/assets/aistudio/Screenshot_2026-10-21_at_3.13.59_PM_47176ac5.png`,
        },
      },
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': canonicalUrl,
      },
    };

    // Perform replacements in HTML
    let html = template;

    // 1. Title
    html = html.replace(/<title>.*?<\/title>/i, `<title>${escapeHtml(pageTitle)}</title>`);

    // 2. Meta description
    html = html.replace(
      /<meta\s+name=["']description["']\s+content=["'][^"']*["']/i,
      `<meta name="description" content="${escapeAttr(metaDescription)}"`
    );

    // 3. Canonical
    html = html.replace(
      /<link\s+rel=["']canonical["']\s+href=["'][^"']*["']/i,
      `<link rel="canonical" href="${escapeAttr(canonicalUrl)}"`
    );

    // 4. Open Graph & Twitter Cards
    html = html.replace(
      /<meta\s+property=["']og:title["']\s+content=["'][^"']*["']/i,
      `<meta property="og:title" content="${escapeAttr(cleanTitle)} | ${escapeAttr(catInfo.name)} | Besim Design"`
    );
    html = html.replace(
      /<meta\s+property=["']og:description["']\s+content=["'][^"']*["']/i,
      `<meta property="og:description" content="${escapeAttr(metaDescription)}"`
    );

    // Add og:url, og:image, and Twitter cards if missing
    const ogTags = `
  <meta property="og:url" content="${escapeAttr(canonicalUrl)}">
  <meta property="og:image" content="${escapeAttr(imageUrl)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeAttr(cleanTitle)} | ${escapeAttr(catInfo.name)} | Besim Design">
  <meta name="twitter:description" content="${escapeAttr(metaDescription)}">
  <meta name="twitter:image" content="${escapeAttr(imageUrl)}">
  <script type="application/ld+json">
${JSON.stringify(structuredData, null, 2)}
  </script>`;
    html = html.replace('</head>', `${ogTags}\n</head>`);

    // 5. Breadcrumb & Kicker
    html = html.replace(
      /<a\s+href=["'][^"']*["']\s+id=["']projectBreadcrumbCategory["']>.*?<\/a>/i,
      `<a href="${catInfo.url}" id="projectBreadcrumbCategory">${escapeHtml(catInfo.name)}</a>`
    );
    html = html.replace(
      /<span\s+id=["']projectBreadcrumbTitle["'][^>]*>.*?<\/span>/i,
      `<span id="projectBreadcrumbTitle" style="color: #111827; font-weight: 600;">${escapeHtml(cleanTitle)}</span>`
    );
    html = html.replace(
      /<span\s+class=["']hospitality-kicker["']\s+id=["']projectKicker["']>.*?<\/span>/i,
      `<span class="hospitality-kicker" id="projectKicker">${escapeHtml(catInfo.kicker)}</span>`
    );

    // 6. Main H1 and narrative
    html = html.replace(
      /<h1\s+class=["']hospitality-main-title["']\s+id=["']projectTitle["']>.*?<\/h1>/i,
      `<h1 class="hospitality-main-title" id="projectTitle">${escapeHtml(displayHeading)}</h1>`
    );
    html = html.replace(
      /<p\s+class=["']hospitality-narrative["']\s+id=["']projectNarrative["']>.*?<\/p>/i,
      `<p class="hospitality-narrative" id="projectNarrative">${escapeHtml(projectRecord.description || '')}</p>`
    );
    html = html.replace(
      /<div\s+id=["']projectScopeTags["'][^>]*>.*?<\/div>/i,
      `<div id="projectScopeTags" style="margin-bottom: 24px;">${scopeTagsHtml}</div>`
    );
    html = html.replace(
      /<a\s+id=["']projectBackLink["'][^>]*>.*?<\/a>/i,
      `<a id="projectBackLink" href="${catInfo.url}" style="display: inline-flex; align-items: center; gap: 8px; font-size: 0.9rem; color: #16a34a; text-decoration: none; font-weight: 600; transition: color 0.2s;">← Back to ${escapeHtml(catInfo.name)} Portfolio</a>`
    );

    // 7. Middle Column Info items
    html = html.replace(
      /<span\s+class=["']project-info-value["']\s+id=["']infoExecutedBy["']>.*?<\/span>/i,
      `<span class="project-info-value" id="infoExecutedBy">${escapeHtml(executedByFormatted)}</span>`
    );
    html = html.replace(
      /<span\s+class=["']project-info-value["']\s+id=["']infoDesignedBy["']>.*?<\/span>/i,
      `<span class="project-info-value" id="infoDesignedBy">${escapeHtml(designedByFormatted)}</span>`
    );
    html = html.replace(
      /<span\s+class=["']project-info-value["']\s+id=["']infoArea["']>.*?<\/span>/i,
      `<span class="project-info-value" id="infoArea">${escapeHtml(areaFormatted)}</span>`
    );
    html = html.replace(
      /<span\s+class=["']project-info-value["']\s+id=["']infoLocation["']>.*?<\/span>/i,
      `<span class="project-info-value" id="infoLocation">${escapeHtml(locationFormatted)}</span>`
    );
    html = html.replace(
      /<span\s+class=["']project-info-value["']\s+id=["']infoDuration["']>.*?<\/span>/i,
      `<span class="project-info-value" id="infoDuration">${escapeHtml(durationFormatted)}</span>`
    );

    // 8. Featured Cover Image
    html = html.replace(
      /<img\s+id=["']projectCoverImg["'][^>]*>/i,
      `<img id="projectCoverImg" class="project-featured-cover" src="${escapeAttr(rawImg)}" alt="${escapeAttr(cleanTitle)} – Featured Cover Photograph" loading="eager" onclick="openLightbox(0)">`
    );

    // 9. Gallery Track & Count
    html = html.replace(
      /<div\s+class=["']gallery-track["']\s+id=["']galleryTrack["']>.*?<\/div>/i,
      `<div class="gallery-track" id="galleryTrack">${galleryItemsHtml}</div>`
    );
    html = html.replace(
      /<span\s+id=["']galleryCountText["'][^>]*>.*?<\/span>/i,
      `<span id="galleryCountText" style="font-size: 0.85rem; color: #6b7280;">${allPhotos.length} High-Resolution Photographs</span>`
    );

    // 10. Initial State Visibility: Hide loading state, show content state
    html = html.replace(
      /<div\s+id=["']projectLoadingState["'][^>]*>/i,
      `<div id="projectLoadingState" style="display: none; padding: 120px 20px; text-align: center; color: #6b7280;">`
    );
    html = html.replace(
      /<div\s+id=["']projectContentState["'][^>]*>/i,
      `<div id="projectContentState" style="display: block;">`
    );

    // 11. Inject serialized project data for client-side hydration
    const clientPayload = {
      id: projectRecord.id,
      title: projectRecord.title,
      slug: projectRecord.slug,
      category: canonicalCategory,
      client_name: projectRecord.client_name,
      location: projectRecord.location,
      area_sqft: projectRecord.area_sqft,
      description: projectRecord.description,
      scope: scopes,
      image_url: rawImg,
      gallery: allPhotos,
    };
    const hydrationScript = `<script>window.__INITIAL_PROJECT__ = ${JSON.stringify(clientPayload).replace(/</g, '\\u003c')};</script>`;
    html = html.replace('</body>', `${hydrationScript}\n</body>`);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    return res.status(200).send(html);
  } catch (renderErr) {
    logger.error('Error during project HTML template hydration:', renderErr);
    return next(renderErr);
  }
}

export default {
  renderProjectPage,
};
