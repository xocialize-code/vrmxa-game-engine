// "After Hours", the second game (M6 W10, AB-T-0651): everything under after-hours/ but its behaviour (after-hours/
// behaviours.js, written by hand). Re-run to regenerate; the outputs are committed, and a run that changes nothing writes
// the same bytes.
//
//   after-hours/items/scarf.vrmxi,      the lost things: VRMXI pickups, found (lost), out of sight (away) and on their
//     phone.vrmxi, book.vrmxi           shelf (shelved); a take verb while lost
//   after-hours/items/shelf.vrmxi       the starter content's shelf (content/starter/items/shelf.vrmxi, CC0), copied
//   after-hours/props/back-room.glb     the store room behind the staff door: floor, walls, a lamp (boxes and colliders)
//   after-hours/{title,level,won,lost}.vrmxs
//                                       the scenes, as the editor builds them: tools/after-hours-plan.mjs applied to the
//                                       editor's own EditorSession (the ops its panels call), saved as it saves
//   after-hours/game.json               the game document, as File › Project Settings… leaves it after New Project
//                                       from the "One level" template (the editor's own ProjectSettings, applied here)
//
//   node content/sample/tools/make-after-hours.mjs [--check]     --check: write nothing, exit 1 when a file would change
// Needs vrmxa-core beside the repo (it packs the items).
import fs from 'node:fs';
import path from 'node:path';
import { writeGLB, writeGLBTree } from '@vrmxg/model';
import { packItem } from '@vrmxg/item';
import { createValidator, parse, serialize } from '@vrmxg/scene';
import { vrmxaCore as loadCore } from '../../../engine/packages/character/test/fixtures.mjs';
import { DIR, LOST } from './after-hours-plan.mjs';
import { afterHoursRegistry, buildScenes, afterHoursGame } from './after-hours-build.mjs';

const root = path.resolve(import.meta.dirname, '..');
const repo = path.resolve(root, '../..');
const check = process.argv.includes('--check');
const GEN = 'VRMXG sample game "After Hours" (content/sample/tools/make-after-hours.mjs)';
const changed = [];
const write = (rel, bytes) => {
  const file = path.join(root, rel), data = Buffer.from(bytes);
  if (fs.existsSync(file) && Buffer.compare(fs.readFileSync(file), data) === 0) return;
  changed.push(rel);
  if (check) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  console.log('wrote', rel, data.length, 'bytes');
};

// ---------------------------------------------------------------- the lost things
const META = { version: '1.0', authors: ['Xocialize LLC'], licenseUrl: 'https://vrm.dev/licenses/1.0/', commercialUsage: 'corporation', creditNotation: 'unnecessary', allowRedistribution: true, modification: 'allowModificationRedistribution' };
const box3 = (size) => ({ type: 'box', box: { size } });
// each model's origin is the bottom of the thing; Reach is a sensor about it that a person standing beside overlaps
const SHAPES = {
  scarf: [
    { name: 'Folds', t: [0, 0.025, 0], box: { size: [0.34, 0.05, 0.2], color: '#b8323a', roughness: 0.9 } },
    { name: 'Stripe', t: [0, 0.051, 0], box: { size: [0.34, 0.004, 0.05], color: '#e9d9b8', roughness: 0.9 } },
    { name: 'Tail', t: [0.2, 0.01, 0.04], box: { size: [0.12, 0.02, 0.07], color: '#b8323a', roughness: 0.9 } },
  ],
  phone: [
    { name: 'Body', t: [0, 0.006, 0], box: { size: [0.08, 0.012, 0.16], color: '#1e2328', roughness: 0.3, metalness: 0.4 } },
    { name: 'Screen', t: [0, 0.0125, 0.004], box: { size: [0.07, 0.002, 0.135], color: '#3a6fa8', roughness: 0.15 } },
  ],
  book: [
    { name: 'Cover', t: [0, 0.02, 0], box: { size: [0.17, 0.04, 0.24], color: '#2f5d8a', roughness: 0.7 } },
    { name: 'Pages', t: [0.006, 0.02, 0], box: { size: [0.165, 0.032, 0.228], color: '#efe8d8', roughness: 0.9 } },
  ],
};
const lostModel = (l) => {
  const parts = SHAPES[l.key];
  return writeGLBTree({ name: l.name, generator: GEN, roots: ['Thing'], nodes: [
    { name: 'Thing', children: [...parts.map((p) => p.name), 'Reach'] },
    ...parts,
    { name: 'Reach', t: [0, 0, 0], trigger: box3([1.8, 1.6, 1.8]) },
  ] });
};
const lostManifest = (l) => {
  const parts = SHAPES[l.key].map((p) => p.name);
  return {
    format: 'vrmxi', version: 1, id: l.id, revision: 1, name: l.name, generator: GEN, type: 'pickup', tags: ['lost-property', `lost:${l.key}`], model: { file: 'model.glb' },
    states: [
      { name: 'lost', tags: ['lost:found-here'], show: parts },
      { name: 'away', tags: ['lost:away'], show: [] },
      { name: 'shelved', tags: ['lost:shelved'], show: parts },
    ],
    verbs: [{ verb: 'take', prompt: `Pick up the ${l.name.toLowerCase()}`, states: ['lost'], reach: 'Reach' }],
    takeable: false, extensions: {}, meta: META,
    listing: null, origin: { made: 'authored', source: 'content/sample/tools/make-after-hours.mjs' }, madeWith: null, thumbnail: null, files: [],
  };
};
const core = await loadCore();
for (const l of LOST) write(`${DIR}/items/${l.key}.vrmxi`, await packItem({ manifest: lostManifest(l), model: lostModel(l), vrmxaCore: core }));
write(`${DIR}/items/shelf.vrmxi`, fs.readFileSync(path.join(repo, 'content/starter/items/shelf.vrmxi')));

