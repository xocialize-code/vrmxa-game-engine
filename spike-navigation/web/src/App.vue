<script setup>
// Two modes from the query string:
//   (default)      the stage: navmesh debug draw + a crowd on Rapier controllers.
//                  ?backend=recast|navcat&agents=50&draw=ours|library
//   ?autorun=1     no stage; runs the measurement suite, shows it, and posts the JSON to the wrapper
//                  (webkit.messageHandlers.spike) and to window.__spikeResults. &save=<name> writes
//                  results/<name>.json through the dev server; &only=recast|navcat; &rapier=0.
import { ref, shallowRef, onMounted, onBeforeUnmount, markRaw, computed } from 'vue';
import { runSuite, environment } from './sim/tests.js';

const params = new URLSearchParams(location.search);
const autorun = params.get('autorun') === '1';
const backend = ref(params.get('backend') || 'recast');
const agents = ref(+(params.get('agents') || 50));
const draw = ref(params.get('draw') || 'ours');

const canvas = ref(null);
const stats = shallowRef(null);
const logLines = ref([]);
const results = shallowRef(null);
const error = ref('');
const env = environment();
let stage = null; // never reactive: Vue's proxies would wrap WASM handles

const bridge = window.webkit?.messageHandlers?.spike;
const post = (type, payload) => { try { bridge?.postMessage(JSON.stringify({ type, payload })); } catch { /* not in the wrapper */ } };

function reloadWith(key, value) {
  const p = new URLSearchParams(location.search);
  p.set(key, value);
  location.search = p.toString();
}

async function runTests() {
  try {
    const only = params.get('only');
    const r = await runSuite({
      backends: only ? [only] : ['recast', 'navcat'],
      rapier: params.get('rapier') !== '0',
      log: (m) => { logLines.value = [...logLines.value, m]; post('log', m); },
    });
    results.value = markRaw(r);
    window.__spikeResults = r;
    post('results', r);
    if (params.get('save')) fetch(`__results?name=${encodeURIComponent(params.get('save'))}`, { method: 'POST', body: JSON.stringify(r) }).catch(() => {});
  } catch (e) {
    error.value = String(e?.stack ?? e);
    post('error', error.value);
  }
}

const table = computed(() => {
  const r = results.value;
  if (!r) return [];
  return Object.entries(r.backends).map(([k, b]) => b.error ? { k, error: b.error } : {
    k,
    bake: `${b.bake.solo.warmMedianMs} / ${b.bake.tiled.warmMedianMs}`,
    door: `${b.door.closeMs.p50} / ${b.door.openMs.p50}`,
    c10: b.crowd[10] && `${b.crowd[10].timing.mean} · ${b.crowd[10].hash}`,
    c50: b.crowd[50] && `${b.crowd[50].timing.mean} · ${b.crowd[50].hash}`,
    c200: b.crowd[200] && `${b.crowd[200].timing.mean} · ${b.crowd[200].hash}`,
    rep: Object.values(b.crowd).every((c) => c.repeatable),
    coupled: b.coupled ? `${b.coupled['200-sync'].timing.total.mean} · ${b.coupled['200-sync'].hash}` : '',
  });
});

onMounted(async () => {
  window.addEventListener('error', (e) => post('error', String(e.message)));
  if (autorun) { await runTests(); return; }
  const { Stage } = await import('./stage/stage.js');
  stage = markRaw(new Stage(canvas.value, {
    backend: backend.value, agents: agents.value, draw: draw.value, door: params.get('door') === '1', cam: params.get('cam') || 'overview',
    onStats: (s) => { stats.value = s; },
  }));
  window.__stage = stage;
  try {
    await stage.start();
    post('ready', { backend: backend.value, agents: agents.value });
  } catch (e) {
    error.value = String(e?.stack ?? e);
    post('error', error.value);
  }
});
onBeforeUnmount(() => stage?.dispose());
</script>

<template>
  <main v-if="autorun" class="report">
    <h1>VRMXG navigation spike: test run</h1>
    <p class="env">
      <span>origin <b>{{ env.origin }}</b></span>
      <span>cross-origin isolated <b>{{ env.crossOriginIsolated }}</b></span>
      <span>SharedArrayBuffer <b>{{ env.sharedArrayBuffer }}</b></span>
      <span>timer <b>{{ env.timerResolutionMs }} ms</b></span>
    </p>
    <ul class="log"><li v-for="(l, i) in logLines" :key="i">{{ l }}</li></ul>
    <table v-if="table.length">
      <thead><tr><th>library</th><th>bake solo / tiled ms</th><th>door close / open ms</th><th>crowd 10 ms · hash</th><th>crowd 50</th><th>crowd 200</th><th>repeatable</th><th>200 on Rapier ms · hash</th></tr></thead>
      <tbody>
        <tr v-for="row in table" :key="row.k">
          <td>{{ row.k }}</td>
          <template v-if="row.error"><td colspan="7" class="bad">{{ row.error }}</td></template>
          <template v-else>
            <td>{{ row.bake }}</td><td>{{ row.door }}</td><td><code>{{ row.c10 }}</code></td><td><code>{{ row.c50 }}</code></td><td><code>{{ row.c200 }}</code></td>
            <td :class="row.rep ? '' : 'bad'">{{ row.rep }}</td><td><code>{{ row.coupled }}</code></td>
          </template>
        </tr>
      </tbody>
    </table>
    <pre v-if="error" class="bad">{{ error }}</pre>
  </main>

  <div v-else class="stage-wrap">
    <canvas ref="canvas" class="stage"></canvas>
    <aside class="hud">
      <h1>VRMXG navigation spike</h1>
      <label>Library
        <select :value="backend" @change="reloadWith('backend', $event.target.value)">
          <option value="recast">recast-navigation 0.44 (WASM)</option>
          <option value="navcat">navcat 0.4.1 (JS)</option>
        </select>
      </label>
      <label>Agents
        <select :value="agents" @change="reloadWith('agents', $event.target.value)">
          <option v-for="n in [10, 50, 200]" :key="n" :value="n">{{ n }}</option>
        </select>
      </label>
      <label>Debug draw
        <select :value="draw" @change="reloadWith('draw', $event.target.value)">
          <option value="ours">navmesh triangles (engine-side)</option>
          <option value="library">the library's three.js helper</option>
        </select>
      </label>
      <dl v-if="stats">
        <dt>bake</dt><dd>{{ stats.bakeMs }} ms · {{ stats.polys }} polys · {{ stats.tiles }} tiles</dd>
        <dt>crowd</dt><dd>{{ stats.crowdMs }} ms / step</dd>
        <dt>controllers + physics</dt><dd>{{ stats.physicsMs }} ms / step</dd>
        <dt>fps</dt><dd>{{ stats.fps }}</dd>
        <dt>door</dt><dd>{{ stats.door ? 'closed' : 'open' }} · last toggle {{ stats.doorMs }} ms</dd>
        <dt>drift</dt><dd>mean {{ stats.drift }} m</dd>
      </dl>
      <p class="help"><button @click="stage?.toggleDoor()">Toggle door (D)</button> · click the ground to send every agent there · drag orbits · wheel zooms</p>
      <p class="help"><a href="?autorun=1">Run the test suite</a></p>
      <pre v-if="error" class="bad">{{ error }}</pre>
    </aside>
  </div>
</template>
