// M5 W6's shared decisions: the assets panel's filters, folders and drop rules (AB-T-0606), the tree's search and
// folding, panel sizes, and per-field copy and paste (AB-T-0607), plus the assets panel's markup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { m0Registry } from '@vrmxg/registry/m0';
import { describeType } from '@vrmxg/scene';
import {
  assetEntries, filterAssets, filterCounts, assetFolders, assetCategory, dragTypes, draggedKind, dropVerdict, dropVerdictFor,
  filterTree, foldTree, parseTreeQuery, readLayout, resize, toggle, splitterKey, writeLayout, shownSize, defaultLayout, EDITOR_PANELS, FOLDED,
  inspectorFields, fieldType, copyField, copyTransform, copyPart, pasteVerdict,
} from '../src/index.js';
import { loadSFC, render } from './sfc.mjs';

const reg = m0Registry();
const SAMPLE = path.join(import.meta.dirname, '../../../../content/sample');
const files = fs.readdirSync(SAMPLE, { recursive: true }).map(String).filter((f) => fs.statSync(path.join(SAMPLE, f)).isFile()).sort();

test('assets: a category per file, Items lists only .vrmxi, search and folders narrow it', () => {
  const entries = assetEntries(reg, files);
  assert.equal(assetCategory('sets/cafe.glb'), 'sets'); assert.equal(assetCategory('props/bench.glb'), 'props');
  assert.equal(assetCategory('characters/mira.vrmxa'), 'characters'); assert.equal(assetCategory('animations/clips/carry.vrma'), 'clips');
  assert.equal(assetCategory('scripts/cafe-order.fountain'), null);
  const items = filterAssets(entries, { filter: 'items' });
  assert.ok(items.length >= 6);
  assert.ok(items.every((e) => e.ref.endsWith('.vrmxi')), 'Items: only .vrmxi');
  assert.deepEqual(filterAssets(entries, { filter: 'items' }).map((e) => e.ref), files.filter((f) => f.endsWith('.vrmxi')));
  assert.ok(filterAssets(entries, { filter: 'sets' }).every((e) => e.ref.startsWith('sets/')));
  assert.deepEqual(filterAssets(entries, { query: 'door PREFAB' }).map((e) => e.ref), ['prefabs/door.vrmxs', 'prefabs/double-door.vrmxs']);
  assert.deepEqual(filterAssets(entries, { folder: 'prefabs' }).map((e) => e.label), ['Prefab', 'Prefab']);
  assert.ok(filterAssets(entries, { folder: 'animations' }).length >= 1, 'a folder shows its subfolders\' files');
  const counts = filterCounts(entries);
  assert.equal(counts.all, entries.length); assert.equal(counts.items, items.length);
  const folders = assetFolders(entries);
  assert.equal(folders[0].path, ''); assert.equal(folders[0].count, entries.length);
  assert.ok(folders.some((f) => f.path === 'animations/clips' && f.depth === 2));
  const mira = entries.find((e) => e.ref === 'characters/mira.vrmxa');
  assert.equal(mira.nodeType, 'Character');
  assert.equal(entries.find((e) => e.kind === 'vrma').nodeType, null, 'a clip isn\'t placed');
});

test('drops: a .glb on a Model\'s asset slot, never a .wav; node slots take tree rows; the viewport what a type places', () => {
  const model = { slot: 'asset', types: reg.get('Model').asset.types };
  assert.deepEqual(dropVerdictFor('props/bench.glb', model), { ok: true });
  const wav = dropVerdictFor('sounds/switch.wav', model);
  assert.equal(wav.ok, false); assert.match(wav.reason, /takes Model, not a Sound/);
  const types = dragTypes({ ref: 'props/bench.glb', kind: 'glb' });
  assert.equal(types['text/x-vrmxg-asset'], 'props/bench.glb');
  assert.equal(draggedKind(Object.keys(types)), 'glb');
  assert.equal(draggedKind(['text/x-vrmxg-node']), 'node');
  assert.equal(draggedKind(['Files']), null);
  assert.deepEqual(dropVerdict('node', { slot: 'node' }), { ok: true });
  assert.equal(dropVerdict('glb', { slot: 'node' }).ok, false);
  assert.equal(dropVerdict('node', model).ok, false);
  assert.equal(dropVerdict('vrma', { slot: 'viewport', placeable: (k) => k !== 'vrma' }).ok, false);
  assert.equal(dropVerdict('glb', { slot: 'viewport', placeable: () => true }).ok, true);
  assert.equal(dropVerdict(null, model).ok, false);
});

