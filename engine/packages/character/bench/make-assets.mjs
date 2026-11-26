// Puts the bench's assets in public/models/ (git-ignored: VRoid sample models can't be committed): the
// local vroid10.vrm (106 spring joints, the determinism spike's model) and the generated CC0 clips.
import fs from 'node:fs';
import path from 'node:path';
import { read, vrmxaCore, testAnimations, available } from '../test/fixtures.mjs';
if (!available('vroid10', 'core', 'coreAnim')) throw new Error('needs spike-determinism/web/public/models/vroid10.vrm and vrmxa-core beside the repo');
const out = path.join(import.meta.dirname, 'public/models');
fs.mkdirSync(path.join(out, 'clips'), { recursive: true });
fs.writeFileSync(path.join(out, 'vroid10.vrm'), read('vroid10'));
const a = await testAnimations(await vrmxaCore());
for (const [sha, bytes] of a.clips) fs.writeFileSync(path.join(out, 'clips', `${sha}.vrma`), bytes);
fs.writeFileSync(path.join(out, 'animations.json'), JSON.stringify(a.doc));
console.log('wrote', out);
