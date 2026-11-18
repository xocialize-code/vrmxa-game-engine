// M2 W7 (AB-T-0530) without a world: curves, the tree runtime (memory composites, utility with hysteresis and switching,
// guards, until, cooldown, repeat, blackboard references and writes), actions starting and cancelling, and tree state
// that is plain data (so a brain restores mid-thought).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPortableMath } from '@vrmxg/dmath';
import { RandomStream } from '@vrmxg/core';
import { compile, tick, curve, ACTIONS, PRESETS, NODE_TYPES, actionSchemas } from '@vrmxg/ai';

installPortableMath();

/** A fake agent: actions are logged; goTo arrives after `walk` ticks. */
function agent() {
  const log = [];
  const node = {
    id: 'npc', ctrl: { goTo: null }, object3d: { position: { x: 0, y: 0, z: 0 }, updateWorldMatrix() {}, matrixWorld: { elements: new Array(16).fill(0) } },
    say: (a) => log.push(['say', a.text]), emote: (a) => log.push(['emote', a.name]), lookAt: (a) => log.push(['lookAt', a.target ?? null]),
    goTo: (a) => { log.push(['goTo', a.point ?? a.target ?? null]); node.ctrl.goTo = a.point ?? a.target ?? null; node.walk = 3; },
    speaking: false,
  };
  const ctx = { node, tree: { find: () => null, services: new Map() }, ai: { stimulus: (s) => log.push(['heard', s.topic]), brainOf: () => null, adverts: () => [], standUp() {} }, brain: { memory: {}, recall: () => null, bb: null }, bb: {}, step: 0, rng: new RandomStream(1, 'test') };
  ctx.brain.bb = ctx.bb;
  const run = (nodes, state, n = 1) => { let r; for (let i = 0; i < n; i++) { ctx.step++; if (node.ctrl.goTo && --node.walk <= 0) { node.object3d.position.x = node.ctrl.goTo[0]; node.object3d.position.z = node.ctrl.goTo[2]; node.ctrl.goTo = null; } r = tick(nodes, state, ctx); } return r; };
  return { node, ctx, log, run };
}

test('curves are polynomials clamped to 0…1', () => {
  assert.equal(curve({ type: 'linear' }, 0.3), 0.3);
  assert.equal(curve({ type: 'inverse' }, 0.25), 0.75);
  assert.equal(curve({ type: 'exponent', n: 3 }, 0.5), 0.125);
  assert.equal(curve({ type: 'logistic' }, 0.5), 0.5);
  assert.equal(curve({ type: 'bell' }, 0.5), 1);
  assert.equal(curve({ type: 'step', at: 0.4 }, 0.39), 0);
  assert.equal(curve({ type: 'linear', m: 3 }, 0.9), 1, 'clamped');
  assert.throws(() => curve({ type: 'exp' }, 0.5), /unknown curve/);
});

test('a sequence runs actions in order across ticks, resolving blackboard references; set writes paths', () => {
  const { ctx, log, run } = agent();
  ctx.bb.dest = [4, 0, 2]; ctx.bb.who = 'hana';
  const nodes = compile({ type: 'sequence', children: [
    { type: 'action', do: 'goTo', args: { point: '$dest' } },
    { type: 'action', do: 'say', args: { text: 'Hello $who', topic: 'greet' } },
    { type: 'set', key: 'met.$who', value: true },
    { type: 'action', do: 'wait', args: { seconds: 0.05 } },
  ] });
  const state = {};
  assert.equal(run(nodes, state), 'running');
  assert.deepEqual(log[0], ['goTo', [4, 0, 2]]);
  assert.equal(run(nodes, state, 3), 'running', 'walking, then saying');
  assert.ok(log.some((l) => l[0] === 'say'));
  assert.equal(run(nodes, state, 4), 'success', 'done on step 8: walk 3, say 1, wait 3');
  assert.deepEqual(ctx.bb.met, { hana: true });
  assert.deepEqual(state, {}, 'a finished tree leaves no state');
  void log;
});

