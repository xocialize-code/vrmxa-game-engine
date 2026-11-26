import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { parse, serialize, createValidator } from '@vrmxg/scene';
import { SceneTree, Node, Behaviour, StateMachine, frameToStep, Clock, RandomStream } from '@vrmxg/core';

installPortableMath();
const reg = m0Registry();
const read = (p) => parse(fs.readFileSync(new URL(`./fixtures/${p}`, import.meta.url), 'utf8'));
const prefabs = new Map(['prefabs/door.vrmxs', 'prefabs/double-door.vrmxs'].map((p) => [p, read(p)]));

// Stand-ins for behaviours later packages implement for real (the hinge is physics, W2).
class Hinge extends Behaviour {
  ready() { this.isOpen = false; this.calls = []; }
  open() { this.calls.push('open'); if (!this.params.locked) { this.isOpen = true; this.emit('opened'); } }
  close() { this.calls.push('close'); this.isOpen = false; this.emit('closed'); }
  toggle() { return this.isOpen ? this.close() : this.open(); }
  getState() { return { isOpen: this.isOpen }; }
}
class Wander extends Behaviour {
  ready() { this.target = [0, 0]; }
  physicsProcess(dt) {
    const p = this.node.object3d.position;
    if (this.node.tree.clock.step % 30 === 0) this.target = [this.rng.range(-this.params.radius, this.params.radius), this.rng.range(-this.params.radius, this.params.radius)];
    const dx = this.target[0] - p.x, dz = this.target[1] - p.z, d = Math.hypot(dx, dz);
    if (d > 1e-6) { const s = Math.min(1, (1.2 * dt) / d); p.x += dx * s; p.z += dz * s; }
    this.node.object3d.quaternion.set(0, Math.sin(Math.atan2(dx, dz) / 2), 0, Math.cos(Math.atan2(dx, dz) / 2));
  }
  getState() { return { target: this.target }; }
}
const behaviours = new Map([['hinge', Hinge], ['wander', Wander]]);
const makeTree = (opts = {}) => new SceneTree({ registry: reg, behaviours, prefabs, ...opts });

const consistent = (tree) => {
  for (const n of tree.all()) {
    assert.equal(tree.byId.get(n.id), n, `${n.id} indexed`);
    assert.equal(n.object3d.parent, n.parent.object3d, `${n.id} object3d parent matches`);
    assert.ok(n.parent.children.includes(n));
  }
  assert.equal(tree.byId.size, tree.all().length);
};

test('the cafe scene instantiates: every node, connection and behaviour; it saves back byte for byte', () => {
  const doc = read('cafe.vrmxs');
  const tree = makeTree().instantiate(doc);
  assert.equal(tree.all().length, 26); // 8 scene nodes + 3 door prefabs × 6
  consistent(tree);
  assert.equal(tree.find('door-1/hinge').behaviours[0].constructor, Hinge);
  assert.equal(tree.find('door-1/hinge').behaviours[0].params.locked, true, 'scene override applied');
  assert.equal(tree.find('entrance/right/hinge').behaviours[0].params.openAngle, -100, 'nested prefab override applied');
  assert.equal(tree.find('hana-1').behaviours[0].constructor, Wander);
  assert.equal(tree.links.get(tree.find('entrance/left/trigger')).get('bodyEntered')[0].to, 'entrance/left/hinge');
  assert.equal(serialize(tree.toDocument()), serialize(doc), 'live tree -> document is the same scene');
});

test('remove and re-add keep the tree, the three.js graph and the connections consistent', () => {
  const tree = makeTree().instantiate(read('cafe.vrmxs'));
  const removed = tree.remove('entrance');
  assert.equal(tree.all().length, 26 - 14, 'entrance, its pair, two inner instances and two doors of 5');
  assert.equal(tree.find('entrance/left/hinge'), null);
  assert.equal(removed.object3d.parent, null);
  consistent(tree);
  tree.add({ id: 'entrance', type: 'Instance', parent: 'root', asset: 'double', transform: { p: [0, 0, 6] }, overrides: { 'left/hinge': { props: { mass: 20 } } } }, 3);
  consistent(tree);
  assert.equal(tree.all().length, 26);
  assert.equal(tree.find('entrance/left/hinge').props.mass, 20);
  assert.equal(serialize(tree.toDocument()), serialize(read('cafe.vrmxs')), 'back where it started');
  tree.find('entrance/left/trigger').emit('bodyEntered', { body: 'hana-1' });
  assert.equal(tree.find('entrance/left/hinge').behaviours[0].isOpen, true, 're-added connections work');
});

