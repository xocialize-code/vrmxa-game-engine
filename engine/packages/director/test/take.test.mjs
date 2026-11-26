// M3 W4 (AB-T-0543): a take of a conversation, its replay, and its bake into a sequence, on the sample cafe (needs
// vrmxa-core). Mira walks in (input/walk-in.json) and the person, speaking as her, talks to Hana (the host);
// the director runs the split turn on a scripted model.
//   - The take (scene, cast, input, the ai log) replays with no model to the same world at every 30th step.
//   - takeToSequence: her lines become dialogue clips, the person's become Mira's, the rest a decisions track, the input
//     an input track; the document validates and composes with the set.
//   - The sequence world says her lines on the same steps as the take, Mira ends where she did, Hana makes and brings
//     the order, and two runs of the sequence are the same world.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { worldHashes, hashValue } from '@vrmxg/snapshot';
import { composeSequence, checkSequence } from '@vrmxg/sequence';
import { installDirector, scriptedModel, makeTake, takeToSequence } from '@vrmxg/director';
import { loadSample, buildWorld } from '../../../../apps/playground/src/world.js';
import { vrmxaCore, PATHS } from '../../character/test/fixtures.mjs';
import * as projectBehaviours from '../../../../content/sample/behaviours.js';

installPortableMath();
const content = path.resolve(import.meta.dirname, '../../../../content/sample');
const skip = !fs.existsSync(PATHS.core) && 'needs vrmxa-core';
const flush = () => new Promise((r) => setImmediate(r));
const CAST = { 'hana-1': { behaviours: [{ use: 'brain', preset: 'host' }] } };
const walkIn = JSON.parse(fs.readFileSync(path.join(content, 'input/walk-in.json'), 'utf8'));
const isVerdict = (req) => !req.tools.length && /Fill in this JSON object/.test(req.messages.at(-1).content);
const SCRIPT = {
  'Good morning, Hana!': ['Morning, Mira! Lovely to see you.', '{"emotion": "happy", "gesture": "greet"}'],
  'Could I get a latte, please?': ['Of course, one latte coming up.', '{"emotion": "happy", "goal": {"name": "takeOrder", "params": {"customer": "Mira", "order": "latte"}}}'],
  'Thanks! See you tomorrow.': ['See you tomorrow, Mira!', '{"emotion": "happy"}'],
};
const model = () => scriptedModel((req) => {
  const heard = isVerdict(req) ? /said to Hana: "(.*)"/.exec(req.messages[0].content)?.[1] : req.messages.at(-1).content;
  const [line, verdict] = SCRIPT[heard] ?? ['Mm-hm.', '{}'];
  return { text: isVerdict(req) ? verdict : line };
}, { latency: 20 });

async function world(doc = null) {
  const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
  const sample = await loadSample(bytes);
  sample.doc = doc ? composeSequence(doc, sample.doc) : { ...sample.doc, nodes: sample.doc.nodes.map((n) => (CAST[n.id] ? { ...n, ...CAST[n.id] } : n)) };
  const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
  return buildWorld(await loadRapier(), sample, { vrmxaCore: await vrmxaCore(), closet, behaviours, stubTextures: true });
}

async function run(W, steps, { director = null, script = () => {} } = {}) {
  const tree = W.tree, said = [], hashes = {};
  tree.listen(tree.find('hana-1'), 'spoke', (a) => said.push([tree.clock.step, a.text]));
  while (tree.clock.step < steps) {
    tree.step(); director?.pump(); await flush();
    script(tree.clock.step, director);
    if (tree.clock.step % 30 === 0) hashes[tree.clock.step] = hashValue(worldHashes(tree, { physicsBytes: true }));
  }
  return { said, hashes, mira: tree.find('mira').object3d.position.toArray() };
}

test('a take replays exactly; baked into a sequence it says her lines on the same steps and makes the order', { skip }, async () => {
  const steps = 2700, talk = { 600: 'Good morning, Hana!', 900: 'Could I get a latte, please?', 2400: 'Thanks! See you tomorrow.' };
  const L = await world();
  L.input.replay(walkIn);
  const director = installDirector(L.tree, { model: model(), user: 'mira', userName: 'Mira', persona: (id) => L.personas.forDirector(id) });
  const live = await run(L, steps, { director, script: (step, d) => {
    for (const [at, text] of Object.entries(talk)) { if (step === Number(at) - 90) d.speaking('hana-1', true); if (step === Number(at)) { d.speaking('hana-1', false); d.talk('hana-1', text); } }
  } });
  const take = makeTake({ scene: 'cafe.vrmxs', cast: CAST, input: walkIn, ai: L.ai.record(), steps });
  assert.equal(live.said.filter((s) => s[1] === 'Here you go. Enjoy!').length, 1, `she brought the latte, once (${live.said.map((s) => s[1]).join(' / ')})`);

  const R = await world(); R.input.replay(take.input); R.ai.replay(take.ai);
  const replayed = await run(R, steps);
  assert.deepEqual(replayed.hashes, live.hashes, 'the take replays with no model: the same world every 30 steps');

  const seq = takeToSequence(take, { id: 'conversation' });
  assert.deepEqual(checkSequence(seq.sequence), [], 'the sequence validates');
  const types = seq.sequence.tracks.map((t) => `${t.id}:${t.type}`);
  assert.deepEqual(types, ['hana-1-says:dialogue', 'mira-says:dialogue', 'hana-1-decisions:decisions', 'input:input']);
  const hanaLines = seq.sequence.tracks[0].clips.map((c) => c.text);
  assert.deepEqual(hanaLines, ['Morning, Mira! Lovely to see you.', 'Of course, one latte coming up.', 'See you tomorrow, Mira!'], 'her directed lines as clips');
  assert.ok(!hanaLines.includes('Here you go. Enjoy!'), "the tree's own lines stay the tree's (not clips)");
  assert.deepEqual(seq.sequence.tracks[1].clips.map((c) => c.text), Object.values(talk), "the person's lines on Mira");
  assert.ok(seq.sequence.tracks[2].keys.every(([, e]) => !(e.actions ?? []).some((a) => a.do === 'say')), 'no say left in the decisions');

  const S1 = await world(seq), film = await run(S1, steps);
  const directed = (xs) => xs.filter((s) => hanaLines.includes(s[1]));
  assert.deepEqual(directed(film.said), directed(live.said), 'her directed lines on the same steps as the take');
  assert.ok(film.said.some((s) => s[1] === 'Here you go. Enjoy!'), 'and the latte made and brought');
  assert.deepEqual(film.mira.map((v) => v.toFixed(3)), live.mira.map((v) => v.toFixed(3)), 'Mira walked where she did (the input track)');
  const S2 = await world(seq), again = await run(S2, steps);
  assert.deepEqual(again.hashes, film.hashes, 'two runs of the sequence: the same world');
});
