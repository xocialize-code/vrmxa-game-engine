// M6 W1 (AB-T-0638): a node's behaviours and connections as the inspector shows them, from the registry (the Morning
// Rush's own behaviours declared by their describe) and the level: the forms are the params' and arguments' schemas,
// rendered on the server with the ids and accessible names the level scenario uses. No JSON box anywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { m0Registry } from '@vrmxg/registry/m0';
import { declareProjectBehaviours } from '@vrmxg/registry';
import { wiringView, nodeAfter, propFields, pinValue, layerField, looseSchema, structRows, widgetOf, inspectorFields } from '../src/index.js';
import { loadSFC, render } from './sfc.mjs';

const SAMPLE = path.join(import.meta.dirname, '../../../../content/sample');
const level = JSON.parse(fs.readFileSync(path.join(SAMPLE, 'game/level.vrmxs'), 'utf8'));
const reg = m0Registry();
declareProjectBehaviours(reg, await import(path.join(SAMPLE, 'game/behaviours.js')));
const src = (f) => path.join(import.meta.dirname, '../src', f);

test('a table area: its project behaviour\'s params as fields (node menus, numbers, text), its signals with the Area\'s own', () => {
  const w = wiringView(reg, level, 'table-1');
  assert.equal(w.behaviours.length, 1);
  const tz = w.behaviours[0];
  assert.deepEqual([tz.use, tz.project, tz.known], ['tableZone', true, true]);
  const by = Object.fromEntries(tz.fields.map((f) => [f.key, f]));
  assert.deepEqual(Object.keys(by), ['customer', 'dialogue', 'item', 'ordered', 'right', 'player', 'points', 'served', 'score', 'mistakes']);
  assert.equal(by.customer.widget, 'node');
  assert.equal(by.customer.value, 'aoi');
  assert.equal(by.points.widget, 'number');
  assert.deepEqual([by.points.value, by.points.set, by.points.default], [10, true, 10]);
  assert.deepEqual([by.served.value, by.served.set, by.served.default], [undefined, false, 'served']);
  assert.equal(by.item.widget, 'string');
  assert.ok(tz.fields.every((f) => f.widget !== 'json'), 'no JSON box');
  const signals = w.signals.map((s) => `${s.from}.${s.name}`);
  for (const s of ['Area.bodyEntered', 'Area.bodyExited', 'tableZone.served']) assert.ok(signals.includes(s), s);
  assert.equal(signals.at(-1), 'tableZone.served', 'the type\'s first, then its behaviours\'');
  assert.ok(!w.addable.some((a) => a.name === 'tableZone'), 'it has it');
  assert.ok(!w.addable.some((a) => a.name === 'brain'), 'a brain attaches to a Character');
  assert.deepEqual(w.connections, []);
});

test('a dialogue\'s connections: each its signal, target, action and arguments by the action\'s schema; what calls it listed', () => {
  const w = wiringView(reg, level, 'order-1');
  assert.deepEqual(w.connections.map((c) => [c.index, c.signal, c.to, c.call]), [[1, 'chose', 'brew-1', 'start'], [2, 'chose', 'hana-1', 'playLayer']]);
  const play = w.connections[1];
  assert.equal(play.problem, null);
  const by = Object.fromEntries(play.fields.map((f) => [f.key, f]));
  assert.deepEqual([by.layer.value, by.loop.value, by.slot.value, by.clip.set], ['upperBody', false, 'use', false]);
  assert.equal(by.loop.widget, 'boolean');
  assert.ok(w.actions['hana-1'].some((a) => a.name === 'say'));
  assert.ok(w.actions['brew-1'].some((a) => a.name === 'start'));
  assert.ok(w.signals.some((s) => s.name === 'chose'));
  const brew = wiringView(reg, level, 'brew-1');
  assert.deepEqual(brew.incoming, [{ index: 1, from: 'order-1', signal: 'chose', call: 'start' }]);
  const rules = wiringView(reg, level, 'rules');
  assert.deepEqual(rules.connections.find((c) => c.call === 'lookAt').fields.find((f) => f.key === 'target').widget, 'node');
  // a broken one says why
  const bad = { ...level, connections: [{ from: 'order-1', signal: 'nonesuch', to: 'brew-1', call: 'start' }, { from: 'order-1', signal: 'chose', to: 'brew-1', call: 'fly' }] };
  assert.deepEqual(wiringView(reg, bad, 'order-1').connections.map((c) => c.problem), ['order-1 has no signal nonesuch', 'brew-1 has no action fly']);
});

