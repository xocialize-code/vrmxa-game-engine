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
  for (const id of ['q-preset-draft', 'q-preset-review', 'q-preset-master', 'q-preset-h264-1080p24', 'q-preset-h264-4k24', 'q-preset-hevc-1080p24', 'q-preset-hevc-4k24', 'q-preset-prores-1080p24', 'q-preset-prores-4k24', 'q-backend-view', 'q-backend-webgpu', 'q-backend-webgl', 'q-check', 'q-add', 'q-run', 'q-job-2']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /aria-label="Film presets"/); assert.match(html, /aria-label="Delivery presets"/);
  assert.match(html, /aria-label="Preset Delivery 4K24 ProRes 4444 with alpha"/);
  assert.doesNotMatch(html, /id="q-stills"/, 'the extras show for a delivery preset only (the form starts on draft)');
  assert.match(await render(Panel, { jobs: [] }), /Nothing queued\./);
});

// M5 W4: the inspector's widgets (AB-T-0599, 0600), rendered from registry schemas
test('the number field: a real input with its id, accessible name and value; mixed says so', async () => {
  const NumberField = await loadSFC(src('NumberField.vue'));
  const html = await render(NumberField, { id: 'pos-x', label: 'Position X', value: 1.23456, precision: 3, unit: 'm' });
  assert.match(html, /<input id="pos-x"[^>]*aria-label="Position X"[^>]*value="1\.235"/);
  assert.match(html, /title="1\.23456 m"/);
  const mixed = await render(NumberField, { id: 'prop-intensity', label: 'intensity', value: 2, mixed: true, min: 0, max: 4 });
  assert.match(mixed, /aria-label="intensity \(mixed values\)"/);
  assert.match(mixed, /placeholder="—"/);
  assert.match(mixed, /placeholder="—" value>/, "no value of its own");
  assert.match(await render(NumberField, { id: 'n', label: 'n', value: 1, min: 0, max: 4 }), /class="num-fill"[^>]*width:calc\(\(100% - 16px\) \* 0\.25\)/);
});

test('generated fields: a dialogue\'s lines as rows with their own fields, a map, a vector, a condition, a choice', async () => {
  const ValueField = await loadSFC(src('ValueField.vue'));
  const { m0Registry } = await import('@vrmxg/registry/m0');
  const reg = m0Registry();
  const lines = reg.get('Dialogue').props.lines;
  const html = await render(ValueField, { id: 'prop-lines', label: 'lines', schema: lines.schema, meta: lines.meta, value: [{ id: 'hi', speaker: 'hana', text: 'Morning!', choices: [{ text: 'Coffee', to: 'end' }] }, { text: 'Bye', future: 1 }], nodes: ['hana', 'mira'] });
  assert.doesNotMatch(html, /\(JSON\)/, 'no JSON box anywhere');
  assert.match(html, /id="prop-lines"[^>]*aria-label="lines, 2 rows"/);
  assert.match(html, /<input id="prop-lines-0-text"[^>]*value="Morning!"[^>]*aria-label="lines 1 text"/);
  assert.match(html, /id="prop-lines-0-choices-0-text"[^>]*value="Coffee"/, 'a nested list in a row');
  assert.match(html, /id="prop-lines-1-future"[^>]*aria-label="lines 2 future"/, 'an unknown key is shown, and kept');
  assert.match(html, /id="prop-lines-0-up"[^>]*aria-label="Move lines 1 up"[^>]*disabled/);
  assert.match(html, /id="prop-lines-1-remove"[^>]*aria-label="Remove lines 2"/);
  assert.match(html, /id="prop-lines-add"[^>]*aria-label="Add a row to lines"/);
  assert.match(html, /id="prop-lines-0-when-set"[^>]*aria-label="Set lines 1 when"/, 'an unset condition waits behind a button');
  assert.match(html, /id="prop-lines-1-choices-set"/);
  assert.doesNotMatch(html, /id="prop-lines-0-when-test"/);
  const flags = reg.get('GameRules').props.flags;
  const map = await render(ValueField, { id: 'prop-flags', label: 'flags', schema: flags.schema, meta: flags.meta, value: { tillClosed: false, lives: 3 } });
  assert.match(map, /aria-label="flags, 2 entries"/);
  assert.match(map, /id="prop-flags-tillClosed-key"[^>]*value="tillClosed"/);
  assert.match(map, /id="prop-flags-lives-kind"[^>]*aria-label="flags lives kind"/);
  assert.match(map, /<input id="prop-flags-lives"[^>]*value="3"/);
  const size = reg.get('Collider').props.size;
  const vec = await render(ValueField, { id: 'prop-size', label: 'size', schema: size.schema, meta: size.meta, value: [1, 2, 0.5] });
  assert.match(vec, /id="prop-size-z"[^>]*aria-label="size Z"[^>]*value="0\.5"/);
  const win = reg.get('GameRules').props.win;
  const cond = await render(ValueField, { id: 'prop-win', label: 'win', schema: win.schema, meta: win.meta, value: { test: 'state', key: 'score', op: 'ge', value: 10 } });
  assert.match(cond, /id="prop-win-test"/);
  assert.match(cond, /id="prop-win-key"[^>]*value="score"/);
  assert.match(cond, /id="prop-win-op"/);
  assert.doesNotMatch(cond, /id="prop-win-newkey"/, 'additionalProperties false: no new keys');
  const post = reg.get('Environment').props.post;
  const choice = await render(ValueField, { id: 'prop-post', label: 'post', schema: post.schema, meta: post.meta, value: [{ effect: 'bloom', strength: 0.4 }] });
  assert.match(choice, /id="prop-post-kind"/);
  assert.match(choice, /id="prop-post-0-effect"[^>]*value="bloom"/);
  assert.match(choice, /id="prop-post-0-strength"[^>]*value="0\.4"/);
  const keys = await render(ValueField, { id: 'k', label: 'keys', schema: {}, value: [[0, 0], [12, 1.5]] });
  assert.match(keys, /aria-label="keys, 2 keys"/);
  assert.match(keys, /id="k-1-y"[^>]*aria-label="keys 2 value"[^>]*value="1\.5"/);
  assert.match(keys, /<polyline points="0,40 120,0"/);
  const off = await render(ValueField, { id: 'prop-shadowExtent', label: 'shadowExtent', schema: { type: 'number' }, value: 8, disabled: true });
  assert.match(off, /id="prop-shadowExtent"[^>]*disabled/);
});
