<script setup>
// The playground's controls. Engine objects stay in the Playground instance (not reactive); this keeps
// plain copies of what the controls show, refreshed when the engine says something changed.
import { onMounted, ref, reactive } from 'vue';
import { Playground, PRESETS } from './engine.js';
import { inShell, call, on } from '../../shell/js/shell.js';

const canvas = ref(null);
const ui = reactive({ shell: '', file: '', loading: true, error: '', playing: false, step: 0, frame: '—', sim: '—', render: '—', cameras: [], camera: '', preset: '', timeScale: 1, interpolate: true, debug: { colliders: false, sensors: false, capsules: false, rays: false }, scene: new URLSearchParams(location.search).get('scene') ?? 'cafe.vrmxs', notes: '', prompt: null, wearing: '', buses: null, audioOn: false, captions: [], slot: 'slot-1', saves: [], saveNote: '', bubbles: [], choices: [], chatText: '', hasDirector: false, showBubbles: true, showCaptions: true });
// the sample's scenes and sequences; ?scene= picks one at load
const SCENES = ['cafe.vrmxs', 'sequences/morning.vrmxs', 'sequences/cafe-morning.vrmxs'];
const BUS_LABELS = { master: 'Master', music: 'Music', ambience: 'Ambience', sfx: 'Effects', voice: 'Voice' };
let pg = null; // never reactive

function refresh() {
  ui.playing = pg.playing; ui.step = pg.stats.step;
  ui.frame = pg.stats.frameMs ? `${pg.stats.frameMs.toFixed(1)} ms · ${pg.stats.fps.toFixed(0)} fps` : '—';
  ui.sim = pg.stats.simMs ? `${pg.stats.simMs.toFixed(2)} ms` : '—';
  ui.render = pg.stats.renderMs ? `${pg.stats.renderMs.toFixed(2)} ms` : '—';
  ui.prompt = pg.prompt(); ui.wearing = pg.wearing();
  ui.buses = pg.busSettings(); ui.audioOn = !!pg.audio?.running; ui.captions = pg.captions();
  ui.bubbles = ui.showBubbles ? pg.bubbles() : []; ui.hasDirector = !!pg.director; ui.choices = pg.choices(); // M3 W6
  const cur = pg.currentCamera(); ui.cameras = pg.cameras(); ui.camera = cur?.id ?? ''; ui.preset = cur?.preset ?? '';
  if (pg.error) ui.error = pg.error;
}

// M3 W6: talking to the character with a director (typed, or a choice); bubbles and captions are presentation only
function say(text) { try { pg.talk(text); } catch (e) { ui.error = String(e?.message ?? e); } refresh(); }
function send() { const t = ui.chatText.trim(); if (!t) return; say(t); ui.chatText = ''; }

async function load() {
  ui.loading = true; ui.error = '';
  try { const r = await pg.load(ui.scene); ui.notes = `${r.nodes} nodes${r.skipped.length ? ` · skipped: ${r.skipped.map((s) => s.node).join(', ')}` : ''}`; }
  catch (e) { ui.error = String(e?.stack ?? e); console.error(e); }
  ui.loading = false; refresh();
}

const mode = new URLSearchParams(location.search).get('mode');
onMounted(async () => {
  pg = new Playground(canvas.value, { preserveDrawingBuffer: mode === 'acceptance' });
  pg.onChange = refresh; window.__playground = pg;
  if (mode !== 'acceptance') { await load(); await listSaves(); return; }
  // M0's exit checks (acceptance/README.md): results for the runners in window.__result, then READY.
  try {
    const r = await pg.acceptance();
    window.__result = { mode, ua: navigator.userAgent, origin: location.protocol, ...r };
    const s = r.simulation, x = r.rendered;
    ui.notes = `acceptance: final ${s.final} · snapshot ${s.snapshot.rerunMatches ? 'identical' : 'DIFFERS'} · rendered = headless ${x.sameAsHeadless} · debug ${x.debug.colliders}+${x.debug.sensors.length}+${x.debug.capsules.length}/${x.debug.physicsColliders}`;
  } catch (e) { window.__errors.push(String(e?.stack ?? e)); ui.error = String(e?.stack ?? e); }
  ui.loading = false; refresh();
  window.READY = true;
});

