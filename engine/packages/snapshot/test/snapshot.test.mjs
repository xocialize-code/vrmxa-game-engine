// W6 (AB-T-0507) in Node, without characters so it runs on CI: the cafe's doors (physics, hinges,
// triggers), a kinematic walker the input recording drives, a behaviour with a random stream and a
// timer, and a follow camera. The character-scale harness (the full cafe in Node, Chromium and WKWebView)
// is in ../harness.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { parse } from '@vrmxg/scene';
import { SceneTree, Behaviour } from '@vrmxg/core';
import { loadRapier, installPhysics } from '@vrmxg/physics';
import { installInput, VirtualDevice } from '@vrmxg/input';
import { installCameras } from '@vrmxg/camera';
import { captureWorld, restoreWorld, recordRun, compareRuns, assertSameRun, hashValue, worldHashes } from '@vrmxg/snapshot';

installPortableMath();
const R = await loadRapier();
const reg = m0Registry();
const read = (p) => parse(fs.readFileSync(new URL(`../../core/test/fixtures/${p}`, import.meta.url), 'utf8'));
const prefabs = new Map(['prefabs/door.vrmxs', 'prefabs/double-door.vrmxs'].map((p) => [p, read(p)]));

// The walker moves by the move actions; a random sway from its own stream; a repeating timer blinks a prop.
class Walker extends Behaviour {
  ready() { this.blinks = 0; this.node.after(0.5, () => { this.blinks++; this.node.props.lit = !this.node.props.lit; }, { repeat: true }); }
  physicsProcess(dt) {
    const input = this.tree.services.get('input');
    const p = this.node.object3d.position;
    p.x += (input.axis('move_x') * 2 + this.rng.range(-0.05, 0.05)) * dt;
    p.z -= input.axis('move_y') * 2 * dt;
  }
  getState() { return { blinks: this.blinks }; }
  setState(s) { this.blinks = s.blinks; }
}
// A bug on purpose: from step 200 the walker sways by Math.random.
class Chaos extends Behaviour {
  physicsProcess() { if (this.tree.clock.step >= 200) this.node.object3d.position.x += (Math.random() - 0.5) * 1e-3; }
}

const scene = (extra = []) => ({
  format: 'vrmxs', version: 1, id: 'w6-doors',
  assets: [{ id: 'door', type: 'vrmxs', ref: 'prefabs/door.vrmxs' }, { id: 'double', type: 'vrmxs', ref: 'prefabs/double-door.vrmxs' }],
  nodes: [
    { id: 'root', type: 'Node3D' },
    { id: 'floor', type: 'Collider', parent: 'root', transform: { p: [0, -0.1, 0] }, props: { shape: 'box', size: [30, 0.2, 30] } },
    { id: 'door-1', type: 'Instance', parent: 'root', asset: 'door', transform: { p: [2, 0, -3], q: [0, 0.707, 0, 0.707] }, overrides: { hinge: { behaviours: [{ locked: true, use: 'hinge' }] } } },
    { id: 'entrance', type: 'Instance', parent: 'root', asset: 'double', transform: { p: [0, 0, 6] } },
    { id: 'walker', type: 'RigidBody', parent: 'root', transform: { p: [-0.5, 0.9, 3] }, props: { bodyType: 'kinematic' }, behaviours: [{ use: 'walker' }, ...extra] },
    { id: 'walker-shape', type: 'Collider', parent: 'walker', props: { shape: 'capsule', radius: 0.3, height: 1.2 } },
    { id: 'cam', type: 'Camera', parent: 'root', transform: { p: [0, 1.5, 0] }, props: { preset: 'follow', target: 'walker' } },
  ],
});

function world(doc = scene()) {
  const tree = new SceneTree({ registry: reg, prefabs, behaviours: new Map([['walker', Walker], ['chaos', Chaos]]), seed: 7 });
  const input = installInput(tree);
  installPhysics(tree, R);
  installCameras(tree);
  tree.instantiate(doc);
  return { tree, input };
}

// 10 s of input: walk forward into the entrance's trigger (the door swings open), sidestep, turn the
// camera, walk back out (it closes), cycle the camera preset.
function drive(dev, k) {
  if (k === 10) dev.press('KeyS');
  if (k === 150) dev.release('KeyS');
  if (k === 200) dev.press('KeyD');
  if (k === 230) dev.release('KeyD');
  if (k >= 240 && k < 300) dev.moveMouse(4, 1);
  if (k === 330) dev.press('KeyW');
  if (k === 460) dev.release('KeyW');
  if (k === 500) dev.press('KeyC');
  if (k === 502) dev.release('KeyC');
}

let recording;
function recorded() {
  if (recording) return recording;
  const { tree, input } = world();
  const dev = input.addDevice(new VirtualDevice());
  input.record();
  for (let k = 0; k < 600; k++) { drive(dev, k); tree.step(); }
  recording = JSON.parse(JSON.stringify(input.stop()));
  return recording;
}

