// Fails when a file in content/sample isn't listed in LICENCES.md (a backticked path in a table row; `*` matches
// within one folder level), or when a listed path matches nothing.
//   node content/sample/tools/check-licences.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const md = fs.readFileSync(path.join(root, 'LICENCES.md'), 'utf8');
const listed = [...md.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map((m) => m[1]);
const re = (p) => new RegExp(`^${p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`);
const pats = listed.map((p) => ({ p, re: re(p), hits: 0 }));
const files = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === '.DS_Store') continue; const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else files.push(path.relative(root, f).split(path.sep).join('/')); } };
walk(root);
const missing = [];
for (const f of files) { const m = pats.filter((x) => x.re.test(f)); if (!m.length) missing.push(f); m.forEach((x) => x.hits++); }
const stale = pats.filter((x) => !x.hits).map((x) => x.p);
if (missing.length) console.error(`not in LICENCES.md:\n  ${missing.join('\n  ')}`);
if (stale.length) console.error(`listed but no such file:\n  ${stale.join('\n  ')}`);
console.log(`${files.length} files, ${listed.length} rows${missing.length || stale.length ? '' : ': every file has a licence'}`);
process.exit(missing.length || stale.length ? 1 : 0);
