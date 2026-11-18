// M2 W6 (AB-T-0529) without characters' VRMs: the soup from colliders, a bake, paths around a wall and through its
// doorway, a box blocker that sends the path round (and back), off-mesh links, and the snapshot of the navmesh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree } from '@vrmxg/core';
import { loadRapier, installPhysics } from '@vrmxg/physics';
import { installNav, collidersToSoup } from '@vrmxg/nav';

installPortableMath();

// A 12 × 12 m floor, a wall across z = 0 with a 1.4 m doorway at x = 0, and a thick 3 m block that must not bake on top.
async function world() {
  const tree = new SceneTree({ registry: m0Registry(), seed: 1 });
  installPhysics(tree, await loadRapier());
  const navs = installNav(tree);
  tree.instantiate({ format: 'vrmxs', version: 1, id: 'n', nodes: [
    { id: 'root', type: 'Node3D' },
    { id: 'floor', type: 'Collider', parent: 'root', transform: { p: [0, -0.1, 0] }, props: { shape: 'box', size: [12, 0.2, 12] } },
    { id: 'wall-l', type: 'Collider', parent: 'root', transform: { p: [-3.35, 1.25, 0] }, props: { shape: 'box', size: [5.3, 2.5, 0.2] } },
    { id: 'wall-r', type: 'Collider', parent: 'root', transform: { p: [3.35, 1.25, 0] }, props: { shape: 'box', size: [5.3, 2.5, 0.2] } },
    { id: 'block', type: 'Collider', parent: 'root', transform: { p: [-4, 1.5, -4] }, props: { shape: 'box', size: [2, 3, 2] } },
  ] });
  return { tree, navs };
}

test('the soup is the fixed colliders; tall boxes lose their tops', async () => {
  const { tree } = await world();
  const ph = tree.services.get('physics');
  const s = collidersToSoup(ph.R, ph.world.world);
  assert.equal(s.colliders, 4);
  assert.equal(s.indices.length / 3, 12 + 10 + 10 + 10, 'the floor whole; the walls (2.5 m) and the block (3 m) without their tops');
});

test('bake, then paths: through the doorway, round a blocker, back when it lifts; links shorten a path', async () => {
  const { navs } = await world();
  const st = navs.bake();
  assert.ok(st.polys > 4 && st.tiles >= 4, JSON.stringify(st));
  assert.equal(navs.closest([-4, 3.2, -4]), null, 'no navmesh on top of the 3 m block (the search reaches 1.2–5.2 m)');
  const a = [-1.5, 0, 3], b = [1.5, 0, -3];
  const p0 = navs.findPath(a, b);
  assert.ok(p0.complete && p0.length > 6.5 && p0.length < 8, `through the doorway (${p0.length.toFixed(2)} m)`);
  navs.setBlocked('door', [-0.8, 0, -0.3, 0.8, 2.2, 0.3]);
  const p1 = navs.findPath(a, b);
  assert.ok(!p1 || !p1.complete, 'the doorway blocked: no way through (the wall spans the floor)');
  assert.equal(navs.st.version, 1);
  navs.setBlocked('door', null);
  const p2 = navs.findPath(a, b);
  assert.ok(p2.complete && Math.abs(p2.length - p0.length) < 1e-9, 'unblocked: the same path again');
  const key = navs.addLink({ start: [-5, 0, 1], end: [-5, 0, -1], radius: 0.4 });
  const p3 = navs.findPath([-5, 0, 2], [-5, 0, -2]);
  assert.ok(p3.complete && p3.length < 6, `a link through the wall (${p3.length.toFixed(2)} m)`);
  navs.removeLink(key);
  const p4 = navs.findPath([-5, 0, 2], [-5, 0, -2]);
  assert.ok(p4.length > p3.length + 4, `without it, round by the doorway (${p4.length.toFixed(2)} m)`);
});

test('a snapshot carries the navmesh only once it changed; restore gives the same paths', async () => {
  const { navs } = await world();
  navs.bake();
  assert.equal(navs.snapshot().mesh, null, 'as baked: nothing to carry');
  navs.setBlocked('door', [-0.8, 0, -0.3, 0.8, 2.2, 0.3]);
  const snap = navs.snapshot();
  assert.ok(snap.mesh, 'changed: the navmesh is in it');
  const { navs: other } = await world();
  other.bake();
  other.restore(snap);
  const p = other.findPath([-1.5, 0, 3], [1.5, 0, -3]);
  assert.ok(!p || !p.complete, 'restored with the doorway blocked');
  assert.deepEqual(other.stateVector(), navs.stateVector());
});
