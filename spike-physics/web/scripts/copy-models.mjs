#!/usr/bin/env node
// Puts the avatars and motions the stage loads into public/models/ (not in git; never ship it).
//   spec      the VRMXA base character (VRMXA_Specification/assets/spec/spec.vrm)
//   vroid10   a VRM 1.0 model from the local VRoid dataset (licence: modification + corporate use allowed, credit necessary)
//   vroid0x   a VRM 0.x model from the same dataset, to check the 0.x path
//   idle/walk .vrma motions from vrmxa-core/assets/motions/kimodo
// Override any path with the env var named in the table below.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dev = path.resolve(web, '../../..'); // /Volumes/Satechi/Development
const out = path.join(web, 'public', 'models');
const DATASET = process.env.VROID_DATASET || '/Volumes/DEV_ARCHIVE/vroid-vrm-dataset/vroid';

const wanted = [
  { key: 'spec', file: 'spec.vrm', env: 'SPIKE_SPEC_VRM', from: path.join(dev, 'VRMXA_Specification/assets/spec/spec.vrm'), label: 'Spec (VRMXA base, VRM 1.0)' },
  { key: 'vroid10', file: 'vroid10.vrm', env: 'SPIKE_VROID10_VRM', from: path.join(DATASET, '9/9096495490126901469/9096495490126901469.vrm'), label: 'VRoid 9096… (VRM 1.0)' },
  { key: 'vroid0x', file: 'vroid0x.vrm', env: 'SPIKE_VROID0X_VRM', from: path.join(DATASET, '1/1020331055235827291/1020331055235827291.vrm'), label: 'VRoid 1020… (VRM 0.x)' },
  { key: 'idle', file: 'idle.vrma', env: 'SPIKE_IDLE_VRMA', from: path.join(dev, 'vrmxa-core/assets/motions/kimodo/idle.vrma') },
  { key: 'walk', file: 'walk.vrma', env: 'SPIKE_WALK_VRMA', from: path.join(dev, 'vrmxa-core/assets/motions/kimodo/walk.vrma') },
];

fs.mkdirSync(out, { recursive: true });
const manifest = { avatars: [], motions: {} };
for (const w of wanted) {
  const from = process.env[w.env] || w.from;
  const to = path.join(out, w.file);
  if (!fs.existsSync(from)) { console.warn(`[models] ${w.key}: not found at ${from}`); continue; }
  const src = fs.statSync(from);
  const have = fs.existsSync(to) ? fs.statSync(to) : null;
  if (!have || have.size !== src.size) fs.copyFileSync(from, to);
  if (w.file.endsWith('.vrm')) manifest.avatars.push({ key: w.key, url: `models/${w.file}`, label: w.label });
  else manifest.motions[w.key] = `models/${w.file}`;
}
fs.writeFileSync(path.join(out, 'models.json'), JSON.stringify(manifest, null, 2));
console.log(`[models] ${manifest.avatars.length} avatars, ${Object.keys(manifest.motions).length} motions in public/models`);
