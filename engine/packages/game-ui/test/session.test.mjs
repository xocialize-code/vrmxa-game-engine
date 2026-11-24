// M5 W3's acceptance in Node, on the test game (test/fixtures): a conversation with a choice, played through the
// overlay's binding, is in the input recording, and replaying the recording takes the same branch with the same per-step
// hashes. The HUD updates from the step. A rebinding is used by the next step, survives a relaunch, and a recording made
// before it replays the same after it. (acceptance/m5/dialogue* runs the same game in Chromium and WKWebView.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { parse } from '@vrmxg/scene';
import { MemoryStore } from '@vrmxg/save';
import { compareRuns, hashValue } from '@vrmxg/snapshot';
import { VirtualDevice } from '@vrmxg/input';
import { OverlayBinding, GameSettings, memorySettingsStore } from '../src/index.js';
import { SCENES, startFlow, playSession, replaySession } from './fixtures/world.js';

installPortableMath();
const R = await loadRapier();
const dir = path.join(import.meta.dirname, 'fixtures');
const scenes = new Map(SCENES.map((s) => [s, parse(fs.readFileSync(path.join(dir, s), 'utf8'))]));
const STEPS = 520;

test('a conversation with a choice plays, is in the recording, and replays to the same branch and per-step hashes', async () => {
  const live = await playSession(await startFlow(R, scenes, { store: new MemoryStore() }), { steps: STEPS, pick: 'latte' });
  const chosen = live.recording.frames.map((f, i) => [live.recording.start + i, f[2]]).filter(([, c]) => c);
  assert.equal(chosen.length, 1);
  assert.deepEqual(chosen[0][1], { 'dialogue.choose': 'latte' });
  assert.equal(live.recording.version, 2);
  assert.deepEqual([live.view.scene, live.view.outcome, live.view.flags.order, live.view.score], ['ending.vrmxs', 'won', 'latte', 35]);
  const rep = await replaySession(await startFlow(R, scenes), live.recording, STEPS);
  assert.equal(compareRuns(live.run, rep.run), null, 'every step\'s hashes, across the scene change');
  assert.deepEqual(rep.view.flags, live.view.flags);
  // the ending says goodbye by what was ordered, read across the scene change
  const tea = await playSession(await startFlow(R, scenes), { steps: STEPS, pick: 'tea' });
  assert.equal(tea.view.flags.order, 'tea');
  assert.notEqual(hashValue(tea.run.at(-1).h), hashValue(live.run.at(-1).h), 'the other branch is another run');
  const bye = (r) => r.models.filter((m) => m.hud.scene === 'ending.vrmxs' && m.dialogue).map((m) => m.dialogue.text)[0];
  assert.equal(bye(live), 'Enjoy your latte!'); assert.equal(bye(tea), 'Enjoy your tea!');
});

test('the overlay holds the devices while Hana talks, and lets go when she is done', async () => {
  const live = await playSession(await startFlow(R, scenes), { steps: 400, pick: 'tea' });
  const start = live.models.findIndex((m) => m.holding), first = live.models.findIndex((m, i) => i > start && !m.holding);
  assert.equal(live.models[start].step, 1, 'from the step after the conversation started (it autostarts on the first)');
  assert.ok(first - start > 100, `held through the conversation (let go at ${live.models[first]?.step})`);
  assert.ok(live.models.slice(start, first).every((m) => m.dialogue), 'only while it lasts');
  assert.equal(live.models[first].dialogue, null);
  // the ball didn't move while D was held and the overlay had the keys: every frame of the conversation pushes nothing
  const frames = live.recording.frames.slice(start, first);
  assert.ok(frames.every((f) => f[0][0] === 0), 'move_x read nothing while held');
  assert.ok(live.recording.frames.slice(first + 1, first + 10).every((f) => f[0][0] === 1), 'and reads D again after');
});