// In the Mac shell: open and save scenes through the system panels; File menu commands arrive as events.
async function openScene() {
  try {
    const f = await call('file.open', { types: ['vrmxs'], title: 'Open Scene' });
    ui.loading = true; ui.error = '';
    const r = await pg.load('cafe.vrmxs', { text: f.text });
    ui.file = f.path; ui.notes = `${f.name} · ${r.nodes} nodes`;
  } catch (e) { if (e.code !== 'cancelled') ui.error = String(e?.message ?? e); }
  ui.loading = false; refresh();
}
async function saveScene() {
  try {
    const r = await call('file.save', { text: pg.sceneText(), suggestedName: 'cafe.vrmxs', types: ['vrmxs'], title: 'Save Scene' });
    ui.file = r.path; ui.notes = `saved ${r.name} (${r.bytes} bytes)`;
  } catch (e) { if (e.code !== 'cancelled') ui.error = String(e?.message ?? e); }
}
if (inShell) {
  call('shell.info').then((i) => { ui.shell = `${i.app} · shell ${i.shell} · ${i.origin}`; });
  on('menu.open', openScene); on('menu.save', saveScene); on('menu.saveAs', saveScene);
}

const toggle = () => pg.toggle();
const step = () => pg.step();
const replay = () => pg.replay();
const setScale = () => pg.setTimeScale(Number(ui.timeScale));
const setCamera = () => pg.setCamera(ui.camera);
const setPreset = () => pg.setPreset(ui.preset);
const setDebug = () => pg.setDebug({ ...ui.debug });
const setInterp = () => pg.setInterpolation(ui.interpolate);
const setBus = (name, opts) => pg.setBus(name, opts);
// save slots (M2 W9): the shell's saves folder in the Mac app, IndexedDB in a browser
const listSaves = async () => { try { ui.saves = await pg.slots(); } catch (e) { ui.error = String(e?.message ?? e); } };
const saveSlot = async () => { try { const r = await pg.saveSlot(ui.slot); ui.saveNote = `saved ${r.slot} at step ${r.step} (${(r.bytes / 1024).toFixed(0)} KB) · ${r.hash}`; await listSaves(); } catch (e) { ui.error = String(e?.message ?? e); } };
const loadSlot = async () => { ui.loading = true; try { const r = await pg.loadSlot(ui.slot); ui.saveNote = `loaded ${r.slot} at step ${r.step} · ${r.hash}`; } catch (e) { ui.error = String(e?.message ?? e); } ui.loading = false; refresh(); };
const slotLabel = (s) => { const e = ui.saves.find((x) => x.slot === s); return e ? `${s}: ${e.seconds ?? '?'} s` : `${s}: empty`; };
</script>

