// The menus' decisions: settings, slot rows, the gamepad and keyboard, what the game sees after a menu, and the question
// before progress is lost.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VirtualDevice } from '@vrmxg/input';
import { readSettings, chosenBackend, SettingsStore, memoryStorage, defaultSettings, serializeSettings, SETTINGS_FORMAT } from '../src/settings.js';
import { slotRows, latestSave, formatPlayed, saveName, PLAYER_SLOTS } from '../src/slots.js';
import { PadNavigator, HeldGate, nextIndex, keyCommand, padDirections, PAD } from '../src/nav.js';
import { leaveQuestion, mayLeave } from '../src/closing.js';

// ---------------------------------------------------------------- settings

test('settings: each field is read on its own, and a bad one costs only itself', () => {
  assert.deepEqual(readSettings(null).settings, defaultSettings());
  const r = readSettings({ format: SETTINGS_FORMAT, version: 1, backend: 'vulkan', volume: { music: 0.25, sfx: 7, voice: 'loud' }, bindings: { jump: [{ key: 'KeyJ' }] } });
  assert.equal(r.settings.backend, 'auto');
  assert.equal(r.settings.volume.music, 0.25);
  assert.equal(r.settings.volume.sfx, 1, 'clamped to 1');
  assert.equal(r.settings.volume.voice, 1, 'not a number: the default');
  assert.deepEqual(r.settings.bindings, { jump: [{ key: 'KeyJ' }] }, 'kept as stored for W3');
  assert.match(r.problems.join(), /vulkan/);
  assert.match(readSettings({ hello: 1 }).problems[0], /not a settings document/);
  assert.equal(readSettings({ format: SETTINGS_FORMAT, version: 9, backend: 'webgl' }).settings.backend, 'webgl', 'a later version: the fields this one knows');
});

test('settings: the renderer= query wins over the stored backend', () => {
  assert.deepEqual(chosenBackend('', { backend: 'webgl' }), { backend: 'webgl', from: 'settings' });
  assert.deepEqual(chosenBackend('?renderer=webgpu', { backend: 'webgl' }), { backend: 'webgpu', from: 'query' });
  assert.deepEqual(chosenBackend('?renderer=metal', { backend: 'auto' }), { backend: 'auto', from: 'settings' });
  assert.deepEqual(chosenBackend(null, {}), { backend: 'auto', from: 'settings' });
});

test('settings: a change applies at once and counts as saved only once written; writes land in order', async () => {
  const slow = [], storage = { text: null, read: async () => storage.text, write: (t) => new Promise((ok) => slow.push(() => { storage.text = t; ok(); })) };
  const s = new SettingsStore(storage);
  await s.load();
  const a = s.set({ backend: 'webgl' }), b = s.set({ volume: { music: 0.5 } });
  assert.equal(s.value.backend, 'webgl'); assert.equal(s.value.volume.music, 0.5); assert.equal(s.saved, false);
  const tick = () => new Promise((r) => setImmediate(r));
  await tick(); assert.equal(slow.length, 1, 'one write at a time'); slow.shift()(); await a;
  assert.equal(s.saved, false, 'the first write is not the last change');
  await tick(); slow.shift()(); await b;
  assert.equal(s.saved, true);
  assert.equal(JSON.parse(storage.text).volume.music, 0.5);
  assert.equal(JSON.parse(storage.text).backend, 'webgl');
});