test('a regular\'s brain: preset a choice of kinds, vars an open struct whose values pick their kind', () => {
  const w = wiringView(reg, level, 'aoi');
  const by = Object.fromEntries(w.behaviours[0].fields.map((f) => [f.key, f]));
  assert.equal(by.preset.widget, 'choice');
  assert.equal(by.vars.widget, 'struct');
  const rows = structRows(by.vars.schema, by.vars.value).rows;
  assert.deepEqual(rows.map((r) => [r.key, widgetOf(r.schema, {}, by.vars.value[r.key])]), [['arrive', 'scalar'], ['seat', 'scalar']], 'a vars value is text, a number or yes / no by its kind menu');
  assert.deepEqual(looseSchema([1]), { type: 'array' });
});

test('pins, layers and the node after', () => {
  assert.equal(pinValue({ default: 'mira', schema: {} }), 'mira');
  assert.equal(pinValue({ default: undefined, schema: { type: 'boolean' } }), false);
  assert.equal(pinValue({ default: undefined, schema: { type: 'number' } }), 0);
  const collider = inspectorFields({ schema: { properties: { props: { properties: { layer: { type: 'string' } } } } }, propMeta: { layer: { widget: 'layer' } } }, { props: { layer: 'ghost' } })[0];
  const f = layerField(collider, ['default', 'player']);
  assert.deepEqual(f.schema.enum, ['default', 'player', 'ghost'], 'an unknown layer stays visible');
  assert.equal(f.unknownLayer, 'ghost');
  assert.equal(widgetOf(f.schema, f.meta, f.value), 'enum');
  assert.equal(layerField({ ...collider, value: undefined }, ['default']).unknownLayer, null);
  assert.equal(nodeAfter(level, 'stool-8'), 'till');
  assert.equal(nodeAfter(level, 'order-3'), '');
  assert.equal(wiringView(reg, level, 'nobody'), null);
  assert.deepEqual(propFields({ n: { schema: { type: 'string' }, nodeRef: true, meta: {} } }, {}).map((x) => x.widget), ['node']);
});

test('the panels render every control with its id and accessible name, no JSON box', async () => {
  const Beh = await loadSFC(src('BehavioursPanel.vue'));
  const nodes = level.nodes.map((n) => n.id);
  const html = await render(Beh, { wiring: wiringView(reg, level, 'table-1'), nodes });
  for (const id of ['behaviours', 'beh-tableZone', 'beh-tableZone--remove', 'beh-tableZone-customer', 'beh-tableZone-points', 'beh-tableZone-points--clear', 'beh-tableZone-served--pin', 'beh-add', 'beh-add-button']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /aria-label="Behaviour tableZone \(the project&#39;s\)"/);
  assert.match(html, /aria-label="Write tableZone served into the file \(&quot;served&quot;\)"/);
  assert.doesNotMatch(html, /\(JSON\)/);
  const brain = await render(Beh, { wiring: wiringView(reg, level, 'aoi'), nodes });
  for (const id of ['beh-brain-preset--kind', 'beh-brain-vars', 'beh-brain-vars-arrive--kind', 'beh-brain-vars-arrive', 'beh-brain-vars--newkey', 'beh-brain-vars--addkey']) assert.match(brain, new RegExp(`id="${id}"`), id);
  assert.doesNotMatch(brain, /\(JSON\)/);

  const Conn = await loadSFC(src('ConnectionsPanel.vue'));
  const c = await render(Conn, { wiring: wiringView(reg, level, 'order-1'), nodes });
  for (const id of ['connections', 'conn-1', 'conn-1-signal', 'conn-1-to', 'conn-1-call', 'conn-1--remove', 'conn-2-arg-layer', 'conn-2-arg-loop', 'conn-2-arg-clip--pin', 'conn-new-signal', 'conn-new-to', 'conn-new-call', 'conn-new-add']) assert.match(c, new RegExp(`id="${id}"`), id);
  assert.match(c, /aria-label="Connection 3: order-1.chose → hana-1.playLayer"/);
  assert.match(c, /id="conn-new-add"[^>]*disabled/);
  assert.doesNotMatch(c, /\(JSON\)/);
  const none = await render(Conn, { wiring: wiringView(reg, level, 'brew-1'), nodes });
  assert.match(none, /id="connections-in"/);
});
