import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.resolve(process.argv[2] ?? fileURLToPath(new URL('../dist/', import.meta.url)));
const origin = 'https://borgdock.dev';
const read = (file) => fs.readFileSync(path.join(dist, file), 'utf8');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const file = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(file) : [file];
});

assert.match(read('robots.txt'), /User-agent: \*\s+Allow: \//);
assert.ok(read('robots.txt').includes(`Sitemap: ${origin}/sitemap-index.xml`));
const sitemapFiles = [...read('sitemap-index.xml').matchAll(/<loc>(.*?)<\/loc>/g)]
  .map((match) => new URL(match[1]));
assert.ok(sitemapFiles.length > 0, 'Sitemap index must list a sitemap');
const locations = sitemapFiles.flatMap((url) => {
  assert.equal(url.origin, origin);
  return [...read(url.pathname.slice(1)).matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
});
assert.equal(new Set(locations).size, locations.length, 'Duplicate sitemap URLs');
const titles = new Set();
const pages = walk(dist).filter((file) => file.endsWith('.html'));
for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8');
  const route = path.relative(dist, file).replaceAll('\\', '/').replace(/index\.html$/, '');
  const expected = new URL(route, `${origin}/`).href;
  assert.ok(html.includes(`<link rel="canonical" href="${expected}"`), `${route}: canonical`);
  assert.ok(locations.includes(expected), `${route}: missing from sitemap`);
  assert.doesNotMatch(html, /<meta[^>]+(?:name="robots"|name="googlebot")[^>]+noindex/i);
  const title = html.match(/<title>(.*?)<\/title>/)?.[1];
  assert.ok(title?.includes('BorgDock'), `${route}: branded title`);
  assert.ok(!titles.has(title), `${route}: duplicate title`);
  titles.add(title);
  for (const name of ['description', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) {
    assert.match(html, new RegExp(`<meta name="${name}" content="[^"]+"`), `${route}: ${name}`);
  }
  for (const name of ['og:title', 'og:description', 'og:type', 'og:site_name', 'og:url', 'og:image']) {
    assert.match(html, new RegExp(`<meta property="${name}" content="[^"]+"`), `${route}: ${name}`);
  }
  const image = new URL(html.match(/<meta property="og:image" content="([^"]+)"/)?.[1]);
  assert.equal(image.origin, origin);
  assert.ok(fs.existsSync(path.join(dist, image.pathname)), `${route}: share image exists`);
}
assert.equal(locations.length, pages.length, 'Sitemap must match built HTML pages');
const home = read('index.html');
const data = JSON.parse(home.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)?.[1]);
assert.ok(data['@graph'].some((item) => item['@type'] === 'WebSite' && item.name === 'BorgDock'));
assert.ok(data['@graph'].some((item) => item['@type'] === 'SoftwareApplication' && item.name === 'BorgDock'));
console.log(`SEO checks passed for ${pages.length} pages, sitemap, robots.txt and structured data.`);
