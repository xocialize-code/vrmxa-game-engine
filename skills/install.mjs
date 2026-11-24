#!/usr/bin/env node
// Install the repository's skills on this machine, for Claude Code and other clients that read Agent Skills folders.
// Local only: nothing is published anywhere (publishing a skill is the operator's step).
//
//   node skills/install.mjs                 copy each skill into ~/.claude/skills/<name>/
//   node skills/install.mjs --project <dir> into <dir>/.claude/skills/<name>/ (a project's own skills)
//   node skills/install.mjs --dest <dir>    into <dir>/<name>/
//   node skills/install.mjs --link          a symbolic link to the repository's copy instead (it follows the repo)
//   node skills/install.mjs --force         replace a folder of that name that isn't this skill
//
// A folder that holds this skill already (its SKILL.md has the same name) is replaced; any other is left alone unless
// --force. Start a new agent session afterwards: clients read skills when a session starts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const here = import.meta.dirname;
const argv = process.argv.slice(2), opt = (k) => { const i = argv.indexOf(k); return i < 0 ? null : argv[i + 1] ?? ''; };
const link = argv.includes('--link'), force = argv.includes('--force');
for (const k of ['--dest', '--project']) if (opt(k) === '' || opt(k)?.startsWith('--')) { console.error(`${k} needs a folder`); process.exit(2); }
const dest = opt('--dest') ?? (opt('--project') !== null ? path.join(opt('--project'), '.claude/skills') : path.join(os.homedir(), '.claude/skills'));

/** A skill's name from its SKILL.md front matter, or null. @param {string} file */
export function skillName(file) {
  if (!fs.existsSync(file)) return null;
  const m = /^---\n[\s\S]*?^name: *(.+?) *$[\s\S]*?^---$/m.exec(fs.readFileSync(file, 'utf8'));
  return m ? m[1].replace(/^["']|["']$/g, '') : null;
}

const skills = fs.readdirSync(here, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(here, e.name, 'SKILL.md'))).map((e) => e.name);
fs.mkdirSync(dest, { recursive: true });
let failed = 0;
for (const name of skills) {
  const from = path.join(here, name), to = path.join(dest, name);
  if (skillName(path.join(from, 'SKILL.md')) !== name) { console.error(`${name}: its SKILL.md names another skill (or none): not installed`); failed++; continue; }
  const st = fs.lstatSync(to, { throwIfNoEntry: false });
  // the repository's own copy (--dest skills, or a folder that leads back to it) is the source: never removed
  if (st && !st.isSymbolicLink() && fs.realpathSync(to) === fs.realpathSync(from)) { console.error(`${to} is this skill's own source: nothing installed`); failed++; continue; }
  if (st) {
    const ours = st.isSymbolicLink() ? fs.realpathSync(to) === fs.realpathSync(from) || skillName(path.join(to, 'SKILL.md')) === name : skillName(path.join(to, 'SKILL.md')) === name;
    if (!ours && !force) { console.error(`${to} holds something else: left alone (--force replaces it)`); failed++; continue; }
    fs.rmSync(to, { recursive: true, force: true });
  }
  if (link) fs.symlinkSync(from, to, 'dir'); else fs.cpSync(from, to, { recursive: true });
  console.log(`${link ? 'linked' : 'installed'} ${name} → ${to}`);
}
if (!skills.length) console.error('no skills here');
process.exit(failed || !skills.length ? 1 : 0);
