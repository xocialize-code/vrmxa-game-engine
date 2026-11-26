<script setup>
// The game app (M5 W1): the canvas, the app's own menus (title, pause, save slots, settings), the question sheet, and
// the one overlay seam where @vrmxg/game-ui mounts (overlay/GameOverlay.vue). The engine lives in host.js, outside Vue.
//
// Menus are a stack: [] while playing, ['title'], ['pause'], ['pause', 'save'], ['title', 'settings'], … Back pops one;
// popping the pause menu resumes. Every control is a real button or slider with an accessible name, reached by
// Tab, the arrows, or a gamepad (A confirms, B goes back, Start pauses and resumes).
import { reactive, ref, shallowRef, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { inShell, call, onClosing, setEdited } from '../../shell/js/shell.js';
import { questions } from '@vrmxg/editor-ui';
import { GameHost } from './host.js';
import { GameSettings } from '@vrmxg/game-ui';
import VolumeControls from '@vrmxg/game-ui/VolumeControls.vue';
import RebindList from '@vrmxg/game-ui/RebindList.vue';
import { SettingsStore, localStorageFor, shellStorage, memoryStorage, chosenBackend, gameUiStore, settingsNote } from './settings.js';
import { slotRows, latestSave, PLAYER_SLOTS } from './slots.js';
import { mayLeave } from './closing.js';
import MenuScreen from './MenuScreen.vue';
import GameOverlay from './overlay/GameOverlay.vue';

const props = defineProps({ build: { type: Object, required: true }, characters: { type: Object, required: true } });
const game = props.build.game;
const query = new URLSearchParams(location.search);

const canvas = ref(null), menu = ref(null), sheet = ref(null);
const host = shallowRef(/** @type {GameHost | null} */ (null));
const settings = shallowRef(/** @type {SettingsStore | null} */ (null));
/** The player's volumes and bindings (@vrmxg/game-ui), kept in the settings document's `ui`. */
const uiSettings = shallowRef(/** @type {GameSettings | null} */ (null));
const ui = reactive({
  stack: ['title'], ready: false, starting: 'Loading…', fatal: '', message: '', version: 0,
  backend: '', step: 0, safeStep: 0, scene: null, held: null, loading: '', error: '', dirty: false, lastSlot: null,
  saves: /** @type {any[]} */ ([]), question: /** @type {any} */ (null),
  choice: /** @type {any} */ ({ backend: 'auto', from: 'settings' }), values: /** @type {any} */ (null), settingsNote: '',
  frames: '', // ?stats: the frame-time readout
  display: '', // the display's own status (M6 W6): "The display stopped. Restarting it…" until a new frame is drawn
});
const ask = questions((q) => { ui.question = q; if (!q) nextTick(() => menu.value?.focusFirst()); });

const top = computed(() => ui.stack.at(-1) ?? null);
const playing = computed(() => ui.ready && ui.stack.length === 0);
const backendName = computed(() => ({ webgpu: 'WebGPU', webgl: 'WebGL', 'webgl-fallback': 'WebGL (after the GPU was lost)' })[ui.backend] ?? 'starting');
const buildDigest = props.build.manifest.digest; // saves another build made are shown as such, and never offered by Continue
const rows = computed(() => slotRows(ui.saves, { build: buildDigest }));
const latest = computed(() => { const e = latestSave(ui.saves, { build: buildDigest }); return e ? rows.value.player.concat(rows.value.checkpoints).find((r) => r.slot === e.slot) : null; });
// Load Game opens when there is a save this build can load (Continue picks the newest of them)
const loadable = computed(() => !!latest.value);
const slotLabel = (s) => (PLAYER_SLOTS.includes(s) ? `Slot ${PLAYER_SLOTS.indexOf(s) + 1}` : s);

function sync() {
  const s = host.value?.state;
  if (!s) return;
  Object.assign(ui, { display: s.display ?? '', backend: s.backend, step: s.step, safeStep: host.value.session?.safeStep ?? 0, scene: s.scene, held: s.held, loading: s.loading, error: s.error ?? '', dirty: s.dirty, lastSlot: s.lastSlot });
  ui.version++;
  if (inShell) setEdited(s.dirty);
}
function say(text) { ui.message = text; }
// the canvas the game draws on: the host's (a lost renderer's replacement draws on a fresh one, M6 W6), else the first
function focusView() { (host.value?.canvas ?? canvas.value)?.focus(); }

async function refreshSaves() {
  try { ui.saves = await host.value.slots(); } catch (e) { ui.saves = []; say(`The saves couldn't be listed: ${e?.message ?? e}`); }
}

// ---------------------------------------------------------------- the menus

function open(screen) { ui.stack.push(screen); }
function back() {
  if (ui.question) { ask.reply('cancel'); return; }
  if (ui.stack.length <= 1) { if (top.value === 'pause') resume(); return; } // the title menu has nowhere to go back to
  ui.stack.pop();
  nextTick(() => menu.value?.focusFirst());
}
function pause() {
  if (!playing.value || !host.value.pause()) return; // not while a game starts or a save loads
  ui.stack = ['pause'];
  refreshSaves();
}
function resume() { ui.stack = []; say(''); host.value.resume(); nextTick(focusView); }

async function run(fn) {
  try { await fn(); } catch (e) { say(String(e?.message ?? e)); nextTick(() => menu.value?.focusFirst()); }
}
const newGame = () => run(async () => { ui.stack = []; say(''); try { await host.value.newGame(); } catch (e) { ui.stack = ['title']; throw e; } nextTick(focusView); });
const continueGame = () => latest.value && loadSlot(latest.value);

async function loadSlot(row) {
  if (row.empty || row.other) return;
  const go = await mayLeave(host.value.session, { what: 'load', ask: ask.ask, asking: () => ask.asking });
  if (!go) return;
  const was = ui.stack.slice();
  await run(async () => {
    ui.stack = [];
    try { await host.value.loadSlot(row.slot); } catch (e) { ui.stack = was; throw e; }
    say(`Loaded ${row.label} at step ${host.value.session.current?.at ?? '?'}.`);
    nextTick(focusView);
  });
}

async function saveSlot(row) {
  if (!row.empty) {
    const c = await ask.ask(`Replace the save in ${row.label}?`, `${row.name}${row.detail ? ` (${row.detail})` : ''} will be replaced by this game.`, [{ id: 'cancel', label: 'Cancel' }, { id: 'replace', label: 'Replace' }]);
    if (c !== 'replace') return;
  }
  await run(async () => {
    say(`Saving to ${row.label}…`);
    const entry = await host.value.saveSlot(row.slot); // throws when the store's write fails: then nothing says "saved"
    await refreshSaves();
    say(`Saved to ${row.label} at step ${entry?.step ?? '?'}.`);
  });
}

async function quitToTitle() {
  const go = await mayLeave(host.value.session, { what: 'title', ask: ask.ask, asking: () => ask.asking, lastSlot: ui.lastSlot, slotLabel, save: saveFor, onError: (e) => say(`Not saved: ${e?.message ?? e}`) });
  if (!go) return;
  const log = host.value.quitToTitle();
  if (log) window.__game.lastLog = log; // a replay ended this way is nobody's session: the last log played stays
  ui.stack = ['title'];
  await refreshSaves();
  nextTick(() => menu.value?.focusFirst());
}

// "Save to Slot N and …" in the questions: the menu's own save (its name, the slot list refreshed)
async function saveFor(slot) { await host.value.saveSlot(slot); await refreshSaves(); }

let quitting = false;
function quitApp() { quitting = true; call('app.quit').catch((e) => { quitting = false; say(String(e?.message ?? e)); }); }

// ---------------------------------------------------------------- settings

const BACKEND_CHOICES = [{ id: 'auto', label: 'Automatic' }, { id: 'webgpu', label: 'WebGPU' }, { id: 'webgl', label: 'WebGL' }];
function setBackend(backend) { settings.value.set({ backend }).then(noteSettings); }
function noteSettings() { ui.settingsNote = settingsNote(settings.value, uiSettings.value); }
const backendNote = computed(() => {
  if (ui.choice.from === 'query') return `Set by the page's address (renderer=${ui.choice.backend}): the setting below applies without it.`;
  if (!ui.values) return '';
  return ui.values.backend !== ui.choice.backend ? 'Takes effect when the game starts again.' : '';
});
const canRestart = computed(() => ui.choice.from !== 'query' && ui.values && ui.values.backend !== ui.choice.backend && !host.value?.session?.active);
function restart() { location.reload(); }

// ---------------------------------------------------------------- input outside the menus

function onCommand(c) {
  if (!ui.ready) return;
  if (c === 'pause') { pause(); return; }
  if (ui.question) { sheet.value?.command(c); return; }
  if (c === 'start') { if (top.value === 'pause') resume(); return; }
  if (top.value === 'settings') return; // the settings menu navigates with @vrmxg/game-ui's useNav, its gamepad included
  if (!playing.value) menu.value?.command(c);
}
function onKey(e) {
  if (e.key === 'Escape' && playing.value) { e.preventDefault(); pause(); }
}
let locked = false;
function onPointerLock() {
  const now = !!document.pointerLockElement;
  if (locked && !now && playing.value) pause(); // Escape in pointer lock leaves it before the page hears the key
  locked = now;
}
function beforeUnload(e) { if (host.value?.session?.dirty) { e.preventDefault(); e.returnValue = ''; } }

// `?replay=<log>[,<log>…]` (M5 W10): play recorded sessions back with the renderer on, no menus, each log (a URL beside
// the page) after the other; `&loop=<seconds>` starts them again until that long has passed. The result goes to
// window.__result (and window.READY): each replay's per-step hashes, the frame times, the backend. A runner compares the
// hashes with the log's own and with Node's.
// ?loop=<seconds>: a number above zero, else no loop (a bare ?loop or loop=abc plays once, with its hashes)
const LOOP_SECONDS = Math.max(0, Number(query.get('loop')) || 0);
const replayed = { runs: 0, scenes: 0, last: null }; // ?replay with ?stats: what the readout counts (scenes sampled once a second)
async function replayFromQuery(h) {
  const urls = query.get('replay').split(',').filter(Boolean), loop = LOOP_SECONDS, runs = [];
  const t0 = performance.now();
  try {
    const logs = await Promise.all(urls.map(async (u) => { const r = await fetch(new URL(u, location.href)); if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); }));
    ui.stack = [];
    do {
      for (const [i, log] of logs.entries()) {
        const trace = await new Promise((done, fail) => { h.replay(log, { onDone: done, onFail: fail }).catch(fail); });
        // with loop the trace is empty (no per-step hashes): a run says only which log it played
        runs.push({ log: urls[i], ...(loop ? {} : { steps: trace.length, final: trace.at(-1) ?? null, hashes: trace }) });
        replayed.runs = runs.length;
      }
    } while (loop && (performance.now() - t0) / 1000 < loop);
    window.__result = { mode: 'replay', backend: h.state.backend, runs, frames: h.frameStats(), seconds: (performance.now() - t0) / 1000, errors: window.__errors ?? [], ua: navigator.userAgent, ...lostDevices(h) };
  } catch (e) {
    window.__result = { mode: 'replay', error: String(e?.message ?? e), runs, errors: window.__errors ?? [], ...lostDevices(h) };
  }
  window.READY = true;
}

