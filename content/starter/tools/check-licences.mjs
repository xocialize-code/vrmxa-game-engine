// Fails when a file in content/starter isn't listed in LICENCES.md (a backticked path in a table row; `*` matches within
// one folder level), when a listed path matches nothing, or when a content file's row isn't CC0 (decision AB-D-0297
// item 7: starter content is CC0 only). Code (tools/, test/) is the repository's, not content, and never exported.
//   node content/starter/tools/check-licences.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function checkLicences(root = path.resolve(import.meta.dirname, '..')) {
  const md = fs.readFileSync(path.join(root, 'LICENCES.md'), 'utf8');
  const listed = [...md.matchAll(/^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|/gm)].map((m) => ({ p: m[1], licence: m[2] }));
  const re = (p) => new RegExp(`^${p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`);
  const pats = listed.map((x) => ({ ...x, re: re(x.p), hits: 0 }));
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === '.DS_Store') continue; const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else files.push(path.relative(root, f).split(path.sep).join('/')); } };
  walk(root);
  const missing = [], notCC0 = [];
  const code = (f) => /^(tools|test)\//.test(f);
  for (const f of files) {
    const m = pats.filter((x) => x.re.test(f));
    if (!m.length) missing.push(f);
    m.forEach((x) => x.hits++);
    if (!code(f) && m.some((x) => !/^CC0-1\.0\b/.test(x.licence))) notCC0.push(`${f} (${m.map((x) => x.licence).join(', ')})`);
  }
  const stale = pats.filter((x) => !x.hits).map((x) => x.p);
  return { files: files.length, rows: listed.length, missing, stale, notCC0, ok: !missing.length && !stale.length && !notCC0.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = checkLicences();
  if (r.missing.length) console.error(`not in LICENCES.md:\n  ${r.missing.join('\n  ')}`);
  if (r.stale.length) console.error(`listed but no such file:\n  ${r.stale.join('\n  ')}`);
  if (r.notCC0.length) console.error(`content that isn't CC0:\n  ${r.notCC0.join('\n  ')}`);
  console.log(`${r.files} files, ${r.rows} rows${r.ok ? ': every file has a licence, every content file is CC0' : ''}`);
  process.exit(r.ok ? 0 : 1);
}
