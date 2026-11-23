// The render queue's model (M4 W5): order, states, presets, cancel and retry, with the stub runner and fakes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RenderQueue, stubRunner, PRESETS, JOB_STATES, DELIVERY_EXTRAS, JOB_BACKENDS, JOB_CHECKS, resolveCheck } from '../src/index.js';

const spec = (o = {}) => ({ short: 'cafe-order', title: 'The Order', ref: 'sequences/cafe-order.vrmxs', seconds: 2, ...o });

test('a preset fills the job and explicit fields win; ids count up', () => {
  const q = new RenderQueue();
  const a = q.add(spec({ preset: 'draft' }));
  assert.equal(a.id, 'job-1');
  assert.deepEqual([a.spec.size, a.spec.codec, a.spec.fps, a.spec.audio, a.spec.subtitles], ['720p', 'h264', null, true, true]);
  assert.equal(a.label, 'The Order · Draft 720p H.264');
  const b = q.add(spec({ preset: 'master', size: '4k' }));
  assert.equal(b.id, 'job-2');
  assert.deepEqual([b.spec.size, b.spec.codec], ['4k', 'prores4444']);
  assert.throws(() => q.add(spec({ preset: 'nope' })), /no preset nope/);
  assert.throws(() => q.add({ short: 'x' }), /short and its sequence/);
  assert.deepEqual(Object.keys(PRESETS), ['draft', 'review', 'master', 'h264-1080p24', 'h264-4k24', 'hevc-1080p24', 'hevc-4k24', 'prores-1080p24', 'prores-4k24']);
  assert.deepEqual(JOB_STATES, ['queued', 'running', 'done', 'failed', 'cancelled']);
});

test('the stub runner renders nothing and reports the frames it would draw, in order, one job at a time', async () => {
  const seen = [];
  const q = new RenderQueue({ onChange: (x) => seen.push(x.jobs.map((j) => j.state).join(',')) });
  q.add(spec({ preset: 'draft', fps: 24 })); q.add(spec({ preset: 'review', seconds: 1, fps: 30 }));
  await q.run();
  const [a, b] = q.list();
  assert.equal(a.state, 'done'); assert.equal(b.state, 'done');
  assert.deepEqual([a.result.stub, a.result.frames, b.result.frames], [true, 48, 30]);
  assert.deepEqual(a.progress, { n: 48, total: 48, phase: 'stub' });
  assert.ok(!seen.some((s) => s === 'running,running'), 'never two at once');
  assert.ok(seen.includes('done,running'));
  assert.equal(stubRunner.name, 'stub');
});

test('a failing runner fails its job and the queue goes on', async () => {
  let calls = 0;
  const q = new RenderQueue({ runner: { name: 'flaky', async run(job) { calls++; if (job.id === 'job-1') throw new Error('encoder gone'); return { ok: job.id }; } } });
  q.add(spec()); q.add(spec());
  await q.run();
  assert.deepEqual(q.jobs.map((j) => [j.state, j.error]), [['failed', 'encoder gone'], ['done', null]]);
  assert.equal(calls, 2);
  assert.ok(q.retry('job-1'));
  assert.equal(q.get('job-1').state, 'queued');
  assert.equal(q.retry('job-2'), false, 'a done job is not retried');
});

test('cancel: a queued job never runs; the running one sees its signal and ends cancelled', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const runner = { name: 'slow', async run(job, { signal, progress }) { progress(1, 10); await gate; if (signal.aborted) throw new Error('stopped'); return {}; } };
  const q = new RenderQueue({ runner });
  q.add(spec()); q.add(spec()); q.add(spec());
  assert.ok(q.cancel('job-3'));
  const run = q.run();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(q.running?.id, 'job-1');
  assert.throws(() => q.remove('job-1'), /cancel it first/);
  assert.ok(q.cancel('job-1'));
  release();
  await run;
  assert.deepEqual(q.jobs.map((j) => j.state), ['cancelled', 'done', 'cancelled']);
  assert.equal(q.get('job-1').error, null);
});

test('queued jobs reorder among themselves; a job is removed once it is not running', async () => {
  const q = new RenderQueue();
  q.add(spec({ title: 'A' })); q.add(spec({ title: 'B' })); q.add(spec({ title: 'C' }));
  assert.ok(q.move('job-3', -1));
  assert.deepEqual(q.jobs.map((j) => j.spec.title), ['A', 'C', 'B']);
  assert.equal(q.move('job-1', -1), false, 'already first');
  assert.ok(q.remove('job-2'));
  assert.deepEqual(q.list().map((j) => j.id), ['job-1', 'job-3']);
  const list = q.list(); list[0].state = 'x';
  assert.equal(q.jobs[0].state, 'queued', 'list() hands out copies');
});