// `?lose=<step>:<how>[,…]` (M6 W6, a check): lose the renderer's device as the session reaches each step (destroy,
// encoder, context: GameHost.loseDevices). With ?replay the game must play on to the log's hashes; the result says each
// loss, what the host made again and what the status line said. `?recover=` picks the backends it makes again.
const LOSE = (query.get('lose') ?? '').split(',').filter(Boolean).map((x) => { const [at, how] = x.split(':'); return { at: Number(at), how }; });
let lost = null;
const lostDevices = (h) => (LOSE.length ? { losses: lost ?? [], recoveries: h.recoveries, displays: h.displays, canvases: document.querySelectorAll('canvas').length } : {});

// what the ?stats readout adds (M6 W6), for a check that reads only the page (AppProbe in the Mac app): each lost GPU
// device and what it was made again on, and once a replay without a loop has ended, its steps and final hash
function statsAfter(h) {
  const r = h.recoveries.length ? `; GPU lost, display restarted: ${h.recoveries.map((x) => x.backend ?? 'gave up').join(', ')}` : '';
  const run = window.__result?.runs?.at(-1);
  return `${r}${run?.final ? `; replay ended: ${run.steps} steps, final ${run.final.hash}` : window.__result?.error ? `; replay failed: ${window.__result.error}` : ''}`;
}

