#!/usr/bin/env node
// Install the repository's skills on this machine, for Claude Code and other clients that read Agent Skills folders.
// Local only: nothing is published anywhere (publishing a skill is the operator's step).
//
//   node skills/install.mjs                 copy each skill into ~/.claude/skills/<name>/
//   node skills/install.mjs --project <dir> into <dir>/.claude/skills/<name>/ (a project's own skills)
//   node skills/install.mjs --dest <dir>    into <dir>/<name>/
//   node skills/install.mjs --link          a symbolic link to the repository's copy instead (it follows the repo)
//   node skills/install.mjs --force         replace what is there although it isn't this skill as it would be installed
//
// What it replaces without --force: nothing, or a link to this skill, or a folder that already holds exactly what it
// would install. Anything else (a folder with changes in it, a link elsewhere or to nothing, a file) is left alone
// unless --force. Never, --force or not: a target that is the skill's own source, contains it (the repository cloned
// into the skills folder) or lies inside it. Start a new agent session afterwards: clients read skills when a session
// starts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const here = import.meta.dirname;
const argv = process.argv.slice(2), opt = (k) => { const i = argv.indexOf(k); return i < 0 ? null : argv[i + 1] ?? ''; };
const link = argv.includes('--link'), force = argv.includes('--force');
const stop = (m) => { console.error(m); process.exit(2); };
for (const k of ['--dest', '--project']) if (opt(k) === '' || opt(k)?.startsWith('--')) stop(`${k} needs a folder`);
let dest = opt('--dest') ?? (opt('--project') !== null ? path.join(opt('--project'), '.claude/skills') : null);
if (dest === null) {
  const home = os.homedir();
  if (!home || !path.isAbsolute(home)) stop(`no home folder to install into (HOME is ${JSON.stringify(home)}): pass --dest <dir> or --project <dir>`);
  dest = path.join(home, '.claude/skills');
}
dest = path.resolve(dest);

/** A skill's name from its SKILL.md front matter, or null. @param {string} file */
export function skillName(file) {
  if (!fs.existsSync(file)) return null;
  const m = /^---\n[\s\S]*?^name: *(.+?) *$[\s\S]*?^---$/m.exec(fs.readFileSync(file, 'utf8'));
  return m ? m[1].replace(/^["']|["']$/g, '') : null;
}

/** A path with every folder that exists resolved through links (the rest as written), so two spellings compare. */
function real(p) {
  let head = path.resolve(p);
  const tail = [];
  while (!fs.existsSync(head)) { tail.unshift(path.basename(head)); const up = path.dirname(head); if (up === head) break; head = up; }
  return path.join(fs.realpathSync(head), ...tail);
}
const inside = (a, b) => { const r = path.relative(b, a); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); }; // a is b or under it

/** Every file under a folder, by relative path, with its bytes; links and other kinds make it not a plain copy (null). */
function tree(dir) {
  const out = new Map();
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name), r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (walk(p, r) === null) return null; } else if (e.isFile()) out.set(r, fs.readFileSync(p)); else return null;
    }
    return out;
  };
  return walk(dir, '');
}
const same = (a, b) => !!a && !!b && a.size === b.size && [...a].every(([k, v]) => b.has(k) && b.get(k).equals(v));

const skills = fs.readdirSync(here, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(here, e.name, 'SKILL.md'))).map((e) => e.name);
let failed = 0;
for (const name of skills) {
  const from = path.join(here, name), to = path.join(dest, name), src = fs.realpathSync(from);
  if (skillName(path.join(from, 'SKILL.md')) !== name) { console.error(`${name}: its SKILL.md names another skill (or none): not installed`); failed++; continue; }
  // where the target is, through any links in the folders above it (not through the target itself: a link there is
  // only ever unlinked, which can't touch what it points at)
  const at = path.join(real(path.dirname(to)), name);
  if (inside(src, at) || inside(at, src)) { console.error(`${to} ${inside(src, at) && at !== src ? 'contains' : 'is or lies inside'} this skill's own source (${src}): nothing installed there, --force or not`); failed++; continue; }
  const st = fs.lstatSync(to, { throwIfNoEntry: false });
  if (st) {
    let ours = false, what = 'something else';
    if (st.isSymbolicLink()) {
      let target = null;
      try { target = fs.realpathSync(to); } catch { /* a link to nothing */ }
      ours = target === src;
      what = target === null ? 'a link to nothing' : `a link to ${target}`;
    } else if (st.isDirectory()) {
      ours = same(tree(to), tree(from));
      what = skillName(path.join(to, 'SKILL.md')) === name ? 'a copy of this skill with changes in it' : 'a folder of something else';
    } else what = 'a file';
    if (!ours && !force) { console.error(`${to} holds ${what}: left alone (--force replaces it)`); failed++; continue; }
    if (st.isSymbolicLink() || !st.isDirectory()) fs.unlinkSync(to); else fs.rmSync(to, { recursive: true, force: true });
  }
  fs.mkdirSync(dest, { recursive: true });
  if (link) fs.symlinkSync(src, to, 'dir'); else fs.cpSync(from, to, { recursive: true });
  console.log(`${link ? 'linked' : 'installed'} ${name} → ${to}`);
}
if (!skills.length) console.error('no skills here');
process.exit(failed || !skills.length ? 1 : 0);
