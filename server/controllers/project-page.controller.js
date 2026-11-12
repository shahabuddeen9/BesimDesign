/**
 * Database-backed server rendering for public project detail pages.
 * A project receives HTTP 200 only after its active PostgreSQL/SQLite record
 * has been checked for publication, a usable title/slug/category and tombstones.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db/index.js';
import { normalizeCategoryForUrl } from './sitemap.controller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const publicPath = path.resolve(projectRoot, 'public');
const distPath = path.resolve(projectRoot, 'dist');
const DOMAIN = 'https://www.besimdesign.com';

const SLUG_ALIASES = {
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

const CATEGORY_DETAILS = {
  hospitality: { name: 'Hospitality & Dining', route: '/hospitality', kicker: 'HOSPITALITY PROJECT' },
  hotels: { name: 'Hotels & Resorts', route: '/hotels', kicker: 'HOTEL & RESORT ARCHITECTURE' },
  residential: { name: 'Residential Architecture', route: '/residential', kicker: 'RESIDENTIAL ARCHITECTURE' },
  'central-kitchen': { name: 'Central Kitchens & Hubs', route: '/central-kitchen', kicker: 'COMMISSARY & CENTRAL KITCHEN' },
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^{}()|[\]\\]/g, '\\$&');
}

function replaceElementContent(html, tagName, id, content) {
  const safeId = escapeRegExp(id);
  const pattern = new RegExp(
    '(<' + tagName + '\\b(?=[^>]*\\bid=["\\x27]' + safeId + '["\\x27])[^>]*>)[\\s\\S]*?(</' + tagName + '>)',
    'i'
  );
  return html.replace(pattern, (match, opening, closing) => opening + content + closing);
}

function setElementAttribute(html, tagName, id, attribute, value) {
  const safeId = escapeRegExp(id);
  const tagPattern = new RegExp(
    '<' + tagName + '\\b(?=[^>]*\\bid=["\\x27]' + safeId + '["\\x27])[^>]*>',
    'i'
  );
  return html.replace(tagPattern, (openingTag) => {
    const attrPattern = new RegExp('\\b' + attribute + '=["\\x27][^"\\x27]*["\\x27]', 'i');
    const replacement = attribute + '="' + escapeHtml(value) + '"';
    return attrPattern.test(openingTag)
      ? openingTag.replace(attrPattern, replacement)
      : openingTag.replace(/>$/, ' ' + replacement + '>');
  });
}

function setElementDisplay(html, id, display) {
  const safeId = escapeRegExp(id);
  const tagPattern = new RegExp(
    '<div\\b(?=[^>]*\\bid=["\\x27]' + safeId + '["\\x27])[^>]*>',
    'i'
  );
  return html.replace(tagPattern, (openingTag) => {
    const styleMatch = openingTag.match(/\bstyle=["\x27]([^"\x27]*)["\x27]/i);
    if (!styleMatch) {
      return openingTag.replace(/>$/, ' style="display:' + display + ';">');
    }
    const currentStyle = styleMatch[1].replace(/(^|;)\s*display\s*:[^;]*/i, '$1').trim();
    const nextStyle = (currentStyle ? currentStyle.replace(/;?$/, '; ') : '') + 'display:' + display + ';';
    return openingTag.replace(styleMatch[0], 'style="' + escapeHtml(nextStyle) + '"');
  });
}

function upsertMeta(html, attribute, name, content) {
  const safeName = escapeRegExp(name);
  const pattern = new RegExp(
    '<meta\\b(?=[^>]*\\b' + attribute + '=["\\x27]' + safeName + '["\\x27])[^>]*>',
    'i'
  );
  const tag = '<meta ' + attribute + '="' + escapeHtml(name) + '" content="' + escapeHtml(content) + '">';
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace(/<\/head>/i, '  ' + tag + '\n</head>');
}

function upsertCanonical(html, canonicalUrl) {
  const pattern = /<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/i;
  const tag = '<link rel="canonical" href="' + escapeHtml(canonicalUrl) + '">';
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace(/<\/head>/i, '  ' + tag + '\n</head>');
}

