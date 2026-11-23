// The shared components, compiled from their .vue files and rendered on the server (M4 W5): the markup the editor and
// the creator get, with the ids and accessible names their AppProbe scenarios use.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { rowsOf, RenderQueue } from '@vrmxg/editor-core';
import { loadSFC, render } from './sfc.mjs';

const src = (f) => path.join(import.meta.dirname, '../src', f);
const seq = {
  fps: 24, duration: 96,
  shots: [{ id: 'shot-1', name: '010', start: 0, end: 48, camera: 'vc-wide' }, { id: 'shot-2', name: '020', start: 48, end: 96, camera: 'vc-hana' }],
  markers: [{ frame: 0, name: 'INT. CAFE' }],
  tracks: [
    { id: 'cams', type: 'camera', clips: [{ start: 0, end: 48, camera: 'vc-wide' }, { start: 48, end: 96, camera: 'vc-hana' }] },
    { id: 'hana-1-says', type: 'dialogue', target: 'hana-1', clips: [{ start: 48, end: 90, text: 'Good morning!' }] },
    { id: 'hana-1-face', type: 'expression', target: 'hana-1', keys: { happy: [[50, 0], [58, 0.7]] } },
  ],
};
const data = (o = {}) => ({ seq, rows: rowsOf(seq), fps: 24, duration: 96, set: 'cafe.vrmxs', cameras: ['vc-wide', 'vc-hana'], characters: ['hana-1', 'mira'], nodes: ['hana-1', 'mira', 'vc-wide', 'vc-hana'], playhead: 12, range: null, loop: true, playing: false, view: 'preview', previewCamera: 'sequence', angles: false, scrub: { frame: 12, step: 30, alpha: 0, restored: 0, stepped: 30, ms: 4, hash: 'abc' }, building: false, angleNames: [], ...o });

test('the timeline draws every row, item and control from plain data', async () => {
  const Timeline = await loadSFC(src('Timeline.vue'));
  const html = await render(Timeline, { data: data() });
  for (const id of ['tl-play', 'tl-frame', 'tl-add-shot', 'tl-add-track', 'tl-head-shots', 'tl-head-cams', 'tl-head-hana-1-says', 'tl-type-dialogue', 'tl-cam-vc-hana', 'tl-target-mira']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /aria-label="Shot 020 48 to 96"/);
  assert.match(html, /aria-label="Clip Good morning! 48 to 90"/);
  assert.match(html, /aria-label="Key happy at 58"/);
  assert.match(html, /aria-label="Showing frame 12 step 30 alpha 0 world abc"/);
  assert.match(html, /aria-label="Time 0:12 of 4:00"/);
  assert.match(html, /in cafe\.vrmxs/);
  const off = await render(Timeline, { data: data({ scrub: null, building: true }), disabled: true });
  assert.match(off, /aria-label="Building preview"/);
  assert.match(off, /id="tl-add-shot"[^>]*disabled/);
  assert.match(await render(Timeline, { data: null }), /aria-label="Timeline"/, 'renders with no sequence');
});

test('the storyboard strip: a card per shot, its thumbnail or its camera, its script line', async () => {
  const Strip = await loadSFC(src('StoryboardStrip.vue'));
  const board = { fps: 24, shots: [
    { id: 'shot-1', name: '010', start: 0, end: 48, frame: 24, camera: 'vc-wide', cameras: ['vc-wide'], subjects: [], beat: 'sc-1', hand: false, crossesLine: null },
    { id: 'shot-2', name: '020', start: 48, end: 96, frame: 72, camera: 'vc-hana', cameras: ['vc-hana'], subjects: ['hana-1'], beat: 'ln-1', hand: true, crossesLine: null },
  ] };
  const html = await render(Strip, { board, thumbs: { 'shot-1': { url: 'data:image/png;base64,AA', frame: 24 } }, beats: { 'ln-1': { line: 14, text: 'HANA: Good morning!' } }, playhead: 50, selected: 'shot-2', status: 'thumbnails 1 of 2' });
  assert.match(html, /aria-label="Storyboard 2 shots, thumbnails 1 of 2"/);
  assert.match(html, /id="sb-shot-1"[^>]*aria-label="Shot 010, 48 frames from 0, camera vc-wide"/);
  assert.match(html, /<img src="data:image\/png;base64,AA" alt="Shot 010 at frame 24">/);
  assert.match(html, /id="sb-shot-2"[^>]*class="sb-card current sel hand"[^>]*aria-selected="true"/);
  assert.match(html, /aria-label="Script line 14 for shot 020"/);
  assert.match(await render(Strip, {}), /aria-label="Storyboard 0 shots"/);
});

test('the render queue panel lists jobs with their states', async () => {
  const Panel = await loadSFC(src('RenderQueue.vue'));
  const q = new RenderQueue();
  q.add({ short: 'cafe-order', title: 'The Order', ref: 'sequences/cafe-order.vrmxs', preset: 'draft', seconds: 2 });
  q.add({ short: 'cafe-order', title: 'The Order', ref: 'sequences/cafe-order.vrmxs', preset: 'master', seconds: 2 });
  await q.run(); q.add({ short: 'cafe-order', ref: 'sequences/cafe-order.vrmxs' });
  const html = await render(Panel, { jobs: q.list(), runner: 'stub' });
  assert.match(html, /aria-label="Runner stub"/);
  assert.match(html, /aria-label="job-1 done: 48 frames counted, nothing rendered \(stub\)"/);
  assert.match(html, /aria-label="job-3 queued"/);
  for (const id of ['q-preset-draft', 'q-preset-review', 'q-preset-master', 'q-add', 'q-run', 'q-job-2']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(await render(Panel, { jobs: [] }), /Nothing queued\./);
});
