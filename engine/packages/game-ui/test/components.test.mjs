// The components, compiled from their .vue files and rendered on the server: the markup an app gets, with the ids and
// accessible names AppProbe and a screen reader read, and every control marked for keyboard and gamepad navigation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DEFAULT_ACTIONS } from '@vrmxg/input';
import { hudModel, dialogueModel, GameSettings, memorySettingsStore } from '../src/index.js';
import { loadSFC, render } from './sfc.mjs';

const src = (f) => path.join(import.meta.dirname, '../src', f);
const view = { scene: 'counter.vrmxs', step: 120, counters: { score: 10, served: 0 }, labels: { score: 'Score', served: 'Served' }, timers: { clock: { limit: true, leftSteps: 500, elapsedSteps: 700, running: true, done: false, declared: true, label: 'Until closing' } }, objectives: [], goal: { key: 'serve', text: 'Bring the order to the table' }, outcome: null };
const hud = hudModel(view, { prompts: [{ actor: 'mira', item: 'key', verb: 'take', prompt: 'Take' }], names: () => 'Brass key', bindings: structuredClone(DEFAULT_ACTIONS), carrying: [{ id: 'coin', name: 'Coin' }], notices: [{ id: 'n1', text: 'Saved' }] });
const asking = dialogueModel({ node: 'order', title: null, index: 0, line: null, speaker: 'hana', name: 'Hana', text: 'What can I get you?', clip: null, phase: 'choice', since: 0, duration: 2, skippable: true, choices: [{ id: 'latte', text: 'A latte, please.' }, { id: 'tea', text: 'Just tea.' }] });
const controls = (html) => [...html.matchAll(/<(button|input)\b[^>]*>/g)].map((m) => m[0]);

test('the HUD: every readout carries its value in its accessible name', async () => {
  const Hud = await loadSFC(src('Hud.vue'));
  const html = await render(Hud, { model: hud });
  assert.match(html, /id="hud-goal"[^>]*aria-label="Goal: Bring the order to the table"/);
  assert.match(html, /id="hud-score"[^>]*aria-label="Score 10"/);
  assert.match(html, /id="hud-counter-served"[^>]*aria-label="Served 0"/);
  assert.match(html, /id="hud-timer-clock"[^>]*role="timer"[^>]*aria-label="Until closing 0:09, hurry"/);
  assert.match(html, /id="hud-carrying"[^>]*aria-label="Carrying: Coin"/);
  assert.match(html, /id="hud-prompt"[^>]*aria-label="Press E or Gamepad X to Take Brass key"/);
  assert.match(html, /<kbd[^>]*>E<\/kbd>/);
  assert.match(html, /id="hud-notice-n1"[^>]*>Saved</);
  assert.match(html, /aria-live="polite"/, 'the prompt is announced when it changes');
  assert.deepEqual(controls(html), [], 'the HUD has no controls');
  const won = await render(Hud, { model: { ...hud, outcome: 'won', prompt: null } });
  assert.match(won, /id="hud-outcome"[^>]*>You won</);
  assert.doesNotMatch(won, /id="hud-prompt"/);
});

test('the dialogue box: the speaker and line, numbered choices as buttons with which-of-how-many names', async () => {
  const Box = await loadSFC(src('DialogueBox.vue'));
  const html = await render(Box, { model: asking });
  assert.match(html, /id="dialogue"[^>]*role="dialog"[^>]*aria-label="Conversation with Hana"/);
  assert.match(html, /id="dialogue-line"[^>]*aria-label="Hana: What can I get you\?"/);
  assert.match(html, /id="dialogue-choice-latte"[^>]*data-nav[^>]*aria-label="Choice 1 of 2: A latte, please."/);
  assert.match(html, /id="dialogue-choice-tea"[^>]*aria-label="Choice 2 of 2: Just tea."/);
  assert.doesNotMatch(html, /dialogue-continue/);
  const line = await render(Box, { model: dialogueModel({ node: 'o', index: 0, line: null, speaker: 'hana', name: 'Hana', text: 'Good morning there', phase: 'line', skippable: true, choices: [] }, [{ actor: 'hana', words: ['Good', 'morning', 'there'], spoken: 1 }]) });
  assert.match(line, /id="dialogue-continue"[^>]*data-nav[^>]*aria-label="Continue"/);
  assert.match(line, /<span class="said">Good <\/span><span class="unsaid">morning <\/span><span class="unsaid">there<\/span>/, 'words appear as they are said, with the spaces between them');
});

test('the root overlay draws the HUD, captions and the dialogue from one model', async () => {
  const Overlay = await loadSFC(src('GameOverlay.vue'));
  const html = await render(Overlay, { flow: {}, model: { hud, dialogue: asking, captions: [{ actor: 'guest', name: 'Guest', text: 'Hello?', label: 'Guest: Hello?' }], holding: true } });
  assert.match(html, /class="gu-overlay"[^>]*role="region"[^>]*aria-label="Game"/);
  for (const id of ['hud-goal', 'hud-prompt', 'dialogue', 'dialogue-choice-latte', 'captions', 'caption-guest']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(await render(Overlay, { flow: {} }), /aria-label="Game status"/, 'renders with nothing to show yet');
});

test('the settings controls: a slider and a mute button per bus; a key and a button slot per action; all navigable', async () => {
  const settings = await new GameSettings({ store: memorySettingsStore({ volumes: { music: { volume: 0.4 } } }) }).load();
  const Volume = await loadSFC(src('VolumeControls.vue'));
  const vol = await render(Volume, { settings });
  assert.match(vol, /aria-label="Volume"/);
  assert.match(vol, /id="volume-music"[^>]*type="range"[^>]*value="40"[^>]*aria-label="Music volume"[^>]*aria-valuetext="40 percent"/);
  assert.match(vol, /id="mute-voice"[^>]*aria-pressed="false"[^>]*aria-label="Mute Voices"/);
  assert.equal(controls(vol).length, 10);
  assert.ok(controls(vol).every((c) => /data-nav/.test(c)), 'every control is reachable from the keyboard and a gamepad');
  const Rebind = await loadSFC(src('RebindList.vue'));
  const input = { bindings: () => structuredClone(DEFAULT_ACTIONS), peek: () => ({ gamepad: null }) };
  const reb = await render(Rebind, { input, settings, hide: ['look_x', 'look_y', 'zoom'] });
  assert.match(reb, /aria-label="Controls"/);
  assert.match(reb, /id="rebind-jump-keyboard"[^>]*aria-label="Jump, keyboard: Space. Change"/);
  assert.match(reb, /id="rebind-jump-gamepad"[^>]*aria-label="Jump, gamepad: Gamepad A. Change"/);
  assert.match(reb, /id="rebind-move_x\+-keyboard"[^>]*aria-label="Move right, keyboard: D, Right. Change"/);
  assert.match(reb, /id="rebind-reset"/);
  assert.doesNotMatch(reb, /rebind-zoom/);
  assert.ok(controls(reb).every((c) => /data-nav/.test(c)));
});
