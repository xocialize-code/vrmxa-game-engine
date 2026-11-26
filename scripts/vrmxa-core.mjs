#!/usr/bin/env node
// vrmxa-core beside the repository, at the commit vrmxa-core.json pins (AB-A-0337). The apps bundle it, and the
// character tests and acceptance runs read it from ../vrmxa-core; it's public, so no key is needed.
//
//   node scripts/vrmxa-core.mjs             clone it beside the repository at the pinned commit if it's missing,
//                                           install its dependencies, then check it
//   node scripts/vrmxa-core.mjs --checkout  also move an existing clone to the pinned commit (refused when it has
//                                           changes of its own)
//   node scripts/vrmxa-core.mjs --check     only check: exit 1 when it's missing or at another commit
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const pin = JSON.parse(fs.readFileSync(path.join(root, 'vrmxa-core.json'), 'utf8'));
const dir = path.resolve(root, '../vrmxa-core');
const args = new Set(process.argv.slice(2));
const git = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' }).trim();
const short = (sha) => sha.slice(0, 7);

if (!fs.existsSync(path.join(dir, '.git'))) {
  if (args.has('--check')) { console.error(`vrmxa-core is not beside the repository (${dir}): node scripts/vrmxa-core.mjs clones it`); process.exit(1); }
  execFileSync('git', ['clone', '--quiet', `https://github.com/${pin.repository}.git`, dir], { stdio: 'inherit' });
  git('checkout', '--quiet', '--detach', pin.commit);
}

let head = git('rev-parse', 'HEAD');
if (head !== pin.commit && args.has('--checkout')) {
  if (git('status', '--porcelain')) { console.error(`vrmxa-core (${dir}) has changes of its own: not moving it to ${short(pin.commit)}`); process.exit(1); }
  try { git('cat-file', '-e', `${pin.commit}^{commit}`); } catch { git('fetch', '--quiet', 'origin'); }
  git('checkout', '--quiet', '--detach', pin.commit);
  head = git('rev-parse', 'HEAD');
}
if (!args.has('--check') && !fs.existsSync(path.join(dir, 'node_modules'))) execFileSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: dir, stdio: 'inherit' });

if (head !== pin.commit) {
  console.error(`vrmxa-core (${dir}) is at ${short(head)}, vrmxa-core.json pins ${short(pin.commit)}: node scripts/vrmxa-core.mjs --checkout moves it, or update the pin on purpose (game builds bundle it)`);
  process.exit(1);
}
console.log(`vrmxa-core ${short(head)} beside the repository, as pinned`);
