// The split turn in the world (AB-D-0265, the director's default design) on the sample cafe (needs vrmxa-avatar-studio),
// with a scripted model that answers line requests with text and verdict requests with JSON. The person speaks as Mira.
//   - "Could I get a latte?": her line lands first (she speaks while the verdict is asked for), then the verdict's face,
//     gesture and goal as a second decision; "Mira" in the goal becomes her id and the order her words; Hana makes and
//     brings it without asking. Two runs and a replay of the log are the same world.
//   - A goodbye ends the conversation by rule, even when the verdict is not JSON.
//   - A goal choice on an event is a verdict alone; a verdict that never comes leaves the line standing.
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
const skip = !fs.existsSync(PATHS.core) && 'needs vrmxa-avatar-studio';
const flush = () => new Promise((r) => setImmediate(r));
const isVerdict = (req) => !req.tools.length && /Fill in this JSON object/.test(req.messages.at(-1).content);

async function world() {
  const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
  const sample = await loadSample(bytes);
  sample.doc = { ...sample.doc, nodes: sample.doc.nodes.map((n) => (n.id === 'hana-1' ? { ...n, behaviours: [{ use: 'brain', preset: 'host' }] } : n)) };
  const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
  return buildWorld(await loadRapier(), sample, { vrmxaCore: await vrmxaCore(), closet, behaviours, stubTextures: true });
}

async function play({ steps, model, script = () => {}, replay = null, setup = () => {} }) {
  const W = await world(), tree = W.tree, P = W.personas;
  const director = installDirector(tree, { model, user: 'mira', userName: 'Mira', persona: (id) => P.forDirector(id), memory: (id) => P.memoryOf(id) });
  setup(director, W);
  const said = [], hashes = {};
  tree.listen(tree.find('hana-1'), 'spoke', (a) => said.push([tree.clock.step, a.text]));
  if (replay) W.ai.replay(replay);
  while (tree.clock.step < steps) {
    tree.step(); director.pump(); await flush();
    script(tree.clock.step, director, W);
    if (tree.clock.step % 30 === 0) hashes[tree.clock.step] = hashValue(worldHashes(tree, { physicsBytes: true }));
  }
  return { W, director, said, hashes, log: W.ai.record(), bb: /** @type {any} */ (tree.find('hana-1')).behaviours[0].bb };
}

test('the split turn: the line lands first, the verdict second; the order is made and brought; replays exactly', { skip }, async () => {
  const model = () => scriptedModel((req) => (isVerdict(req)
    ? { text: '```json\n{"emotion": "happy", "gesture": "nod", "action": null, "goal": {"name": "takeOrder", "params": {"customer": "Mira"}}}\n```' }
    : { text: 'Hana: "Of course! One latte, coming right up."' }), { latency: 15 });
  const script = (step, d) => { if (step === 400) d.talk('hana-1', 'Could I get a latte, please?'); };
  const a = await play({ steps: 2600, model: model(), script });
  const line = a.said.find((s) => s[1] === 'Of course! One latte, coming right up.');
  assert.ok(line && line[0] >= 415 && line[0] <= 417, `the line, cleaned, lands when it arrives (${line?.[0]})`);
  const [lineDec, verdictDec] = a.log.filter((e) => e.kind === 'decision');
  assert.deepEqual(lineDec.actions.map((x) => x.do), ['think', 'say', 'lookAt'], 'first: her line');
  assert.equal(verdictDec.meta.part, 'verdict');
  assert.ok(verdictDec.step >= lineDec.step + 15, `then the verdict (${lineDec.step} → ${verdictDec.step})`);
  assert.deepEqual(verdictDec.actions.map((x) => x.do), ['think', 'emote', 'gesture'], 'its face and gesture');
  assert.deepEqual(verdictDec.goal, { name: 'takeOrder', params: { customer: 'mira', order: 'Could I get a latte, please?' } }, '"Mira" is her id; the order, her words');
  const texts = a.said.map((s) => s[1]);
  assert.ok(!texts.includes('Hi! What can I get you?') && texts.includes('Here you go. Enjoy!'), `made and brought without asking (${texts.join(' / ')})`);
  const b = await play({ steps: 2600, model: model(), script });
  assert.deepEqual(b.hashes, a.hashes, 'two runs: the same world every 30 steps');
  const c = await play({ steps: 2600, model: replayModel(), replay: a.log });
  assert.deepEqual(c.hashes, a.hashes, 'the log alone: the same world every 30 steps');
});

test('a goodbye ends the conversation by rule, even when the verdict is not JSON; a verdict that never comes leaves the line', { skip }, async () => {
  let n = 0;
  const model = { name: 'mixed', respond: async (req, ctx) => { n++; await ctx.untilStep(10); if (isVerdict(req)) return n <= 2 ? { text: 'Sure thing!', toolCalls: [] } : new Promise(() => {}); return { text: n <= 2 ? 'See you tomorrow, Mira!' : 'Hm, maybe.', toolCalls: [] }; } };
  const r = await play({ steps: 1200, model, script: (step, d) => { if (step === 300) d.talk('hana-1', 'Bye, Hana!'); if (step === 500) d.talk('hana-1', 'Is the machine new?'); } });
  const decisions = r.log.filter((e) => e.kind === 'decision');
  const bye = decisions.find((e) => e.meta.part === 'verdict' && e.meta.failed === 'unparsed');
  assert.ok(bye && bye.bb.conversation === null, 'the goodbye ended the conversation, though the verdict was not JSON');
  assert.ok(r.said.some((s) => s[1] === 'See you tomorrow, Mira!') && r.said.some((s) => s[1] === 'Hm, maybe.'), 'both lines were said');
  const late = decisions.find((e) => e.meta.part === 'verdict' && e.meta.failed === 'timeout');
  assert.ok(late && !late.actions && !late.goal, 'the second verdict timed out: nothing more, the line stood');
});

test('a goal choice on an event is a verdict alone', { skip }, async () => {
  const seen = [];
  const r = await play({
    steps: 700, model: scriptedModel((req) => { seen.push(req); return { text: '{"emotion": null, "gesture": null, "action": {"do": "lookAt", "target": "user"}, "goal": null}' }; }, { latency: 10 }),
    setup: (d) => d.watch('hana-1', 'entrance-left', 'opened', { reason: 'The front door opened.' }),
    script: (step, d, W) => { if (step === 300) W.tree.emit(W.tree.find('entrance-left'), 'opened', {}); },
  });
  assert.equal(seen.length, 1, 'one call');
  assert.ok(isVerdict(seen[0]) && seen[0].messages[0].content.startsWith('What just happened, for Hana: The front door opened.'));
  const dec = r.log.find((e) => e.kind === 'decision');
  assert.deepEqual(dec.actions?.map((x) => [x.do, x.args.target ?? null]), [['think', null], ['lookAt', 'mira']], 'she looks at Mira (the entrance is beyond her reach: not one of her choices)');
  assert.equal(r.bb.director.pending, null);
});