// the input service the settings controls read and rebind: the world being played's, else the menus' own (the title)
const inputOf = () => host.value?.input() ?? null;

onMounted(async () => {
  window.__game = { log: () => host.value?.session?.log() ?? null, lastLog: null, state: () => JSON.parse(JSON.stringify(ui)), host: () => host.value, frames: () => host.value?.frameStats() ?? null };
  addEventListener('keydown', onKey);
  document.addEventListener('pointerlockchange', onPointerLock);
  addEventListener('beforeunload', beforeUnload);
  try {
    let storage;
    if (inShell) storage = shellStorage(call);
    else { try { localStorage.length; storage = localStorageFor(game.id); } catch { storage = memoryStorage(); } }
    const store = new SettingsStore(storage);
    await store.load();
    if (store.error) say(store.error);
    settings.value = store;
    ui.values = store.value;
    // every change and every write's outcome, the volumes' and the rebindings' too (GameSettings writes through this
    // store): the status line says a failed write, whichever control made it
    store.on((v) => { ui.values = { ...v }; if (ui.ready) noteSettings(); });
    // the player's volumes and bindings: W3's GameSettings over the `ui` field (a store that can't be read gives defaults)
    const playerSettings = await new GameSettings({ store: gameUiStore(store) }).load();
    if (playerSettings.loadError) say(`The volumes and controls couldn't be read: ${playerSettings.loadError}`);
    uiSettings.value = playerSettings;
    ui.choice = chosenBackend(location.search, store.value);
    ui.starting = 'Starting the renderer…';
    const h = new GameHost({
      canvas: canvas.value, build: props.build, backend: ui.choice.backend, characters: props.characters, shell: { inShell, call }, trace: query.has('trace') || (query.has('replay') && !LOOP_SECONDS), onChange: sync, onCommand,
      hold: () => ui.stack.length > 0 || !!ui.question, // nothing steps while a menu or a question is up
      uiSettings: playerSettings,
      // ?recover=<backend>[,<backend>…]: what a lost renderer is made again on (a check forcing WebGL's path); else WebGPU, then WebGL
      recoverWith: query.get('recover')?.split(',').filter(Boolean) ?? null,
    });
    host.value = h;
    await h.open(ui.choice.backend);
    await refreshSaves();
    ui.ready = true;
    sync();
    if (query.has('stats') || query.has('replay')) {
      h.keepFrameStats();
      if (query.has('stats')) setInterval(() => { if (h.state.scene && h.state.scene !== replayed.last) { if (replayed.last) replayed.scenes++; replayed.last = h.state.scene; } const f = h.frameStats(); ui.frames = f && f.frames ? `${f.frames} frames in ${f.seconds.toFixed(0)} s: ${f.fps.toFixed(1)} fps, p99 ${f.p99.toFixed(1)} ms, max ${f.max.toFixed(1)} ms, ${f.over25} over 25 ms, at ${f.width}×${f.height}${query.has('replay') ? `; ${replayed.runs} replays played, ${replayed.scenes} scene changes` : ''}${statsAfter(h)}` : 'no frames yet'; }, 1000);
    }
    if (LOSE.length) lost = h.loseDevices(LOSE);
    if (query.has('replay')) replayFromQuery(h);
    // the game doesn't play on behind the question (and nothing more becomes unsaved while it is asked)
    if (inShell) onClosing((reason) => {
      if (h.session?.dirty && playing.value) pause();
      return mayLeave(h.session, { what: reason, ask: ask.ask, asking: () => ask.asking, lastSlot: ui.lastSlot, slotLabel, save: saveFor, quitting, onError: (e) => say(`Not saved: ${e?.message ?? e}`) });
    });
    nextTick(() => menu.value?.focusFirst());
  } catch (e) {
    console.error(e);
    window.__errors?.push(String(e?.stack ?? e));
    ui.fatal = `This game can't start: ${e?.message ?? e}`;
  }
});
onBeforeUnmount(() => { removeEventListener('keydown', onKey); document.removeEventListener('pointerlockchange', onPointerLock); removeEventListener('beforeunload', beforeUnload); });
</script>

