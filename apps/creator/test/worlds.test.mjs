// The editor host's retire, sweep and in-use bookkeeping (AB-T-0592; apps/editor/src/worlds.js), which every world the
// host builds goes through: the edit view, the preview, Play, exports, and whatever builds worlds next.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh, BoxGeometry, MeshBasicMaterial } from 'three';
import { RetiredWorlds } from '../../editor/src/worlds.js';

const world = (name) => ({ name, tree: { name, root: { object3d: new Group() }, services: new Map() } });

test('a world nothing shows is disposed at once; one the view shows waits until the view moves on', () => {
  const gone = [];
  let shown = null;
  const worlds = new RetiredWorlds({ showing: () => shown, dispose: (w) => gone.push(w.name) });
  const edit = world('edit'), next = world('next');
  shown = edit.tree;
  worlds.retire(next); // built and never shown (a newer edit overtook it)
  assert.deepEqual(gone, ['next']);
  worlds.retire(edit); // the edit view being replaced: still on screen
  assert.deepEqual(gone, ['next'], 'not while the view draws it');
  assert.equal(worlds.sweep(), 0);
  worlds.retire(edit);
  assert.equal(worlds.waiting.length, 1, 'retired twice: waiting once');
  shown = world('replacement').tree;
  assert.equal(worlds.sweep(), 1, 'the frame loop\'s sweep, once the view shows the replacement');
  assert.deepEqual(gone, ['next', 'edit']);
  assert.equal(worlds.sweep(), 0);
  assert.equal(worlds.waiting.length, 0);
  shown = null; // nothing attached at all (between scenes)
  worlds.retire(world('orphan'));
  assert.deepEqual(gone, ['next', 'edit', 'orphan']);
  worlds.retire(null); worlds.retire(undefined);
  worlds.retire({ ...world('done'), disposed: true });
  assert.equal(gone.length, 3, 'nothing, and a world already disposed, are left alone');
});

test('a world in use (a scrub stepping and drawing it) is not disposed under the work, however often it is used', () => {
  const gone = [];
  const worlds = new RetiredWorlds({ showing: () => null, dispose: (w) => gone.push(w.name) });
  const preview = world('preview');
  const scrub = worlds.use(preview), check = worlds.use(preview);
  worlds.retire(preview); // another scene was opened while the scrub awaits its step
  assert.deepEqual(gone, [], 'kept: its physics is still being stepped');
  assert.equal(worlds.sweep(), 0);
  scrub();
  assert.deepEqual(gone, [], 'one user left');
  scrub(); // released twice: counted once
  assert.equal(preview.inUse, 1);
  check();
  assert.deepEqual(gone, ['preview'], 'released: it goes at once, without waiting for a frame');
  assert.equal(preview.inUse, 0);
  // used and never retired: releasing disposes nothing
  const live = world('live');
  worlds.use(live)();
  assert.deepEqual(gone, ['preview']);
});

test('with the real dispose: a retired world is disposed once, and one that throws loses no other', () => {
  const worlds = new RetiredWorlds({ showing: () => null });
  const a = world('a'), geo = new BoxGeometry(), mat = new MeshBasicMaterial();
  a.tree.root.object3d.add(new Mesh(geo, mat));
  let disposed = 0, freed = 0;
  geo.addEventListener('dispose', () => disposed++);
  a.tree.services.set('physics', { world: { free: () => { freed++; } } });
  worlds.retire(a);
  worlds.retire(a);
  assert.equal(a.disposed, true);
  assert.deepEqual([disposed, freed], [1, 1], 'once');
  // a dispose that throws: the worlds free beside it still go, and none is left waiting to be tried for ever
  const gone = [];
  let shown = null;
  const flaky = new RetiredWorlds({ showing: () => shown, dispose: (w) => { if (w.name === 'bad') throw new Error('boom'); gone.push(w.name); } });
  const bad = world('bad'), good = world('good'), other = world('other');
  for (const w of [bad, good, other]) { w.inUse = 1; flaky.retire(w); }
  assert.equal(flaky.waiting.length, 3);
  bad.inUse = 0; good.inUse = 0; // both free at the same sweep, the one that throws first
  assert.throws(() => flaky.sweep(), /boom/, 'the failure is thrown on');
  assert.deepEqual(gone, ['good'], 'and the world beside it still went');
  assert.deepEqual(flaky.waiting, [other], 'neither is left waiting to be tried for ever; the one in use still waits');
  other.inUse = 0;
  assert.equal(flaky.sweep(), 1);
  assert.deepEqual(gone, ['good', 'other']);
});