<template>
  <div class="app">
    <header class="bar" role="toolbar" aria-label="Playground controls">
      <strong class="title">VRMXG Playground</strong>
      <label class="field">Scene
        <select v-model="ui.scene" aria-label="Scene" @change="load"><option v-for="s in SCENES" :key="s" :value="s">{{ s }}</option></select>
      </label>
      <button id="play" type="button" :disabled="ui.loading" :aria-label="ui.playing ? 'Pause' : 'Play'" @click="toggle">{{ ui.playing ? 'Pause' : 'Play' }}</button>
      <button id="step" type="button" :disabled="ui.loading" aria-label="Step" @click="step">Step</button>
      <button id="reset" type="button" :disabled="ui.loading" aria-label="Reset" @click="load">Reset</button>
      <button id="replay" type="button" :disabled="ui.loading" aria-label="Replay demo walk" @click="replay">Replay demo walk</button>
      <button v-if="ui.shell" id="open-scene" type="button" :disabled="ui.loading" aria-label="Open scene" @click="openScene">Open…</button>
      <button v-if="ui.shell" id="save-scene" type="button" :disabled="ui.loading" aria-label="Save scene as" @click="saveScene">Save as…</button>
      <fieldset class="saves" aria-label="Save slots">
        <div class="seg" role="radiogroup" aria-label="Slot">
          <button v-for="s in ['slot-1', 'slot-2', 'slot-3']" :id="`slot-${s.slice(-1)}`" :key="s" type="button" role="radio" :aria-checked="ui.slot === s" :aria-label="slotLabel(s)" :title="slotLabel(s)" :class="{ on: ui.slot === s }" @click="ui.slot = s; listSaves()">{{ s.slice(-1) }}</button>
        </div>
        <button id="save-game" type="button" :disabled="ui.loading" aria-label="Save game" @click="saveSlot">Save</button>
        <button id="load-game" type="button" :disabled="ui.loading || !ui.saves.some((x) => x.slot === ui.slot)" aria-label="Load game" @click="loadSlot">Load</button>
      </fieldset>
      <label class="field">Time scale
        <select v-model="ui.timeScale" aria-label="Time scale" @change="setScale"><option :value="0.25">0.25×</option><option :value="0.5">0.5×</option><option :value="1">1×</option><option :value="2">2×</option></select>
      </label>
      <label class="field">Camera
        <select v-model="ui.camera" aria-label="Camera" @change="setCamera"><option v-for="c in ui.cameras" :key="c" :value="c">{{ c }}</option></select>
      </label>
      <label class="field">Preset
        <select v-model="ui.preset" aria-label="Camera preset" @change="setPreset"><option v-for="p in PRESETS" :key="p" :value="p">{{ p }}</option></select>
      </label>
    </header>
    <main class="stage"><canvas ref="canvas" aria-label="Scene view" tabindex="0"></canvas>
      <p v-if="ui.loading" class="overlay">Loading…</p>
      <pre v-if="ui.error" class="overlay error" role="alert">{{ ui.error }}</pre>
      <div v-if="ui.showBubbles && ui.bubbles.length" id="bubbles" class="bubbles">
        <div v-for="b in ui.bubbles" :key="`${b.actor}-${b.kind}`" class="bubble" :class="[b.kind, { edge: b.edge }]" :style="{ left: `${b.x}px`, top: `${b.y}px` }" role="status" :aria-label="b.kind === 'thinking' ? `${b.name} is thinking` : `${b.name} says: ${b.text}`">
          <span v-if="b.kind === 'thinking'" class="dots" aria-hidden="true"><i></i><i></i><i></i></span>
          <template v-else><strong v-if="b.edge">{{ b.name }}</strong><span v-for="(w, i) in b.words" :key="i" :class="{ said: i < b.spoken, now: i === b.word }">{{ `${w} ` }}</span></template>
        </div>
      </div>
      <form v-if="ui.hasDirector" id="chat" class="chat" aria-label="Talk" @submit.prevent="send">
        <div class="choices" role="group" aria-label="Replies">
          <button v-for="c in ui.choices" :key="c" type="button" class="choice" :aria-label="`Say: ${c}`" @click="say(c)">{{ c }}</button>
        </div>
        <div class="line">
          <input id="chat-input" v-model="ui.chatText" type="text" placeholder="Say something…" aria-label="Say something" autocomplete="off" @keydown.stop @keyup.stop>
          <button id="chat-send" type="submit" aria-label="Send" :disabled="!ui.chatText.trim()">Send</button>
        </div>
      </form>
      <div v-if="ui.showCaptions && ui.captions.length" id="captions" class="captions" role="status" aria-live="polite">
        <p v-for="c in ui.captions" :key="c.actor" :aria-label="`${c.name}: ${c.text}`"><strong>{{ c.name }}</strong> <span v-for="(w, i) in c.words" :key="i" :class="{ said: i < c.spoken, now: i === c.word }">{{ `${w} ` }}</span></p>
      </div>
      <p v-if="ui.prompt" id="prompt" class="prompt" role="status" :aria-label="`Press ${ui.prompt.key} to ${ui.prompt.text}`"><kbd>{{ ui.prompt.key }}</kbd> {{ ui.prompt.text }}</p>
    </main>
    <footer class="bar status">
      <fieldset class="toggles"><legend>Debug draw</legend>
        <label><input type="checkbox" v-model="ui.debug.colliders" aria-label="Colliders" @change="setDebug"> Colliders</label>
        <label><input type="checkbox" v-model="ui.debug.sensors" aria-label="Sensors" @change="setDebug"> Sensors</label>
        <label><input type="checkbox" v-model="ui.debug.capsules" aria-label="Capsules" @change="setDebug"> Capsules</label>
        <label><input type="checkbox" v-model="ui.debug.rays" aria-label="Rays" @change="setDebug"> Rays</label>
        <label><input type="checkbox" v-model="ui.interpolate" aria-label="Interpolate" @change="setInterp"> Interpolate</label>
        <label><input id="show-bubbles" type="checkbox" v-model="ui.showBubbles" aria-label="Speech bubbles" @change="refresh"> Bubbles</label>
        <label><input id="show-captions" type="checkbox" v-model="ui.showCaptions" aria-label="Captions" @change="refresh"> Captions</label>
      </fieldset>
      <!-- Each readout's accessible name carries its value ("Frame time 16.7 ms · 60 fps"), so AppProbe reads it in one find. -->
      <output v-if="ui.saveNote" id="save-note" :aria-label="ui.saveNote">{{ ui.saveNote }}</output>
      <dl class="readout">
        <div><dt id="frame-time-label">Frame time</dt><dd><output id="frame-time" :aria-label="`Frame time ${ui.frame}`">{{ ui.frame }}</output></dd></div>
        <div><dt id="sim-time-label">Simulation</dt><dd><output id="sim-time" :aria-label="`Simulation ${ui.sim}`">{{ ui.sim }}</output></dd></div>
        <div><dt id="render-time-label">Render</dt><dd><output id="render-time" :aria-label="`Render ${ui.render}`">{{ ui.render }}</output></dd></div>
        <div><dt id="step-label">Step</dt><dd><output id="step-count" :aria-label="`Step ${ui.step}`">{{ ui.step }}</output></dd></div>
      </dl>
      <fieldset v-if="ui.buses" class="mixer" aria-label="Mixer"><legend>Sound{{ ui.audioOn ? '' : ' (click to start)' }}</legend>
        <label v-for="(label, name) in BUS_LABELS" :key="name" class="bus" :title="label">
          <span>{{ label }}</span>
          <input type="range" min="0" max="1" step="0.05" :value="ui.buses[name].volume" :aria-label="`${label} volume`" @input="setBus(name, { volume: Number($event.target.value) })">
          <input type="checkbox" :checked="ui.buses[name].muted" :aria-label="`Mute ${label}`" @change="setBus(name, { muted: $event.target.checked })">
        </label>
      </fieldset>
      <span id="notes" class="notes" :aria-label="ui.notes">{{ ui.notes }} · WASD move, Shift run, Space jump, E interact, C camera</span>
      <span v-if="ui.wearing" id="wearing" class="notes" :aria-label="`Mira wears ${ui.wearing}`">Wearing: {{ ui.wearing }}</span>
      <span v-if="ui.shell" id="shell-info" class="notes" :aria-label="`Shell ${ui.shell}`">{{ ui.shell }}</span>
    </footer>
  </div>
