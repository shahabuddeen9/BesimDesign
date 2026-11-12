const PROJECT_PAGE_PATH = /^\/(?:hospitality|hotels|residential|central-kitchen)\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\.html)?$/i;

function getHeader(headers, names) {
  for (const name of names) {
    const value = headers?.[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Restore public page paths hidden behind the Vercel /api/index rewrite.
 * The __page query value is internal routing metadata and is removed before
 * Express receives the request. Real user query parameters are preserved.
 */
export function resolveVercelRequestUrl(req) {
  const headers = req.headers || {};
  const baseUrl = 'https://vercel.invalid';
  const rawForwarded = getHeader(headers, [
    'x-forwarded-url',
    'x-forwarded-uri',
    'x-vercel-rewrite-path',
  ]);
  const requestUrl = new URL(req.url || '/', baseUrl);
  const incomingUrl = rawForwarded ? new URL(rawForwarded, baseUrl) : requestUrl;
  const query = new URLSearchParams(incomingUrl.search);

  for (const [key, value] of requestUrl.searchParams.entries()) {
    if (!query.has(key)) query.append(key, value);
  }

  const explicitPage = typeof req.query?.__page === 'string'
    ? req.query.__page
    : query.get('__page');
  query.delete('__page');

  let resolvedPath = '';
  if (explicitPage === '/sitemap.xml') {
    resolvedPath = '/api/sitemap.xml';
  } else if (explicitPage && PROJECT_PAGE_PATH.test(explicitPage)) {
    resolvedPath = explicitPage;
  } else if (PROJECT_PAGE_PATH.test(incomingUrl.pathname)) {
    resolvedPath = incomingUrl.pathname;
  } else if (incomingUrl.pathname === '/sitemap.xml') {
    resolvedPath = '/api/sitemap.xml';
  } else if (
    incomingUrl.pathname === '/api' ||
    incomingUrl.pathname.startsWith('/api/') ||
    incomingUrl.pathname.startsWith('/uploads/')
  ) {
    resolvedPath = incomingUrl.pathname;
  } else if (incomingUrl.pathname.startsWith('/auth/') || incomingUrl.pathname.startsWith('/admin/')) {
    resolvedPath = '/api' + incomingUrl.pathname;
  } else {
    const rawParts = req.query?.slug || req.query?.match || req.query?.path;
    if (rawParts) {
      const parts = Array.isArray(rawParts) ? rawParts : [rawParts];
      const isUpload = incomingUrl.pathname.includes('uploads') || (rawForwarded || '').includes('uploads');
      resolvedPath = isUpload ? '/uploads/' + parts.join('/') : '/api/' + parts.join('/');
    } else {
      resolvedPath = incomingUrl.pathname;
    }
  }

  if (!resolvedPath.startsWith('/')) resolvedPath = '/' + resolvedPath;

  const isProjectPage = PROJECT_PAGE_PATH.test(resolvedPath);
  if (
    !resolvedPath.startsWith('/api') &&
    !resolvedPath.startsWith('/uploads') &&
    !resolvedPath.startsWith('/admin') &&
    !isProjectPage
  ) {
    resolvedPath = '/api' + (resolvedPath.startsWith('/') ? '' : '/') + resolvedPath;
  }

  const querySuffix = query.toString();
  return resolvedPath + (querySuffix ? '?' + querySuffix : '');
}

export default { resolveVercelRequestUrl };
