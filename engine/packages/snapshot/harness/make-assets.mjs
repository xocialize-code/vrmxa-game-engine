// Puts the harness's assets in public/models/ (git-ignored: the models can't be committed): Mira is the
// avatar.vrm inside vrmxa-core's full.vrmxa fixture, Hana the specification's spec.vrm, the budget NPCs
// the determinism spike's vroid10.vrm (VRoid-class, 106 spring joints); the generated CC0 clips; the
// scene, the door prefabs and the recorded input. Every runtime then reads the same bytes.
import fs from 'node:fs';
import path from 'node:path';
import { read, vrmxaCore, testAnimations, available } from '../../character/test/fixtures.mjs';
if (!available('spec', 'full', 'vroid10', 'core', 'coreAnim')) throw new Error('needs VRMXA_Specification, vrmxa-core and spike-determinism/web/public/models/vroid10.vrm beside the repo');
const here = import.meta.dirname, out = path.join(here, 'public/models');
fs.mkdirSync(path.join(out, 'clips'), { recursive: true });
fs.mkdirSync(path.join(out, 'prefabs'), { recursive: true });
const core = await vrmxaCore();
const bundle = await core.readBundle(read('full'));
fs.writeFileSync(path.join(out, 'mira.vrm'), bundle.entries.get('avatar.vrm'));
fs.writeFileSync(path.join(out, 'hana.vrm'), read('spec'));
fs.writeFileSync(path.join(out, 'npc.vrm'), read('vroid10'));
const a = await testAnimations(core);
for (const [sha, bytes] of a.clips) fs.writeFileSync(path.join(out, 'clips', `${sha}.vrma`), bytes);
fs.writeFileSync(path.join(out, 'animations.json'), JSON.stringify(a.doc));
fs.copyFileSync(path.join(here, 'cafe.vrmxs'), path.join(out, 'cafe.vrmxs'));
for (const p of ['door.vrmxs', 'double-door.vrmxs']) fs.copyFileSync(path.join(here, '../../core/test/fixtures/prefabs', p), path.join(out, 'prefabs', p));
if (fs.existsSync(path.join(here, 'input.json'))) fs.copyFileSync(path.join(here, 'input.json'), path.join(out, 'input.json'));
console.log('wrote', out);