function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
}

function findTemplate() {
  const candidates = [
    path.resolve(distPath, 'hospitality-detail.html'),
    path.resolve(publicPath, 'hospitality-detail.html'),
    path.resolve(projectRoot, 'hospitality-detail.html'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function sendNotFound(res) {
  const candidates = [
    path.resolve(distPath, '404.html'),
    path.resolve(publicPath, '404.html'),
    path.resolve(projectRoot, '404.html'),
  ];
  const notFoundFile = candidates.find((candidate) => fs.existsSync(candidate));
  if (notFoundFile) return res.status(404).sendFile(notFoundFile);
  return res.status(404).type('text/plain').send('Project not found');
}

function renderProjectHtml(template, project, categoryInfo, canonicalUrl) {
  const cleanTitle = String(project.title).trim();
  const plainDescription = String(project.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const description = plainDescription || ('Explore this ' + categoryInfo.name.toLowerCase() + ' project by Besim Design.');
  const pageTitle = cleanTitle + ' | ' + categoryInfo.name + ' | Besim Design';
  const city = String(project.location || '').split(',')[0].trim();
  const heading = city && !cleanTitle.toLowerCase().includes(city.toLowerCase())
    ? cleanTitle + ' – ' + city
    : cleanTitle;
  const rawImageUrl = String(project.image_url || '').trim();
  const imageUrl = /^(https?:\/\/|\/)/i.test(rawImageUrl) ? rawImageUrl : '';
  const categoryPath = categoryInfo.route;

  let html = template;
  html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + escapeHtml(pageTitle) + '</title>');
  html = upsertMeta(html, 'name', 'description', description.slice(0, 320));
  html = upsertCanonical(html, canonicalUrl);
  html = upsertMeta(html, 'property', 'og:title', pageTitle);
  html = upsertMeta(html, 'property', 'og:description', description.slice(0, 320));
  html = upsertMeta(html, 'property', 'og:type', 'article');
  html = upsertMeta(html, 'property', 'og:url', canonicalUrl);
  if (imageUrl) html = upsertMeta(html, 'property', 'og:image', imageUrl);
  html = upsertMeta(html, 'name', 'twitter:card', imageUrl ? 'summary_large_image' : 'summary');
  html = upsertMeta(html, 'name', 'twitter:title', pageTitle);
  html = upsertMeta(html, 'name', 'twitter:description', description.slice(0, 320));

  html = replaceElementContent(html, 'h1', 'projectTitle', escapeHtml(heading));
  html = replaceElementContent(html, 'p', 'projectNarrative', escapeHtml(description));
  html = replaceElementContent(html, 'span', 'projectBreadcrumbTitle', escapeHtml(cleanTitle));
  html = replaceElementContent(html, 'a', 'projectBreadcrumbCategory', escapeHtml(categoryInfo.name));
  html = replaceElementContent(html, 'span', 'projectKicker', escapeHtml(categoryInfo.kicker));
  html = setElementAttribute(html, 'a', 'projectBreadcrumbCategory', 'href', categoryPath);
  html = replaceElementContent(html, 'a', 'projectBackLink', '← Back to ' + escapeHtml(categoryInfo.name) + ' Portfolio');
  html = setElementAttribute(html, 'a', 'projectBackLink', 'href', categoryPath);

  const clientName = String(project.client_name || 'Besim Design Architecture Studio');
  const area = Number(project.area_sqft) > 0
    ? Number(project.area_sqft).toLocaleString('en-IN') + ' Sq. Ft.'
    : '—';
  const location = String(project.location || 'Mumbai, Maharashtra');
  html = replaceElementContent(html, 'span', 'infoDesignedBy', escapeHtml(clientName));
  html = replaceElementContent(html, 'span', 'infoArea', escapeHtml(area));
  html = replaceElementContent(html, 'span', 'infoLocation', escapeHtml(location));

  if (imageUrl) {
    html = setElementAttribute(html, 'img', 'projectCoverImg', 'src', imageUrl);
    html = setElementAttribute(html, 'img', 'projectCoverImg', 'alt', cleanTitle + ' – Featured Project Photograph');
  }

  const scopes = parseArray(project.scope).filter((item) => typeof item === 'string' && item.trim());
  const scopeMarkup = scopes.map((item) =>
    '<span style="display:inline-block;font-size:0.8rem;background:#f3f4f6;color:#374151;padding:4px 10px;border-radius:4px;margin-right:6px;margin-bottom:6px;border:1px solid #e5e7eb;">✓ ' +
    escapeHtml(item) + '</span>'
  ).join('');
  html = replaceElementContent(html, 'div', 'projectScopeTags', scopeMarkup);

  html = setElementDisplay(html, 'projectLoadingState', 'none');
  html = setElementDisplay(html, 'projectContentState', 'block');

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: cleanTitle,
    description,
    url: canonicalUrl,
    image: imageUrl || undefined,
    creator: { '@type': 'Organization', name: 'Besim Design', url: DOMAIN },
  }).replace(/</g, '\\u003c');
  html = html.replace(/<\/head>/i, '  <script type="application/ld+json">' + jsonLd + '</script>\n</head>');

  return html;
}

/**
 * GET /:category/:slug — render only a valid active project record.
 * Database failures are passed to Express error handling (never converted to 404 or 200).
 */
export async function serveProjectDetailPage(req, res, next) {
  try {
    const rawSlug = String(req.params.slug || '').toLowerCase().trim();
    const hasHtmlSuffix = rawSlug.endsWith('.html');
    const requestedSlug = hasHtmlSuffix ? rawSlug.slice(0, -5) : rawSlug;

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(requestedSlug)) {
      return sendNotFound(res);
    }

    const aliasTarget = SLUG_ALIASES[requestedSlug] || null;
    const lookupSlug = aliasTarget || requestedSlug;
    const project = await db.get(
      'SELECT id, title, slug, category, client_name, location, area_sqft, description, scope, image_url, gallery, is_published FROM projects WHERE LOWER(TRIM(slug)) = ? LIMIT 1',
      lookupSlug
    );

    if (!project) return sendNotFound(res);

    const canonicalSlug = String(project.slug || '').trim().toLowerCase();
    const tombstone = await db.get(
      'SELECT project_id FROM deleted_projects WHERE project_id = ? OR (slug IS NOT NULL AND LOWER(TRIM(slug)) = ?) LIMIT 1',
      project.id,
      canonicalSlug
    );
    if (tombstone) return sendNotFound(res);

    const projectTitle = String(project.title || '').trim();
    const routeCategory = normalizeCategoryForUrl(project.category);
    if (
      Number(project.is_published) !== 1 ||
      !projectTitle ||
      !canonicalSlug ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(canonicalSlug) ||
      !routeCategory
    ) {
      return sendNotFound(res);
    }

    const categoryInfo = CATEGORY_DETAILS[routeCategory];
    if (!categoryInfo) return sendNotFound(res);

    const canonicalPath = '/' + routeCategory + '/' + canonicalSlug;
    const requestCategory = String(req.path.split('/')[1] || '').toLowerCase();
    if (
      aliasTarget ||
      hasHtmlSuffix ||
      requestedSlug !== canonicalSlug ||
      requestCategory !== routeCategory
    ) {
      return res.redirect(301, canonicalPath);
    }

    const templatePath = findTemplate();
    if (!templatePath) {
      const error = new Error('Project detail HTML template is missing');
      error.statusCode = 500;
      return next(error);
    }

    const template = fs.readFileSync(templatePath, 'utf8');
    const html = renderProjectHtml(template, project, categoryInfo, DOMAIN + canonicalPath);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, must-revalidate');
    return res.status(200).send(html);
  } catch (error) {
    return next(error);
  }
}

export default { serveProjectDetailPage };
