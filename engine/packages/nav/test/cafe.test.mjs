// M2 W6 on the sample cafe (needs vrmxa-core beside the repo for the characters): the navmesh bakes from the
// set's colliders, the locked staff door blocks its doorway, Hana walks behind the counter (round it, not through it)
// and Mira walks in through the entrance, both along the crowd's paths on their own controllers; the same every run,
// and a snapshot mid-walk replays identically.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { captureWorld, restoreWorld, worldHashes, hashValue } from '@vrmxg/snapshot';
import { loadSample, buildWorld } from '../../../../apps/playground/src/world.js';
import { vrmxaCore, PATHS } from '../../character/test/fixtures.mjs';
import * as projectBehaviours from '../../../../content/sample/behaviours.js';

installPortableMath();
const content = path.resolve(import.meta.dirname, '../../../../content/sample');
const OK = fs.existsSync(PATHS.core);

async function cafe() {
  const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
  const sample = await loadSample(bytes);
  // Hana without her wander and greet (her goTo is the test), Mira without the player's input
  sample.doc = { ...sample.doc, nodes: sample.doc.nodes.map((n) => (n.id === 'hana-1' ? { ...n, behaviours: [] } : n.id === 'mira' ? { ...n, behaviours: [] } : n)) };
  const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
  return { sample, opts: { vrmxaCore: await vrmxaCore(), closet, behaviours, stubTextures: true } };
}
const hash = (tree) => hashValue(worldHashes(tree, { physicsBytes: true }));

test('Hana walks behind the counter and Mira walks in, along the navmesh; the same every run; a snapshot mid-walk replays', { skip: !OK && 'needs vrmxa-core' }, async () => {
  const R = await loadRapier();
  const { sample, opts } = await cafe();
  const BEHIND = [0.6, 0, -4.6], INSIDE = [-0.8, 0, 1.2];
  const run = async (snapAt = null, from = null) => {
    const W = await buildWorld(R, sample, opts);
    const tree = W.tree, hana = /** @type {any} */ (tree.find('hana-1')), mira = /** @type {any} */ (tree.find('mira'));
    const seen = { arrived: {}, minCounterGap: Infinity };
    tree.listen(hana, 'arrived', () => { seen.arrived.hana ??= tree.clock.step; });
    tree.listen(mira, 'arrived', () => { seen.arrived.mira ??= tree.clock.step; });
    let snap = null;
    if (from) restoreWorld(tree, from);
    else { hana.goTo({ point: BEHIND }); mira.goTo({ point: INSIDE }); }
    while (tree.clock.step < 900) {
      tree.step();
      // the counter's front edge is at z ≈ -3.5 between x ≈ -1.6 and 1.6: walking through it would cross that strip
      const p = hana.object3d.position;
      if (p.x > -1.2 && p.x < 1.2 && p.z < -3.6 && p.z > -4.0) seen.minCounterGap = Math.min(seen.minCounterGap, Math.abs(p.z + 3.8));
      if (tree.clock.step === snapAt) snap = captureWorld(tree);
    }
    return { W, seen, snap, hash: hash(tree), hana: hana.object3d.position.clone(), mira: mira.object3d.position.clone() };
  };
  const a = await run(300);
  assert.ok(a.seen.arrived.hana, `Hana arrived behind the counter (${a.hana.toArray().map((v) => v.toFixed(2))})`);
  assert.ok(a.seen.arrived.mira, `Mira arrived inside (${a.mira.toArray().map((v) => v.toFixed(2))})`);
  const snapped = a.W.nav.closest(BEHIND);
  assert.ok(Math.hypot(a.hana.x - snapped[0], a.hana.z - snapped[2]) < 0.3, `at the navmesh point nearest the goal (${snapped.map((v) => v.toFixed(2))})`);
  assert.equal(a.seen.minCounterGap, Infinity, 'Hana never walked through the counter');
  assert.ok(a.W.nav.stats.polys > 50 && a.W.nav.st.blocked['item:door-1'], 'baked, and the locked staff door blocks its doorway');
  const b = await run();
  assert.equal(b.hash, a.hash, 'two runs, the same world');
  const c = await run(null, a.snap);
  assert.equal(c.hash, a.hash, 'restored at step 300 (both mid-walk), the same world at 900');
});