test('a runner that reports a cancel (a closed save panel) ends its job cancelled, not failed', async () => {
  const q = new RenderQueue({ runner: { name: 'panel', async run() { throw Object.assign(new Error('nothing was exported'), { code: 'cancelled' }); } } });
  q.add(spec());
  await q.run();
  assert.deepEqual([q.jobs[0].state, q.jobs[0].error], ['cancelled', null]);
});

test('run({ only }) renders that job alone; a run asked for meanwhile waits its turn', async () => {
  const order = [];
  const q = new RenderQueue({ runner: { name: 'log', async run(job) { order.push(job.id); await Promise.resolve(); return {}; } } });
  q.add(spec()); q.add(spec()); const c = q.add(spec());
  await q.run({ only: c.id });
  assert.deepEqual(order, ['job-3']);
  assert.deepEqual(q.jobs.map((j) => j.state), ['queued', 'queued', 'done']);
  const a = q.run(), b = q.run({ only: 'job-1' });
  await Promise.all([a, b]);
  assert.deepEqual(order, ['job-3', 'job-1', 'job-2'], 'one at a time, in order');
});

test('a runner that finishes although Cancel came too late leaves a done job that says so', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const q = new RenderQueue({ runner: { name: 'late', async run() { await gate; return { frames: 3 }; } } });
  q.add(spec());
  const run = q.run();
  await Promise.resolve(); await Promise.resolve();
  q.cancel('job-1');
  release();
  await run;
  assert.deepEqual([q.jobs[0].state, q.jobs[0].lateCancel], ['done', true]);
});

test('delivery presets (M4 W10): every codec at 1080p24 and 4K24 with the extras; a backend and the redraw check per job', () => {
  const q = new RenderQueue();
  for (const [k, p] of Object.entries(PRESETS).filter(([, x]) => x.delivery)) {
    const j = q.add(spec({ preset: k }));
    assert.equal(j.spec.fps, 24, k);
    assert.deepEqual(j.spec.extras, { ...DELIVERY_EXTRAS }, `${k}: stills, thumbnails, a turntable`);
    assert.ok(['1080p', '4k'].includes(j.spec.size) && ['h264', 'hevc', 'prores4444'].includes(j.spec.codec), k);
    assert.equal(j.label, `The Order · ${p.label}`, 'drawn on the view\'s backend: the check is decided when it renders');
    assert.equal(j.spec.check, 'auto', `${k}: the redraw check on WebGPU by default (AB-D-0280)`);
  }
  assert.equal(PRESETS['prores-4k24'].label, 'Delivery 4K24 ProRes 4444 with alpha');
  assert.equal(q.add(spec({ preset: 'draft' })).spec.extras, null, 'a draft is the film alone');
  const gl = q.add(spec({ preset: 'h264-4k24', backend: 'webgl', check: 'redraw' }));
  assert.equal(gl.label, 'The Order · Delivery 4K24 H.264 · WebGL · checked');
  assert.deepEqual([gl.spec.backend, gl.spec.check], ['webgl', 'redraw']);
  assert.deepEqual(JOB_BACKENDS, [null, 'webgpu', 'webgl']);
  assert.throws(() => q.add(spec({ preset: 'draft', backend: 'metal' })), /no backend metal/);
  assert.throws(() => q.add(spec({ preset: 'draft', check: 'twice' })), /check is 'redraw', 'auto' or null/);
  const extras = q.add(spec({ preset: 'hevc-1080p24' })).spec.extras;
  extras.turntable = false;
  assert.equal(PRESETS['hevc-1080p24'].extras.turntable, true, 'a job\'s extras are its own copy');
});

test('the redraw check by default for a delivery drawn on WebGPU, never for a film preset or WebGL (AB-D-0280)', () => {
  const q = new RenderQueue();
  assert.deepEqual(JOB_CHECKS, [null, 'auto', 'redraw']);
  const film = q.add(spec({ preset: 'master' })), del = q.add(spec({ preset: 'prores-4k24' }));
  assert.deepEqual([film.spec.check, del.spec.check], [null, 'auto']);
  assert.deepEqual([resolveCheck(del.spec, 'webgpu'), resolveCheck(del.spec, 'webgl')], ['redraw', null], 'auto: WebGPU checks, WebGL draws once');
  assert.deepEqual([resolveCheck(film.spec, 'webgpu'), resolveCheck({ check: 'redraw' }, 'webgl')], [null, 'redraw'], 'a film preset draws once; an explicit redraw always checks');
  assert.equal(q.add(spec({ preset: 'h264-4k24', backend: 'webgpu' })).label, 'The Order · Delivery 4K24 H.264 · WebGPU · checked');
  assert.equal(q.add(spec({ preset: 'h264-4k24', backend: 'webgl' })).label, 'The Order · Delivery 4K24 H.264 · WebGL');
  const off = q.add(spec({ preset: 'h264-4k24', backend: 'webgpu', check: null }));
  assert.deepEqual([off.spec.check, resolveCheck(off.spec, 'webgpu'), off.label], [null, null, 'The Order · Delivery 4K24 H.264 · WebGPU'], 'a job that says null draws once');
});
