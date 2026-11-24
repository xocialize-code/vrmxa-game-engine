// Thumbnail worlds are disposed whole (M4 W5 review): physics freed, each geometry, material and texture once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh, SkinnedMesh, BoxGeometry, BufferAttribute, MeshStandardMaterial, Texture } from 'three';
import { disposeWorld } from '../src/dispose.js';

test('a world lets go of its physics, geometries, materials and textures, once each', () => {
  const root = new Group(), geo = new BoxGeometry(), map = new Texture(), mat = new MeshStandardMaterial({ map });
  root.add(new Mesh(geo, mat), new Mesh(geo, [mat, new MeshStandardMaterial()]));
  const disposed = [];
  for (const x of [geo, map, mat]) x.addEventListener('dispose', () => disposed.push(x.type ?? x.constructor.name));
  let freed = 0, silenced = 0;
  const world = { tree: { root: { object3d: root }, services: new Map([['physics', { world: { free: () => { freed++; } } }]]) }, audio: { dispose: () => { silenced++; } } };
  assert.deepEqual(disposeWorld(world), { geometries: 1, materials: 2, textures: 1, physics: true, bytes: 0, bitmaps: 0 });
  assert.equal(disposed.length, 3, 'the shared geometry and material once each');
  assert.deepEqual([freed, silenced], [1, 1]);
  assert.deepEqual(disposeWorld(world), { geometries: 0, materials: 0, textures: 0, physics: false, bytes: 0, bitmaps: 0 }, 'twice is harmless');
  assert.deepEqual(disposeWorld(null), { geometries: 0, materials: 0, textures: 0, physics: false, bytes: 0, bitmaps: 0 });
  assert.equal(geo.getAttribute('position').array.length, 72, 'a static mesh keeps its arrays (they may be a library\'s own)');
});

// AB-T-0592: what WebKit would hold until a collection it has no reason to run is given back by hand.
test('a character\'s vertex data and its textures\' image bitmaps are given back at once', () => {
  class ImageBitmap { constructor() { this.closed = 0; } close() { this.closed++; } }
  const had = globalThis.ImageBitmap; globalThis.ImageBitmap = ImageBitmap; // Node has none
  try {
    const body = new BoxGeometry(), other = new BoxGeometry();
    body.morphAttributes.position = [new BufferAttribute(new Float32Array(72), 3), new BufferAttribute(new Float32Array(72), 3)];
    const bytes = body.index.array.byteLength + ['position', 'normal', 'uv'].reduce((n, k) => n + body.getAttribute(k).array.byteLength, 0) + 2 * 72 * 4;
    const face = new ImageBitmap(), shared = new Texture(face), again = new Texture(face), plain = new Texture({ width: 1, height: 1 });
    const root = new Group();
    const skinned = new SkinnedMesh(body, [new MeshStandardMaterial({ map: shared }), new MeshStandardMaterial({ map: again, emissiveMap: plain })]);
    root.add(skinned, new SkinnedMesh(body, skinned.material[0]), new Mesh(other, skinned.material[0]));
    const out = disposeWorld({ tree: { root: { object3d: root }, services: new Map() } });
    assert.equal(out.bytes, bytes, 'the index, every attribute and both morph targets, once for the shared geometry');
    assert.equal(body.getAttribute('position').array.length, 0, 'detached: nothing holds the memory');
    assert.equal(body.morphAttributes.position[1].array.length, 0);
    assert.equal(other.getAttribute('position').array.length, 72, 'the static mesh beside it is left alone');
    assert.deepEqual([out.bitmaps, face.closed], [1, 1], 'one bitmap behind two textures: closed once');
    assert.equal(out.textures, 3);
  } finally { if (had) globalThis.ImageBitmap = had; else delete globalThis.ImageBitmap; }
});
