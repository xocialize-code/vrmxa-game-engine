// M3 W2 (AB-T-0541) on the sample cafe (needs vrmxa-avatar-studio beside the repo), with a scripted model. The person
// speaks as Mira.
//   - Hana as host: she listens while Mira speaks (looks at her, nods), thinks while the reply is on its way (looks
//     away), says a filler line past 1.5 s, then the reply; "Could I have a latte?" becomes takeOrder with the order,
//     and she makes and brings it without asking again. Two runs and a replay of the log are the same world.
//   - Lingering: a talkative Hana stays in a quiet conversation about three times longer than a reserved one.
//   - Hana as follower: "wait by the door" sends her there to wait, "follow me" brings her back to Mira.
//   - Goal choice on a salient event: asked after the step it fired in, once per cooldown.
//   - Turn-taking: a reply that arrives while Mira is still speaking waits for her to finish.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { worldHashes, hashValue } from '@vrmxg/snapshot';
import { FILLERS } from '@vrmxg/ai';
import { installDirector, scriptedModel, replayModel } from '@vrmxg/director';
import { loadSample, buildWorld } from '../../../../apps/playground/src/world.js';
import { vrmxaCore, PATHS } from '../../character/test/fixtures.mjs';
import * as projectBehaviours from '../../../../content/sample/behaviours.js';

installPortableMath();
const content = path.resolve(import.meta.dirname, '../../../../content/sample');
const skip = !fs.existsSync(PATHS.core) && 'needs vrmxa-avatar-studio';
const flush = () => new Promise((r) => setImmediate(r));
const say = (text, extra = {}) => ({ name: 'say', arguments: { text, to: 'user', ...extra } });

/** The cafe with Hana on `brain` (Mira stays the player, standing still: the person speaks as her). */
async function world(brain, { profile = null } = {}) {
  const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
  const sample = await loadSample(bytes);
  sample.doc = { ...sample.doc, nodes: sample.doc.nodes.map((n) => (n.id === 'hana-1' ? { ...n, behaviours: [{ use: 'brain', ...brain }] } : n)) };
  const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
  const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
  const W = await buildWorld(await loadRapier(), sample, { vrmxaCore: await vrmxaCore(), closet, behaviours, stubTextures: true });
  if (profile) W.personas.setProfile('hana-1', { ...W.personas.profileOf('hana-1'), ...profile });
  return W;
}

/** Step `steps` steps; `script(step, director, W)` after each; `watch(step, W)` records. Hashes every 30 steps. */
async function play(W, { steps, model, script = () => {}, watch = () => {}, replay = null, setup = () => {} }) {
  const tree = W.tree, P = W.personas;
  const director = installDirector(tree, { model, user: 'mira', userName: 'Mira', persona: (id) => P.forDirector(id), memory: (id) => P.memoryOf(id) });
  setup(director, W);
  const said = [], hashes = {};
  tree.listen(tree.find('hana-1'), 'spoke', (a) => said.push([tree.clock.step, a.text]));
  if (replay) W.ai.replay(replay);
  while (tree.clock.step < steps) {
    tree.step(); director.pump(); await flush();
    script(tree.clock.step, director, W);
    watch(tree.clock.step, W);
    if (tree.clock.step % 30 === 0) hashes[tree.clock.step] = hashValue(worldHashes(tree, { physicsBytes: true }));
  }
  return { W, director, said, hashes, log: W.ai.record() };
}

test('host: listen, think, a filler, the reply; an order she heard is made and brought without asking; replays exactly', { skip }, async () => {
  const model = () => scriptedModel([{ toolCalls: [say('Of course! One latte, coming up.', { emotion: 'happy' }), { name: 'setGoal', arguments: { goal: 'takeOrder', params: { customer: 'user', order: 'latte' } } }] }], { latency: 150 });
  const script = (step, d) => {
    if (step === 300) d.speaking('hana-1', true);
    if (step === 420) { d.speaking('hana-1', false); d.talk('hana-1', 'Could I have a latte, please?'); }
  };
  const seen = { look: {}, away: {}, nods: 0 };
  const watch = (step, W) => {
    const h = /** @type {any} */ (W.tree.find('hana-1'));
    seen.look[step] = h.ctrl.look; seen.away[step] = h.ctrl.lookAway ?? 0;
    if (step > 300 && step < 420 && h.graph.gesturing && !seen.wasNodding) seen.nods++;
    seen.wasNodding = !!h.graph.gesturing;
  };
  const a = await play(await world({ preset: 'host' }), { steps: 2600, model: model(), script, watch });
  assert.equal(seen.look[400], 'mira', 'listening: she looks at Mira while Mira speaks');
  assert.ok(seen.nods >= 1, `and nods (${seen.nods})`);
  assert.ok(seen.away[480] !== 0, 'thinking: she looks away while the reply is on its way');
  const filler = a.said.find((s) => FILLERS.includes(s[1]));
  assert.ok(filler && filler[0] >= 500 && filler[0] < 570, `a filler past 1.5 s (${filler?.[0]}: ${filler?.[1]})`);
  const reply = a.said.find((s) => s[1] === 'Of course! One latte, coming up.');
  assert.ok(reply && reply[0] >= 570 && reply[0] <= 700, `then the reply (${reply?.[0]}), after the filler finished`);
  assert.equal(seen.away[reply[0] + 30], 0, 'no longer looking away');
  const texts = a.said.map((s) => s[1]);
  assert.ok(!texts.includes('Hi! What can I get you?'), 'the order was heard: she does not ask again');
  assert.ok(texts.includes('Here you go. Enjoy!'), `she made and brought it (${texts.join(' / ')})`);
  assert.deepEqual(a.log.find((e) => e.kind === 'decision').goal, { name: 'takeOrder', params: { customer: 'mira', order: 'latte' } }, '"user" in the goal is Mira');

  const b = await play(await world({ preset: 'host' }), { steps: 2600, model: model(), script });
  assert.deepEqual(b.hashes, a.hashes, 'two runs: the same world every 30 steps');
  const c = await play(await world({ preset: 'host' }), { steps: 2600, model: replayModel(), replay: a.log });
  assert.deepEqual(c.hashes, a.hashes, 'the log alone (speaking, the request, the decision): the same world every 30 steps');
});

