<script setup>
// Two modes from the query string:
//   ?autorun=1   runs the measurement suite (src/char/suite.js), shows a summary, posts the JSON to
//                the wrapper (webkit.messageHandlers.spike) and to window.__spikeResults.
//                &parts=determinism,snapshot  &models=spec,vroid10  &save=<name> (dev server writes ../results)
//   (default)    a viewer: the scripted shot on one model with real textures, stepped at a fixed
//                1/60 s. ?model=spec|vroid10|vroid0x|seed  &mode=native|dmath|nlerp
import { ref, shallowRef, onMounted, onBeforeUnmount, markRaw } from 'vue';
import { runSuite, environment, MODEL_FILES, CLIP_FILES, MODES } from './char/suite.js';

const params = new URLSearchParams(location.search);
const autorun = params.get('autorun') === '1';
const canvas = ref(null);
const logLines = ref([]);
const summary = shallowRef([]);
const error = ref('');
const hud = shallowRef(null);
const env = environment();
let viewer = null;

const bridge = window.webkit?.messageHandlers?.spike;
const post = (type, payload) => { try { bridge?.postMessage(JSON.stringify({ type, payload })); } catch { /* not in the wrapper */ } };
const fetchBuf = async (f) => { const r = await fetch(`models/${f}`); if (!r.ok) throw new Error(`${f}: ${r.status}`); return r.arrayBuffer(); };

async function runTests() {
  try {
    const models = params.get('models')?.split(',') ?? Object.keys(MODEL_FILES);
    const assets = {
      models: Object.fromEntries(await Promise.all(models.map(async (k) => [k, await fetchBuf(MODEL_FILES[k])]))),
      clips: Object.fromEntries(await Promise.all(Object.entries(CLIP_FILES).map(async ([k, f]) => [k, await fetchBuf(f)]))),
    };
    const parts = params.get('parts')?.split(',');
    const r = await runSuite({ assets, ...(parts ? { parts } : {}), log: (m) => { logLines.value = [...logLines.value, m]; post('log', m); } });
    window.__spikeResults = r;
    summary.value = Object.entries(r.models ?? {}).flatMap(([m, x]) => Object.entries(x.modes).map(([mode, y]) => ({ m, mode, mixer: y.mixer.final, springs: y.springs.final, full: y.full.final, timeline: y.timeline.final, repeatable: y.repeatable })));
    post('results', r);
    if (params.get('save')) await fetch(`__results?name=${encodeURIComponent(params.get('save'))}`, { method: 'POST', body: JSON.stringify(r) }).catch(() => {});
    window.__spikeDone = true;
  } catch (e) {
    error.value = String(e?.stack ?? e);
    window.__spikeError = error.value;
    post('error', error.value);
  }
}

onMounted(async () => {
  window.addEventListener('error', (e) => post('error', String(e.message)));
  if (autorun) { await runTests(); return; }
  try {
    const { Viewer } = await import('./viewer.js');
    const model = params.get('model') || 'spec';
    const mode = params.get('mode') || 'native';
    if (!MODES[mode]) throw new Error(`unknown mode ${mode}`);
    MODES[mode].install();
    viewer = markRaw(new Viewer(canvas.value, { onStats: (s) => { hud.value = s; } }));
    await viewer.start(await fetchBuf(MODEL_FILES[model]), Object.fromEntries(await Promise.all(Object.entries(CLIP_FILES).map(async ([k, f]) => [k, await fetchBuf(f)]))));
    window.__viewer = viewer;
    post('ready', { model, mode });
  } catch (e) {
    error.value = String(e?.stack ?? e);
    post('error', error.value);
  }
});
onBeforeUnmount(() => viewer?.dispose());
</script>

<template>
  <main v-if="autorun" class="report">
    <h1>VRMXG determinism spike: test run</h1>
    <p class="env"><span>runtime <b>{{ env.runtime }}</b></span><span>origin <b>{{ env.origin }}</b></span><span>timer <b>{{ env.timerResolutionMs }} ms</b></span></p>
    <ul class="log"><li v-for="(l, i) in logLines" :key="i">{{ l }}</li></ul>
    <table v-if="summary.length">
      <thead><tr><th>model</th><th>mode</th><th>mixer</th><th>springs</th><th>full</th><th>timeline</th><th>repeatable</th></tr></thead>
      <tbody><tr v-for="row in summary" :key="row.m + row.mode"><td>{{ row.m }}</td><td>{{ row.mode }}</td><td><code>{{ row.mixer }}</code></td><td><code>{{ row.springs }}</code></td><td><code>{{ row.full }}</code></td><td><code>{{ row.timeline }}</code></td><td :class="row.repeatable ? '' : 'bad'">{{ row.repeatable }}</td></tr></tbody>
    </table>
    <pre v-if="error" class="bad">{{ error }}</pre>
  </main>
  <div v-else class="stage-wrap">
    <canvas ref="canvas" class="stage"></canvas>
    <aside class="hud">
      <h1>VRMXG determinism spike</h1>
      <dl v-if="hud"><dt>step</dt><dd>{{ hud.k }} / 600</dd><dt>sim</dt><dd>{{ hud.simMs }} ms</dd><dt>springs</dt><dd>{{ hud.springs }} joints</dd><dt>VRM</dt><dd>{{ hud.version }}</dd></dl>
      <p class="help">The scripted shot loops every 600 steps. <a href="?autorun=1">Run the test suite</a></p>
      <pre v-if="error" class="bad">{{ error }}</pre>
    </aside>
  </div>
</template>