test('the HUD updates from the step: goal, score, timer, "Saved" on the checkpoint written, the result', async () => {
  const live = await playSession(await startFlow(R, scenes, { store: new MemoryStore() }), { steps: STEPS, pick: 'latte' });
  const at = (step) => live.models.find((m) => m.step === step).hud;
  const h0 = at(0);
  assert.deepEqual([h0.goal.text, h0.score.value, h0.timers[0].label, h0.timers[0].text, h0.counters[0].label], ['Take Hana\'s order', 0, 'Until closing', '0:20', 'Served']);
  assert.equal(at(61).timers[0].text, '0:19', 'the clock is the step\'s: one second after 60 steps');
  const saved = live.models.find((m) => m.hud.notices.some((n) => n.text === 'Saved'));
  const taken = live.models.find((m) => m.hud.goal?.key === 'serve');
  assert.ok(saved && taken && saved.step >= taken.step, '"Saved" once the order is taken and the file is written');
  assert.equal(taken.hud.score.value, 10);
  const won = live.models.find((m) => m.hud.outcome === 'won');
  assert.ok(won, 'the result');
  assert.equal(won.hud.score.value, 35);
  // nothing in the model depends on when it was read: reading the same step twice gives the same model
  const flow = await startFlow(R, scenes); const b = new OverlayBinding(flow);
  flow.run(30);
  assert.deepEqual(b.read(), b.read());
  assert.notEqual(b.sync(), null); assert.equal(b.sync(), null, 'nothing changed: no redraw');
  flow.step(); assert.notEqual(b.sync(), null, 'a step: a redraw');
  b.dispose();
});

test('a rebinding in settings is used by the next step, survives a relaunch, and an older recording replays the same after it', async () => {
  const store = memorySettingsStore();
  // a session recorded on the game's own bindings (D pushes)
  const before = await playSession(await startFlow(R, scenes), { steps: STEPS, pick: 'latte' });
  // the player rebinds move right to L
  const flow = await startFlow(R, scenes);
  const settings = await new GameSettings({ store }).load();
  const binding = new OverlayBinding(flow, { settings });
  binding.read();
  await settings.rebind(flow.tree.services.get('input'), 'move_x', [{ key: 'KeyL', value: 1 }, { key: 'KeyJ', value: -1 }]);
  const dev = flow.tree.services.get('input').addDevice(new VirtualDevice().press('KeyL'));
  flow.tree.services.get('dialogue').stop(); binding.read(); // no conversation: the overlay lets go of the keys
  flow.step();
  assert.equal(flow.tree.services.get('input').axis('move_x'), 1, 'L moves on the next step');
  dev.release('KeyL').press('KeyD'); flow.step();
  assert.equal(flow.tree.services.get('input').axis('move_x'), 0, 'D no longer does');
  binding.dispose();
  // relaunch: a new session, settings read from the store and put on the world by the overlay
  const again = await startFlow(R, scenes);
  const relaunched = new OverlayBinding(again, { settings: await new GameSettings({ store }).load() });
  relaunched.read();
  assert.deepEqual(again.tree.services.get('input').overrides(), { move_x: [{ key: 'KeyL', value: 1 }, { key: 'KeyJ', value: -1 }] });
  // the recording made before the rebinding replays the same in it, step for step
  const rep = await replaySession(again, before.recording, STEPS);
  assert.equal(compareRuns(before.run, rep.run), null);
  // and the bindings went with the session across the scene change (carried), and after a load (put on by the overlay)
  assert.deepEqual(again.tree.services.get('input').overrides(), { move_x: [{ key: 'KeyL', value: 1 }, { key: 'KeyJ', value: -1 }] });
  relaunched.dispose();
});

test('settings go on a world a save loads into', async () => {
  const store = new MemoryStore(), settingsStore = memorySettingsStore({ bindings: { jump: [{ key: 'KeyJ' }] } });
  const flow = await startFlow(R, scenes, { store });
  const b = new OverlayBinding(flow, { settings: await new GameSettings({ store: settingsStore }).load() });
  b.read();
  flow.run(20);
  await flow.saveTo('slot-1');
  await flow.loadFrom('slot-1');
  assert.deepEqual(flow.tree.services.get('input').overrides(), { jump: [{ key: 'KeyJ' }] }, 'before the loaded world\'s first step');
  b.dispose();
  assert.equal(flow.tree.services.get('input').muted, false, 'disposed: the devices are the game\'s again');
});

test('the overlay changes input.muted only when its own hold changes: an app\'s own muting stands (review)', async () => {
  const flow = await startFlow(R, scenes);
  const b = new OverlayBinding(flow, { hold: 'never' });
  const input = flow.tree.services.get('input');
  b.read();
  input.muted = true;      // the app's pause menu, say
  flow.step(); b.read(); b.read();
  assert.equal(input.muted, true);
  b.dispose();
  assert.equal(input.muted, true, 'and disposing an overlay that never held leaves it alone');
});
