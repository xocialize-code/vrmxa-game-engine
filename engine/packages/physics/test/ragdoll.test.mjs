// M3 W7: ball joints and hinges by frames, and ragdolls through the adapter. A small figure (a torso, a thigh on a ball
// joint, a shin on a hinge, an arm on a ball joint) dropped on a floor: limits hold, the parts touch the floor and never
// each other, and the fall is the same twice and from a snapshot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier, PhysicsWorld, Layers, buildRagdoll, removeRagdoll, ragdollMotion } from '@vrmxg/physics';

installPortableMath();
const R = await loadRapier();
const I = [0, 0, 0, 1];
const half = (axis, a) => { const s = Math.sin(a / 2); return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(a / 2)]; };
const angleAbout = (qa, qb, axis) => {
  // the rotation from a to b (both world), as an angle about `axis` (its twist part)
  const [ax, ay, az, aw] = qa, [bx, by, bz, bw] = qb;
  const rx = aw * bx - ax * bw - ay * bz + az * by, ry = aw * by + ax * bz - ay * bw - az * bx, rz = aw * bz - ax * by + ay * bx - az * bw, rw = aw * bw + ax * bx + ay * by + az * bz;
  return 2 * Math.atan2(rx * axis[0] + ry * axis[1] + rz * axis[2], rw);
};

function figure(y = 1.2) {
  // the torso stands up; the thigh hangs from its bottom, the shin from the thigh's end, an arm sticks out to the side
  return [
    { name: 'torso', parent: -1, p: [0, y, 0], q: I, shape: { shape: 'capsule', radius: 0.12, height: 0.5, p: [0, 0.2, 0] }, mass: 30 },
    { name: 'thigh', parent: 0, p: [0.1, y - 0.05, 0], q: I, shape: { shape: 'capsule', radius: 0.07, height: 0.42, p: [0, -0.21, 0] }, mass: 8,
      joint: { type: 'ball', rest: I, limits: { x: [-1.8, 0.4], y: [-0.5, 0.5], z: [-0.3, 0.8] } } },
    { name: 'shin', parent: 1, p: [0.1, y - 0.47, 0], q: I, shape: { shape: 'capsule', radius: 0.05, height: 0.42, p: [0, -0.21, 0] }, mass: 4,
      joint: { type: 'hinge', rest: I, range: [0, 2.4] } }, // x is the hinge: positive swings the foot back (−z)
    { name: 'arm', parent: 0, p: [0.2, y + 0.35, 0], q: I, shape: { shape: 'capsule', radius: 0.05, height: 0.5, p: [0.25, 0, 0], q: half([0, 0, 1], Math.PI / 2) }, mass: 3,
      joint: { type: 'ball', rest: I, limits: { x: [-1, 1], y: [-1, 1], z: [-1.4, 1.4] } } },
  ];
}

function makeWorld() {
  const w = new PhysicsWorld(R, { layers: new Layers() });
  const floor = w.createBody({ type: 'fixed' });
  w.createCollider(floor, { shape: 'box', size: [20, 1, 20], p: [0, -0.5, 0] });
  return w;
}
const bits = (w, rd) => { const out = []; for (const b of rd.bodies) { const { p, q } = w.bodyPose(b); out.push(...p, ...q); } return Float64Array.from(out).join(','); };

