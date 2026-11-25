// The assets panel's thumbnail queue (M5 W6, AB-T-0606): drawn one at a time, cached by path, size and modification
// time, a newer list overtakes an older one, and release waits for the draw in hand and lets the host go. No GPU: the
// draws are fakes (the real one, thumbs-draw.js, runs in the app under AppProbe).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ThumbnailQueue } from '../src/thumbs.js';

const b64 = (u8) => Buffer.from(u8).toString('base64');
const entries = (...refs) => refs.map((ref) => ({ ref }));
function setup({ store = null, gate = null } = {}) {
  const drawn = [], released = [];
  const q = new ThumbnailQueue({
    size: 64, toBase64: b64, store,
    draw: async (e, size) => { drawn.push(`${e.ref}@${size}`); if (gate) await gate(e); if (e.ref.endsWith('.bad')) throw new Error('no'); return e.ref.endsWith('.none') ? null : new Uint8Array([e.ref.length]); },
    onRelease: () => { released.push(true); },
  });
  return { q, drawn, released };
}
const memStore = () => { const m = new Map(), gets = []; return { m, gets, get: async (k) => { gets.push(k); return m.get(k) ?? null; }, put: async (k, v) => { m.set(k, v); } }; };

test('each file is drawn once; an unchanged one isn\'t drawn again; a file with none or a failed draw has no thumbnail', async () => {
  const { q, drawn } = setup();
  await q.load(entries('a.glb', 'b.none', 'c.bad'));
  assert.deepEqual(drawn, ['a.glb@64', 'b.none@64', 'c.bad@64']);
  assert.match(q.urls.get('a.glb'), /^data:image\/png;base64,/);
  assert.ok(!q.urls.has('b.none') && !q.urls.has('c.bad'));
  assert.equal(q.errors.get('c.bad'), 'no');
  assert.equal(q.status(), '1 thumbnails, 1 failed');
  await q.load(entries('a.glb', 'd.glb'));
  assert.deepEqual(drawn.slice(3), ['d.glb@64'], 'a.glb kept');
  assert.ok(!q.urls.has('c.bad') && !q.keys.has('c.bad'), 'a file gone from the list is forgotten');
});

test('cached by path, size and modification time: a changed file is drawn again, a cached one is read', async () => {
  const store = memStore();
  const { q, drawn } = setup({ store });
  await q.load(entries('a.glb'), { 'a.glb': { size: 10, mtime: 1 } });
  assert.deepEqual([...store.m.keys()], ['a.glb\n64\n1\n10']);
  const second = setup({ store }); // a relaunch: a fresh queue, the same cache
  await second.q.load(entries('a.glb'), { 'a.glb': { size: 10, mtime: 1 } });
  assert.deepEqual(second.drawn, [], 'read from the cache');
  assert.equal(second.q.cached, 1);
  assert.equal(second.q.urls.get('a.glb'), q.urls.get('a.glb'));
  await q.load(entries('a.glb'), { 'a.glb': { size: 11, mtime: 2 } });
  assert.deepEqual(drawn, ['a.glb@64', 'a.glb@64'], 'changed on disk: drawn again');
});

test('a newer list overtakes an older one at its next file, and its picture of a changed file is dropped', async () => {
  let open; const wait = new Promise((r) => { open = r; });
  const { q, drawn } = setup({ gate: (e) => (e.ref === 'a.glb' ? wait : null) });
  const first = q.load(entries('a.glb', 'b.glb', 'c.glb'));
  await new Promise((r) => setTimeout(r, 0));
  const second = q.load(entries('x.glb'));
  open();
  await first; await second;
  assert.deepEqual(drawn, ['a.glb@64', 'x.glb@64'], 'b and c never drawn');
  assert.ok(!q.urls.has('a.glb'));
});

test('release waits for the draw in hand, stops the rest and lets the host go; the next load starts again', async () => {
  let open; const wait = new Promise((r) => { open = r; });
  const { q, drawn, released } = setup({ gate: (e) => (e.ref === 'a.glb' ? wait : null) });
  q.load(entries('a.glb', 'b.glb'));
  await new Promise((r) => setTimeout(r, 0));
  let done = false;
  const rel = q.release().then(() => { done = true; });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(done, false, 'still drawing a.glb');
  open(); await rel;
  assert.deepEqual(released, [true]);
  assert.deepEqual(drawn, ['a.glb@64']);
  await q.load(entries('a.glb', 'b.glb'));
  assert.deepEqual(drawn, ['a.glb@64', 'a.glb@64', 'b.glb@64']);
  assert.equal(q.status(), '2 thumbnails');
});
