#!/usr/bin/env node
// Copies the avatars and motions from the physics spike into public/models/ (not in git; never ship).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const from = path.resolve(web, '../../spike-physics/web/public/models');
const out = path.join(web, 'public', 'models');
fs.mkdirSync(out, { recursive: true });
let n = 0;
for (const f of ['spec.vrm', 'vroid10.vrm', 'vroid0x.vrm', 'idle.vrma', 'walk.vrma', 'models.json']) {
  const src = path.join(from, f), dst = path.join(out, f);
  if (!fs.existsSync(src)) { console.warn(`[models] missing ${src}`); continue; }
  if (!fs.existsSync(dst) || fs.statSync(dst).size !== fs.statSync(src).size) fs.copyFileSync(src, dst);
  n++;
}
console.log(`[models] ${n} files in public/models (copied from spike-physics)`);
