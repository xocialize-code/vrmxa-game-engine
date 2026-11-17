<script setup>
// Two modes from the query string:
//   (default)      the interactive stage: ?variant=standard|simd|deterministic&avatar=spec|vroid10|vroid0x
//   ?autorun=1     no stage; runs the measurement suite, shows it, and posts the JSON to the wrapper
//                  (webkit.messageHandlers.spike) and to window.__spikeResults. &jolt=0 skips Jolt.
import { ref, shallowRef, onMounted, onBeforeUnmount, markRaw, computed } from 'vue';
import { runSuite, environment } from './sim/tests.js';

const params = new URLSearchParams(location.search);
const autorun = params.get('autorun') === '1';
const variant = ref(params.get('variant') || 'deterministic');
const avatarKey = ref(params.get('avatar') || 'spec');

const canvas = ref(null);
const stats = shallowRef(null); // plain numbers only, replaced wholesale
const manifest = shallowRef({ avatars: [], motions: {} });
const logLines = ref([]);
const results = shallowRef(null);
const error = ref('');
const env = environment();
let stage = null; // never reactive: Vue's proxies would wrap Rapier's WASM handles

const bridge = window.webkit?.messageHandlers?.spike;
const post = (type, payload) => { try { bridge?.postMessage(JSON.stringify({ type, payload })); } catch { /* not in the wrapper */ } };

function reloadWith(key, value) {
  const p = new URLSearchParams(location.search);
  p.set(key, value);
  location.search = p.toString();
}

async function runTests() {
  logLines.value = [];
  results.value = null;
  try {
    const r = await runSuite({
      jolt: params.get('jolt') !== '0',
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
  const rows = Object.entries(r.rapier).map(([v, x]) =>
    x.error
      ? { variant: v, error: x.error }
      : {
          variant: v,
          hashFull: x.full.hash,
          hashNoCloth: x.noCloth.hash,
          repeatable: x.full.repeatable && x.noCloth.repeatable,
          snapshot: x.snapshot.identical && x.snapshotNoCloth.identical,
          full: `${x.timing.full.mean} / ${x.timing.full.p95}`,
          boxesAwake: x.timing.boxesOnly.allAwake60,
        },
  );
  if (r.jolt) rows.push({ variant: 'jolt (ST)', error: r.jolt.error, boxesAwake: r.jolt.allAwake60 });
  return rows;
});

onMounted(async () => {
  window.addEventListener('error', (e) => post('error', String(e.message)));
  if (autorun) {
    await runTests();
    return;
  }
  try {
    manifest.value = await (await fetch('models/models.json')).json();
  } catch { /* no models copied: capsule only */ }
  const av = manifest.value.avatars.find((a) => a.key === avatarKey.value) ?? manifest.value.avatars[0];
  const { Stage } = await import('./stage/stage.js');
  stage = markRaw(new Stage(canvas.value, {
    variant: variant.value,
    avatar: av?.url ?? null,
    motions: manifest.value.motions,
    onStats: (s) => { stats.value = s; },
  }));
  window.__stage = stage; // for poking at it from the console / tests
  try {
    await stage.start();
    post('ready', { variant: variant.value, avatar: av?.key ?? null });
  } catch (e) {
    error.value = String(e?.stack ?? e);
    post('error', error.value);
  }
});
onBeforeUnmount(() => stage?.dispose());
</script>

<template>
  <main v-if="autorun" class="report">
    <h1>VRMXG physics spike: test run</h1>
    <p class="env">
      <span>origin <b>{{ env.origin }}</b></span>
      <span>secure context <b>{{ env.isSecureContext }}</b></span>
      <span>cross-origin isolated <b>{{ env.crossOriginIsolated }}</b></span>
      <span>SharedArrayBuffer <b>{{ env.sharedArrayBuffer }}</b></span>
    </p>
    <ul class="log"><li v-for="(l, i) in logLines" :key="i">{{ l }}</li></ul>
    <table v-if="table.length">
      <thead><tr><th>build</th><th>hash full</th><th>hash no cloth</th><th>repeatable</th><th>snapshot ok</th><th>full step mean / p95 ms</th><th>300 boxes awake ms</th></tr></thead>
      <tbody>
        <tr v-for="row in table" :key="row.variant">
          <td>{{ row.variant }}</td>
          <template v-if="row.error && !row.boxesAwake"><td colspan="6" class="bad">{{ row.error }}</td></template>
          <template v-else>
            <td><code>{{ row.hashFull }}</code></td><td><code>{{ row.hashNoCloth }}</code></td>
            <td :class="row.repeatable === false ? 'bad' : ''">{{ row.repeatable ?? '' }}</td>
            <td :class="row.snapshot === false ? 'bad' : ''">{{ row.snapshot ?? '' }}</td>
            <td>{{ row.full ?? '' }}</td><td>{{ row.boxesAwake }}</td>
          </template>
        </tr>
      </tbody>
    </table>
    <pre v-if="error" class="bad">{{ error }}</pre>
  </main>

  <div v-else class="stage-wrap">
    <canvas ref="canvas" class="stage"></canvas>
    <aside class="hud">
      <h1>VRMXG physics spike</h1>
      <label>Rapier build
        <select :value="variant" @change="reloadWith('variant', $event.target.value)">
          <option value="deterministic">deterministic</option>
          <option value="standard">standard</option>
          <option value="simd">simd</option>
        </select>
      </label>
      <label v-if="manifest.avatars.length">Avatar
        <select :value="avatarKey" @change="reloadWith('avatar', $event.target.value)">
          <option v-for="a in manifest.avatars" :key="a.key" :value="a.key">{{ a.label }}</option>
        </select>
      </label>
      <dl v-if="stats">
        <dt>step</dt><dd>{{ stats.stepMs }} ms (max {{ stats.stepMaxMs }})</dd>
        <dt>fps</dt><dd>{{ stats.fps }}</dd>
        <dt>bodies</dt><dd>{{ stats.awake }} awake / {{ stats.bodies }}</dd>
        <dt>grounded</dt><dd>{{ stats.grounded }}</dd>
        <dt>door</dt><dd>{{ stats.doorOpen ? 'open' : 'closed' }} · {{ stats.doorAngle }} rad</dd>
        <dt>rapier</dt><dd>{{ stats.rapier }}</dd>
        <template v-if="stats.avatar"><dt>avatar</dt><dd>VRM {{ stats.avatar.version }} · {{ stats.avatar.springJoints }} spring joints</dd></template>
        <template v-if="stats.lastPoke"><dt>last click</dt><dd>{{ stats.lastPoke.kind }} body · {{ stats.lastPoke.dynamic ? 'pushed' : 'not pushed' }} · {{ stats.lastPoke.toi }} m</dd></template>
      </dl>
      <p class="help">WASD / arrows move · Space jumps · drag to orbit · wheel zooms · click a box to push it (Rapier ray cast)</p>
      <p class="help">Walk into the green volume to open the door. <a href="?autorun=1">Run the test suite</a></p>
      <pre v-if="error" class="bad">{{ error }}</pre>
    </aside>
  </div>
</template>