test('tree search keeps matches and their ancestors; type: and is:overridden; folding', () => {
  const tree = [{ id: 'root', type: 'Node3D', label: 'Scene (root)', children: [
    { id: 'lamp', type: 'PointLight', label: 'Lamp (lamp)', children: [] },
    { id: 'door', type: 'Instance', label: 'door', overridden: true, children: [
      { id: 'door/hinge', type: 'RigidBody', label: 'door/hinge', inner: true, overridden: true, children: [{ id: 'door/panel', type: 'Collider', label: 'door/panel', inner: true, children: [] }] },
    ] },
  ] }];
  assert.deepEqual(parseTreeQuery('type:Light lamp is:overridden'), { words: ['lamp'], types: ['light'], overridden: true });
  assert.equal(filterTree(tree, '  ').items, tree);
  const panel = filterTree(tree, 'panel');
  assert.equal(panel.matches, 1);
  assert.deepEqual(panel.items[0].children.map((c) => c.id), ['door']);
  assert.equal(panel.items[0].children[0].children[0].children[0].match, true);
  assert.equal(panel.items[0].match, false);
  assert.deepEqual(filterTree(tree, 'type:point').items[0].children.map((c) => c.id), ['lamp']);
  assert.equal(filterTree(tree, 'type:collider').matches, 1);
  assert.deepEqual(filterTree(tree, 'is:overridden').items[0].children.map((c) => c.id), ['door']);
  assert.equal(filterTree(tree, 'nothing-here').items.length, 0);
  const folded = foldTree(tree);
  assert.equal(folded[0].children[1].folded, 2, 'an instance starts folded: its two inner nodes');
  assert.equal(folded[0].children[1].children.length, 0);
  assert.equal(foldTree(tree, { open: new Set(['door']) })[0].children[1].children.length, 1);
  assert.equal(foldTree(tree, { closed: new Set(['root']) })[0].folded, 4);
  assert.equal(foldTree(tree, { closed: new Set(['root']), searching: true })[0].folded, 0);
});

test('panels: sizes clamp, fold, resize by key, and a bad settings file falls back to the defaults', () => {
  const d = defaultLayout();
  assert.deepEqual(d.scene, { size: 280, collapsed: false });
  let l = resize(d, 'scene', 9999);
  assert.equal(l.scene.size, EDITOR_PANELS.scene.max);
  l = toggle(l, 'inspector');
  assert.equal(shownSize(l, 'inspector'), FOLDED); assert.equal(l.inspector.size, 300, 'its size kept for when it opens');
  assert.equal(splitterKey(d, 'scene', { key: 'ArrowRight' }).scene.size, 296);
  assert.equal(splitterKey(d, 'inspector', { key: 'ArrowRight', shiftKey: true }, -1).inspector.size, 236, 'a right-hand panel grows to the left');
  assert.equal(splitterKey(d, 'assets', { key: 'ArrowUp' }, -1).assets.size, 216);
  assert.equal(splitterKey(d, 'assets', { key: 'Home' }).assets.size, EDITOR_PANELS.assets.min);
  assert.equal(splitterKey(d, 'assets', { key: 'Enter' }).assets.collapsed, true);
  assert.equal(splitterKey(d, 'assets', { key: 'x' }), null);
  const back = readLayout(writeLayout(l));
  assert.deepEqual(back, l);
  assert.deepEqual(readLayout('not json'), d);
  assert.deepEqual(readLayout({ scene: { size: -50, collapsed: 'yes' }, bogus: { size: 1 } }).scene, { size: EDITOR_PANELS.scene.min, collapsed: false });
  assert.deepEqual(readLayout([1, 2]), d);
  assert.throws(() => resize(d, 'nope', 1), /no panel/);
});

