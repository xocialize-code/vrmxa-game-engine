// M3 W8: the raycast vehicle through the adapter. A 300 kg box on four wheels on a floor: it settles on its springs,
// drives forward (+z, the VRMXI front), turns with its front wheels, brakes to a stop; the same bits twice, and from a
// snapshot taken mid-drive (the controller built again after the restore).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier, PhysicsWorld } from '@vrmxg/physics';

installPortableMath();
const R = await loadRapier();
const WHEELS = [[-0.6, 0.3, 0.9], [0.6, 0.3, 0.9], [-0.6, 0.3, -0.9], [0.6, 0.3, -0.9]].map((at) => ({ at, radius: 0.3, rest: 0.25 }));

function car() {
  const w = new PhysicsWorld(R);
  const floor = w.createBody({ type: 'fixed' });
  w.createCollider(floor, { shape: 'box', size: [200, 1, 200], p: [0, -0.5, 0] });
  const chassis = w.createBody({ type: 'dynamic', p: [0, 0.6, 0], angularDamping: 0.5 });
  w.createCollider(chassis, { shape: 'box', size: [1.4, 0.4, 2.4], p: [0, 0.35, 0], mass: 300 });
  const v = w.createVehicle(chassis, { wheels: WHEELS });
  return { w, chassis, v };
}
const drive = (k) => {
  // forward for 3 s, then a left turn for 2 s, then the brakes
  if (k < 180) return WHEELS.map((_, i) => ({ engine: i >= 2 ? 400 : 0 }));
  if (k < 300) return WHEELS.map((_, i) => ({ engine: i >= 2 ? 250 : 0, steer: i < 2 ? 0.4 : 0 }));
  return WHEELS.map(() => ({ brake: 30 }));
};
const bits = (w, h) => { const { p, q } = w.bodyPose(h); return Float64Array.from([...p, ...q]).join(','); };

test('a car settles on its springs, drives forward, turns left and stops', () => {
  const { w, chassis, v } = car();
  for (let k = 0; k < 60; k++) { v.update(1 / 60, WHEELS.map(() => ({ brake: 30 }))); w.step(); }
  const rest = w.bodyPose(chassis).p;
  assert.ok(v.wheels().every((x) => x.contact), 'all four wheels on the floor');
  assert.ok(Math.abs(rest[0]) < 0.01 && Math.abs(rest[2]) < 0.01, 'parked: it stays put');
  for (let k = 0; k < 180; k++) { v.update(1 / 60, drive(k)); w.step(); }
  const fwd = w.bodyPose(chassis).p;
  assert.ok(fwd[2] > 5, `forward along +z (${fwd[2].toFixed(2)} m)`);
  assert.ok(Math.abs(fwd[0]) < 0.3, `straight (${fwd[0].toFixed(3)} m sideways)`);
  for (let k = 180; k < 300; k++) { v.update(1 / 60, drive(k)); w.step(); }
  const turned = w.bodyPose(chassis);
  const yaw = 2 * Math.atan2(turned.q[1], turned.q[3]);
  assert.ok(yaw > 0.3, `turned left (yaw ${yaw.toFixed(2)} rad: +z towards +x)`);
  for (let k = 300; k < 600; k++) { v.update(1 / 60, drive(k)); w.step(); }
  assert.ok(Math.abs(v.speed()) < 0.05, `stopped (${v.speed().toFixed(3)} m/s)`);
  const end = w.bodyPose(chassis);
  assert.ok(Math.abs(end.q[0]) < 0.05 && Math.abs(end.q[2]) < 0.05, 'on its wheels');
});

test('the drive is bit-identical twice, and from a snapshot taken mid-drive', () => {
  const run = (snapAt) => {
    const { w, chassis, v } = car(), trace = [];
    let snap = null;
    for (let k = 0; k < 420; k++) { v.update(1 / 60, drive(k)); w.step(); trace.push(bits(w, chassis)); if (k === snapAt) snap = w.snapshot(); }
    return { trace, snap, chassis };
  };
  const a = run(200), b = run(-1);
  assert.deepEqual(a.trace, b.trace, 'two runs, the same bits');
  const { w, v } = car();
  w.restore(a.snap);
  const again = [];
  for (let k = 201; k < 420; k++) { v.update(1 / 60, drive(k)); w.step(); again.push(bits(w, a.chassis)); }
  assert.deepEqual(again, a.trace.slice(201), 'restored mid-turn: the same bits to the end');
});
