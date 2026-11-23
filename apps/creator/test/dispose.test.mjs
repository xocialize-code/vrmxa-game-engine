// Thumbnail worlds are disposed whole (M4 W5 review): physics freed, each geometry, material and texture once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh, BoxGeometry, MeshStandardMaterial, Texture } from 'three';
import { disposeWorld } from '../src/dispose.js';

test('a world lets go of its physics, geometries, materials and textures, once each', () => {
  const root = new Group(), geo = new BoxGeometry(), map = new Texture(), mat = new MeshStandardMaterial({ map });
  root.add(new Mesh(geo, mat), new Mesh(geo, [mat, new MeshStandardMaterial()]));
  const disposed = [];
  for (const x of [geo, map, mat]) x.addEventListener('dispose', () => disposed.push(x.type ?? x.constructor.name));
  let freed = 0, silenced = 0;
  const world = { tree: { root: { object3d: root }, services: new Map([['physics', { world: { free: () => { freed++; } } }]]) }, audio: { dispose: () => { silenced++; } } };
  assert.deepEqual(disposeWorld(world), { geometries: 1, materials: 2, textures: 1, physics: true });
  assert.equal(disposed.length, 3, 'the shared geometry and material once each');
  assert.deepEqual([freed, silenced], [1, 1]);
  assert.deepEqual(disposeWorld(world), { geometries: 0, materials: 0, textures: 0, physics: false }, 'twice is harmless');
  assert.deepEqual(disposeWorld(null), { geometries: 0, materials: 0, textures: 0, physics: false });
});
