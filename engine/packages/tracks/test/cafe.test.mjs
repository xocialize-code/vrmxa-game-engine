// M2 W0 on the sample cafe (needs vrmxa-core beside the repo for the characters): an AnimationPlayer in the
// scene's data opens the staff door by an event key, fades the counter light, and plays Hana's talk clip over her
// locomotion for two seconds. Two runs are identical, and a snapshot taken mid-play restores and replays identically.
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
const player = { id: 'show', type: 'AnimationPlayer', parent: 'root', props: { fps: 30, autoplay: true, tracks: [
  { id: 'door', type: 'event', keys: [[15, { target: 'door-1', call: 'enterState', args: { state: 'open' } }]] },
  { id: 'light', type: 'property', target: 'counter-light', path: 'props.intensity', keys: [[0, 18], [45, 2, 'easeInOut']] },
  { id: 'hana', type: 'animation', target: 'hana-1', clips: [{ start: 10, end: 70, slot: 'talk', blendIn: 8, blendOut: 8 }] },
] } };

async function cafe() {
  const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
  const sample = await loadSample(bytes);
  sample.doc = { ...sample.doc, nodes: [...sample.doc.nodes, player] };
  const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
  return { sample, opts: { vrmxaCore: await vrmxaCore(), closet, behaviours, stubTextures: true } };
}

test('an AnimationPlayer in the cafe opens a door, fades a light and plays Hana\'s talk clip, the same every run', { skip: !OK && 'needs vrmxa-core' }, async () => {
  const R = await loadRapier();
  const { sample, opts } = await cafe();
  const run = async (snapAt = null, restore = null) => {
    const W = await buildWorld(R, sample, opts);
    if (restore) restoreWorld(W.tree, restore);
    const seen = { talkWeight: 0, doorAt: null };
    let snap = null;
    for (let k = W.tree.clock.step; k < 180; k++) {
      while (!W.tree.step()) await W.tree.settle();
      const hana = /** @type {any} */ (W.tree.find('hana-1'));
      const talk = hana.graph.slots.talk?.clips?.[0]?.clip;
      if (talk) seen.talkWeight = Math.max(seen.talkWeight, hana.actions.get(talk)?.weight ?? 0);
      if (seen.doorAt === null && W.tree.find('door-1').current === 'open') seen.doorAt = W.tree.clock.step;
      if (W.tree.clock.step === snapAt) snap = captureWorld(W.tree);
    }
    return { hash: hashValue(worldHashes(W.tree, { physicsBytes: true })), light: W.tree.find('counter-light').props.intensity, hana: W.tree.find('hana-1'), seen, snap, W };
  };
  const a = await run(60), b = await run();
  assert.equal(a.hash, b.hash, 'two runs, the same world');
  assert.equal(a.seen.doorAt, 31, 'the door opened on the step that crossed frame 15');
  assert.equal(a.light, 2);
  assert.ok(a.seen.talkWeight > 0.99, `Hana's talk clip took over (${a.seen.talkWeight})`);
  assert.equal(a.hana.trackAnimation, null, 'and let go when the player finished');
  const c = await run(null, a.snap);
  assert.equal(c.hash, a.hash, 'restored at step 60 (mid-clip), it replays to the same world');
});