test('settings: a write that fails says so and leaves them unsaved; a store that can\'t be read gives the defaults', async () => {
  const s = new SettingsStore({ read: async () => null, write: async () => { throw new Error('read-only volume'); } });
  await s.load();
  assert.equal(await s.set({ backend: 'webgpu' }), false);
  assert.equal(s.saved, false);
  assert.match(s.error, /read-only volume/);
  const t = new SettingsStore({ read: async () => '{ not json', write: async () => {} });
  await t.load();
  assert.deepEqual(t.value, defaultSettings());
  assert.match(t.error, /couldn't be read/);
  const m = memoryStorage(serializeSettings({ ...defaultSettings(), backend: 'webgl' }));
  const u = new SettingsStore(m); await u.load();
  assert.equal(u.value.backend, 'webgl');
});

// ---------------------------------------------------------------- slots

const LIST = [
  { slot: 'slot-2', name: 'The cafe · level · Get to the counter', savedAt: '2026-11-24T10:05:00.000Z', step: 1500, seconds: 25, scene: 'game/level.vrmxs' },
  { slot: 'auto-door', name: 'Inside the cafe', savedAt: '2026-11-24T10:07:30.000Z', step: 1700, seconds: 28.3, scene: 'game/level.vrmxs' },
  { slot: 'auto-checkpoint', name: 'Checkpoint', savedAt: '2026-11-24T09:00:00.000Z', step: 300, seconds: 5, scene: 'game/level.vrmxs' },
  { slot: 'notes', name: 'Something else', savedAt: '2026-11-24T11:00:00.000Z', step: 1, seconds: 0, scene: null },
];

test('slots: six player slots in order, the game\'s checkpoints newest first, nothing else', () => {
  const { player, checkpoints } = slotRows(LIST);
  assert.deepEqual(player.map((r) => r.slot), PLAYER_SLOTS);
  assert.equal(player[0].empty, true); assert.equal(player[0].text, 'Slot 1: empty');
  assert.equal(player[1].empty, false);
  assert.equal(player[1].text, 'Slot 2: The cafe · level · Get to the counter, 0:25 · 2026-11-24 10:05');
  assert.deepEqual(checkpoints.map((r) => r.slot), ['auto-door', 'auto-checkpoint']);
  assert.equal(checkpoints[0].label, 'Checkpoint door');
  assert.equal(checkpoints[1].label, 'Checkpoint');
});

test('slots: Continue is the newest save the menu knows', () => {
  assert.equal(latestSave(LIST).slot, 'auto-door');
  assert.equal(latestSave([]), null);
  assert.equal(latestSave([{ slot: 'notes', savedAt: 'z' }]), null);
  assert.equal(latestSave([{ slot: 'slot-1', savedAt: null, step: 5 }, { slot: 'slot-3', savedAt: null, step: 9 }]).slot, 'slot-3');
});

test('slots: time played, and a save\'s name', () => {
  assert.equal(formatPlayed(0), '0:00'); assert.equal(formatPlayed(75.9), '1:15'); assert.equal(formatPlayed(3725), '1:02:05'); assert.equal(formatPlayed(null), '');
  assert.equal(saveName({ title: 'The Cafe', view: { scene: 'game/level.vrmxs', goal: { text: 'Get to the counter' }, outcome: null } }), 'The Cafe · level · Get to the counter');
  assert.equal(saveName({ title: 'The Cafe', view: { scene: 'game/ending.vrmxs', outcome: 'won' } }), 'The Cafe · ending · Won');
  assert.equal(saveName({}), 'Save');
});

// ---------------------------------------------------------------- the gamepad and the keyboard

const pad = (pressed = [], axes = [0, 0, 0, 0]) => { const buttons = new Array(17).fill(0); for (const b of pressed) buttons[b] = 1; return { axes, buttons }; };

test('a gamepad: a change counts, a held direction repeats on the frame clock, a button held when first seen waits', () => {
  const n = new PadNavigator({ delay: 0.4, every: 0.1 });
  assert.deepEqual(n.poll(pad([PAD.A, PAD.DOWN]), 0), [], 'held when first seen: nothing');
  assert.deepEqual(n.poll(pad([PAD.A, PAD.DOWN]), 0.5), [], 'still held: nothing, no repeat either');
  assert.deepEqual(n.poll(pad(), 0.6), []);
  assert.deepEqual(n.poll(pad([PAD.DOWN]), 1), ['down']);
  assert.deepEqual(n.poll(pad([PAD.DOWN]), 1.3), [], 'before the repeat delay');
  assert.deepEqual(n.poll(pad([PAD.DOWN]), 1.4), ['down']);
  assert.deepEqual(n.poll(pad([PAD.DOWN]), 1.45), []);
  assert.deepEqual(n.poll(pad([PAD.DOWN]), 1.5), ['down']);
  assert.deepEqual(n.poll(pad([PAD.A]), 1.6), ['confirm']);
  assert.deepEqual(n.poll(pad([PAD.A]), 1.7), [], 'A is no repeat');
  assert.deepEqual(n.poll(pad([PAD.B, PAD.START]), 1.8), ['back', 'start']);
  assert.deepEqual(n.poll(null, 1.9), [], 'the pad gone');
});

test('a gamepad: after a stalled frame a held direction repeats once, not on every frame after it', () => {
  const n = new PadNavigator({ delay: 0.4, every: 0.1 });
  n.poll(pad(), 0);
  assert.deepEqual(n.poll(pad([PAD.DOWN]), 1), ['down']);
  assert.deepEqual(n.poll(pad([PAD.DOWN]), 3), ['down'], 'a two-second stall: one repeat');
  assert.deepEqual(n.poll(pad([PAD.DOWN]), 3.016), [], 'the next frame: none');
  assert.deepEqual(n.poll(pad([PAD.DOWN]), 3.1), ['down']);
});

test('a gamepad: the left stick past half-way is a direction', () => {
  assert.deepEqual([...padDirections(pad([], [0.9, -0.2]))], ['right']);
  assert.deepEqual([...padDirections(pad([], [-0.1, -0.8]))], ['up']);
  assert.deepEqual([...padDirections(pad([], [0.3, 0.3]))], []);
  const n = new PadNavigator(); n.poll(pad(), 0);
  assert.deepEqual(n.poll(pad([], [0, 0.95]), 0.1), ['down']);
});

test('the keyboard: arrows move, Escape goes back, Enter and Space are the buttons\' own', () => {
  assert.equal(keyCommand({ key: 'ArrowDown' }), 'down');
  assert.equal(keyCommand({ key: 'Escape' }), 'back');
  assert.equal(keyCommand({ key: 'Enter' }), null);
  assert.equal(keyCommand({ key: ' ' }), null);
  assert.equal(nextIndex(-1, 4, 1), 0); assert.equal(nextIndex(-1, 4, -1), 3);
  assert.equal(nextIndex(3, 4, 1), 0); assert.equal(nextIndex(0, 4, -1), 3); assert.equal(nextIndex(0, 0, 1), -1);
});

test('after a menu, what was held when the game took over is hidden until it is let go', () => {
  const v = new VirtualDevice(), gate = new HeldGate(v);
  const read = () => { const out = { keys: new Set(), mouse: { dx: 0, dy: 0, wheel: 0, buttons: new Set() }, gamepad: null }; gate.read(out); return out; };
  v.press('Space').press('KeyW'); v.setGamepad([0, 0, 0, 0], pad([PAD.A]).buttons);
  assert.deepEqual([...read().keys].sort(), ['KeyW', 'Space'], 'nothing gated before the game takes over');
  gate.arm();
  let o = read();
  assert.deepEqual([...o.keys], [], 'Space and W held at Resume: hidden');
  assert.equal(o.gamepad.buttons[PAD.A], 0, 'A held at Resume: hidden');
  v.release('KeyW'); o = read();
  v.press('KeyW'); o = read();
  assert.deepEqual([...o.keys], ['KeyW'], 'W let go and pressed again: the game sees it');
  v.setGamepad([0, 0, 0, 0], pad().buttons); read();
  v.setGamepad([0, 0, 0, 0], pad([PAD.A]).buttons); o = read();
  assert.equal(o.gamepad.buttons[PAD.A], 1, 'A pressed again: seen');
  assert.ok(!o.keys.has('Space'), 'Space still held since Resume: still hidden');
});

test('after a menu, a stick still tilted is hidden until it is back near the middle', () => {
  const v = new VirtualDevice(), gate = new HeldGate(v);
  const read = () => { const out = { keys: new Set(), mouse: { dx: 0, dy: 0, wheel: 0, buttons: new Set() }, gamepad: null }; gate.read(out); return out; };
  v.setGamepad([0, 0.9, 0, 0]); gate.arm();
  assert.deepEqual(read().gamepad.axes, [0, 0, 0, 0], 'the stick that moved through the menu: hidden');
  v.setGamepad([0, 0.4, 0, 0]);
  assert.deepEqual(read().gamepad.axes, [0, 0, 0, 0], 'not back near the middle yet');
  v.setGamepad([0, 0.1, 0, 0]); read();
  v.setGamepad([0, 0.8, 0, 0]);
  assert.deepEqual(read().gamepad.axes, [0, 0.8, 0, 0], 'let go and tilted again: the game sees it');
});

// ---------------------------------------------------------------- the question before progress is lost

test('nothing unsaved: no question; unsaved: one that offers saving into the last slot', async () => {
  assert.equal(leaveQuestion({ active: false, dirty: true, unsavedSteps: 9 }, { what: 'close' }), null);
  assert.equal(leaveQuestion({ active: true, dirty: false, unsavedSteps: 0 }, { what: 'quit' }), null);
  const q = leaveQuestion({ active: true, dirty: true, unsavedSteps: 60 * 75 }, { what: 'quit', lastSlot: 'slot-2', slotLabel: () => 'Slot 2' });
  assert.equal(q.title, 'Quit without saving?');
  assert.match(q.text, /^1 min 15 s of play/);
  assert.match(leaveQuestion({ active: true, dirty: true, unsavedSteps: 12 }, { what: 'close' }).text, /^Less than a second of play/);
  assert.deepEqual(q.options.map((o) => o.id), ['cancel', 'save', 'discard']);
  assert.equal(q.options[1].label, 'Save to Slot 2 and Quit');
  assert.deepEqual(leaveQuestion({ active: true, dirty: true, unsavedSteps: 60 }, { what: 'load', lastSlot: 'slot-2' }).options.map((o) => o.id), ['cancel', 'discard']);
});

test('the answer: go on, stay, or save first; a save that fails keeps the game and says why', async () => {
  const session = { active: true, dirty: true, unsavedSteps: 600, saved: [], async saveSlot(s) { this.saved.push(s); } };
  const answer = (id) => async () => id;
  assert.equal(await mayLeave(session, { what: 'close', ask: answer('discard') }), true);
  assert.equal(await mayLeave(session, { what: 'close', ask: answer('cancel') }), false);
  assert.equal(await mayLeave(session, { what: 'close', ask: answer('save'), lastSlot: 'slot-1' }), true);
  assert.deepEqual(session.saved, ['slot-1']);
  const named = [];
  assert.equal(await mayLeave(session, { what: 'close', ask: answer('save'), lastSlot: 'slot-2', save: async (s) => named.push(s) }), true);
  assert.deepEqual(named, ['slot-2'], 'the app\'s own save (the one that names the save) when given');
  const errors = [];
  const failing = { ...session, async saveSlot() { throw new Error('the disk is full'); } };
  assert.equal(await mayLeave(failing, { what: 'quit', ask: answer('save'), lastSlot: 'slot-1', onError: (e) => errors.push(e.message) }), false);
  assert.deepEqual(errors, ['the disk is full']);
  assert.equal(await mayLeave(session, { what: 'quit', ask: answer('cancel'), quitting: true }), true, 'the page asked to quit itself');
  assert.equal(await mayLeave(session, { what: 'quit', ask: answer('discard'), asking: () => true }), false, 'a question is up already');
});
