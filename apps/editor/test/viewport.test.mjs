// M5 W5 (AB-T-0604, AB-T-0605): the viewport aids' maths in Node: shape handles' drag-to-props, rectangle select, the
// view cube's layout and angles, the preview's corner, and the preview leaving the edit world's cameras as it found them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, PerspectiveCamera, Quaternion, Vector3, Euler } from 'three';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree } from '@vrmxg/core';
import { installCameras } from '@vrmxg/camera';
import { worldHashes, hashValue } from '@vrmxg/snapshot';
import { shapeOf, handlesOf, dragShape, coneAngle, closestOnLine, shapeLines, SNAP } from '../src/viewport/shapes.js';
import { normRect, isDrag, screenBox, rectSelect } from '../src/viewport/rect.js';
import { layout, viewAngles, intoCamera } from '../src/viewport/cube.js';
import { pipRect, previewPose, previewable } from '../src/viewport/preview.js';

const reg = m0Registry();
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} ≉ ${b}`);
const nearAll = (a, b, e = 1e-9) => { assert.equal(a.length, b.length); a.forEach((v, i) => near(v, b[i], e)); };

test('shapeOf: colliders and sensors with physics\' defaults, lights with the registry\'s, nothing for other nodes', () => {
  assert.deepEqual(shapeOf({ type: 'Collider' }, reg), { kind: 'box', size: [1, 1, 1] });
  assert.deepEqual(shapeOf({ type: 'Area', props: { shape: 'box', size: [2, 1, 3] } }, reg), { kind: 'box', size: [2, 1, 3] });
  assert.deepEqual(shapeOf({ type: 'Collider', props: { shape: 'capsule' } }, reg), { kind: 'capsule', radius: 0.3, height: 1.8 });
  assert.deepEqual(shapeOf({ type: 'Collider', props: { shape: 'cylinder', radius: 0.2 } }, reg), { kind: 'cylinder', radius: 0.2, height: 1 });
  assert.deepEqual(shapeOf({ type: 'Collider', props: { shape: 'sphere' } }, reg), { kind: 'sphere', radius: 0.5 });
  assert.equal(shapeOf({ type: 'Collider', props: { shape: 'trimesh' } }, reg), null);
  assert.deepEqual(shapeOf({ type: 'PointLight' }, reg), { kind: 'point', range: 10 });
  assert.deepEqual(shapeOf({ type: 'SpotLight', props: { range: 7, angle: 40 } }, reg), { kind: 'spot', range: 7, angle: 40 });
  assert.equal(shapeOf({ type: 'Marker' }, reg), null);
});

test('a box: a handle on each face; dragging a face moves only that face (the node shifts by half), and the inspector\'s size follows', () => {
  const box = { kind: 'box', size: [2, 1, 4] };
  const hs = handlesOf(box);
  assert.deepEqual(hs.map((h) => h.id), ['x+', 'x-', 'y+', 'y-', 'z+', 'z-']);
  assert.deepEqual(hs.find((h) => h.id === 'z-').at, [-0, -0, -2]);
  for (const h of hs) {
    const k = 'xyz'.indexOf(h.id[0]), sign = h.id[1] === '+' ? 1 : -1;
    const r = dragShape(box, h.id, 0.5);
    const want = [...box.size]; want[k] += 0.5;
    assert.deepEqual(r.props, { size: want }, h.id);
    const shift = [0, 0, 0]; shift[k] = sign * 0.25;
    assert.deepEqual(r.shift, shift, `${h.id}: the opposite face stays put`);
    // the far face: centre + shift − half the new size, along the handle's axis, is where it was
    near(sign * shift[k] - want[k] / 2, -box.size[k] / 2);
  }
  // pushing a face in shrinks the box, never past the smallest size
  assert.deepEqual(dragShape(box, 'x+', -5).props.size, [0.01, 1, 4]);
  // symmetric (⌥): both sides grow, nothing moves
  assert.deepEqual(dragShape(box, 'y+', 0.25, { symmetric: true }), { shape: { kind: 'box', size: [2, 1.5, 4] }, props: { size: [2, 1.5, 4] }, shift: [0, 0, 0] });
});

test('snapping rounds the size the drag gives (the far face never moves)', () => {
  const box = { kind: 'box', size: [1.03, 1, 1] };
  const r = dragShape(box, 'x+', 0.111, { snap: true });
  assert.deepEqual(r.props.size, [1.15, 1, 1]);
  near(r.shift[0], (1.15 - 1.03) / 2, 1e-6);
  assert.equal(dragShape({ kind: 'box', size: [1, 1, 1] }, 'x-', -3, { snap: true }).props.size[0], SNAP.length);
});

test('spheres, capsules, cylinders and lights', () => {
  assert.deepEqual(dragShape({ kind: 'sphere', radius: 0.5 }, 'ry-', 0.2).props, { radius: 0.7 });
  const cap = { kind: 'capsule', radius: 0.3, height: 1.8 };
  assert.deepEqual(handlesOf(cap).map((h) => h.id), ['y+', 'y-', 'rx+', 'rx-', 'rz+', 'rz-']);
  assert.deepEqual(dragShape(cap, 'y+', 0.2), { shape: { ...cap, height: 2 }, props: { height: 2 }, shift: [0, 0.1, 0] });
  assert.deepEqual(dragShape(cap, 'rz-', 0.1).props, { radius: 0.4 });
  assert.deepEqual(dragShape({ kind: 'cylinder', radius: 0.5, height: 1 }, 'y-', 0.5).shift, [0, -0.25, 0]);
  // a capsule is never shorter than its two caps nor wider than half its height (physics would stop changing it while
  // the node still moved): the end that stays put stays put
  const short = dragShape(cap, 'y+', -5);
  assert.deepEqual([short.props.height, short.shift[1]], [0.6, -0.6]);
  near(short.shift[1] - short.props.height / 2, -0.9); // the bottom end is where it was
  assert.equal(dragShape(cap, 'rx+', 5).props.radius, 0.9);
  assert.equal(dragShape({ kind: 'cylinder', radius: 0.5, height: 1 }, 'rx+', 5).props.radius, 5.5, 'a cylinder has no such limit');
  assert.deepEqual(dragShape({ kind: 'point', range: 10 }, 'rx+', -2.5).props, { range: 7.5 });
  const spot = { kind: 'spot', range: 4, angle: 30 };
  const [range, angle] = handlesOf(spot);
  assert.deepEqual(range.at, [0, 0, -4]);
  nearAll(angle.at, [4 * Math.tan(Math.PI / 6), 0, -4]);
  assert.deepEqual(dragShape(spot, 'range', 1).props, { range: 5 });
  // widening the rim to the range's own length is 45°
  near(dragShape(spot, 'angle', 4 - 4 * Math.tan(Math.PI / 6)).props.angle, 45, 1e-6);
  assert.equal(coneAngle(1, 100), 89); assert.equal(coneAngle(1, 0), 1);
  assert.equal(dragShape(spot, 'angle', 0.013, { snap: true }).props.angle, 30);
});

test('closestOnLine: a ray straight across a handle\'s axis; parallel gives nothing', () => {
  near(closestOnLine([3, 5, 0], [0, -1, 0], [0, 0, 0], [1, 0, 0]), 3);
  near(closestOnLine([0, 2, 10], [0, 0, -1], [0, 0, 0], [0, 1, 0]), 2);
  assert.equal(closestOnLine([0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 0, 0]), null);
});

test('shape wireframes: a box has 12 edges, each shape some segments, all in pairs of points', () => {
  assert.equal(shapeLines({ kind: 'box', size: [1, 2, 3] }).length, 12 * 6);
  for (const s of [{ kind: 'sphere', radius: 1 }, { kind: 'capsule', radius: 0.3, height: 1.8 }, { kind: 'cylinder', radius: 0.5, height: 1 }, { kind: 'point', range: 3 }, { kind: 'spot', range: 4, angle: 30 }]) {
    const l = shapeLines(s);
    assert.ok(l.length > 0 && l.length % 6 === 0, s.kind);
  }
  const ys = shapeLines({ kind: 'capsule', radius: 0.3, height: 1.8 }).filter((_, i) => i % 3 === 1);
  near(Math.max(...ys), 0.9, 1e-9); near(Math.min(...ys), -0.9, 1e-9);
});

test('rectangle select: wholly inside picks, partly inside or behind the camera doesn\'t', () => {
  const r = normRect(300, 200, 100, 50);
  assert.deepEqual(r, { left: 100, top: 50, right: 300, bottom: 200 });
  assert.ok(isDrag(r)); assert.ok(!isDrag(normRect(10, 10, 12, 13)));
  const items = [
    { id: 'in', box: screenBox([{ x: 120, y: 60, behind: false }, { x: 200, y: 150, behind: false }]) },
    { id: 'half', box: screenBox([{ x: 250, y: 60, behind: false }, { x: 350, y: 150, behind: false }]) },
    { id: 'point', box: screenBox([{ x: 150, y: 100, behind: false }]) },
    { id: 'behind', box: screenBox([{ x: 150, y: 100, behind: true }, { x: 160, y: 110, behind: false }]) },
  ];
  assert.equal(items[3].box, null);
  assert.deepEqual(rectSelect(r, items), ['in', 'point']);
});

test('the view cube: ends where the camera sees them; each end\'s angles; the short way round', () => {
  const ident = [0, 0, 0, 1]; // looking down -Z, +Y up
  const by = Object.fromEntries(layout(ident).map((e) => [e.id, e]));
  nearAll([by.px.x, by.px.y, by.px.depth], [1, -0, 0]);
  nearAll([by.py.x, by.py.y], [0, -1]);
  near(by.pz.depth, 1);
  assert.equal(layout(ident).at(-1).id, 'pz', 'the nearest end is drawn last');
  // turned 90° about Y (looking down -X): +Z is now on the left
  const q = new Quaternion().setFromEuler(new Euler(0, Math.PI / 2, 0)).toArray();
  nearAll(intoCamera(q, [0, 0, 1]), [-1, 0, 0], 1e-9);
  assert.deepEqual(viewAngles('pz', 0), { azimuth: 0, polar: Math.PI / 2 });
  assert.deepEqual(viewAngles('px', 0), { azimuth: Math.PI / 2, polar: Math.PI / 2 });
  near(viewAngles('nz', 0.1).azimuth, Math.PI);
  near(viewAngles('nz', -0.1).azimuth, -Math.PI, 1e-9);
  near(viewAngles('px', 4 * Math.PI).azimuth, 4 * Math.PI + Math.PI / 2);
  const top = viewAngles('py', 1.4);
  near(top.azimuth, Math.PI / 2); assert.ok(top.polar > 0 && top.polar < 1e-3);
  // camera-controls' angles put the camera on that side: azimuth θ, polar φ → (sin φ sin θ, cos φ, sin φ cos θ)
  for (const [id, axis] of [['px', [1, 0, 0]], ['nx', [-1, 0, 0]], ['pz', [0, 0, 1]], ['nz', [0, 0, -1]], ['py', [0, 1, 0]], ['ny', [0, -1, 0]]]) {
    const { azimuth: t, polar: f } = viewAngles(id, 0);
    nearAll([Math.sin(f) * Math.sin(t), Math.cos(f), Math.sin(f) * Math.cos(t)], axis, 1e-3);
  }
});

test('the preview sits in the bottom right at 16:9, at least 160 px wide', () => {
  const r = pipRect(1200, 700);
  assert.deepEqual([r.width, r.height, r.right, r.bottom, r.x, r.y], [360, 203, 12, 12, 828, 12]);
  assert.equal(pipRect(300, 200).width, 160);
});

test('the preview poses a rigged Camera and a VirtualCamera and leaves the edit world exactly as it was', () => {
  const tree = new SceneTree({ registry: reg });
  installCameras(tree);
  const doc = {
    format: 'vrmxs', version: 1, id: 't', assets: [], connections: [],
    nodes: [
      { id: 'mira', type: 'Node3D', transform: { p: [0, 0, 2] } },
      { id: 'cam', type: 'Camera', transform: { p: [-0.5, 1.6, 12.5] }, props: { focalLength: 30, preset: 'follow', rig: { yaw: 180 }, target: 'mira' } },
      { id: 'shot', type: 'VirtualCamera', transform: { p: [3, 2, 3] }, props: { body: { type: 'fixed' }, aim: { type: 'lookAt', target: 'mira' }, lens: { focalLength: 35 } } },
    ],
  };
  tree.instantiate(doc);
  tree.root.object3d.updateMatrixWorld(true);
  const before = hashValue(worldHashes(tree));
  const objBefore = tree.all().map((n) => [n.id, n.object3d.position.toArray(), n.object3d.quaternion.toArray()]);
  const out = new PerspectiveCamera();
  const cam = tree.find('cam'), shot = tree.find('shot');
  assert.ok(previewable(cam) && previewable(shot) && !previewable(tree.find('mira')));
  assert.ok(previewPose(cam, out, 16 / 9));
  // follow: behind the target (yaw 180 looks along -Z, so the camera is on +Z of Mira), looking at her
  assert.ok(out.position.z > 2 + 1, `behind Mira: ${out.position.toArray()}`);
  const fwd = new Vector3(0, 0, -1).applyQuaternion(out.quaternion);
  assert.ok(fwd.z < -0.8, 'looking back at her');
  assert.ok(previewPose(shot, out, 16 / 9));
  nearAll(out.position.toArray(), [3, 2, 3], 1e-6);
  const look = new Vector3(0, 0, -1).applyQuaternion(out.quaternion), toMira = new Vector3(0, 1.5, 2).sub(new Vector3(3, 2, 3)).normalize();
  assert.ok(look.dot(toMira) > 0.999, 'aimed at Mira\'s eyes');
  assert.equal(hashValue(worldHashes(tree)), before, 'the world hash didn\'t move');
  assert.deepEqual(tree.all().map((n) => [n.id, n.object3d.position.toArray(), n.object3d.quaternion.toArray()]), objBefore, 'every node where it was');
  assert.equal(cam.rig.distance, null, 'the rig\'s state as it was');
  assert.equal(shot.vstate.p, null);
  void Matrix4;
});
