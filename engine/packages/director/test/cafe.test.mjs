// M3 W0 (AB-T-0539) on the sample cafe (needs vrmxa-avatar-studio beside the repo for the characters). Hana runs the
// server brain and Mira the customer brain; the person speaks as Mira. With a scripted model:
//   - a conversation: the request flags Hana as waiting on her next tick, the reply lands on its step as a line with a
//     face and a look, and two live runs give the same world at every checked step;
//   - replay: the ai log alone, with no model, gives the same world at every checked step, and so does a snapshot taken
//     while Hana was waiting, restored with the rest of the log;
//   - bad replies are rejected in the world, nothing of them is said, and Hana still serves Mira;
//   - a model that never answers times out, and its late answer is dropped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { captureWorld, restoreWorld, worldHashes, hashValue } from '@vrmxg/snapshot';
import { installDirector, scriptedModel, replayModel } from '@vrmxg/director';
import { loadSample, buildWorld } from '../../../../apps/playground/src/world.js';
import { vrmxaCore, PATHS } from '../../character/test/fixtures.mjs';
import * as projectBehaviours from '../../../../content/sample/behaviours.js';

installPortableMath();
const content = path.resolve(import.meta.dirname, '../../../../content/sample');
const OK = fs.existsSync(PATHS.core);
const skip = !OK && 'needs vrmxa-avatar-studio';

async function cafe() {
  const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
  const sample = await loadSample(bytes);
  sample.doc = { ...sample.doc, nodes: sample.doc.nodes.map((n) => (n.id === 'hana-1' ? { ...n, behaviours: [{ use: 'brain', preset: 'server' }] } : n.id === 'mira' ? { ...n, behaviours: [{ use: 'brain', preset: 'customer' }] } : n)) };
  const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
  return { sample, opts: { vrmxaCore: await vrmxaCore(), closet, behaviours, stubTextures: true } };
}
const hash = (tree) => hashValue(worldHashes(tree, { physicsBytes: true }));
const flush = () => new Promise((r) => setImmediate(r));

/**
 * Play `steps` steps with a director on `model`; `script(step, director, W)` runs after each step (the person talking).
 * Hashes every 30 steps.
 */
async function play(R, sample, opts, { steps, model, script = () => {}, replay = null, from = null, snapAt = null }) {
  const W = await buildWorld(R, sample, opts), tree = W.tree;
  const director = installDirector(tree, { design: 'one', model, user: 'mira', userName: 'Mira', persona: (id) => (id === 'hana-1' ? { name: 'Hana', summary: 'Runs the cafe.', allowedExpressions: ['happy', 'relaxed'] } : null) });
  const said = [], waiting = [], hashes = {};
  for (const id of ['hana-1', 'mira']) tree.listen(tree.find(id), 'spoke', (a) => said.push([tree.clock.step, id, a.text]));
  if (from) restoreWorld(tree, from.snap);
  if (replay) W.ai.replay(replay);
  let snap = null;
  const hana = /** @type {any} */ (tree.find('hana-1')).behaviours[0];
  while (tree.clock.step < steps) {
    tree.step();
    director.pump();
    await flush();
    script(tree.clock.step, director, W);
    if (hana.bb.director?.pending) waiting.push(tree.clock.step);
    if (tree.clock.step % 30 === 0) hashes[tree.clock.step] = hash(tree);
    if (tree.clock.step === snapAt) snap = { snap: captureWorld(tree), log: W.ai.record() };
  }
  return { W, director, said, waiting, hashes, snap, log: W.ai.record(), hash: hash(tree) };
}

/** Mira asks for a latte at step 500; Hana answers 30 steps later. */
const latte = (step, director) => { if (step === 500) director.talk('hana-1', 'Hi Hana! Could I get a latte, please?'); };
const answer = () => scriptedModel([{ toolCalls: [{ name: 'say', arguments: { text: 'Of course! One latte, coming up.', to: 'user', emotion: 'happy' } }] }], { latency: 30 });