test('a trigger\'s bodyEntered opens the door through the connection, and opened reaches a listener', () => {
  const tree = makeTree().instantiate(read('cafe.vrmxs'));
  const hinge = tree.find('entrance/right/hinge').behaviours[0];
  const heard = [];
  tree.find('entrance/right/hinge').on('opened', () => heard.push('opened'));
  tree.find('entrance/right/trigger').emit('bodyEntered', { body: 'hana-1' });
  assert.equal(hinge.isOpen, true);
  assert.deepEqual(heard, ['opened']);
  tree.find('entrance/right/trigger').emit('bodyExited', { body: 'hana-1' });
  assert.equal(hinge.isOpen, false);
  const locked = tree.find('door-1/hinge').behaviours[0];
  tree.find('door-1/trigger').emit('bodyEntered', { body: 'hana-1' });
  assert.deepEqual([locked.calls, locked.isOpen], [['open'], false], 'door-1 is locked by its override');
  tree.find('hana-1').call('dance');
  assert.deepEqual(tree.unhandled.at(-1), { id: 'hana-1', action: 'dance' }, 'an action nothing implements is recorded');
});

test('lifecycle order follows Godot: enterTree parent first, ready children first, exitTree children first', () => {
  const log = [];
  class Logged extends Node {
    enterTree() { log.push(`enter ${this.id}`); }
    ready() { log.push(`ready ${this.id}`); }
    exitTree() { log.push(`exit ${this.id}`); }
  }
  const tree = makeTree({ classes: new Map([['Node3D', Logged], ['Marker', Logged]]) });
  tree.instantiate({ format: 'vrmxs', version: 1, id: 's', nodes: [
    { id: 'a', type: 'Node3D' }, { id: 'b', type: 'Node3D', parent: 'a' }, { id: 'c', type: 'Marker', parent: 'b' }, { id: 'd', type: 'Marker', parent: 'a' },
  ] });
  assert.deepEqual(log, ['enter a', 'enter b', 'enter c', 'enter d', 'ready c', 'ready b', 'ready d', 'ready a']);
  log.length = 0;
  tree.remove('a');
  assert.deepEqual(log, ['exit c', 'exit b', 'exit d', 'exit a']);
});

// 600 steps with RNG-driven wandering, timers, repeating timers, tweens, a state machine and a time
// scale: two fresh runs must agree at every checkpoint.
function runScenario(seed = 7) {
  const tree = makeTree({ seed }).instantiate(read('cafe.vrmxs'));
  const sun = tree.find('sun'), cam = tree.find('cam'), hana = tree.find('hana-1');
  let fired = 0;
  sun.after(0.5, () => { fired++; sun.tween('props.intensity', 0.4, 1.5, { ease: 'sineInOut' }); });
  cam.after(0.25, () => { fired++; cam.props.focalLength += cam.rng.int(10); }, { repeat: true });
  cam.tween('quaternion', [0, 0.3826834, 0, 0.9238795], 4, { ease: 'cubicInOut' });
  tree.find('spawn').timeScale = 0.5;
  tree.find('spawn').after(1, () => { fired++; tree.find('spawn').props.purpose = 'look'; });
  hana.stateMachine = new StateMachine({
    idle: { step: (sm) => { if (sm.steps >= 90) sm.go('walk'); } },
    walk: { enter: () => { hana.props.controller = 'npc'; }, step: (sm) => { if (sm.steps >= 120) sm.go('idle'); } },
  }, 'idle');
  hana.stateMachine.start();
  const hashes = [];
  for (let k = 1; k <= 600; k++) { tree.step(); if (k % 60 === 0) hashes.push(tree.stateHash()); }
  return { hashes, fired, tree };
}

test('600 steps with RNG, timers, tweens and a state machine are identical on two runs', () => {
  const a = runScenario(), b = runScenario();
  assert.deepEqual(a.hashes, b.hashes);
  assert.equal(new Set(a.hashes).size, a.hashes.length, 'the state really changes');
  assert.ok(a.fired > 30, `timers fired (${a.fired})`);
  assert.equal(a.tree.find('spawn').props.purpose, 'look', 'the half-speed timer fired');
  assert.ok(Math.abs(a.tree.find('sun').props.intensity - 0.4) < 1e-12, 'the tween arrived');
  assert.notDeepEqual(runScenario(8).hashes, a.hashes, 'a different seed gives a different run');
});