</template>

<style>
:root { color-scheme: light dark; --bg: #f4f5f7; --panel: #ffffff; --ink: #1d2128; --muted: #5f6672; --line: #d9dde3; --accent: #2f6fde; }
@media (prefers-color-scheme: dark) { :root { --bg: #15171b; --panel: #1e2127; --ink: #e8eaee; --muted: #9aa1ad; --line: #30353d; --accent: #5b8ff0; } }
html, body, #app { margin: 0; height: 100%; background: var(--bg); color: var(--ink); font: 13px/1.4 -apple-system, system-ui, sans-serif; }
.app { display: grid; grid-template-rows: auto 1fr auto; height: 100%; }
.bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 8px 12px; background: var(--panel); border-bottom: 1px solid var(--line); }
.status { border-top: 1px solid var(--line); border-bottom: 0; justify-content: space-between; }
.title { margin-right: 6px; }
.field { display: flex; align-items: center; gap: 6px; color: var(--muted); }
button, select { font: inherit; color: var(--ink); background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 4px 10px; }
button#play { background: var(--accent); color: #fff; border-color: var(--accent); min-width: 64px; }
button:disabled { opacity: 0.5; }
.stage { position: relative; min-height: 0; }
canvas { display: block; width: 100%; height: 100%; outline: none; }
.overlay { position: absolute; left: 12px; top: 8px; margin: 0; padding: 6px 10px; background: color-mix(in srgb, var(--panel) 85%, transparent); border-radius: 6px; }
.error { color: #c0392b; white-space: pre-wrap; max-width: 80%; max-height: 60%; overflow: auto; }
.toggles { display: flex; gap: 10px; border: 0; margin: 0; padding: 0; }
.toggles legend { float: left; margin-right: 6px; color: var(--muted); }
.readout { display: flex; gap: 14px; margin: 0; }
.readout div { display: flex; gap: 6px; }
.readout dt { color: var(--muted); }
.readout dd { margin: 0; font-variant-numeric: tabular-nums; min-width: 4.5em; }
.notes { color: var(--muted); }
.mixer { display: flex; gap: 10px; border: 0; margin: 0; padding: 0; align-items: center; } .mixer legend { float: left; margin-right: 6px; color: var(--muted); }
.mixer .bus { display: flex; align-items: center; gap: 4px; font-size: 12px; } .mixer input[type=range] { width: 64px; }
/* M3 W6: speech bubbles over the speakers, and the chat */
.bubbles { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.bubble { position: absolute; transform: translate(-50%, calc(-100% - 10px)); max-width: 280px; padding: 8px 12px; border-radius: 14px; background: #fffdf7; color: #1d1f24; font-size: 15px; line-height: 1.35; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25); }
.bubble::after { content: ''; position: absolute; left: 50%; bottom: -8px; transform: translateX(-50%); border: 8px solid transparent; border-bottom: 0; border-top-color: #fffdf7; }
.bubble span { opacity: 0.45; } .bubble span.said, .bubble span.now { opacity: 1; }
.bubble.thinking { padding: 10px 14px; }
.bubble.edge::after { display: none; } .bubble.edge { outline: 1px solid rgba(0, 0, 0, 0.12); }
.bubble strong { margin-right: 4px; }
.dots { display: inline-flex; gap: 4px; } .dots i { width: 6px; height: 6px; border-radius: 50%; background: #6b7280; animation: dot 1.1s infinite ease-in-out; } .dots i:nth-child(2) { animation-delay: 0.15s; } .dots i:nth-child(3) { animation-delay: 0.3s; }
@keyframes dot { 0%, 80%, 100% { opacity: 0.25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
@media (prefers-reduced-motion: reduce) { .dots i { animation: none; opacity: 0.7; } }
.chat { position: absolute; left: 16px; bottom: 16px; width: min(420px, calc(100% - 32px)); display: flex; flex-direction: column; gap: 8px; }
.chat .choices { display: flex; flex-wrap: wrap; gap: 6px; }
.chat .choice { padding: 5px 10px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.35); background: rgba(10, 12, 16, 0.6); color: #f2f2f2; font-size: 13px; cursor: pointer; }
.chat .line { display: flex; gap: 6px; }
.chat input { flex: 1; min-width: 0; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.35); background: rgba(10, 12, 16, 0.72); color: #f2f2f2; font-size: 15px; }
.captions { position: absolute; left: 50%; bottom: 6%; transform: translateX(-50%); max-width: 70%; text-align: center; pointer-events: none; }
.captions p { margin: 4px 0; padding: 6px 12px; border-radius: 8px; background: rgba(10, 12, 16, 0.72); color: #f2f2f2; font-size: 16px; }
.captions span { opacity: 0.55; } .captions span.said, .captions span.now { opacity: 1; } .captions span.now { color: #ffd76a; }
.prompt { position: absolute; left: 50%; bottom: 18%; transform: translateX(-50%); margin: 0; padding: 6px 12px; border-radius: 8px; background: color-mix(in srgb, var(--panel) 88%, transparent); font-size: 15px; pointer-events: none; }
.prompt kbd { display: inline-block; min-width: 1.4em; padding: 1px 6px; margin-right: 6px; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 5px; background: var(--bg); font: 600 13px/1.4 -apple-system, system-ui, sans-serif; text-align: center; }
.saves { display: flex; align-items: center; gap: 4px; border: 0; margin: 0; padding: 0; }
.seg { display: inline-flex; } .seg button { border-radius: 0; margin-left: -1px; min-width: 26px; } .seg button:first-child { border-radius: 6px 0 0 6px; } .seg button:last-child { border-radius: 0 6px 6px 0; }
.seg button.on { background: #2f6fde; color: #fff; border-color: #2f6fde; }
</style>
