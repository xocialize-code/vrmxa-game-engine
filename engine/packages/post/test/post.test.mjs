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