test('lingering: a talkative Hana stays in a quiet conversation about three times longer than a reserved one', { skip }, async () => {
  const until = async (talkativeness) => {
    let left = null;
    const r = await play(await world({ preset: 'host' }, { profile: { talkativeness } }), {
      steps: 2400, model: scriptedModel([{ toolCalls: [say('Morning, Mira!')] }], { latency: 30 }),
      script: (step, d) => { if (step === 300) d.talk('hana-1', 'Morning, Hana!'); },
      watch: (step, W) => { const u = /** @type {any} */ (W.tree.find('hana-1')).behaviours[0].inspect().utility[0]; if (step > 400 && left === null && u && u.options[u.current] !== 'converse') left = step; },
    });
    return { left, replied: r.said.find((s) => s[1] === 'Morning, Mira!')?.[0] };
  };
  const chatty = await until(0.9), quiet = await until(0.1);
  const chattyFor = (chatty.left - chatty.replied) / 60, quietFor = (quiet.left - quiet.replied) / 60;
  assert.ok(chattyFor > 15 && chattyFor < 21, `talkative: ${chattyFor.toFixed(1)} s of quiet before she gets back to work (4 + 16 × 0.9 = 18.4)`);
  assert.ok(quietFor > 4 && quietFor < 8, `reserved: ${quietFor.toFixed(1)} s (4 + 16 × 0.1 = 5.6)`);
});

test('follower: "wait by the door" sends her there to wait; "follow me" brings her back to Mira', { skip }, async () => {
  const replies = [
    { toolCalls: [say('Sure, I\'ll wait there.'), { name: 'setGoal', arguments: { goal: 'waitAt', params: { target: 'entrance-left' } } }] },
    { toolCalls: [say('Right behind you!'), { name: 'setGoal', arguments: { goal: 'follow', params: { target: 'user' } } }] },
  ];
  const dist = (W, a, b) => { const p = W.tree.find(a).object3d.getWorldPosition(W.tree.find(a).object3d.position.clone()), q = W.tree.find(b).object3d.getWorldPosition(W.tree.find(b).object3d.position.clone()); return Math.hypot(p.x - q.x, p.z - q.z); };
  const at = {};
  const r = await play(await world({ preset: 'follower', vars: { leader: 'mira' } }), {
    steps: 3000, model: scriptedModel(replies, { latency: 30 }),
    setup: (d, W) => { W.personas.doc.characters['cc97eb67-3eac-41c3-9e91-c15029fb6595'].goals = W.ai.presets.get?.('follower')?.goals ?? [{ name: 'waitAt' }, { name: 'follow' }]; },
    script: (step, d) => { if (step === 200) d.talk('hana-1', 'Could you wait by the door?'); if (step === 1800) d.talk('hana-1', 'Okay, follow me.'); },
    watch: (step, W) => { if (step === 1700 || step === 1790 || step === 2900) at[step] = { door: dist(W, 'hana-1', 'entrance-left'), mira: dist(W, 'hana-1', 'mira') }; },
  });
  assert.ok(at[1700].door < 1.6, `at the door (${at[1700].door.toFixed(2)} m)`);
  assert.ok(Math.abs(at[1790].door - at[1700].door) < 0.05, 'and waiting there');
  assert.ok(at[2900].mira < 2.4, `back with Mira after "follow me" (${at[2900].mira.toFixed(2)} m)`);
  assert.equal(r.W.tree.find('hana-1').behaviours[0].bb.goal.params.target, 'mira');
});

test('goal choice on a salient event: asked after the step it fired in, once per cooldown', { skip }, async () => {
  const r = await play(await world({ preset: 'host' }), {
    steps: 900, model: scriptedModel(() => ({ toolCalls: [{ name: 'wait', arguments: { seconds: 1 } }] }), { latency: 10 }),
    setup: (d) => d.watch('hana-1', 'entrance-left', 'opened', { reason: 'The door opened.', cooldown: 300 }),
    script: (step, d, W) => { if ([200, 250, 600].includes(step)) W.tree.emit(W.tree.find('entrance-left'), 'opened', {}); },
  });
  const asked = r.director.requests.filter((q) => q.kind === 'consider').map((q) => q.step);
  assert.deepEqual(asked, [201, 601], 'asked after the event, and not again within the cooldown');
  assert.match(r.director.requests[0].request.messages.at(-1).content, /The door opened\./);
});

test('turn-taking: a reply that arrives while Mira is still speaking waits for her to finish (at most 2 s)', { skip }, async () => {
  const r = await play(await world({ preset: 'host' }), {
    steps: 900, model: scriptedModel([{ toolCalls: [say('Ha, yes!')] }], { latency: 20 }),
    script: (step, d) => {
      if (step === 300) d.talk('hana-1', 'You know what I mean?');
      if (step === 310) d.speaking('hana-1', true);
      if (step === 400) d.speaking('hana-1', false);
    },
  });
  const line = r.said.find((s) => s[1] === 'Ha, yes!');
  assert.ok(line && line[0] >= 400 && line[0] <= 402, `held until she stopped (${line?.[0]}), not at 320`);
});
