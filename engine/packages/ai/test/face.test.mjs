// M3 W12 (AB-A-0313): turning to face someone. On the sample cafe (needs vrmxa-avatar-studio beside the repo), Hana turns
// in place to face Mira standing behind her: the character's face(), and the brains' `face` action, which succeeds once
// she is within ~5° and fails after its time runs out. The turn is state: the same in two runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { worldHashes, hashValue } from '@vrmxg/snapshot';
import { ACTIONS } from '@vrmxg/ai';
import { loadSample, buildWorld } from '../../../../apps/playground/src/world.js';
import { vrmxaCore, PATHS } from '../../character/test/fixtures.mjs';

installPortableMath();
const content = path.resolve(import.meta.dirname, '../../../../content/sample');
const OK = fs.existsSync(PATHS.core);

async function world() {
  const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
  const sample = await loadSample(bytes);
  // Hana at the counter facing +z (into the room); Mira 2 m behind her (−z), both with nothing else to do
  sample.doc = { ...sample.doc, nodes: sample.doc.nodes.map((n) => (n.id === 'hana-1' ? { ...n, behaviours: [], transform: { p: [0, 0, -2] } } : n.id === 'mira' ? { ...n, behaviours: [], transform: { p: [0.3, 0, -4.4] } } : n)) };
  const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  return buildWorld(await loadRapier(), sample, { vrmxaCore: await vrmxaCore(), closet, behaviours: new Map(), stubTextures: true });
}
const facingError = (hana, mira) => {
  const h = hana.object3d.position, m = mira.object3d.position, want = Math.atan2(m.x - h.x, m.z - h.z);
  let d = want - hana.ctrl.yaw; d -= Math.floor((d + Math.PI) / (2 * Math.PI)) * 2 * Math.PI;
  return Math.abs(d);
};

test('Hana turns to face Mira behind her, eased, and says so', { skip: !OK && 'needs vrmxa-avatar-studio' }, async () => {
  const W = await world(), hana = /** @type {any} */ (W.tree.find('hana-1')), mira = W.tree.find('mira');
  for (let i = 0; i < 10; i++) W.tree.step();
  assert.ok(facingError(hana, mira) > 2.5, 'she starts with her back to Mira');
  let faced = null;
  W.tree.listen(hana, 'faced', () => { faced = W.tree.clock.step; });
  hana.face({ target: 'mira' });
  const from = W.tree.clock.step;
  for (let i = 0; i < 120 && faced === null; i++) W.tree.step();
  assert.ok(faced !== null && faced - from > 30 && faced - from < 70, `she turned over ~0.75 s (${faced - from} steps at 4 rad/s)`);
  assert.ok(facingError(hana, mira) < 0.09, `facing Mira within 5° (${facingError(hana, mira).toFixed(3)} rad)`);
  assert.equal(hana.ctrl.face, undefined, 'done: nothing left in her state');
});

test('the brains\' face action succeeds when she faces the target, fails when time runs out; two runs are the same', { skip: !OK && 'needs vrmxa-avatar-studio' }, async () => {
  const run = async (seconds) => {
    const W = await world(), hana = /** @type {any} */ (W.tree.find('hana-1'));
    const ctx = () => ({ node: hana, tree: W.tree, step: W.tree.clock.step });
    const data = ACTIONS.face.start(ctx(), { target: 'mira', seconds });
    let status = 'running';
    while (status === 'running') { W.tree.step(); status = ACTIONS.face.update(ctx(), { target: 'mira' }, data); }
    return { status, step: W.tree.clock.step, hash: hashValue(worldHashes(W.tree)) };
  };
  const a = await run(3), b = await run(3), late = await run(0.2);
  assert.equal(a.status, 'success'); assert.equal(late.status, 'failure', 'a fifth of a second is too short to turn round');
  assert.deepEqual(a, b, 'the same step and world twice');
  assert.equal(ACTIONS.face.start({ node: {}, tree: { find: () => null } }, { target: 'nobody' }).failed, true, 'no such target: it fails');
});
