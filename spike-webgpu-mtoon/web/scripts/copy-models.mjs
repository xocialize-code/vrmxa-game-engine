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

// The VRoid Hub sample (results/vroid-sample.json, picked by scripts/scan-vroid-dataset.py) when the dataset is
// mounted: public/models/vroid-sample/<id>.vrm. Licence-filtered; never committed.
const dataset = process.env.VROID_DATASET ?? '/Volumes/DEV_ARCHIVE/vroid-vrm-dataset/vroid';
const sampleFile = path.resolve(here, '../../results/vroid-sample.json');
if (fs.existsSync(dataset) && fs.existsSync(sampleFile)) {
  const { sample } = JSON.parse(fs.readFileSync(sampleFile, 'utf8'));
  fs.mkdirSync(path.join(dst, 'vroid-sample'), { recursive: true });
  for (const { id } of sample) {
    const out = path.join(dst, 'vroid-sample', `${id}.vrm`);
    if (!fs.existsSync(out)) fs.copyFileSync(path.join(dataset, findBucket(id), id, `${id}.vrm`), out);
  }
  console.log(`vroid sample ready: ${sample.length} models`);
}
function findBucket(id) {
  for (const b of fs.readdirSync(dataset)) if (fs.existsSync(path.join(dataset, b, id))) return b;
  throw new Error(`model ${id} not in ${dataset}`);
}
