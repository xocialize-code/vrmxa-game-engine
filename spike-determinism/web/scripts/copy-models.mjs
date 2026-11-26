#!/usr/bin/env node
// Puts the avatars and motions into public/models/ (not in git; never ship or commit it).
//   spec      VRMXA base character (via spike-physics, from VRMXA_Specification)
//   vroid10   VRoid Hub 9096495490126901469, VRM 1.0 (licence: modification + corporate use, credit required)
//   vroid0x   VRoid Hub 1020331055235827291, VRM 0.x (same licence terms)
//   seed-san  vrm-specification sample (VRM Public License 1.0): springs, constraints, expression overrides
//   idle / walk / run_b / wave_b .vrma from vrmxa-core/assets/motions/kimodo
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dev = path.resolve(web, '../../..'); // /Volumes/Satechi/Development
const out = path.join(web, 'public', 'models');
const physics = path.join(dev, 'vrmxa-game-engine/spike-physics/web/public/models');
const kimodo = path.join(dev, 'vrmxa-core/assets/motions/kimodo');
const wanted = [
  ['spec.vrm', path.join(physics, 'spec.vrm')],
  ['vroid10.vrm', path.join(physics, 'vroid10.vrm')],
  ['vroid0x.vrm', path.join(physics, 'vroid0x.vrm')],
  ['seed-san.vrm', path.join(os.homedir(), 'Documents/vrm-specification-master/samples/Seed-san/vrm/Seed-san.vrm')],
  ['idle.vrma', path.join(kimodo, 'idle.vrma')],
  ['walk.vrma', path.join(kimodo, 'walk.vrma')],
  ['run_b.vrma', path.join(kimodo, 'run_b.vrma')],
  ['wave_b.vrma', path.join(kimodo, 'wave_b.vrma')],
];
fs.mkdirSync(out, { recursive: true });
let n = 0;
for (const [file, from] of wanted) {
  const to = path.join(out, file);
  if (!fs.existsSync(from)) { console.warn(`[models] missing ${from}`); continue; }
  if (!fs.existsSync(to) || fs.statSync(to).size !== fs.statSync(from).size) fs.copyFileSync(from, to);
  n++;
}
console.log(`[models] ${n}/${wanted.length} files in public/models`);