test('per-field copy and paste: only into a field of the same type, within its range', () => {
  const fieldsOf = (type, props) => Object.fromEntries(inspectorFields(describeType(reg, type), { props }).map((f) => [f.key, f]));
  const col = fieldsOf('Collider', { shape: 'box', size: [1, 2, 3] });
  const light = fieldsOf('PointLight', { intensity: 3 });
  assert.equal(fieldType(col.size), 'vec3');
  const size = copyField(col.size);
  assert.deepEqual(size, { kind: 'field', type: 'vec3', key: 'size', value: [1, 2, 3] });
  assert.equal(pasteVerdict(size, light.intensity).ok, false);
  assert.match(pasteVerdict(size, light.intensity).reason, /vec3 doesn't paste into a number/);
  assert.deepEqual(pasteVerdict(size, { kind: 'part' }), { ok: true, value: [1, 2, 3] }, 'a vector of three into a position');
  const pos = copyPart('p', [4, 5, 6]);
  assert.deepEqual(pasteVerdict(pos, col.size).value, [4, 5, 6]);
  const intensity = copyField(light.intensity);
  assert.equal(pasteVerdict(intensity, light.intensity).ok, true);
  assert.equal(pasteVerdict({ ...intensity, value: -1 }, light.intensity).ok, false, 'below its minimum');
  const shape = copyField(col.shape);
  assert.equal(pasteVerdict({ ...shape, value: 'teapot' }, col.shape).ok, false);
  assert.equal(pasteVerdict(shape, col.shape).ok, true);
  const t = copyTransform({ p: [1, 0, 0], r: [0, 90, 0], s: [1, 1, 1] });
  assert.equal(pasteVerdict(t, { kind: 'transform' }).ok, true);
  assert.equal(pasteVerdict(t, col.size).ok, false);
  assert.equal(pasteVerdict(size, { kind: 'transform' }).ok, false);
  assert.equal(pasteVerdict(null, col.size).ok, false);
});

test('the assets panel draws tiles, filters, folders and Add buttons from plain data', async () => {
  const Panel = await loadSFC(path.join(import.meta.dirname, '../src/AssetsPanel.vue'));
  const entries = assetEntries(reg, files).map((e) => ({ ...e, thumb: e.ref === 'props/bench.glb' ? 'data:image/png;base64,AA' : null }));
  const html = await render(Panel, { entries, picked: 'props/bench.glb', status: 'drawing 2 of 20' });
  for (const id of ['assets-filter-items', 'assets-filter-all', 'assets-search', 'assets-folder-all', 'assets-folder-prefabs', 'asset-props-bench-glb', 'pick-props-bench-glb', 'add-props-bench-glb', 'add-sets-cafe-glb', 'assets-status']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /aria-label="Model props\/bench\.glb, thumbnail, picked"/);
  assert.match(html, /aria-label="Items \(\d+\)"/);
  assert.match(html, /id="add-animations-clips-[^"]*"[^>]*disabled/, 'a clip can\'t be added');
  assert.match(html, /<img src="data:image\/png;base64,AA"/);
});

test('copy and paste take values that arrive as reactive proxies (the inspector\'s), which structuredClone refuses', async () => {
  const { reactive } = await import('vue');
  const ui = reactive({ clip: null, field: { key: 'size', widget: 'vec', schema: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 }, value: [1, 2, 3] } });
  ui.clip = copyField(ui.field);
  assert.deepEqual(pasteVerdict(ui.clip, { kind: 'part' }), { ok: true, value: [1, 2, 3] });
  assert.deepEqual(copyTransform(reactive({ p: [1, 0, 0], r: [0, 0, 0], s: [1, 1, 1] })).p, [1, 0, 0]);
});

test('an asset field pastes only into one taking the same kinds of file', () => {
  const sound = { key: 'sound', widget: 'asset', schema: { type: 'string' }, meta: { widget: 'asset', assetTypes: ['audio'] }, value: 'sounds/a.wav' };
  const clip = { key: 'clip', widget: 'asset', schema: { type: 'string' }, meta: { widget: 'asset', assetTypes: ['vrma'] } };
  const other = { key: 'other', widget: 'asset', schema: { type: 'string' }, meta: { widget: 'asset', assetTypes: ['audio'] } };
  assert.equal(pasteVerdict(copyField(sound), clip).ok, false);
  assert.equal(pasteVerdict(copyField(sound), other).ok, true);
});

test('every drop target asks for an effect its drag allows (else the browser drops nothing): tree rows link to node slots', async () => {
  const { NODE_DRAG_ALLOWED, ASSET_DRAG_ALLOWED, dropEffectFor, effectPermits } = await import('../src/index.js');
  assert.equal(effectPermits('copyMove', 'link'), false, 'the pairing that lost every node-slot drop');
  assert.ok(effectPermits(NODE_DRAG_ALLOWED, dropEffectFor({ slot: 'node' })), 'a tree row onto a node slot');
  // what WebKit on macOS reports for an in-page drag whatever the page allowed ('all' read back as 'copyMove'): every slot must take it
  for (const slot of [{ slot: 'node' }, { slot: 'asset' }, { slot: 'prop' }, { slot: 'viewport' }]) assert.ok(effectPermits('copyMove', dropEffectFor(slot)), `${slot.slot} under WebKit`);
  assert.ok(effectPermits(NODE_DRAG_ALLOWED, 'move'), 'a tree row onto another row (reparent)');
  for (const slot of [{ slot: 'asset' }, { slot: 'prop' }, { slot: 'viewport' }]) assert.ok(effectPermits(ASSET_DRAG_ALLOWED, dropEffectFor(slot)), slot.slot);
  // and the components set them from these, never a literal of their own
  const root = path.join(import.meta.dirname, '../../../..');
  for (const f of ['apps/editor/src/TreeItem.vue', 'apps/editor/src/App.vue', 'apps/editor/src/Inspector.vue', 'engine/packages/editor-ui/src/ValueField.vue', 'engine/packages/editor-ui/src/AssetsPanel.vue']) {
    const text = fs.readFileSync(path.join(root, f), 'utf8');
    assert.doesNotMatch(text, /(effectAllowed|dropEffect)\s*=\s*'(?!none')/, `${f} sets an effect literally`);
  }
});
