// M3 W4 (AB-T-0543): saves in the middle of a conversation, on the sample cafe (needs vrmxa-core). Hana is the
// host; the director runs the split turn on a scripted model with a slow line (150 steps), so a save can catch her waiting.
//   - A game saved after the turn, or while she waits, loads into a fresh world and continues, with the log's later
//     entries, to the same world as the original run at every later sample.
//   - The save carries the director's conversation history as app data (`extra`).
//   - Loaded into a live world, a question the save caught is told it was interrupted and asked again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { worldHashes, hashValue } from '@vrmxg/snapshot';
import { installDirector, scriptedModel, replayModel } from '@vrmxg/director';
import { loadSample, buildWorld } from '../../../../apps/playground/src/world.js';
import { vrmxaCore, PATHS } from '../../character/test/fixtures.mjs';
import * as projectBehaviours from '../../../../content/sample/behaviours.js';

installPortableMath();
const content = path.resolve(import.meta.dirname, '../../../../content/sample');
const skip = !fs.existsSync(PATHS.core) && 'needs vrmxa-core';
const flush = () => new Promise((r) => setImmediate(r));
const isVerdict = (req) => !req.tools.length && /Fill in this JSON object/.test(req.messages.at(-1).content);
const slowHana = () => scriptedModel((req) => (isVerdict(req) ? { text: '{"emotion": "happy", "gesture": null, "action": null, "goal": null}' } : { text: 'Morning, Mira! The usual?' }), { latency: 150 });

async function world() {
  const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
  const sample = await loadSample(bytes);
  sample.doc = { ...sample.doc, nodes: sample.doc.nodes.map((n) => (n.id === 'hana-1' ? { ...n, behaviours: [{ use: 'brain', preset: 'host' }] } : n)) };
  const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
  return buildWorld(await loadRapier(), sample, { vrmxaCore: await vrmxaCore(), closet, behaviours, stubTextures: true });
}

/** Step to `steps`, from step 0 or from a save; hashes every 30 steps; saves at the steps asked. */
async function play({ model, steps, script = () => {}, saveAt = [], from = null, replay = null, after = () => {} }) {
  const W = await world(), tree = W.tree;
  const director = installDirector(tree, { model, user: 'mira', userName: 'Mira', persona: (id) => W.personas.forDirector(id) });
  if (from) { await W.save.load(from); director.setHistory(from.extra?.director); }
  if (replay) W.ai.replay(replay);
  after(director, W);
  const hashes = {}, saves = {}, said = [];
  tree.listen(tree.find('hana-1'), 'spoke', (a) => said.push([tree.clock.step, a.text]));
  while (tree.clock.step < steps) {
    tree.step(); director.pump(); await flush();
    script(tree.clock.step, director, W);
    if (tree.clock.step % 30 === 0) hashes[tree.clock.step] = hashValue(worldHashes(tree, { physicsBytes: true }));
    if (saveAt.includes(tree.clock.step)) saves[tree.clock.step] = JSON.parse(JSON.stringify(W.save.save({ name: `at ${tree.clock.step}`, extra: { director: director.getHistory() } })));
  }
  return { W, director, hashes, saves, said, log: W.ai.record() };
}

test('a game saved mid-conversation loads and continues to the same world; the history travels as extra', { skip }, async () => {
  const talk = (step, d) => { if (step === 400) d.talk('hana-1', 'Good morning, Hana!'); };
  const a = await play({ model: slowHana(), steps: 1200, script: talk, saveAt: [450, 720] });
  assert.ok(a.said.some((s) => s[1] === 'Morning, Mira! The usual?'));
  assert.equal(a.saves[450].summary.step, 450);
  assert.deepEqual(a.saves[720].extra.director['hana-1'].map((h) => h.role), ['user', 'assistant'], 'the conversation, as app data');
  for (const at of [450, 720]) {
    const rest = a.log.filter((e) => e.step > at);
    const b = await play({ model: replayModel(), steps: 1200, from: a.saves[at], replay: rest });
    for (const s of Object.keys(a.hashes).map(Number).filter((s) => s > at)) assert.equal(b.hashes[s], a.hashes[s], `loaded at ${at}: the same world at ${s}`);
    assert.deepEqual(b.director.inspect('hana-1').history, at === 720 ? a.director.inspect('hana-1').history : [{ role: 'user', content: 'Good morning, Hana!' }], `the history came back (${at})`);
  }
});

test('loaded into a live world, a question the save caught is interrupted and asked again', { skip }, async () => {
  const a = await play({ model: slowHana(), steps: 460, script: (step, d) => { if (step === 400) d.talk('hana-1', 'Good morning, Hana!'); }, saveAt: [450] });
  let asked = null;
  const b = await play({ model: slowHana(), steps: 900, from: a.saves[450], after: (d) => { asked = d.resume(); } });
  assert.equal(asked.length, 1, 'one question asked again');
  const interrupted = b.log.find((e) => e.meta?.failed === 'interrupted');
  assert.ok(interrupted && interrupted.bb.director.pending === null, 'the waiting cleared as interrupted');
  assert.equal(b.director.requests[0].heard.text, 'Good morning, Hana!', 'the same question');
  assert.ok(b.said.some((s) => s[1] === 'Morning, Mira! The usual?' && s[0] > 600), 'and answered this time');
});
