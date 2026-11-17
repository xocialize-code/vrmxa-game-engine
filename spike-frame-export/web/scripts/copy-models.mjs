#!/usr/bin/env node
// Copies the avatar and motions from spike-physics (never commit or ship them) into public/models/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const from = path.resolve(web, '../../spike-physics/web/public/models');
const out = path.join(web, 'public', 'models');
fs.mkdirSync(out, { recursive: true });
for (const f of ['vroid10.vrm', 'spec.vrm', 'idle.vrma', 'walk.vrma']) {
  const src = path.join(from, f), dst = path.join(out, f);
  if (!fs.existsSync(src)) { console.warn(`[models] missing ${src}`); continue; }
  if (!fs.existsSync(dst) || fs.statSync(dst).size !== fs.statSync(src).size) fs.copyFileSync(src, dst);
}
console.log('[models] copied into public/models');
