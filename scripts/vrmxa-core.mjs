#!/usr/bin/env node
// vrmxa-core beside the repository, at the commit vrmxa-core.json pins (AB-A-0337). The apps bundle it, and the
// character tests and acceptance runs read it from ../vrmxa-core; it's public, so no key is needed. A game build's
// digest covers vrmxa-core's files, so a clone at another commit makes builds that recorded logs refuse.
//
//   node scripts/vrmxa-core.mjs             clone it beside the repository at the pinned commit if it's missing,
//                                           install its dependencies, then check it
//   node scripts/vrmxa-core.mjs --checkout  also move an existing clone to the pinned commit (refused when it has
//                                           changes of its own) and install that commit's dependencies
//   node scripts/vrmxa-core.mjs --check     only check: exit 1 when it's missing, at another commit, changed or
//                                           without its dependencies
//
// pinState() is the same check for scripts and builds that import this module (the game app's build warns, the
// recorded Rush run refuses).
// A worktree under .claude/worktrees/ reaches ../vrmxa-core through a symlink there, as it reaches
// VRMXA_Specification: ln -s <Development>/vrmxa-core .claude/worktrees/vrmxa-core
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
export const VRMXA_CORE_DIR = path.resolve(root, '../vrmxa-core');
export const VRMXA_CORE_PIN = JSON.parse(fs.readFileSync(path.join(root, 'vrmxa-core.json'), 'utf8'));
const dir = VRMXA_CORE_DIR, pin = VRMXA_CORE_PIN;
const git = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const short = (sha) => sha.slice(0, 7);

/** The clone beside the repository against the pin: { ok, problem } (problem: a sentence saying what's wrong). */
export function pinState() {
  if (!/^[0-9a-f]{40}$/.test(pin.commit ?? '')) return { ok: false, problem: `vrmxa-core.json's commit is not a full SHA (${pin.commit})` };
  if (!fs.existsSync(path.join(dir, '.git'))) return { ok: false, problem: `vrmxa-core is not beside the repository (${dir}): node scripts/vrmxa-core.mjs clones it` };
  let head, dirty;
  try { head = git('rev-parse', 'HEAD'); dirty = git('status', '--porcelain', '--untracked-files=no'); } catch (e) { return { ok: false, problem: `vrmxa-core (${dir}): git failed: ${String(e.stderr || e.message).trim()}` }; }
  if (head !== pin.commit) return { ok: false, head, problem: `vrmxa-core (${dir}) is at ${short(head)}, vrmxa-core.json pins ${short(pin.commit)}: node scripts/vrmxa-core.mjs --checkout moves it, or update the pin on purpose` };
  if (dirty) return { ok: false, head, problem: `vrmxa-core (${dir}) is at the pinned ${short(head)} but has changes of its own` };
  if (!fs.existsSync(path.join(dir, 'node_modules'))) return { ok: false, head, problem: `vrmxa-core (${dir}) has no node_modules: node scripts/vrmxa-core.mjs installs them` };
  return { ok: true, head, problem: null };
}

function main(args) {
  const fail = (message) => { console.error(message); process.exit(1); };
  const install = () => execFileSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: dir, stdio: 'inherit' });
  if (!args.has('--check')) {
    if (!fs.existsSync(path.join(dir, '.git'))) {
      if (fs.existsSync(dir)) fail(`${dir} is there but isn't a git clone: move it aside, then run this again`);
      execFileSync('git', ['clone', '--quiet', `https://github.com/${pin.repository}.git`, dir], { stdio: 'inherit' });
      git('checkout', '--quiet', '--detach', pin.commit);
      install();
    } else if (args.has('--checkout') && git('rev-parse', 'HEAD') !== pin.commit) {
      if (git('status', '--porcelain', '--untracked-files=no')) fail(`vrmxa-core (${dir}) has changes of its own: not moving it to ${short(pin.commit)}`);
      try { git('cat-file', '-e', `${pin.commit}^{commit}`); } catch { git('fetch', '--quiet', `https://github.com/${pin.repository}.git`, pin.commit); }
      git('checkout', '--quiet', '--detach', pin.commit);
      install(); // the pinned commit's own lock: a game build copies sql.js in as files
    } else if (git('rev-parse', 'HEAD') === pin.commit && !fs.existsSync(path.join(dir, 'node_modules'))) install();
  }
  const state = pinState();
  if (!state.ok) fail(state.problem);
  console.log(`vrmxa-core ${short(state.head)} beside the repository, as pinned`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  try { main(new Set(process.argv.slice(2))); } catch (e) { console.error(`vrmxa-core: ${String(e.stderr || e.message).trim()}`); process.exit(1); }
}