test('a recorded 10 s run hashes identically twice, and the world really moves', () => {
  const rec = recorded();
  const runs = [0, 1].map(() => { const { tree, input } = world(); input.replay(rec); return { tree, run: recordRun(tree, 600, { physicsBytesEvery: 60 }) }; });
  assert.equal(compareRuns(runs[0].run, runs[1].run), null);
  const hinge = runs[0].tree.find('entrance/left/hinge').behaviours[0];
  const opened = new Set(runs[0].run.map((r) => r.h['node:entrance/left/hinge'])).size;
  assert.ok(opened > 50, `the entrance door swung (${opened} distinct hinge states)`);
  assert.equal(hinge.getState().reported ?? 'closed', 'closed', 'and closed again once the walker left');
  assert.ok(new Set(runs[0].run.map((r) => r.h['node:walker'])).size > 400, 'the walker moved');
  assert.ok(runs[0].run[59].h['physics:bytes'] && runs[0].run[59].h['physics:bytes'] === runs[1].run[59].h['physics:bytes'], 'Rapier\'s full bytes agree too');
  assert.equal(runs[0].tree.find('cam').preset, 'overShoulder', 'camera_next reached the camera');
});

test('a snapshot at step 300, restored into a fresh world and re-simulated to 600, is the same run', () => {
  const rec = recorded();
  const A = world(); A.input.replay(rec);
  const first = recordRun(A.tree, 300);
  const snap = captureWorld(A.tree, { meta: { scene: 'w6-doors' } });
  const rest = recordRun(A.tree, 300, { physicsBytesEvery: 30 });

  const B = world(); B.input.replay(rec);
  restoreWorld(B.tree, snap);
  assert.deepEqual(worldHashes(B.tree), first.at(-1).h, 'the restored world hashes as step 300 did');
  const again = recordRun(B.tree, 300, { physicsBytesEvery: 30 });
  assertSameRun(rest, again, 'original and restored');
  assert.equal(B.tree.find('walker').behaviours[0].blinks, A.tree.find('walker').behaviours[0].blinks, 'the timer kept firing on schedule');

  // The snapshot is plain data: a structured clone (postMessage, IndexedDB) restores the same.
  const C = world(); C.input.replay(rec);
  restoreWorld(C.tree, structuredClone(snap));
  assertSameRun(rest, recordRun(C.tree, 300, { physicsBytesEvery: 30 }), 'original and cloned snapshot');
});

test('a Math.random slipped into a behaviour is caught: the first step and the component are named', () => {
  const rec = recorded();
  const good = world(); good.input.replay(rec);
  const bad = world(scene([{ use: 'chaos' }])); bad.input.replay(rec);
  // Same scene apart from the extra behaviour entry: compare the components the bug can reach.
  const a = recordRun(good.tree, 400), b = recordRun(bad.tree, 400);
  const strip = (run) => run.map(({ step, h }) => ({ step, h: Object.fromEntries(Object.entries(h).filter(([k]) => k !== 'node:walker')) }));
  const d = compareRuns(strip(a), strip(b));
  assert.ok(d, 'the runs diverge');
  assert.equal(d.step, 201, 'at the first step the drift exists (the clock reads 201 after stepping 200)');
  assert.equal(d.component, 'node:cam', 'first in hash order: the camera following the walker');
  assert.ok(d.components.includes('physics'), `the walker's body moved too (${d.components})`);
  assert.throws(() => assertSameRun(strip(a), strip(b), 'good and bad'), /good and bad diverge at step 201 in node:cam \(and state:cam, physics\)/);
});

test('restoring refuses what it cannot bring back: a timer made at run time, another scene', () => {
  const A = world();
  A.tree.run(30);
  A.tree.find('walker').after(2, () => {});
  const snap = captureWorld(A.tree);
  assert.throws(() => restoreWorld(world().tree, snap), /was created at run time/);
  const other = new SceneTree({ registry: reg, prefabs, behaviours: new Map([['walker', Walker]]) });
  installInput(other); installPhysics(other, R); installCameras(other);
  other.instantiate({ format: 'vrmxs', version: 1, id: 'empty', nodes: [{ id: 'root', type: 'Node3D' }] });
  assert.throws(() => restoreWorld(other, captureWorld(world().tree)), /isn't in this tree/);
});

test('the hash: bit-exact numbers, typed arrays by element, key order part of the value', () => {
  assert.notEqual(hashValue(0), hashValue(-0));
  assert.equal(hashValue(NaN), hashValue(Number.NaN));
  assert.notEqual(hashValue(0.1 + 0.2), hashValue(0.3));
  assert.equal(hashValue(Float64Array.of(1, 2)), hashValue(Float32Array.of(1, 2)), 'a float32 hashes as the float64 it reads as');
  assert.notEqual(hashValue({ a: 1, b: 2 }), hashValue({ b: 2, a: 1 }));
  assert.notEqual(hashValue([1, [2]]), hashValue([[1], 2]));
  assert.notEqual(hashValue(new Uint8Array([1, 2, 3, 4, 5])), hashValue(new Uint8Array([1, 2, 3, 4, 6])));
  assert.match(hashValue('x'), /^[0-9a-f]{16}$/);
});
