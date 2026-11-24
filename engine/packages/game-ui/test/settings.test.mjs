// Settings: volume per bus and the player's bindings, through a store the app supplies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree } from '@vrmxg/core';
import { installInput, VirtualDevice, DEFAULT_ACTIONS } from '@vrmxg/input';
import { GameSettings, readSettings, memorySettingsStore, volumeRows, rebindRows, applyCapture, captureKey, captureButton, conflicts, VOLUME_BUSES } from '../src/index.js';

const world = () => { const tree = new SceneTree({ registry: m0Registry() }); const input = installInput(tree); const dev = input.addDevice(new VirtualDevice()); tree.instantiate({ format: 'vrmxs', version: 1, id: 't', nodes: [] }); return { tree, input, dev }; };
const fakeAudio = () => { const set = []; return { set, setBus: (name, o) => set.push([name, { ...o }]) }; };

test('stored settings are read whatever the store held: gaps filled, damage replaced', () => {
  const d = readSettings(null);
  assert.deepEqual(Object.keys(d.volumes), VOLUME_BUSES);
  assert.deepEqual(d.volumes.music, { volume: 1, muted: false });
  assert.deepEqual(d.bindings, {});
  const r = readSettings({ volumes: { music: { volume: 7, muted: 'yes' }, voice: { volume: -1 }, sfx: 'loud' }, bindings: [] });
  assert.deepEqual([r.volumes.music, r.volumes.voice, r.volumes.sfx], [{ volume: 1, muted: false }, { volume: 0, muted: false }, { volume: 1, muted: false }]);
  assert.deepEqual(r.bindings, {});
  assert.throws(() => new GameSettings({}), /needs a store/);
});

test('a volume change applies to the output at once and is saved; a relaunch applies it again', async () => {
  const store = memorySettingsStore(), audio = fakeAudio();
  const s = await new GameSettings({ store }).load();
  await s.setVolume('music', { volume: 0.4 }, audio);
  await s.setVolume('voice', { muted: true }, audio);
  assert.deepEqual(audio.set, [['music', { volume: 0.4, muted: false }], ['voice', { volume: 1, muted: true }]]);
  assert.throws(() => s.setVolume('drums', { volume: 1 }), /no bus "drums"/);
  const rows = volumeRows(s.data);
  assert.deepEqual(rows.find((r) => r.bus === 'music'), { bus: 'music', label: 'Music', volume: 0.4, percent: 40, muted: false });
  // relaunch
  const again = fakeAudio();
  (await new GameSettings({ store }).load()).applyTo({ audio: again });
  assert.deepEqual(again.set.find(([b]) => b === 'music')[1], { volume: 0.4, muted: false });
  assert.deepEqual(again.set.find(([b]) => b === 'voice')[1], { volume: 1, muted: true });
});

test('an action rebound in settings is used by the next step and survives a relaunch', async () => {
  const store = memorySettingsStore();
  const a = world();
  const s = await new GameSettings({ store }).load();
  s.applyTo({ input: a.input });
  await s.rebind(a.input, 'jump', [{ key: 'KeyJ' }, { gamepadButton: 0 }]);
  a.dev.press('KeyJ'); a.tree.step();
  assert.equal(a.input.pressed('jump'), true, 'the next step');
  assert.deepEqual(JSON.parse(store.raw).bindings, { jump: [{ key: 'KeyJ' }, { gamepadButton: 0 }] });
  // the app quits and starts again: a new world, new settings, the same store
  const b = world();
  const s2 = await new GameSettings({ store }).load();
  s2.applyTo({ input: b.input });
  b.dev.press('Space'); b.tree.step();
  assert.equal(b.input.isDown('jump'), false, 'Space no longer jumps after the relaunch');
  b.dev.release('Space').press('KeyJ'); b.tree.step();
  assert.equal(b.input.pressed('jump'), true);
  await s2.resetBindings(b.input, 'jump');
  assert.deepEqual(JSON.parse(store.raw).bindings, {});
  // stored bindings from another version of the game: left out and listed
  const c = world();
  const s3 = await new GameSettings({ store: memorySettingsStore({ bindings: { fly: [{ key: 'KeyF' }], jump: [{ key: 'KeyJ' }] } }) }).load();
  s3.applyTo({ input: c.input });
  assert.deepEqual(s3.ignored.map((i) => i.action), ['fly']);
  assert.deepEqual(c.input.overrides(), { jump: [{ key: 'KeyJ' }] });
});

