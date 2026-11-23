<script setup>
// The render queue panel (M4 W5): queue the open short with a preset, run the queue, and see each job's state. It
// draws @vrmxg/editor-core's RenderQueue (plain copies of its jobs) and emits what the person asks for; which runner
// renders is the app's choice (the creator's delivery through the shell, or the stub).
// M4 W10: the presets in two groups (the film alone; deliveries at 24 fps with stills, thumbnails and turntables), the
// extras a delivery renders, the backend a job draws on (the view's, or WebGL as a per-export choice) and the redraw
// check (each frame drawn twice and compared: slower, opt-in).
import { reactive, computed } from 'vue';
import { PRESETS } from '@vrmxg/editor-core';
import { jobStatus, queueSpec } from './storyboard-ui.js';

const props = defineProps({
  jobs: { type: Array, default: () => [] },
  runner: { type: String, default: '' },
  canAdd: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['add', 'run', 'cancel', 'remove', 'retry', 'move']);
const form = reactive({ preset: 'draft', name: '', backend: '', check: false, stills: true, thumbnails: true, turntable: true });
const film = Object.keys(PRESETS).filter((k) => !PRESETS[k].delivery);
// the delivery presets as a grid, a row per codec and a column per size (the panel is narrow)
const CODEC_NAMES = { h264: 'H.264', hevc: 'HEVC', prores4444: 'ProRes 4444 α' };
const deliveryRows = [...new Set(Object.values(PRESETS).filter((p) => p.delivery).map((p) => p.codec))]
  .map((codec) => [codec, Object.keys(PRESETS).filter((k) => PRESETS[k].delivery && PRESETS[k].codec === codec)]);
const sizeLabel = (k) => (PRESETS[k].size === '4k' ? '4K24' : `${PRESETS[k].size}24`);
const delivery = computed(() => !!PRESETS[form.preset]?.delivery);
const backends = [['', 'view\'s backend'], ['webgpu', 'WebGPU'], ['webgl', 'WebGL']];
const running = () => props.jobs.some((j) => j.state === 'running');
const queued = () => props.jobs.some((j) => j.state === 'queued');
</script>

<template>
  <section class="queue" aria-label="Render queue">
    <div class="q-head">
      <h2>Render queue</h2>
      <output id="q-runner" class="muted" :aria-label="`Runner ${runner}`">{{ runner }}</output>
    </div>
    <div class="q-form">
      <div class="seg" role="radiogroup" aria-label="Film presets">
        <span class="q-group muted">Film</span>
        <button v-for="k in film" :id="`q-preset-${k}`" :key="k" type="button" role="radio" :aria-checked="form.preset === k" :aria-label="`Preset ${PRESETS[k].label}`" :title="PRESETS[k].label" :class="{ on: form.preset === k }" :disabled="disabled" @click="form.preset = k">{{ k }}</button>
      </div>
      <div class="q-grid" role="radiogroup" aria-label="Delivery presets">
        <span class="q-group muted">Delivery</span>
        <template v-for="[codec, keys] in deliveryRows" :key="codec">
          <span class="q-codec">{{ CODEC_NAMES[codec] ?? codec }}</span>
          <button v-for="k in keys" :id="`q-preset-${k}`" :key="k" type="button" role="radio" :aria-checked="form.preset === k" :aria-label="`Preset ${PRESETS[k].label}`" :title="PRESETS[k].label" :class="{ on: form.preset === k }" :disabled="disabled" @click="form.preset = k">{{ sizeLabel(k) }}</button>
        </template>
      </div>
      <div class="q-opts">
        <label v-if="delivery" class="q-opt"><input id="q-stills" v-model="form.stills" type="checkbox" :disabled="disabled" aria-label="Stills, one per shot"> stills</label>
        <label v-if="delivery" class="q-opt"><input id="q-thumbnails" v-model="form.thumbnails" type="checkbox" :disabled="disabled" aria-label="Thumbnails, one per shot"> thumbnails</label>
        <label v-if="delivery" class="q-opt"><input id="q-turntable" v-model="form.turntable" type="checkbox" :disabled="disabled" aria-label="A turntable per character"> turntable</label>
        <span class="seg" role="radiogroup" aria-label="Draw on" title="The backend the job draws on (WebKit's popup menus can't be picked over accessibility: buttons)">
          <button v-for="[b, name] in backends" :id="`q-backend-${b || 'view'}`" :key="b" type="button" role="radio" :aria-checked="form.backend === b" :aria-label="`Draw on ${name}`" :class="{ on: form.backend === b }" :disabled="disabled" @click="form.backend = b">{{ name }}</button>
        </span>
        <label class="q-opt" title="Draw every frame twice and compare the two (a third draw breaks a tie): slower; for the rare odd WebGPU frame"><input id="q-check" v-model="form.check" type="checkbox" :disabled="disabled" aria-label="Redraw check, each frame drawn twice"> redraw check</label>
      </div>
      <input id="q-name" v-model="form.name" aria-label="Export file name" placeholder="file name (automatic)" :disabled="disabled" @focus="$event.target.select()">
      <button id="q-add" type="button" aria-label="Add the short to the queue" :disabled="disabled || !canAdd" @click="emit('add', queueSpec(form))">Add</button>
      <button id="q-run" type="button" class="play" :aria-label="running() ? 'Rendering' : 'Render the queue'" :disabled="disabled || running() || !queued()" @click="emit('run')">{{ running() ? 'Rendering…' : 'Render' }}</button>
    </div>
    <ol class="q-jobs" aria-label="Jobs">
      <li v-for="j in jobs" :id="`q-${j.id}`" :key="j.id" class="q-job" :class="j.state">
        <span :id="`q-${j.id}-label`" class="q-label" :title="j.spec.ref" :aria-label="`${j.id} ${j.label}`">{{ j.label }}</span>
        <output :id="`q-${j.id}-status`" class="q-status" :aria-label="`${j.id} ${jobStatus(j)}`">{{ jobStatus(j) }}</output>
        <progress v-if="j.state === 'running'" :max="j.progress.total || 1" :value="j.progress.n" :aria-label="`${j.id} progress ${j.progress.n} of ${j.progress.total}`" />
        <span class="q-actions">
          <button v-if="j.state === 'queued'" type="button" :aria-label="`Move ${j.id} up`" @click="emit('move', j.id, -1)">↑</button>
          <button v-if="j.state === 'queued' || j.state === 'running'" type="button" :aria-label="`Cancel ${j.id}`" @click="emit('cancel', j.id)">Cancel</button>
          <button v-if="j.state === 'failed' || j.state === 'cancelled'" type="button" :aria-label="`Retry ${j.id}`" @click="emit('retry', j.id)">Retry</button>
          <button v-if="j.state !== 'running'" type="button" :aria-label="`Remove ${j.id}`" @click="emit('remove', j.id)">✕</button>
        </span>
      </li>
      <li v-if="!jobs.length" class="muted q-empty">Nothing queued.</li>
    </ol>
  </section>
</template>

<style>
.queue { display: flex; flex-direction: column; min-height: 0; background: var(--panel); }
.q-head { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--line); }
.q-head h2 { flex: 1; }
.q-form { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 10px; border-bottom: 1px solid var(--line); }
.q-form > input { flex: 1; min-width: 100px; }
.q-form .seg { flex-wrap: wrap; } .q-group { font-size: 11px; padding: 0 4px; align-self: center; }
.q-grid { display: grid; grid-template-columns: auto auto auto; gap: 3px 4px; align-items: center; width: 100%; font-size: 12px; }
.q-grid .q-group { grid-column: 1 / -1; padding: 0; } .q-grid button { padding: 1px 8px; } .q-grid button.on { background: var(--accent, #3b82f6); color: #fff; }
.q-opts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; width: 100%; font-size: 12px; } .q-opt { display: inline-flex; gap: 3px; align-items: center; }
.q-jobs { list-style: none; margin: 0; padding: 4px 0; overflow: auto; }
.q-job { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; padding: 5px 10px; border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent); font-size: 12px; }
.q-job progress { grid-column: 1 / -1; width: 100%; }
.q-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.q-status { grid-column: 1; color: var(--muted); word-break: break-word; }
.q-actions { grid-row: 1 / span 2; grid-column: 2; display: flex; gap: 3px; align-items: center; } .q-actions button { padding: 1px 6px; font-size: 11px; }
.q-job.done .q-status { color: #2e9d55; } .q-job.failed .q-status { color: #c0392b; }
.q-empty { padding: 8px 10px; font-size: 12px; }
</style>