test('pause, process modes and time scale', () => {
  const tree = makeTree().instantiate(read('cafe.vrmxs'));
  const hana = tree.find('hana-1');
  const start = hana.object3d.position.toArray();
  tree.clock.paused = true;
  tree.run(30);
  assert.deepEqual(hana.object3d.position.toArray(), start, 'paused: nothing moves');
  hana.processMode = 'always';
  tree.run(30);
  assert.notDeepEqual(hana.object3d.position.toArray(), start, '"always" runs while paused');
  tree.clock.paused = false;
  hana.processMode = 'disabled';
  const here = hana.object3d.position.toArray();
  tree.run(30);
  assert.deepEqual(hana.object3d.position.toArray(), here, 'disabled: never runs');
  hana.processMode = 'inherit';
  let fired = 0;
  tree.find('root').timeScale = 0.5;
  hana.after(1, () => fired++);
  tree.run(119); assert.equal(fired, 0);
  tree.run(1); assert.equal(fired, 1, 'a 1 s timer at half speed fires after 120 steps');
});

test('clock: frames at 24, 25, 30, 60 and 29.97 fps map to a step and α exactly; live play accumulates', () => {
  assert.deepEqual([1, 2, 3, 4].map((n) => frameToStep(n, 24)), [{ step: 2, alpha: 0.5 }, { step: 5, alpha: 0 }, { step: 7, alpha: 0.5 }, { step: 10, alpha: 0 }]);
  assert.deepEqual(frameToStep(1, 25), { step: 2, alpha: 0.4 });
  assert.deepEqual(frameToStep(7, 30), { step: 14, alpha: 0 });
  assert.deepEqual(frameToStep(9, 60), { step: 9, alpha: 0 });
  assert.deepEqual(frameToStep(30000, 29.97), { step: 60060, alpha: 0 }, '1,000 s of 29.97 fps');
  assert.equal(frameToStep(1, 29.97).step, 2);
  assert.deepEqual(frameToStep(2400, 23.976), { step: 6006, alpha: 0 });
  assert.ok(Math.abs(frameToStep(1, 29.97).alpha - 0.002) < 1e-12);
  assert.throws(() => frameToStep(1, 23.5), /non-integer rate/);
  const c = new Clock();
  assert.deepEqual(c.advance(1 / 120), { steps: 0, alpha: 0.5 });
  assert.equal(c.advance(1 / 120).steps, 1);
  c.timeScale = 0.5;
  assert.equal(c.advance(1 / 30).steps, 1, 'half speed: 1/30 s of wall time buys one step');
  assert.equal(c.advance(10).steps, 8, 'a long stall is capped');
});

test('random streams: named, independent, reproducible, snapshot-able', () => {
  const a = new RandomStream(42, 'ai'), b = new RandomStream(42, 'ai'), c = new RandomStream(42, 'particles');
  const xs = Array.from({ length: 5 }, () => a.u32());
  assert.deepEqual(xs, Array.from({ length: 5 }, () => b.u32()));
  assert.notDeepEqual(xs, Array.from({ length: 5 }, () => c.u32()));
  const st = a.getState(); const next = a.float(); a.setState(st);
  assert.equal(a.float(), next);
  for (let i = 0; i < 1000; i++) { const f = a.float(); assert.ok(f >= 0 && f < 1); }
});

test('changes inside an instance save as overrides, and the saved scene validates', () => {
  const tree = makeTree().instantiate(read('cafe.vrmxs'));
  tree.find('door-1/hinge').props.mass = 30;
  tree.find('door-1/panel').object3d.position.x = 0.5;
  tree.find('entrance/right/hinge').behaviours[0].params.locked = true;
  const doc = tree.toDocument();
  const door = doc.nodes.find((n) => n.id === 'door-1');
  assert.deepEqual(door.overrides.hinge, { props: { mass: 30 }, behaviours: [{ use: 'hinge', locked: true }] });
  assert.deepEqual(door.overrides.panel.transform.p, [0.5, 1, 0]);
  assert.deepEqual(doc.nodes.find((n) => n.id === 'entrance').overrides['right/hinge'], { behaviours: [{ use: 'hinge', locked: true }] });
  const r = createValidator(reg).check(doc, { prefabs });
  assert.deepEqual([r.errors, r.warnings], [[], []]);
  const again = makeTree().instantiate(doc);
  assert.equal(again.find('door-1/hinge').props.mass, 30, 'the override reloads');
});