<template>
  <main class="game" :class="{ playing }">
    <!-- a click asks for mouse look: the host listens on the canvas it draws on (a fresh one after a lost GPU device) -->
    <canvas id="view" ref="canvas" tabindex="-1" aria-label="The game" />
    <GameOverlay :inert="ui.stack.length || ui.question ? '' : null" :session="host?.session ?? null" :settings="uiSettings" :version="ui.version" />

    <div v-if="ui.fatal" id="fatal" class="fatal" role="alert">{{ ui.fatal }}</div>
    <div v-else-if="!ui.ready" class="starting" role="status">{{ ui.starting }}</div>
    <div v-if="ui.frames" id="frame-stats" class="frame-stats" role="status">{{ ui.frames }}</div>
    <div v-if="ui.display" id="display-status" class="loading display" role="status">{{ ui.display }}</div>
    <div v-if="ui.loading || ui.held" id="loading" class="loading" role="status" :aria-label="ui.loading || 'Loading'">{{ ui.loading || 'Loading…' }}</div>

    <!-- everything behind the top sheet is inert: Tab, clicks and screen readers reach only the question -->
    <div v-if="ui.ready && ui.stack.length" class="scrim" :class="{ title: top === 'title' || ui.stack[0] === 'title' }" :inert="ui.question ? '' : null">
      <MenuScreen v-if="top === 'title'" id="title-menu" ref="menu" :title="game.title" :focus="latest ? '#continue' : '#new-game'" @back="back">
        <button v-if="latest" id="continue" type="button" :aria-label="`Continue: ${latest.text}`" @click="continueGame">Continue <small>{{ latest.name }}</small></button>
        <button id="new-game" type="button" @click="newGame">New Game</button>
        <button id="load-game" type="button" :disabled="!loadable" @click="open('load')">Load Game</button>
        <button id="settings" type="button" @click="open('settings')">Settings</button>
        <button v-if="inShell" id="quit" type="button" @click="quitApp">Quit</button>
      </MenuScreen>

      <MenuScreen v-else-if="top === 'pause'" id="pause-menu" ref="menu" title="Paused" focus="#resume" @back="back">
        <button id="resume" type="button" @click="resume">Resume</button>
        <button id="save-game" type="button" @click="open('save')">Save Game</button>
        <button id="load-game" type="button" :disabled="!loadable" @click="open('load')">Load Game</button>
        <button id="settings" type="button" @click="open('settings')">Settings</button>
        <button id="quit-to-title" type="button" @click="quitToTitle">Quit to Title</button>
      </MenuScreen>

      <MenuScreen v-else-if="top === 'save' || top === 'load'" :id="`${top}-menu`" ref="menu" :title="top === 'save' ? 'Save Game' : 'Load Game'" @back="back">
        <ul class="slots" :aria-label="top === 'save' ? 'Slots to save into' : 'Saves'">
          <li v-for="r in rows.player" :key="r.slot">
            <button :id="r.slot" type="button" class="slot" :aria-label="r.text" :disabled="top === 'load' && (r.empty || r.other)" @click="top === 'save' ? saveSlot(r) : loadSlot(r)">
              <span class="slot-label">{{ r.label }}</span><span class="slot-name">{{ r.name }}</span><span class="slot-detail">{{ r.detail }}</span>
            </button>
          </li>
        </ul>
        <template v-if="top === 'load' && rows.checkpoints.length">
          <h2 class="menu-sub">Checkpoints</h2>
          <ul class="slots" aria-label="Checkpoints">
            <li v-for="r in rows.checkpoints" :key="r.slot">
              <button :id="`cp-${r.slot}`" type="button" class="slot" :aria-label="r.text" :disabled="r.other" @click="loadSlot(r)">
                <span class="slot-label">{{ r.label }}</span><span class="slot-name">{{ r.name }}</span><span class="slot-detail">{{ r.detail }}</span>
              </button>
            </li>
          </ul>
        </template>
        <button :id="`${top}-back`" type="button" class="back" @click="back">Back</button>
      </MenuScreen>

      <MenuScreen v-else-if="top === 'settings'" id="settings-menu" ref="menu" title="Settings" nav="game-ui" :input="inputOf" @back="back">
        <fieldset class="group">
          <legend>Display</legend>
          <div class="row choices" role="radiogroup" aria-label="Renderer setting">
            <span>Renderer</span>
            <button v-for="b in BACKEND_CHOICES" :id="`backend-${b.id}`" :key="b.id" data-nav type="button" role="radio" :aria-checked="(ui.values?.backend ?? 'auto') === b.id" :aria-label="`Renderer ${b.label}`" :class="{ on: (ui.values?.backend ?? 'auto') === b.id }" @click="setBackend(b.id)">{{ b.label }}</button>
          </div>
          <p class="note">Drawing with {{ backendName }}. {{ backendNote }}</p>
          <button v-if="canRestart" id="restart" data-nav type="button" @click="restart">Restart Now</button>
        </fieldset>
        <!-- M5 W3's controls (@vrmxg/game-ui): volume per bus, and rebinding; they keep the player's settings in uiSettings -->
        <fieldset class="group">
          <legend>Sound</legend>
          <VolumeControls v-if="uiSettings" :settings="uiSettings" :audio="host?.audio" :input="inputOf" @back="back" />
        </fieldset>
        <fieldset class="group">
          <legend>Controls</legend>
          <RebindList v-if="uiSettings" :input="inputOf" :settings="uiSettings" :hide="['look_x', 'look_y', 'zoom']" @back="back" />
          <p class="note">Escape or a gamepad's Start pauses.</p>
        </fieldset>
        <p id="settings-status" class="note" role="status" :aria-label="ui.settingsNote || 'Settings unchanged'">{{ ui.settingsNote }}</p>
        <button id="settings-back" data-nav type="button" class="back" @click="back">Back</button>
      </MenuScreen>
    </div>

    <div v-if="ui.question" class="scrim sheet-scrim">
      <MenuScreen id="question" ref="sheet" :title="ui.question.title" @back="ask.reply('cancel')">
        <p class="question-text">{{ ui.question.text }}</p>
        <div class="question-options">
          <button v-for="o in ui.question.options" :id="`answer-${o.id}`" :key="o.id" type="button" @click="ask.reply(o.id)">{{ o.label }}</button>
        </div>
      </MenuScreen>
    </div>

    <p v-if="ui.message" id="message" class="message" role="status" aria-live="polite" :aria-label="ui.message">{{ ui.message }}</p>
    <p v-if="ui.error" id="error" class="message error" role="alert" :aria-label="ui.error">{{ ui.error }}</p>

    <footer class="readouts" aria-live="off">
      <span id="renderer" role="status" :aria-label="`Renderer ${backendName}`">{{ backendName }}</span>
      <span id="screen" role="status" :aria-label="`Screen ${top ?? 'playing'}`">{{ top ?? 'playing' }}</span>
      <span id="scene" role="status" :aria-label="`Scene ${ui.scene ?? 'none'}`">{{ ui.scene ?? '' }}</span>
      <span id="step-count" role="status" :aria-label="`Step ${ui.step}`">{{ ui.step }}</span>
      <span id="safe-step" role="status" :aria-label="`Safe at step ${ui.safeStep}`" class="faint">{{ ui.safeStep }}</span>
      <span id="progress" role="status" :aria-label="ui.dirty ? 'Unsaved progress' : 'Nothing unsaved'">{{ ui.dirty ? 'unsaved' : '' }}</span>
    </footer>
  </main>