// ---------------------------------------------------------------- the back room
// Inside x 6.2 to 9.4, z -5.2 to -0.8, behind the cafe's east wall (its staff door at z -3); its floor reaches under
// the doorway to the cafe's floor (which ends at x 6).
const C = { floor: '#8f7a62', wall: '#d9d0c2', trim: '#6b4a33', lamp: '#fff1c9', box: '#a8875f' };
write(`${DIR}/props/back-room.glb`, writeGLB({ name: 'back-room', generator: GEN, parts: [
  { name: 'floor', size: [3.7, 0.2, 4.8], p: [7.85, -0.1, -3], color: C.floor, collider: true },
  { name: 'wall-north', size: [3.6, 3, 0.2], p: [7.9, 1.5, -5.3], color: C.wall, collider: true },
  { name: 'wall-south', size: [3.6, 3, 0.2], p: [7.9, 1.5, -0.7], color: C.wall, collider: true },
  { name: 'wall-east', size: [0.2, 3, 4.8], p: [9.5, 1.5, -3], color: C.wall, collider: true },
  { name: 'skirting', size: [3.2, 0.12, 0.04], p: [7.8, 0.06, -5.18], color: C.trim },
  { name: 'lamp', size: [0.25, 0.1, 0.25], p: [7.8, 2.6, -3], color: C.lamp, roughness: 0.3 },
  { name: 'boxes', size: [0.6, 0.5, 0.5], p: [9.0, 0.25, -1.4], color: C.box, collider: true },
  { name: 'boxes-top', size: [0.45, 0.35, 0.4], p: [9.0, 0.675, -1.4], color: C.box, collider: true },
] }));

// ---------------------------------------------------------------- the scenes, through the editor's session
const reg = await afterHoursRegistry();
const { check: validate } = createValidator(reg);
for (const { scene, session } of buildScenes(reg)) {
  const text = session.text();
  const r = validate(parse(text), { prefabs: new Map() });
  if (!r.ok) throw new Error(`${scene.ref}: ${r.errors.join('\n')}`);
  if (r.warnings.length) console.log(`${scene.ref}: ${r.warnings.length} warnings: ${r.warnings.join('; ')}`);
  if (serialize(parse(text)) !== text) throw new Error(`${scene.ref}: not canonical after a round trip`);
  write(scene.ref, text);
}

// ---------------------------------------------------------------- the game document, through the editor's settings
write(`${DIR}/game.json`, await afterHoursGame());

if (check) {
  console.log(changed.length ? `would change: ${changed.join(', ')}` : `${DIR}/ is up to date`);
  process.exit(changed.length ? 1 : 0);
}
console.log(changed.length ? `${changed.length} files written` : 'nothing changed');
