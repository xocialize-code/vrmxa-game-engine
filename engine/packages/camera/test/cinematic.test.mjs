// M2 W2 (AB-T-0525): the physical lens numbers, VirtualCamera bodies and aims (checked by projecting targets to the
// screen), shot / reverse shot on the 180° line, seeded noise and impulses, CameraBrain choice and blends, and the
// whole thing replaying identically, through a snapshot taken mid-blend.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree } from '@vrmxg/core';
import { captureWorld, restoreWorld, worldHashes, hashValue } from '@vrmxg/snapshot';
import { installCameras, thinLens, verticalFov, focalForFov, postDof, shotReverse, noise1 } from '@vrmxg/camera';

installPortableMath();
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} vs ${b} (±${eps})`);

test('the lens: the research\'s worked example, gate fit, the inverse, post DOF numbers', () => {
  const d = thinLens({ focalMm: 50, fStop: 1.8, focusM: 3.9 }); // CoC 0.025 mm, the research's worked example
  near(d.near, 3.65, 0.01, 'near'); near(d.far, 4.19, 0.01, 'far');
  assert.ok(verticalFov(35, 'super35', 2.39, 'overscan') > verticalFov(35, 'super35', 2.39, 'fill'), 'overscan shows more');
  near(focalForFov(verticalFov(40, 'fullframe', 16 / 9), 'fullframe', 16 / 9), 40, 1e-9, 'inverse');
  const p = postDof({ focalMm: 50, fStop: 1.8, focusM: 3.9, heightPx: 1080 });
  near(p.focusRange, d.far - d.near, 1e-9); assert.ok(p.bokehPx > 5 && p.bokehPx < 200, `bokeh ${p.bokehPx} px`);
});

// Two "characters" (markers: their eyes are 1.5 m above), the output camera, a path, a brain and some shots.
function world(extra = [], brain = {}) {
  const tree = new SceneTree({ registry: m0Registry(), seed: 1 });
  const cams = installCameras(tree);
  tree.instantiate({ format: 'vrmxs', version: 1, id: 'w2', nodes: [
    { id: 'root', type: 'Node3D' },
    { id: 'mira', type: 'Marker', parent: 'root', transform: { p: [0, 0, 0] } },
    { id: 'hana', type: 'Marker', parent: 'root', transform: { p: [0, 0, 3] } },
    { id: 'cam', type: 'Camera', parent: 'root', props: { focalLength: 35 } },
    { id: 'rail', type: 'Path3D', parent: 'root', props: { points: [[-4, 1.5, -2], [0, 1.5, -3], [4, 1.5, -2]] } },
    { id: 'brain', type: 'CameraBrain', parent: 'root', props: { camera: 'cam', defaultBlend: { style: 'easeInOut', seconds: 1 }, ...brain } },
    ...extra,
  ] });
  cams.setAspect(16 / 9);
  return { tree, cams, cam: tree.find('cam') };
}
const vc = (id, props) => { const { transform, ...rest } = props; return { id, type: 'VirtualCamera', parent: 'root', props: rest, ...(transform ? { transform } : {}) }; };
function ndc(cam, p) { cam.object3d.updateMatrixWorld(true); cam.camera.updateMatrixWorld(true); return new Vector3(...p).project(cam.camera); }

test('bodies: follow settles at its offset, orbit at its radius, a turntable turns, a dolly rides its path', () => {
  const { tree } = world([
    vc('f', { rig: 'follow', body: { target: 'mira', offset: [0, 1.6, -3], damping: 0.2 }, aim: { type: 'lookAt', target: 'mira' } }),
    vc('o', { rig: 'orbit', body: { target: 'hana', radius: 5, yaw: 90, pitch: 0 } }),
    vc('t', { rig: 'turntable', body: { target: 'hana', radius: 3, yawSpeed: 30 } }),
    vc('d', { rig: 'dolly', body: { path: 'rail', u: 0.5 }, aim: { type: 'lookAt', target: 'mira' } }),
  ]);
  tree.run(240);
  const f = tree.find('f').pose.p; near(f.x, 0, 1e-6); near(f.y, 1.6, 1e-6); near(f.z, -3, 1e-6);
  const o = tree.find('o').pose.p; near(o.distanceTo(new Vector3(0, 1.5, 3)), 5, 1e-9); near(o.x, 5, 1e-9);
  assert.ok(tree.find('t').vstate.yaw > 1.9, 'a turntable turns at its yawSpeed (4 s × 30°/s)');
  const d = tree.find('d').pose.p; near(d.x, 0, 1e-3); near(d.z, -3, 1e-3);
});

test('aims: lookAt centres the target; the composer holds it at its screen point; group framing fits both', () => {
  const { tree, cam } = world([
    vc('look', { priority: 30, body: { type: 'fixed' }, aim: { type: 'lookAt', target: 'hana' } }),
    vc('comp', { priority: 20, body: { type: 'fixed' }, aim: { type: 'composer', target: 'hana', screen: [0.3, 0.2], deadZone: [0.02, 0.02], damping: 0.1 }, lens: { focalLength: 35 } }),
    vc('group', { priority: 10, rig: 'twoShot', aim: { targets: ['mira', 'hana'], size: 0.6 } }),
  ].map((n) => ({ ...n, transform: { p: [4, 1.7, -2] } })), { defaultBlend: { style: 'cut' } });
  tree.run(30);
  const hana = [0, 1.5, 3], mira = [0, 1.5, 0];
  let p = ndc(cam, hana); near(p.x, 0, 1e-6); near(p.y, 0, 1e-6);
  tree.find('look').props.enabled = false; tree.run(120);
  p = ndc(cam, hana); near(p.x, 0.3, 0.02, 'composer x'); near(p.y, 0.2, 0.02, 'composer y');
  tree.find('comp').props.enabled = false; tree.run(10);
  const a = ndc(cam, hana), b = ndc(cam, mira);
  for (const q of [a, b]) assert.ok(Math.abs(q.x) < 1 && Math.abs(q.y) < 1, `both in frame: ${q.x.toFixed(2)}, ${q.y.toFixed(2)}`);
  assert.ok(cam.props.focalLength !== 35, `group framing set the lens (${cam.props.focalLength.toFixed(1)} mm)`);
});

test('shot / reverse shot keep to one side of the 180° line', () => {
  const a = [0, 0, 0], b = [0, 0, 3];
  const s = shotReverse(a, b, { side: 1 }), r = shotReverse(a, b, { side: 1, reverse: true });
  const sideOf = (p) => Math.sign((b[0] - a[0]) * (p[2] - a[2]) - (b[2] - a[2]) * (p[0] - a[0]));
  assert.equal(sideOf(s.p), sideOf(r.p), 'both cameras on the same side');
  assert.ok(s.p[2] < a[2] && r.p[2] > b[2], 'each behind its shoulder character');
});

test('noise is seeded and bounded; an impulse shakes and decays', () => {
  const vals = Array.from({ length: 200 }, (_, i) => noise1(7, i * 0.137));
  assert.ok(vals.every((v) => v >= -1 && v <= 1)); assert.deepEqual(vals, Array.from({ length: 200 }, (_, i) => noise1(7, i * 0.137)));
  const run = () => { const { tree } = world([vc('h', { rig: 'handheld', aim: { target: 'hana' }, transform: { p: [3, 1.6, -1] } })]); tree.run(90); return tree.find('h').pose.q.toArray(); };
  assert.deepEqual(run(), run(), 'handheld noise is the same every run');
  const { tree } = world([vc('s', { body: { type: 'fixed' }, aim: { type: 'lookAt', target: 'hana' }, impulseDecay: 0.5 })]);
  tree.run(5); const still = tree.find('s').pose.q.clone();
  tree.call(tree.find('s'), 'impulse', { strength: 0.8 }); tree.run(3);
  assert.ok(tree.find('s').pose.q.angleTo(still) > 0.001, 'shaken'); tree.run(40);
  assert.equal(tree.find('s').vstate.trauma, 0); near(tree.find('s').pose.q.angleTo(still), 0, 1e-6, 'settled back');
});

test('the brain: priority, then the latest activation; eased blends; cuts; an override; the camera gets the lens', () => {
  const { tree, cam } = world([
    vc('wide', { priority: 10, body: { type: 'fixed' }, aim: { type: 'lookAt', target: 'hana' }, lens: { focalLength: 24 }, transform: { p: [-4, 2, -4] } }),
    vc('tight', { priority: 10, body: { type: 'fixed' }, aim: { type: 'lookAt', target: 'hana' }, lens: { focalLength: 85 }, transform: { p: [4, 2, -4] } }),
  ], { blends: [{ from: 'tight', to: 'wide', style: 'cut' }] });
  const log = []; const emit = tree.emit.bind(tree); tree.emit = (n, s, p) => { if (s === 'cameraChanged') log.push(`${tree.clock.step}:${p.from}>${p.to}`); return emit(n, s, p); };
  tree.run(2);
  assert.equal(tree.find('brain').bstate.live, 'wide', 'equal priority: the first stays');
  tree.call(tree.find('tight'), 'activate'); tree.run(31); // half the 1 s blend
  near(cam.object3d.position.x, 0, 1e-6, 'halfway between the two eyes at t = 0.5'); near(cam.props.focalLength, 54.5, 1e-6, 'lens halfway');
  tree.run(40); near(cam.object3d.position.x, 4, 1e-9); assert.equal(cam.props.focalLength, 85);
  tree.call(tree.find('brain'), 'override', { camera: 'wide' }); tree.run(1);
  near(cam.object3d.position.x, -4, 1e-9, 'the tight → wide pair cuts'); assert.equal(tree.services.get('cameras').current, cam);
  assert.deepEqual(log, ['0:null>wide', '2:wide>tight', '73:tight>wide']);
});

test('cameras replay identically; a snapshot taken mid-blend restores and re-simulates to the same world', () => {
  const shots = [
    vc('a', { priority: 10, rig: 'orbit', body: { target: 'hana', radius: 4, yawSpeed: 25 }, noise: { profile: 'handheldHeavy' } }),
    vc('b', { priority: 5, rig: 'dolly', body: { path: 'rail', target: 'mira', lead: 0.1 }, aim: { type: 'composer', target: 'mira', screen: [-0.2, 0.1] } }),
  ];
  const drive = (t, from, to) => { for (let k = from; k < to; k++) { if (k === 60) { t.find('b').props.priority = 20; } if (k === 90) t.call(t.find('a'), 'impulse', { strength: 0.5 }); t.find('mira').object3d.position.x = Math.sin(k * 0.02); t.step(); } };
  const A = world(shots); drive(A.tree, 0, 75);
  const snap = captureWorld(A.tree); drive(A.tree, 75, 200);
  const B = world(shots); drive(B.tree, 0, 200);
  const C = world(shots); restoreWorld(C.tree, snap); drive(C.tree, 75, 200);
  const h = (w) => hashValue([worldHashes(w.tree), w.cam.object3d.position.toArray(), w.cam.object3d.quaternion.toArray(), w.cam.props.focalLength]);
  assert.equal(h(B), h(A), 'two runs'); assert.equal(h(C), h(A), 'restored mid-blend');
});
