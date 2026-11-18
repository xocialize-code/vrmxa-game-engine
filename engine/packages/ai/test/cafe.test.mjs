// M2 W7 on the sample cafe (needs vrmxa-avatar-studio beside the repo for the characters): Hana runs on the server
// preset and Mira on the customer preset. Mira comes in, sits on a free stool and calls Hana over; Hana greets her, walks
// over, asks, hears the order, makes it at the counter and brings it; Mira drinks, stands and leaves. The same every
// run; a snapshot mid-order replays identically; a director's injected decision lands on its step and replays from the
// log.
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

/** The cafe with Hana as the server and Mira as a customer (her player behaviour replaced). */
export async function brains() {
  const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
  const sample = await loadSample(bytes);
  sample.doc = { ...sample.doc, nodes: sample.doc.nodes.map((n) => (n.id === 'hana-1' ? { ...n, behaviours: [{ use: 'brain', preset: 'server' }] } : n.id === 'mira' ? { ...n, behaviours: [{ use: 'brain', preset: 'customer' }] } : n)) };
  const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
  return { sample, opts: { vrmxaCore: await vrmxaCore(), closet, behaviours, stubTextures: true } };
}
const hash = (tree) => hashValue(worldHashes(tree, { physicsBytes: true }));

/** Play the scene `steps` steps (from a snapshot, if given), logging lines and seats. */
export async function play(R, sample, opts, { steps = 3000, snapAt = null, from = null, inject = null } = {}) {
  const W = await buildWorld(R, sample, opts);
  const tree = W.tree, events = [];
  for (const id of ['hana-1', 'mira']) tree.listen(tree.find(id), 'spoke', (a) => events.push([tree.clock.step, id, 'says', a.text]));
  if (from) restoreWorld(tree, from);
  if (inject) inject(W);
  let snap = null, seatedAt = null, stoodAt = null;
  const mira = /** @type {any} */ (tree.find('mira'));
  while (tree.clock.step < steps) {
    tree.step();
    if (mira.ctrl.seat && seatedAt === null) { seatedAt = tree.clock.step; events.push([tree.clock.step, 'mira', 'sits', mira.ctrl.seat.item]); }
    if (seatedAt !== null && !mira.ctrl.seat && stoodAt === null) { stoodAt = tree.clock.step; events.push([tree.clock.step, 'mira', 'stands', null]); }
    if (tree.clock.step === snapAt) snap = captureWorld(tree);
  }
  return { W, events, snap, hash: hash(tree), mira: mira.object3d.position.clone(), hana: tree.find('hana-1').object3d.position.clone() };
}

test('Hana serves Mira: greet, order, counter, served; Mira sits, orders, drinks, leaves; the same every run; a snapshot mid-order replays', { skip: !OK && 'needs vrmxa-avatar-studio' }, async () => {
  const R = await loadRapier();
  const { sample, opts } = await brains();
  const a = await play(R, sample, opts, { steps: 3400, snapAt: 1200 });
  const said = (who, text) => a.events.find((e) => e[1] === who && e[2] === 'says' && e[3] === text)?.[0] ?? null;

  const greet = said('hana-1', 'Welcome in!'), ask = said('hana-1', 'Hi! What can I get you?'), order = said('mira', 'A latte, please.');
  const ack = said('hana-1', 'Coming right up!'), served = said('hana-1', 'Here you go. Enjoy!');
  const sits = a.events.find((e) => e[2] === 'sits')?.[0], stands = a.events.find((e) => e[2] === 'stands')?.[0];
  assert.ok(greet !== null, 'Hana greets Mira when she sees her');
  assert.ok(sits && ask > sits && order > ask && ack > order && served > ack, `in order: sits ${sits}, asked ${ask}, ordered ${order}, acknowledged ${ack}, served ${served}`);
  assert.ok(stands > served, `stands after being served (${stands})`);
  assert.ok(a.W.tree.find('mira').behaviours[0].bb.left, `Mira left (${a.mira.toArray().map((v) => v.toFixed(2))})`);
  const b = await play(R, sample, opts, { steps: 3400 });
  assert.equal(b.hash, a.hash, 'two runs, the same world');
  const c = await play(R, sample, opts, { steps: 3400, from: a.snap });
  assert.equal(c.hash, a.hash, 'restored at step 1200, the same world at 3400');
});

test('the director hook: an injected decision lands on its step, is logged, and a replay of the log is the same run', { skip: !OK && 'needs vrmxa-avatar-studio' }, async () => {
  const R = await loadRapier();
  const { sample, opts } = await brains();
  let log = null;
  const a = await play(R, sample, opts, { steps: 600, inject: (W) => {
    W.ai.inject({ step: 120, agent: 'hana-1', action: { do: 'say', args: { text: 'Good morning!', topic: 'greet' } } });
    W.ai.inject({ step: 300, agent: 'hana-1', action: { do: 'emote', args: { name: 'happy' } } });
    const t = W.tree; t.listen(t.find('hana-1'), 'spoke', () => { log = W.ai.record(); });
  } });
  const line = a.events.find((e) => e[3] === 'Good morning!');
  assert.ok(line && line[0] >= 120 && line[0] <= 121, `said on its step (${line?.[0]})`);
  const recorded = a.W.ai.record();
  assert.equal(recorded.length, 2, 'both decisions logged');
  assert.ok(log, 'the log was readable while running');
  const b = await play(R, sample, opts, { steps: 600, inject: (W) => W.ai.replay(recorded) });
  assert.equal(b.hash, a.hash, 'the replayed log gives the same run');
  const c = await play(R, sample, opts, { steps: 600 });
  assert.notEqual(c.hash, a.hash, 'and without it, a different one');
});