</template>

<style>
.frame-stats { position: absolute; left: 8px; bottom: 8px; z-index: 5; padding: 2px 6px; font: 12px/1.4 ui-monospace, monospace; color: #fff; background: rgb(0 0 0 / 55%); border-radius: 4px; pointer-events: none; }
:root { color-scheme: dark; --ink: #eef0f3; --muted: #a3a9b4; --panel: rgba(20, 23, 29, 0.92); --line: rgba(255, 255, 255, 0.14); --accent: #6ea0ff; }
html, body, #app { margin: 0; height: 100%; background: #101216; color: var(--ink); font: 15px/1.45 -apple-system, system-ui, sans-serif; }
.game { position: relative; width: 100%; height: 100%; overflow: hidden; }
#view { position: absolute; inset: 0; width: 100%; height: 100%; display: block; outline: none; }
.scrim { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(8, 10, 14, 0.55); }
.scrim.title { background: radial-gradient(circle at 50% 30%, #233049, #0c0e12 75%); }
.sheet-scrim { background: rgba(8, 10, 14, 0.6); z-index: 5; }
.menu { min-width: 320px; max-width: min(560px, 92vw); max-height: 86vh; overflow: auto; padding: 28px 32px; border-radius: 16px; background: var(--panel); border: 1px solid var(--line); display: flex; flex-direction: column; gap: 10px; }
.menu-title { margin: 0 0 8px; font-size: 26px; font-weight: 650; letter-spacing: 0.01em; }
.menu-sub { margin: 10px 0 0; font-size: 14px; color: var(--muted); font-weight: 600; }
.menu button { font: inherit; color: var(--ink); background: rgba(255, 255, 255, 0.06); border: 1px solid var(--line); border-radius: 10px; padding: 10px 16px; text-align: left; cursor: pointer; }
.menu button:disabled { opacity: 0.45; cursor: default; }
.menu button:focus-visible, .menu button:focus, .menu select:focus, .menu input:focus { outline: 3px solid var(--accent); outline-offset: 2px; }
.menu button small { color: var(--muted); margin-left: 8px; }
.slots { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.slot { width: 100%; display: grid; grid-template-columns: 5.5em 1fr; column-gap: 12px; }
.slot-label { font-weight: 600; grid-row: span 2; }
.slot-detail { color: var(--muted); font-size: 13px; }
.group { border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.group legend { color: var(--muted); padding: 0 6px; }
.row { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.row select, .row input { font: inherit; }
.choices { justify-content: flex-start; gap: 8px; }
.choices span { margin-right: auto; }
.menu .choices button.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 22%, transparent); }
.note { margin: 0; color: var(--muted); font-size: 13px; }
.bindings { display: grid; grid-template-columns: auto 1fr; gap: 2px 14px; margin: 0; font-size: 13px; }
.bindings dt { color: var(--muted); }
.bindings dd { margin: 0; }
.question-text { margin: 0 0 6px; color: var(--muted); }
.question-options { display: flex; flex-direction: column; gap: 8px; }
.message { position: absolute; left: 50%; bottom: 44px; transform: translateX(-50%); margin: 0; padding: 8px 14px; border-radius: 10px; background: var(--panel); border: 1px solid var(--line); z-index: 6; }
.message.error { bottom: 92px; border-color: #d66; }
.loading, .starting { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); padding: 10px 18px; border-radius: 10px; background: var(--panel); z-index: 4; }
.loading.display { top: 18%; max-width: min(80%, 640px); text-align: center; z-index: 6; } /* above the menus: it says why the game is held */
.fatal { position: absolute; inset: auto 24px 64px; padding: 14px 18px; border-radius: 10px; background: #3a1717; border: 1px solid #d66; z-index: 7; }
.readouts .faint { opacity: 0.5; }
.readouts { position: absolute; right: 10px; bottom: 8px; display: flex; gap: 10px; font-size: 11px; color: var(--muted); opacity: 0.75; pointer-events: none; }
</style>