test('writes land in the order they were asked for', async () => {
  const order = [];
  const slow = { read: () => null, write: (d) => new Promise((ok) => setTimeout(() => { order.push(d.volumes.music.volume); ok(); }, d.volumes.music.volume === 0.1 ? 20 : 0)) };
  const s = await new GameSettings({ store: slow }).load();
  s.setVolume('music', { volume: 0.1 }); s.setVolume('music', { volume: 0.9 });
  await s.settle();
  assert.deepEqual(order, [0.1, 0.9]);
});

test('the rebinding list: a row per button action, a row per direction of an axis, what can\'t be rebound shown fixed', () => {
  const rows = rebindRows(structuredClone(DEFAULT_ACTIONS));
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.deepEqual([by.jump.label, by.jump.keyboard, by.jump.gamepad], ['Jump', 'Space', 'Gamepad A']);
  assert.deepEqual([by.interact.keyboard, by.interact.gamepad], ['E, Left click', 'Gamepad X']);
  assert.deepEqual([by['move_x-'].label, by['move_x-'].keyboard, by['move_x+'].keyboard, by['move_x+'].fixed], ['Move left', 'A, Left', 'D, Right', ['Left stick X']]);
  assert.deepEqual([by.zoom.direction, by.zoom.fixed], [0, ['Mouse wheel']], 'an axis of the mouse alone is shown, fixed');
  assert.equal(rebindRows(structuredClone(DEFAULT_ACTIONS), { hide: ['zoom', 'look_x', 'look_y'], labels: { jump: 'Hop' } }).find((r) => r.id === 'jump').label, 'Hop');
  assert.ok(!rebindRows(structuredClone(DEFAULT_ACTIONS), { hide: ['zoom'] }).some((r) => r.action === 'zoom'));
});

test('capturing a key or a button rebinds one slot and keeps the rest', () => {
  const jump = DEFAULT_ACTIONS.jump.bindings;
  assert.deepEqual(applyCapture(jump, { type: 'button', direction: 0 }, 'keyboard', { key: 'KeyJ' }), [{ key: 'KeyJ' }, { gamepadButton: 0 }]);
  assert.deepEqual(applyCapture(jump, { type: 'button', direction: 0 }, 'gamepad', { gamepadButton: 3 }), [{ key: 'Space' }, { gamepadButton: 3 }]);
  const mx = DEFAULT_ACTIONS.move_x.bindings;
  const left = applyCapture(mx, { type: 'axis', direction: -1 }, 'keyboard', { key: 'KeyJ' });
  assert.deepEqual(left, [{ key: 'KeyD', value: 1 }, { key: 'KeyJ', value: -1 }, { key: 'ArrowRight', value: 1 }, { gamepadAxis: 0, deadzone: 0.15 }], 'both left keys become J; right, and the stick, kept');
  assert.deepEqual(applyCapture([{ key: 'KeyE' }], { type: 'button', direction: 0 }, 'gamepad', { gamepadButton: 2 }), [{ key: 'KeyE' }, { gamepadButton: 2 }], 'an empty slot is added to');
  assert.deepEqual(captureKey('KeyJ'), { key: 'KeyJ' }); assert.equal(captureKey('Escape'), null);
  assert.deepEqual(captureButton({ buttons: [1, 0, 0] }, { buttons: [1, 0, 1] }), { gamepadButton: 2 }, 'a button newly pressed, not one held all along');
  assert.equal(captureButton({ buttons: [1] }, { buttons: [1] }), null);
  assert.equal(captureButton(null, null), null);
  assert.deepEqual(conflicts(structuredClone(DEFAULT_ACTIONS), 'jump', { key: 'KeyE' }), ['interact']);
});

test('a write that fails is remembered and never stops the next one (review)', async () => {
  const landed = []; let fail = true;
  const flaky = { read: () => null, write: (d) => { if (fail) { fail = false; throw new Error('disk full'); } landed.push(d.volumes.music.volume); } };
  const s = await new GameSettings({ store: flaky }).load();
  assert.equal(await s.setVolume('music', { volume: 0.2 }), false, 'the failed write says so, without rejecting');
  assert.match(String(s.error), /disk full/);
  assert.equal(await s.setVolume('music', { volume: 0.7 }), true);
  assert.deepEqual(landed, [0.7], 'the next write lands, with the latest settings');
  assert.equal(s.error, null);
});
