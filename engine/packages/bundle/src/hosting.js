// A game build on a static host (M6 W7, AB-T-0648; README "On a static host"). A build is a folder of static files that
// plays from wherever it is served: its page and runtime use relative paths (base './'), it needs no custom scheme, no
// SharedArrayBuffer and so no cross-origin isolation headers, and nothing of it generates code from strings (the
// declared behaviours' schemas are checked by a precompiled meta-schema, @vrmxg/registry). What a host should send with
// it is here: the Content Security Policy the build was played under, as a header, and a Cloudflare Worker folder that
// serves the build as static assets (the operator deploys it; nothing here uploads anything).
//
//   vrmxg-export --worker <build> <out> [--name <worker>]   write <out>/wrangler.jsonc and <out>/public/ (the build and
//                                                           its _headers); `npx wrangler dev --ip 127.0.0.1` in <out>
//                                                           serves it locally, `npx wrangler deploy` publishes it
//
// Node only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** The inline scripts and styles of a page, as CSP hash sources ('sha256-…'). */
export function inlineHashes(html) {
  const hash = (text) => `'sha256-${crypto.createHash('sha256').update(text, 'utf8').digest('base64')}'`;
  const scripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => hash(m[1]));
  const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => hash(m[1]));
  return { scripts, styles };
}

/**
 * The Content Security Policy a game build plays under: nothing from elsewhere, no code from strings. WebAssembly
 * (Rapier, sql.js) needs 'wasm-unsafe-eval', which compiles WebAssembly and nothing else; the page's import map and
 * style are allowed by their hashes; GLTF textures and the closet's images are blob: and data: URLs, and an image
 * resize runs in a blob: worker. A game whose behaviours fetch from another host adds it to `connect`.
 * @param {string} html the build's index.html @param {{ connect?: string[] }} [o]
 */
export function contentSecurityPolicy(html, { connect = [] } = {}) {
  const { scripts, styles } = inlineHashes(html);
  return [
    "default-src 'self'",
    `script-src 'self' 'wasm-unsafe-eval' ${scripts.join(' ')}`.trim(),
    `style-src 'self' ${styles.join(' ')}`.trim(),
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' data: blob:${connect.length ? ` ${connect.join(' ')}` : ''}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

/**
 * A `_headers` file (Cloudflare's Workers static assets and Pages, Netlify) for a build: its CSP and nosniff on every
 * file. Files under assets/ are named by their content's hash, so they may be cached for good; the rest (the page, the
 * manifest, the project's files) are revalidated, so a new export of the game is seen at once.
 * @param {string} html the build's index.html @param {{ connect?: string[] }} [o]
 */
export function headersFile(html, o = {}) {
  return [
    '# Response headers for a VRMXG game build (written by vrmxg-export --worker; the host reads this file and does not serve it).',
    '/*',
    `  Content-Security-Policy: ${contentSecurityPolicy(html, o)}`,
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: same-origin',
    '  Cache-Control: no-cache',
    '/assets/*',
    '  ! Cache-Control',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
  ].join('\n');
}

/** A Worker's name from a game's id: lowercase letters, digits and dashes, at most 63. */
export const workerName = (id) => `vrmxg-${String(id).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')}`.slice(0, 63).replace(/-+$/, '');

/**
 * Write a Cloudflare Worker folder that serves a build as static assets: `<out>/public/` (the build's files and a
 * `_headers`), `<out>/wrangler.jsonc` (assets only: no script runs per request; no workers.dev address or preview URLs
 * until the operator says so). Refuses an `<out>` that holds anything but an earlier such folder.
 * @param {{ build: string, out: string, name?: string, compatibilityDate?: string, connect?: string[] }} o
 * @returns {{ out: string, name: string, files: number, bytes: number, largest: { path: string, bytes: number } }}
 */
export function workerFolder({ build, out, name, compatibilityDate = '2026-11-23', connect = [] }) {
  const manifest = JSON.parse(fs.readFileSync(path.join(build, 'vrmxg-build.json'), 'utf8'));
  const html = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
  const worker = name ?? workerName(manifest.game.id);
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(worker)) throw new Error(`not a Worker name: ${worker} (lowercase letters, digits and dashes)`);
  if (fs.existsSync(out)) {
    const there = fs.readdirSync(out).filter((n) => !n.startsWith('.'));
    if (there.some((n) => !['public', 'wrangler.jsonc'].includes(n))) throw new Error(`${out} holds other files: name an empty folder, or one vrmxg-export --worker wrote`);
    fs.rmSync(path.join(out, 'public'), { recursive: true, force: true });
  }
  const pub = path.join(out, 'public');
  fs.mkdirSync(pub, { recursive: true });
  let files = 0, bytes = 0, largest = { path: '', bytes: 0 };
  for (const f of ['index.html', 'vrmxg-build.json', ...manifest.files.map((r) => r.path)]) {
    const to = path.join(pub, f), from = path.join(build, f);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    const n = fs.statSync(to).size;
    files++; bytes += n;
    if (n > largest.bytes) largest = { path: f, bytes: n };
  }
  fs.writeFileSync(path.join(pub, '_headers'), headersFile(html, { connect }));
  fs.writeFileSync(path.join(out, 'wrangler.jsonc'), `${[
    `// A Cloudflare Worker serving the game "${String(manifest.game.title ?? manifest.game.id).replace(/[\r\n]/g, ' ')}" (build ${manifest.digest.slice(0, 16)}) as static assets, written by`,
    '// vrmxg-export --worker. No script runs per request. `npx wrangler dev --ip 127.0.0.1` serves it on this Mac only;',
    '// publishing it (`npx wrangler deploy`, with the account chosen) is the operator\'s step: add a route or set',
    '// workers_dev to true first, since neither address is on until then.',
    JSON.stringify({ name: worker, compatibility_date: compatibilityDate, workers_dev: false, preview_urls: false, assets: { directory: './public', html_handling: 'auto-trailing-slash', not_found_handling: 'none' } }, null, 2),
  ].join('\n')}\n`);
  return { out, name: worker, files, bytes, largest };
}
