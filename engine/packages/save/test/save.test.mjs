// M2 W9 (AB-T-0532): typed arrays survive the file exactly; a save of a world with physics loads into a fresh one and
// plays on with the same per-step hashes; flags are saved; the file names what it needs and a mismatch is refused,
// saying why; the stores keep and list saves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree } from '@vrmxg/core';
import { loadRapier, installPhysics } from '@vrmxg/physics';
import { worldHashes, hashValue } from '@vrmxg/snapshot';
import { installSave, encode, decode, toBase64, fromBase64, MemoryStore, mathsFingerprint } from '@vrmxg/save';
import { FsStore } from '@vrmxg/save/node';

installPortableMath();

const DOC = { format: 'vrmxs', version: 1, id: 'box', nodes: [
  { id: 'root', type: 'Node3D' },
  { id: 'floor', type: 'Collider', parent: 'root', transform: { p: [0, -0.5, 0] }, props: { shape: 'box', size: [20, 1, 20] } },
  { id: 'crate', type: 'RigidBody', parent: 'root', transform: { p: [0, 3, 0] }, props: { mass: 2 } },
  { id: 'crate-shape', type: 'Collider', parent: 'crate', props: { shape: 'box', size: [0.5, 0.5, 0.5], restitution: 0.4 } },
] };
async function world(doc = DOC) {
  const tree = new SceneTree({ registry: m0Registry(), seed: 2 });
  installPhysics(tree, await loadRapier());
  const save = installSave(tree, { scene: { ref: 'box.vrmxs', doc }, app: { name: 'test' } });
  tree.instantiate(structuredClone(doc));
  return { tree, save };
}
const h = (tree) => hashValue(worldHashes(tree, { physicsBytes: true }));

test('typed arrays, -0, NaN and maps survive encode / decode exactly; base64 matches the platform\'s', () => {
  const v = { f: new Float64Array([0.1, -0, Infinity, 1 / 3]), u: new Uint8Array([0, 255, 7]), n: -0, nan: NaN, m: new Map([['a', 1]]), list: [new Float32Array([1.5])] };
  const back = decode(JSON.parse(JSON.stringify(encode(v))));
  assert.deepEqual([...back.f], [...v.f]); assert.ok(Object.is(back.f[1], -0));
  assert.deepEqual([...back.u], [0, 255, 7]); assert.ok(Object.is(back.n, -0)); assert.ok(Number.isNaN(back.nan));
  assert.equal(back.m.get('a'), 1); assert.equal(back.list[0][0], 1.5);
  for (const n of [0, 1, 2, 3, 4, 5, 100]) {
    const bytes = new Uint8Array(n).map((_, i) => (i * 37 + 11) & 255);
    assert.equal(toBase64(bytes), Buffer.from(bytes).toString('base64'));
    assert.deepEqual([...fromBase64(toBase64(bytes))], [...bytes]);
  }
});

test('save mid-fall, load into a fresh world: the same per-step hashes on; flags come back', async () => {
  const a = await world();
  for (let i = 0; i < 45; i++) a.tree.step();
  a.save.setFlag('keyFound', { room: 'staff' });
  const file = JSON.parse(JSON.stringify(a.save.save({ name: 'mid-fall', savedAt: '2026-11-18T12:00:00Z' })));
  assert.equal(file.summary.step, 45);
  assert.deepEqual(file.requires.services, ['physics', 'save']);
  assert.equal(file.requires.maths, mathsFingerprint());
  const ref = [];
  for (let i = 0; i < 120; i++) { a.tree.step(); ref.push(h(a.tree)); }
  const b = await world();
  assert.equal(await b.save.load(file), 45);
  assert.deepEqual(b.save.getFlag('keyFound'), { room: 'staff' });
  for (let i = 0; i < 120; i++) { b.tree.step(); assert.equal(h(b.tree), ref[i], `step ${46 + i}`); }
});

test('a save names what it needs; a different scene, Rapier build or format is refused with the reason', async () => {
  const a = await world();
  a.tree.step();
  const file = a.save.save({ name: 'x' });
  const changed = await world({ ...DOC, nodes: DOC.nodes.map((n) => (n.id === 'crate' ? { ...n, transform: { p: [1, 3, 0] } } : n)) });
  await assert.rejects(changed.save.load(file), /the scene now is/);
  const b = await world();
  assert.match(b.save.check({ ...file, requires: { ...file.requires, rapier: { rapier: 'simd', version: '0.1' } } }).join(), /Rapier/);
  assert.match(b.save.check({ ...file, requires: { ...file.requires, maths: 'x' } }).join(), /portable maths/);
  assert.match(b.save.check({ ...file, version: 99 }).join(), /save version 99/);
  assert.match(b.save.check({ format: 'nope' }).join(), /not a save file/);
  assert.deepEqual(b.save.check(file), []);
});

test('stores keep, list and remove saves (memory and files)', async () => {
  const a = await world();
  for (let i = 0; i < 10; i++) a.tree.step();
  const doc = a.save.save({ name: 'Slot one', savedAt: 'now' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-saves-'));
  for (const store of [new MemoryStore(), new FsStore(dir)]) {
    await store.write('slot-1', doc);
    await store.write('slot-2', { ...doc, name: 'Slot two' });
    const list = await store.list();
    assert.deepEqual(list.map((s) => s.slot), ['slot-1', 'slot-2']);
    assert.equal(list[0].step, 10);
    assert.deepEqual(await store.read('slot-1'), JSON.parse(JSON.stringify(doc)));
    await store.remove('slot-2');
    assert.equal((await store.list()).length, 1);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  await assert.rejects(new FsStore(fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-'))).write('../evil', doc), /a slot is/);
});
