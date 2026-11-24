#!/usr/bin/env node
// The documentation's link check (AB-T-0611), over the built site:
//
//   node scripts/docs-links.mjs docs/.vitepress/dist
//
// - every internal link, script, stylesheet and image in every page resolves to a file of the site, as the Worker's
//   static assets resolve it (the path itself, the path with .html, or the path's index.html);
// - every #fragment names an id in the page it points at (VitePress checks pages when it builds, not anchors);
// - every link in llms.txt resolves, and every page has its Markdown source beside it;
// - nothing internal is published: the site is public and the repository is not, so a bridge record id (AB-T-0611),
//   a home or volume path, or an email address anywhere in the site's text is an error.
// External links (http, https, mailto) are counted, not fetched: CI shouldn't fail on someone else's outage.
// No dependencies. Exit 1 listing each broken link with the page it is on.
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve(process.argv[2] ?? 'docs/.vitepress/dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error(`${dist}: no built site here (run the docs build first)`); process.exit(2); }

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const files = new Set(walk(dist).map((f) => path.relative(dist, f).split(path.sep).join('/')));
const pages = [...files].filter((f) => f.endsWith('.html'));

/** The file a site path is served from, or null. */
function resolve(sitePath) {
  const p = sitePath.replace(/^\/+/, '');
  for (const c of [p, `${p}.html`, `${p.replace(/\/$/, '')}/index.html`, p === '' ? 'index.html' : null]) if (c !== null && files.has(c)) return c;
  return null;
}

const idsOf = new Map();
/** The ids a page's HTML declares. */
function ids(file) {
  if (!idsOf.has(file)) idsOf.set(file, new Set([...fs.readFileSync(path.join(dist, file), 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  return idsOf.get(file);
}
const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const broken = [];
let links = 0, external = 0, anchors = 0;

/** Check one link found on a page (or in llms.txt). */
function check(from, raw) {
  const href = unescape(raw).trim();
  if (!href || /^(https?:|mailto:|tel:|data:|javascript:)/i.test(href)) { if (/^https?:/i.test(href)) external++; return; }
  if (href.startsWith('//')) { external++; return; }
  links++;
  const [target, fragment] = href.split('#');
  const base = from.endsWith('.html') || from.endsWith('.txt') ? path.posix.dirname(`/${from}`) : '/';
  const sitePath = target === '' ? `/${from}` : target.startsWith('/') ? target : path.posix.join(base, target);
  const file = resolve(sitePath.split('?')[0]);
  if (!file) { broken.push(`${from}: ${href} → no such file`); return; }
  if (fragment === undefined || fragment === '') return;
  // a fragment on a Markdown source points at the heading of the page it is the source of
  const page = file.endsWith('.md') ? file.replace(/\.md$/, '.html') : file;
  if (!page.endsWith('.html') || !files.has(page)) return;
  anchors++;
  let id = fragment;
  try { id = decodeURIComponent(fragment); } catch { /* as written */ }
  if (!ids(page).has(id)) broken.push(`${from}: ${href} → ${page} has no #${id}`);
}

for (const page of pages) {
  const html = fs.readFileSync(path.join(dist, page), 'utf8');
  for (const m of html.matchAll(/<(?:a|link|script|img|source)\b[^>]*?\s(?:href|src)="([^"]*)"/g)) check(page, m[1]);
}

// llms.txt: Markdown links
const llms = files.has('llms.txt') ? fs.readFileSync(path.join(dist, 'llms.txt'), 'utf8') : null;
if (llms === null) broken.push('llms.txt: not in the built site');
else for (const m of llms.matchAll(/\]\(([^)\s]+)\)/g)) check('llms.txt', m[1]);

// every page has its Markdown source beside it (the home page and the 404 page are layout only)
for (const page of pages) {
  if (page === 'index.html' || page === '404.html') continue;
  if (!files.has(page.replace(/\.html$/, '.md'))) broken.push(`${page}: its Markdown source (${page.replace(/\.html$/, '.md')}) is not in the built site`);
}

// nothing internal in what is published: pages, their Markdown, the indexes and the schema (not the bundled scripts)
const INTERNAL = [
  [/\bAB-[A-Z]-\d{3,}\b/g, 'a bridge record id'],
  [/(?:\/Users\/|\/Volumes\/|\/home\/)[\w.-]+/g, 'a home or volume path'],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\b/gi, 'an email address'],
];
const internal = [];
for (const f of [...files].filter((x) => /\.(html|md|txt|json)$/.test(x) && x !== 'hashmap.json')) {
  const text = fs.readFileSync(path.join(dist, f), 'utf8').replace(/<script\b[\s\S]*?<\/script>/g, '');
  for (const [re, what] of INTERNAL) for (const m of text.matchAll(re)) internal.push(`${f}: ${what} ("${m[0]}")`);
}

if (broken.length || internal.length) {
  for (const b of broken) console.error(`broken: ${b}`);
  for (const b of [...new Set(internal)]) console.error(`not for a public site: ${b}`);
  console.error(`\n${broken.length} broken link${broken.length === 1 ? '' : 's'}, ${internal.length} internal reference${internal.length === 1 ? '' : 's'} in ${dist}`);
  process.exit(1);
}
console.log(`docs links: ${pages.length} pages, ${links} internal links and ${anchors} anchors resolve; ${external} external links not fetched; no internal ids, paths or email addresses`);
