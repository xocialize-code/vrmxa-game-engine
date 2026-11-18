<script setup>
// The playground's controls. Engine objects stay in the Playground instance (not reactive); this keeps
// plain copies of what the controls show, refreshed when the engine says something changed.
import { onMounted, ref, reactive } from 'vue';
import { Playground, PRESETS } from './engine.js';
import { inShell, call, on } from '../../shell/js/shell.js';

const canvas = ref(null);
const ui = reactive({ shell: '', file: '', loading: true, error: '', playing: false, step: 0, frame: '—', sim: '—', render: '—', cameras: [], camera: '', preset: '', timeScale: 1, interpolate: true, debug: { colliders: false, sensors: false, capsules: false, rays: false }, scene: 'cafe.vrmxs', notes: '' });
let pg = null; // never reactive

function refresh() {
  ui.playing = pg.playing; ui.step = pg.stats.step;
  ui.frame = pg.stats.frameMs ? `${pg.stats.frameMs.toFixed(1)} ms · ${pg.stats.fps.toFixed(0)} fps` : '—';
  ui.sim = pg.stats.simMs ? `${pg.stats.simMs.toFixed(2)} ms` : '—';
  ui.render = pg.stats.renderMs ? `${pg.stats.renderMs.toFixed(2)} ms` : '—';
  const cur = pg.currentCamera(); ui.cameras = pg.cameras(); ui.camera = cur?.id ?? ''; ui.preset = cur?.preset ?? '';
  if (pg.error) ui.error = pg.error;
}

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
  if (mode !== 'acceptance') { await load(); return; }
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
</script>

<template>
  <div class="app">
    <header class="bar" role="toolbar" aria-label="Playground controls">
      <strong class="title">VRMXG Playground</strong>
      <label class="field">Scene
        <select v-model="ui.scene" aria-label="Scene" @change="load"><option value="cafe.vrmxs">cafe.vrmxs</option></select>
      </label>
      <button id="play" type="button" :disabled="ui.loading" :aria-label="ui.playing ? 'Pause' : 'Play'" @click="toggle">{{ ui.playing ? 'Pause' : 'Play' }}</button>
      <button id="step" type="button" :disabled="ui.loading" aria-label="Step" @click="step">Step</button>
      <button id="reset" type="button" :disabled="ui.loading" aria-label="Reset" @click="load">Reset</button>
      <button id="replay" type="button" :disabled="ui.loading" aria-label="Replay demo walk" @click="replay">Replay demo walk</button>
      <button v-if="ui.shell" id="open-scene" type="button" :disabled="ui.loading" aria-label="Open scene" @click="openScene">Open…</button>
      <button v-if="ui.shell" id="save-scene" type="button" :disabled="ui.loading" aria-label="Save scene as" @click="saveScene">Save as…</button>
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
    </main>
    <footer class="bar status">
      <fieldset class="toggles"><legend>Debug draw</legend>
        <label><input type="checkbox" v-model="ui.debug.colliders" aria-label="Colliders" @change="setDebug"> Colliders</label>
        <label><input type="checkbox" v-model="ui.debug.sensors" aria-label="Sensors" @change="setDebug"> Sensors</label>
        <label><input type="checkbox" v-model="ui.debug.capsules" aria-label="Capsules" @change="setDebug"> Capsules</label>
        <label><input type="checkbox" v-model="ui.debug.rays" aria-label="Rays" @change="setDebug"> Rays</label>
        <label><input type="checkbox" v-model="ui.interpolate" aria-label="Interpolate" @change="setInterp"> Interpolate</label>
      </fieldset>
      <!-- Each readout's accessible name carries its value ("Frame time 16.7 ms · 60 fps"), so AppProbe reads it in one find. -->
      <dl class="readout">
        <div><dt id="frame-time-label">Frame time</dt><dd><output id="frame-time" :aria-label="`Frame time ${ui.frame}`">{{ ui.frame }}</output></dd></div>
        <div><dt id="sim-time-label">Simulation</dt><dd><output id="sim-time" :aria-label="`Simulation ${ui.sim}`">{{ ui.sim }}</output></dd></div>
        <div><dt id="render-time-label">Render</dt><dd><output id="render-time" :aria-label="`Render ${ui.render}`">{{ ui.render }}</output></dd></div>
        <div><dt id="step-label">Step</dt><dd><output id="step-count" :aria-label="`Step ${ui.step}`">{{ ui.step }}</output></dd></div>
      </dl>
      <span id="notes" class="notes" :aria-label="ui.notes">{{ ui.notes }} · WASD move, Shift run, Space jump, C camera</span>
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
</style>