test('a hinge by frames turns about its x and stops at its limits; a ball joint at its limits per axis', () => {
  const w = new PhysicsWorld(R, { gravity: [0, 0, 0] });
  const a = w.createBody({ type: 'fixed' }), b = w.createBody({ type: 'dynamic' });
  w.createCollider(b, { shape: 'capsule', radius: 0.05, height: 0.4, p: [0, -0.2, 0] });
  // the hinge's x is the world's z here (align turns x onto z)
  const align = half([0, 1, 0], -Math.PI / 2);
  w.createHinge(a, b, { frameA: align, frameB: align, limits: [-0.2, 0.5] });
  w.setMotion(b, [0, 0, 0], [0, 0, 4]);
  for (let i = 0; i < 60; i++) w.step();
  assert.ok(Math.abs(angleAbout(I, w.bodyPose(b).q, [0, 0, 1]) - 0.5) < 0.02, 'stops at +0.5 about z');
  w.setMotion(b, [0, 0, 0], [0, 0, -4]);
  for (let i = 0; i < 60; i++) w.step();
  assert.ok(Math.abs(angleAbout(I, w.bodyPose(b).q, [0, 0, 1]) + 0.2) < 0.02, 'stops at −0.2 about z');
  const q = w.bodyPose(b).q;
  assert.ok(Math.abs(q[0]) < 1e-3 && Math.abs(q[1]) < 1e-3, 'no turn about the other axes');

  const c = w.createBody({ type: 'fixed', p: [3, 0, 0] }), d = w.createBody({ type: 'dynamic', p: [3, 0, 0] });
  w.createCollider(d, { shape: 'capsule', radius: 0.05, height: 0.4, p: [0, -0.2, 0] });
  w.createSpherical(c, d, { limits: { x: [-0.3, 0.6] } });
  w.setMotion(d, [0, 0, 0], [3, 0, 0]);
  for (let i = 0; i < 60; i++) w.step();
  assert.ok(Math.abs(angleAbout(I, w.bodyPose(d).q, [1, 0, 0]) - 0.6) < 0.02, 'a ball stops at +0.6 about x');
});

test('a ragdoll falls onto the floor, its parts never touch each other, its limits hold', () => {
  const w = makeWorld();
  const parts = figure();
  // the arm overlaps the torso and the shin the thigh at their joints, as a humanoid's parts do: with self-collision
  // they would push apart; the ragdoll's groups keep them out of each other's way
  const rd = buildRagdoll(w, parts, { velocity: [1.5, 0, 0] });
  assert.equal(rd.bodies.length, 4); assert.equal(rd.joints.length, 3);
  let lowest = Infinity;
  for (let i = 0; i < 360; i++) {
    w.step();
    for (const b of rd.bodies) lowest = Math.min(lowest, w.bodyPose(b).p[1]);
    // the shin's hinge: never past its range (a little slack for the solver)
    const knee = angleAbout(w.bodyPose(rd.bodies[1]).q, w.bodyPose(rd.bodies[2]).q, [1, 0, 0]);
    assert.ok(knee > -0.08 && knee < 2.48, `knee ${knee.toFixed(3)} within [0, 2.4] at step ${i}`);
  }
  const torso = w.bodyPose(rd.bodies[0]).p;
  assert.ok(torso[1] < 0.4, `the torso came down (${torso[1].toFixed(3)})`);
  assert.ok(lowest > -0.05, 'nothing went through the floor');
  const m = ragdollMotion(w, rd);
  assert.ok(m.lin < 0.2 && m.ang < 0.5, `it settled (${m.lin.toFixed(3)} m/s, ${m.ang.toFixed(3)} rad/s)`);
  // no contact between two parts of the ragdoll; contacts with the floor
  const parted = new Set(rd.bodies);
  let floorContacts = 0;
  w.world.forEachCollider((c) => {
    if (!parted.has(c.parent()?.handle)) return;
    w.world.contactPairsWith(c, (o) => { if (parted.has(o.parent()?.handle)) assert.fail('two ragdoll parts in contact'); else floorContacts++; });
  });
  assert.ok(floorContacts > 0, 'the parts rest on the floor');
  removeRagdoll(w, rd);
  assert.equal(w.world.bodies.len(), 1, 'removed: the floor alone');
});

test('the fall is bit-identical twice, and from a snapshot taken mid-fall', () => {
  const run = (snapAt) => {
    const w = makeWorld();
    const rd = buildRagdoll(w, figure(), { velocity: [1.5, 0, -0.4] });
    w.applyImpulse(rd.bodies[0], [20, 0, 5]);
    let snap = null; const trace = [];
    for (let i = 1; i <= 240; i++) { w.step(); trace.push(bits(w, rd)); if (i === snapAt) snap = w.snapshot(); }
    return { trace, snap, rd };
  };
  const a = run(90), b = run(-1);
  assert.deepEqual(a.trace, b.trace, 'two runs, the same bits');
  const w = makeWorld();
  w.restore(a.snap);
  const again = [];
  for (let i = 91; i <= 240; i++) { w.step(); again.push(bits(w, a.rd)); }
  assert.deepEqual(again, a.trace.slice(90), 'restored mid-fall: the same bits to the end (the handles survive)');
});