test('unknown node types and behaviours run as plain nodes and survive the round-trip', () => {
  const doc = read('cafe.vrmxs');
  doc.nodes.push({ id: 'fx', type: 'SparkleEmitter', parent: 'root', props: { rate: 30 }, futureKey: { x: 1 }, behaviours: [{ use: 'gossip', topic: 'rain' }] });
  const tree = makeTree().instantiate(doc);
  assert.equal(tree.find('fx').behaviours.length, 0, 'nothing runs for an unknown behaviour');
  assert.equal(serialize(tree.toDocument()), serialize(doc));
  tree.run(10);
  assert.deepEqual(tree.toDocument().nodes.find((n) => n.id === 'fx'), doc.nodes.find((n) => n.id === 'fx'), 'still intact after running');
});

test('autoload services start before the scene and step first', () => {
  const order = [];
  class Score { constructor(tree, entry) { this.points = entry.start; } ready() { order.push('service ready'); } physicsProcess() { this.points++; order.push('service step'); } afterNodes() { order.push('service after'); } }
  const tree = makeTree().loadServices({ autoload: [{ name: 'score', use: 'score', start: 10 }] }, new Map([['score', Score]]));
  class N extends Node { physicsProcess() { order.push('node step'); } }
  tree.classes = new Map([['Marker', N]]);
  tree.instantiate({ format: 'vrmxs', version: 1, id: 's', nodes: [{ id: 'm', type: 'Marker' }] });
  tree.step();
  assert.deepEqual(order, ['service ready', 'service step', 'node step', 'service after']);
  assert.equal(tree.services.get('score').points, 11);
});

test('a node\'s time scale and process mode are in the state: a world restored under a slowed or disabled subtree runs on as the unbroken one (AB-T-0627)', () => {
  class Ticker extends Behaviour {
    ready() { this.fired = 0; this.node.after(0.5, () => this.fired++, { repeat: true }); }
    getState() { return { fired: this.fired }; }
    setState(s) { this.fired = s.fired; }
  }
  const doc = { format: 'vrmxs', version: 1, id: 'ts', nodes: [{ id: 'root', type: 'Node3D' }, { id: 'slow', type: 'Node3D', parent: 'root' }, { id: 'tick', type: 'Node3D', parent: 'slow', behaviours: [{ use: 'ticker' }] }, { id: 'off', type: 'Node3D', parent: 'root', behaviours: [{ use: 'ticker' }] }] };
  const fresh = () => new SceneTree({ registry: reg, behaviours: new Map([['ticker', Ticker]]), seed: 5 }).instantiate(doc);
  const plain = fresh().getState();
  assert.ok(plain.nodes.every((n) => !('ts' in n) && !('pm' in n)), 'absent at the defaults: a scene that sets neither keeps every hash');

  const a = fresh();
  a.run(10);
  a.find('slow').timeScale = 0.5; a.find('off').processMode = 'disabled';
  a.run(50);
  const snap = structuredClone(a.getState());
  assert.deepEqual(snap.nodes.filter((n) => n.ts !== undefined || n.pm !== undefined).map(({ id, ts, pm }) => ({ id, ts, pm })), [{ id: 'slow', ts: 0.5, pm: undefined }, { id: 'off', ts: undefined, pm: 'disabled' }]);
  const b = fresh();
  b.setState(snap);
  assert.equal(b.stateHash(), a.stateHash(), 'restored: the same state');
  assert.deepEqual([b.find('slow').timeScale, b.find('off').processMode], [0.5, 'disabled']);
  a.run(120); b.run(120);
  assert.equal(b.stateHash(), a.stateHash(), 'and it runs on the same: the slowed timer at half speed, the disabled one never');
  assert.deepEqual([a.find('tick').behaviours[0].fired, a.find('off').behaviours[0].fired], [b.find('tick').behaviours[0].fired, b.find('off').behaviours[0].fired]);

  // setting them back to the defaults takes them out of the state again; a restore brings the defaults back too
  a.find('slow').timeScale = 1; a.find('off').processMode = 'inherit';
  assert.ok(a.getState().nodes.every((n) => !('ts' in n) && !('pm' in n)));
  b.setState(a.getState());
  assert.deepEqual([b.find('slow').timeScale, b.find('off').processMode], [1, 'inherit']);
  // a value that can't be refuses the restore before anything changes
  const bad = structuredClone(snap); bad.nodes.find((n) => n.id === 'off').pm = 'sometimes';
  assert.throws(() => fresh().setState(bad), /snapshot node "off": process mode "sometimes" isn't one of inherit, pausable, always, disabled/);
});