test('utility: the best option runs, hysteresis holds it, a better one takes over and the old action is cancelled', () => {
  const { ctx, log, run } = agent();
  const nodes = compile({ type: 'utility', rate: 1, hysteresis: 0.1, children: [
    { name: 'idle', considerations: [{ input: 'constant', value: 0.5, curve: { type: 'linear' } }], tree: { type: 'action', do: 'wait', args: { seconds: 10 } } },
    { name: 'walk', considerations: [{ input: 'bb', key: 'urge', curve: { type: 'linear' } }], tree: { type: 'action', do: 'goTo', args: { point: [9, 0, 9] } } },
  ] });
  const state = {};
  ctx.bb.urge = 0.45;
  run(nodes, state);
  assert.equal(state[0].cur, 0, 'idle 0.5 beats walk 0.45');
  ctx.bb.urge = 0.55;
  run(nodes, state);
  assert.equal(state[0].cur, 0, 'idle 0.5 + 0.1 (hysteresis) still beats walk 0.55');
  ctx.bb.urge = 0.7;
  run(nodes, state);
  assert.equal(state[0].cur, 1, 'walk 0.7 beats idle 0.6');
  assert.deepEqual(log.at(-1), ['goTo', [9, 0, 9]]);
  ctx.bb.urge = 0;
  run(nodes, state);
  assert.equal(state[0].cur, 0);
  assert.deepEqual(log.at(-1), ['goTo', null], 'the abandoned goTo was cancelled (the agent stops)');
});

test('guard, until, cooldown and repeat', () => {
  const { ctx, run } = agent();
  const nodes = compile({ type: 'selector', children: [
    { type: 'guard', test: 'bb', key: 'alarm', child: { type: 'repeat', child: { type: 'action', do: 'wait', args: { seconds: 0.02 } } } },
    { type: 'sequence', children: [{ type: 'until', test: 'bb', key: 'go', timeout: 1 }, { type: 'cooldown', seconds: 1, child: { type: 'set', key: 'went', value: true } }] },
  ] });
  const state = {};
  ctx.bb.alarm = true;
  assert.equal(run(nodes, state, 5), 'running', 'the guarded repeat runs while the alarm holds');
  ctx.bb.alarm = false;
  assert.equal(run(nodes, state), 'running', 'guard fails: on to waiting until go');
  ctx.bb.go = true;
  assert.equal(run(nodes, state), 'success');
  assert.equal(ctx.bb.went, true);
  ctx.bb.went = false;
  assert.equal(run(nodes, state), 'failure', 'the cooldown holds it for a second');
  assert.equal(ctx.bb.went, false);
});

test('tree state is plain data: a copy taken mid-run resumes identically', () => {
  const a = agent(), b = agent();
  const spec = PRESETS.wanderer.tree;
  const na = compile(spec), nb = compile(spec);
  a.ctx.bb.home = [0, 0, 0]; b.ctx.bb.home = [0, 0, 0];
  const sa = {};
  a.run(na, sa, 40);
  const sb = structuredClone(sa);
  b.ctx.step = a.ctx.step; b.ctx.rng.setState(a.ctx.rng.getState()); Object.assign(b.node.ctrl, structuredClone(a.node.ctrl)); b.node.walk = a.node.walk; Object.assign(b.node.object3d.position, a.node.object3d.position);
  a.run(na, sa, 60); b.run(nb, sb, 60);
  assert.deepEqual(sb, sa);
});

test('every preset compiles; the vocabulary and node types describe themselves', () => {
  for (const [k, p] of Object.entries(PRESETS)) assert.ok(compile(p.tree).length > 3, k);
  assert.deepEqual(Object.keys(ACTIONS).sort(), ['emote', 'follow', 'gesture', 'goTo', 'interact', 'lookAt', 'say', 'setGoal', 'wait']);
  for (const [k, s] of Object.entries(actionSchemas())) assert.equal(s.args.type, 'object', k);
  assert.ok(NODE_TYPES.utility.description);
  assert.throws(() => compile({ type: 'action', do: 'fly' }), /unknown action "fly"/);
  assert.throws(() => compile({ type: 'nope' }), /unknown tree node/);
});
