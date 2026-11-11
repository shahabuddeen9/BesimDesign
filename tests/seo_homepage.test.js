import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('Homepage SEO & Structured Data Validation', () => {
  const rootIndexHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
  const publicIndexHtml = fs.readFileSync(path.resolve(process.cwd(), 'public/index.html'), 'utf-8');

  it('1. Title is set to "Besim Design | Architecture & Interior Design in Mumbai"', () => {
    const titleRegex = /<title>(.*?)<\/title>/i;
    const matchRoot = rootIndexHtml.match(titleRegex);
    const matchPub = publicIndexHtml.match(titleRegex);

    expect(matchRoot).not.toBeNull();
    expect(matchRoot[1].trim()).toBe('Besim Design | Architecture & Interior Design in Mumbai');

    expect(matchPub).not.toBeNull();
    expect(matchPub[1].trim()).toBe('Besim Design | Architecture & Interior Design in Mumbai');
  });

  it('2. Meta description matches the required unique description', () => {
    const descRegex = /<meta\s+name=["']description["']\s+content=["'](.*?)["']/i;
    const matchRoot = rootIndexHtml.match(descRegex);
    const matchPub = publicIndexHtml.match(descRegex);

    const expectedDesc = 'Besim Design delivers architectural design, interior execution and turnkey solutions for hospitality, luxury residential and central kitchen projects.';

    expect(matchRoot).not.toBeNull();
    expect(matchRoot[1].trim()).toBe(expectedDesc);

    expect(matchPub).not.toBeNull();
    expect(matchPub[1].trim()).toBe(expectedDesc);
  });

  it('3. Homepage H1 clearly identifies the brand as "Besim Design"', () => {
    const h1Regex = /<h1[^>]*>([\s\S]*?)<\/h1>/i;
    const matchRoot = rootIndexHtml.match(h1Regex);
    const matchPub = publicIndexHtml.match(h1Regex);

    expect(matchRoot).not.toBeNull();
    expect(matchRoot[1].trim()).toBe('Besim Design');

    expect(matchPub).not.toBeNull();
    expect(matchPub[1].trim()).toBe('Besim Design');
  });

  it('4. Canonical URL is kept as https://www.besimdesign.com/', () => {
    const canonicalRegex = /<link\s+rel=["']canonical["']\s+href=["'](.*?)["']/i;
    const matchRoot = rootIndexHtml.match(canonicalRegex);
    const matchPub = publicIndexHtml.match(canonicalRegex);

    expect(matchRoot).not.toBeNull();
    expect(matchRoot[1].trim()).toBe('https://www.besimdesign.com/');

    expect(matchPub).not.toBeNull();
    expect(matchPub[1].trim()).toBe('https://www.besimdesign.com/');
  });

  it('5. WebSite JSON-LD structured data is present, Google-compliant, and contains no duplicates', () => {
    const jsonLdRegex = /<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi;
    const matches = [...rootIndexHtml.matchAll(jsonLdRegex)];

    expect(matches.length).toBe(1);

    const schemaObj = JSON.parse(matches[0][1].trim());
    expect(schemaObj['@context']).toBe('https://schema.org');
    expect(schemaObj['@type']).toBe('WebSite');
    expect(schemaObj.name).toBe('Besim Design');
    expect(schemaObj.alternateName).toBe('Besim Design Studio');
    expect(schemaObj.url).toBe('https://www.besimdesign.com/');

    // Also check public/index.html
    const pubMatches = [...publicIndexHtml.matchAll(jsonLdRegex)];
    expect(pubMatches.length).toBe(1);
    const pubSchema = JSON.parse(pubMatches[0][1].trim());
    expect(pubSchema).toEqual(schemaObj);
  });

  it('6. OpenGraph and Twitter social card tags match the updated brand identity', () => {
    expect(rootIndexHtml).toContain('property="og:title" content="Besim Design | Architecture & Interior Design in Mumbai"');
    expect(rootIndexHtml).toContain('property="og:description" content="Besim Design delivers architectural design, interior execution and turnkey solutions for hospitality, luxury residential and central kitchen projects."');
    expect(rootIndexHtml).toContain('property="og:url" content="https://www.besimdesign.com/"');
    expect(rootIndexHtml).toContain('name="twitter:card" content="summary_large_image"');
  });
});
