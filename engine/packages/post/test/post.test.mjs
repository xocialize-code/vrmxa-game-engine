// M2 W3 (AB-T-0526) in Node: the post spec (presets, defaults, the fixed anime order, refusals, what forces a rebuild).
// The stack itself needs WebGL: it is checked in the browsers (the playground and the editor, Chromium and WKWebView).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePost, structureOf, PRESETS, ORDER, EFFECTS, gridLayout } from '@vrmxg/post';

test('a preset expands; a list runs in the anime order whatever order it is written in; defaults fill in', () => {
  const anime = normalizePost('anime');
  assert.deepEqual(anime.map((e) => e.effect), PRESETS.anime.map((e) => e.effect));
  const mixed = normalizePost([{ effect: 'vignette' }, { effect: 'edges', thickness: 2 }, { effect: 'bloom' }]);
  assert.deepEqual(mixed.map((e) => e.effect), ['edges', 'bloom', 'vignette']);
  assert.equal(mixed[0].thickness, 2); assert.equal(mixed[2].darkness, EFFECTS.vignette.darkness);
  assert.ok(!('about' in mixed[0]));
  assert.deepEqual(normalizePost([{ effect: 'grain', enabled: false }, { effect: 'dof' }]).map((e) => e.effect), ['dof']);
  assert.deepEqual(normalizePost(null), []);
  for (const e of ORDER) assert.ok(EFFECTS[e], e);
});

test('unknown effects and presets are refused, naming what there is; only the list of effects forces a rebuild', () => {
  assert.throws(() => normalizePost([{ effect: 'lensFlare' }]), /unknown post effect "lensFlare" \(edges, dof, bloom/);
  assert.throws(() => normalizePost('noir'), /unknown post preset "noir" \(anime, clean\)/);
  const a = normalizePost([{ effect: 'bloom', intensity: 1 }, { effect: 'anime', speedLines: 0 }]);
  const b = normalizePost([{ effect: 'bloom', intensity: 3 }, { effect: 'anime', speedLines: 1 }]);
  assert.equal(structureOf(a), structureOf(b), 'values change in place');
  assert.notEqual(structureOf(a), structureOf(normalizePost([{ effect: 'bloom' }])), 'removing an effect rebuilds');
});

test('viewport grids fill the canvas', () => {
  const g = gridLayout(4);
  assert.deepEqual(g.map((v) => [v.x, v.y, v.w, v.h]), [[0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5], [0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5]]);
  assert.equal(gridLayout(9).length, 9);
});

test('settle() waits for a LUT the spec loads; a failed load settles too (M2 W12: an offline frame waits for its grade)', async () => {
  const { PostStack } = await import('@vrmxg/post');
  let release;
  const renderer = { toneMapping: 0 };
  const stack = new PostStack(renderer, { loadLut: (file) => (file === 'bad.cube' ? Promise.reject(new Error('missing')) : new Promise((r) => { release = () => r({ lut: file }); })) });
  stack.configure([{ effect: 'lut', file: 'looks/morning.cube' }]);
  stack.configure([{ effect: 'lut', file: 'looks/morning.cube' }]); // asked again while loading: one load
  assert.equal(stack.loading.size, 1);
  let settled = false;
  const p = stack.settle().then(() => { settled = true; });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(settled, false, 'still loading');
  release(); await p;
  assert.deepEqual(stack.luts.get('looks/morning.cube'), { lut: 'looks/morning.cube' });
  const warn = console.warn; console.warn = () => {};
  stack.configure([{ effect: 'lut', file: 'bad.cube' }]);
  await stack.settle(); console.warn = warn;
  assert.equal(stack.luts.get('bad.cube'), null, 'a failed LUT is remembered as none, not retried forever');
});

test('the LUT\'s intensity on WebGL (M4 W1 review): below 1 it blends NORMAL at that opacity; at 1 it stays SRC, drawing as before', async () => {
  const fs = await import('node:fs');
  const { PostStack, lutFromCube, normalizePost } = await import('@vrmxg/post');
  const { LUT3DEffect, BlendFunction } = await import('postprocessing');
  const cube = fs.readFileSync(new URL('../../../../content/sample/looks/morning.cube', import.meta.url), 'utf8');
  const fresh = new LUT3DEffect(lutFromCube(cube));
  assert.equal(fresh.blendMode.blendFunction, BlendFunction.SRC, 'pmndrs\' own default: full strength');
  const stack = new PostStack({ toneMapping: 0 });
  stack.spec = normalizePost([{ effect: 'lut', file: 'looks/morning.cube', intensity: 0.85 }]); // cafe-morning.vrmxs keys 0.85
  stack.effects = { lut: fresh }; stack.composer = {};
  stack.apply();
  assert.equal(fresh.blendMode.blendFunction, BlendFunction.NORMAL);
  assert.equal(fresh.blendMode.opacity.value, 0.85);
  stack.setParams({ 'lut.intensity': 1 });
  assert.equal(fresh.blendMode.blendFunction, BlendFunction.SRC, 'back to the unchanged full-strength path');
  assert.equal(fresh.blendMode.opacity.value, 1);
  stack.setParams({ 'lut.intensity': -2 });
  assert.equal(fresh.blendMode.opacity.value, 0, 'clamped to 0…1');
});