test('a conversation: the wait is in the step, the line lands on its step, and two live runs are the same world', { skip }, async () => {
  const R = await loadRapier();
  const { sample, opts } = await cafe();
  const a = await play(R, sample, opts, { steps: 900, model: answer(), script: latte, snapAt: 515 });
  const line = a.said.find((s) => s[2] === 'Of course! One latte, coming up.');
  assert.ok(line && line[0] >= 530 && line[0] <= 532, `the line lands on the step the answer arrived (${line?.[0]})`);
  assert.ok(a.waiting[0] >= 500 && a.waiting[0] <= 502 && a.waiting.at(-1) <= line[0], `Hana is flagged waiting from ${a.waiting[0]} to ${a.waiting.at(-1)}`);
  const [req, dec] = a.log.filter((e) => e.kind);
  assert.equal(req.kind, 'request'); assert.equal(req.meta.heard.text, 'Hi Hana! Could I get a latte, please?');
  assert.equal(dec.kind, 'decision'); assert.deepEqual(dec.actions.map((x) => x.do), ['think', 'emote', 'say', 'lookAt'], 'stop thinking, then the face, the line and the look');
  assert.equal(dec.meta.source.model, 'scripted'); assert.match(dec.meta.source.promptHash, /^[0-9a-f]{16}$/);
  assert.equal(dec.meta.source.promptHash, req.meta.hash, 'the decision names the prompt it answers');
  const tools = a.director.requests[0].request.tools.find((t) => t.name === 'say').parameters.properties;
  assert.deepEqual(tools.emotion.enum, ['happy', 'relaxed'], "the persona's faces");
  assert.ok(tools.to.enum.includes('user'), 'the person is someone to talk to');
  assert.deepEqual(a.director.inspect('hana-1').history.map((h) => h.role), ['user', 'assistant']);

  const b = await play(R, sample, opts, { steps: 900, model: answer(), script: latte });
  assert.deepEqual(b.hashes, a.hashes, 'two live runs: the same world every 30 steps');

  const c = await play(R, sample, opts, { steps: 900, model: replayModel(), replay: a.log });
  assert.equal(c.said.find((s) => s[2] === 'Of course! One latte, coming up.')?.[0], line[0], 'replayed with no model: the line on the same step');
  assert.deepEqual(c.hashes, a.hashes, 'the log alone: the same world every 30 steps');
  assert.equal(c.director.stats.asked, 0, 'and the model was never asked');

  // restored while Hana waited (step 515), with the log's entries after it (the snapshot holds everything due by then)
  const rest = a.log.filter((e) => e.step > 515);
  assert.ok(rest.some((e) => e.kind === 'decision'), 'the answer was still to come at 515');
  const d = await play(R, sample, opts, { steps: 900, model: replayModel(), from: a.snap, replay: rest });
  for (const s of Object.keys(a.hashes).map(Number).filter((s) => s > 515)) assert.equal(d.hashes[s], a.hashes[s], `restored mid-wait: the same world at ${s}`);

  const none = await play(R, sample, opts, { steps: 900, model: replayModel() });
  assert.notEqual(none.hash, a.hash, 'without the conversation, a different world');
});

test('bad replies are rejected in the world: nothing of them is said, and Hana still serves Mira', { skip }, async () => {
  const R = await loadRapier();
  const { sample, opts } = await cafe();
  const bad = [
    { toolCalls: [{ name: 'say', arguments: '{"text": "half a reply' }] },
    { toolCalls: [{ name: 'dance', arguments: {} }] },
    { toolCalls: [{ name: 'say', arguments: { text: 'Grr.', emotion: 'angry' } }] },
    { toolCalls: [{ name: 'gesture', arguments: { slot: 'backflip' } }] },
    { toolCalls: [{ name: 'goTo', arguments: { target: 'ghost-7' } }] },
    { throws: 'the model crashed' },
  ];
  const script = (step, director) => { if (step >= 300 && step < 300 + bad.length * 40 && (step - 300) % 40 === 0) director.talk('hana-1', `Question ${(step - 300) / 40 + 1}`); };
  const a = await play(R, sample, opts, { steps: 3400, model: scriptedModel(bad, { latency: 10 }), script });
  const s = a.director.stats;
  assert.equal(s.rejected, 5, `five rejected (${JSON.stringify(s)})`);
  assert.equal(s.failed, 1, 'one failed');
  for (const r of a.director.requests) assert.ok(r.errors?.length || r.error, `${r.id}: ${r.errors?.join('; ') ?? r.error}`);
  const decisions = a.log.filter((e) => e.kind === 'decision');
  assert.equal(decisions.length, 6);
  assert.ok(decisions.every((e) => !e.actions && !e.goal && e.bb.director.pending === null && e.bb.director.failed), 'each a decision with no calls that clears the wait');
  assert.ok(!a.said.some((x) => ['Grr.', 'half a reply'].includes(x[2])), 'nothing of them is said');
  const hana = a.said.filter((x) => x[1] === 'hana-1').map((x) => x[2]);
  assert.ok(hana.includes('Coming right up!') && hana.includes('Here you go. Enjoy!'), `the tree carried on: ${hana.join(' / ')}`);
});

test('a model that never answers times out; the tree carries on and a late answer is dropped', { skip }, async () => {
  const R = await loadRapier();
  const { sample, opts } = await cafe();
  let release;
  const slow = { name: 'slow', respond: () => new Promise((r) => { release = r; }) };
  const a = await play(R, sample, opts, { steps: 800, model: slow, script: (step, director) => {
    if (step === 400) director.talk('hana-1', 'Hello?');
    if (step === 700) release({ toolCalls: [{ name: 'say', arguments: { text: 'Sorry, I was miles away.' } }] });
  } });
  assert.equal(a.director.stats.timedOut, 1);
  assert.equal(a.director.stats.late, 1, 'the late answer was noticed');
  const dec = a.log.find((e) => e.kind === 'decision');
  assert.equal(dec.meta.failed, 'timeout');
  assert.ok(dec.step >= 640 && dec.step <= 641, `gave up after 240 steps (${dec.step})`);
  assert.ok(!a.said.some((x) => x[2] === 'Sorry, I was miles away.'), 'and never said');
  assert.ok(a.waiting.at(-1) < 642, 'the wait cleared');
});
