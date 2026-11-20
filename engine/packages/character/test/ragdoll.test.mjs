// M3 W7 (AB-T-0546): ragdolls on the sample cafe (needs vrmxa-avatar-studio beside the repo for the characters). Mira and
// Hana stand on a landing at the top of four steps; each is knocked down the stairs, falls, lies still and gets up,
// blending back into animation. One mapping for both, no numbers per model. Two runs are the same, and a snapshot taken
// mid-fall re-simulates to the same end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Vector3 } from 'three';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { worldHashes, hashValue, captureWorld, restoreWorld, compareRuns } from '@vrmxg/snapshot';
import { loadSample, buildWorld } from '../../../../apps/playground/src/world.js';
import { withStairs, STAIRS } from '../../../../apps/playground/src/stairs.js';
import { humanoidRagdoll, RAGDOLL_BONES } from '../src/ragdoll.js';
import { vrmxaCore, PATHS } from './fixtures.mjs';
import * as projectBehaviours from '../../../../content/sample/behaviours.js';

installPortableMath();
const content = path.resolve(import.meta.dirname, '../../../../content/sample');
const OK = fs.existsSync(PATHS.core);
const WHO = ['mira', 'hana-1'];
const SHOVE = [-45, 0, 0]; // N·s on the torso, down the stairs (−x)
const KNOCK_AT = 30, SNAP_AFTER = 40;

async function world() {
  const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
  const sample = await loadSample(bytes);
  sample.doc = withStairs(sample.doc);
  const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
  return buildWorld(await loadRapier(), sample, { vrmxaCore: await vrmxaCore(), closet, behaviours, stubTextures: true });
}
const hipsY = (c) => new Vector3().setFromMatrixPosition(c.vrm.humanoid.getNormalizedBoneNode('hips').matrixWorld).y;

/** Knock both down at KNOCK_AT and run until both are up (or `steps`); a hash after every step. */
async function fall({ steps = 900, snapAt = null, watch = null } = {}) {
  const W = await world();
  const cs = WHO.map((id) => /** @type {any} */ (W.tree.find(id)));
  const run = [];
  let snap = null;
  for (let k = 1; k <= steps; k++) {
    if (k === KNOCK_AT) for (const c of cs) c.knockDown({ impulse: SHOVE });
    W.tree.step();
    watch?.(k, cs);
    run.push({ step: k, h: worldHashes(W.tree, { physicsBytes: k % 60 === 0 }) });
    if (k === snapAt) snap = captureWorld(W.tree);
  }
  return { W, cs, run, snap };
}

test('the mapping: eleven parts from each humanoid, sized from its skeleton', { skip: !OK && 'needs vrmxa-avatar-studio' }, async () => {
  const W = await world();
  for (const id of WHO) {
    const c = /** @type {any} */ (W.tree.find(id));
    c.object3d.updateWorldMatrix(true, true);
    const parts = humanoidRagdoll(c.vrm, { mass: 60 });
    assert.deepEqual(parts.map((p) => p.name), RAGDOLL_BONES);
    assert.ok(Math.abs(parts.reduce((a, p) => a + p.mass, 0) - 60) < 1e-9, 'the masses add up to the character\'s');
    for (const p of parts) {
      const s = p.shape;
      assert.ok(s.radius > 0.02 && s.radius < 0.2, `${id} ${p.name}: radius ${s.radius.toFixed(3)}`);
      if (s.shape === 'capsule') assert.ok(s.height > 0.1 && s.height < 0.8, `${id} ${p.name}: length ${s.height.toFixed(3)}`);
      assert.equal(p.joint === undefined, p.parent < 0);
    }
    const legs = parts.filter((p) => /LowerLeg$/.test(p.name)), arms = parts.filter((p) => /LowerArm$/.test(p.name));
    assert.ok(legs.every((p) => p.joint.type === 'hinge') && arms.every((p) => p.joint.type === 'hinge'), 'knees and elbows are hinges');
  }
});

test('knocked down the stairs, both characters fall, lie still and get up, blending back into animation', { skip: !OK && 'needs vrmxa-avatar-studio' }, async () => {
  const seen = WHO.map(() => ({ phases: [], lowestHips: Infinity, signals: [], nan: false }));
  const { cs } = await fall({
    watch: (k, cs) => cs.forEach((c, i) => {
      const s = seen[i], ph = c.ragdoll?.phase ?? 'up';
      if (s.phases.at(-1) !== ph) s.phases.push(ph);
      const y = hipsY(c);
      if (!Number.isFinite(y)) s.nan = true;
      if (c.ragdoll && c.ragdoll.phase !== 'rising') s.lowestHips = Math.min(s.lowestHips, y);
    }),
  });
  cs.forEach((c, i) => {
    const s = seen[i];
    assert.equal(s.nan, false, `${c.id}: no NaN`);
    assert.deepEqual(s.phases, ['up', 'falling', 'down', 'rising', 'up'], `${c.id}: falls, lies, gets up (${s.phases.join(' → ')})`);
    assert.ok(s.lowestHips < STAIRS.top - 0.3, `${c.id}: went down the stairs (hips at ${s.lowestHips.toFixed(3)} m)`);
    const p = c.object3d.position;
    assert.ok(p.y < STAIRS.top - STAIRS.rise + 0.01, `${c.id}: stands below the landing after (${p.y.toFixed(3)} m)`);
    assert.ok(p.x < STAIRS.edge, `${c.id}: off the landing (${p.x.toFixed(3)})`);
    assert.ok(hipsY(c) - p.y > 0.6, `${c.id}: standing (hips ${(hipsY(c) - p.y).toFixed(3)} m over the feet)`);
    assert.equal(c.ragdoll, null);
    assert.ok(c.physics.world.world.getCollider(c.collider).isEnabled(), `${c.id}: the capsule is back on`);
  });
});

test('the fall is the same twice, and a snapshot taken mid-fall re-simulates to the same end', { skip: !OK && 'needs vrmxa-avatar-studio' }, async () => {
  const STEPS = 600, AT = KNOCK_AT + SNAP_AFTER;
  const A = await fall({ steps: STEPS, snapAt: AT });
  assert.equal(A.snap.nodes.mira.ragdoll?.phase, 'falling', 'the snapshot is mid-fall');
  const B = await fall({ steps: STEPS });
  assert.equal(compareRuns(A.run, B.run), null, 'two runs, the same hashes after every step');
  const C = await world();
  restoreWorld(C.tree, A.snap);
  const again = [];
  for (let k = AT + 1; k <= STEPS; k++) { C.tree.step(); again.push({ step: k, h: worldHashes(C.tree, { physicsBytes: k % 60 === 0 }) }); }
  assert.equal(compareRuns(A.run.slice(AT), again), null, 'restored mid-fall: the same hashes to the end');
  assert.equal(hashValue(A.run.at(-1).h), hashValue(again.at(-1).h));
});
