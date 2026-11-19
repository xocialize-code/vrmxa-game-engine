// Puts the test models in public/models (git-ignored, never committed).
// Mira and Hana come out of the sample characters' .vrmxa bundles (zip, avatar.vrm inside);
// vroid10 is spike-physics' VRoid Studio 1.0 export, added because it uses normal maps and more MToon inputs.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const here = import.meta.dirname;
const repo = path.resolve(here, '../../..');
const dst = path.resolve(here, '../public/models');
fs.mkdirSync(dst, { recursive: true });

for (const name of ['mira', 'hana']) {
  const out = path.join(dst, `${name}.vrm`);
  if (fs.existsSync(out)) continue;
  const bundle = path.join(repo, 'content/sample/characters', `${name}.vrmxa`);
  fs.writeFileSync(out, execFileSync('unzip', ['-p', bundle, 'avatar.vrm'], { maxBuffer: 64 << 20 }));
}
const vroid = path.join(repo, 'spike-physics/web/public/models/vroid10.vrm');
if (fs.existsSync(vroid) && !fs.existsSync(path.join(dst, 'vroid10.vrm'))) fs.copyFileSync(vroid, path.join(dst, 'vroid10.vrm'));
console.log('models ready:', fs.readdirSync(dst).join(', '));
