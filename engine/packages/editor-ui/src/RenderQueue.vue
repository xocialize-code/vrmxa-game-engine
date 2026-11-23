<script setup>
// The render queue panel (M4 W5): queue the open short with a preset, run the queue, and see each job's state. It
// draws @vrmxg/editor-core's RenderQueue (plain copies of its jobs) and emits what the person asks for; which runner
// renders is the app's choice (the creator's export through the shell, or the stub until W10 fills the queue).
import { reactive } from 'vue';
import { PRESETS } from '@vrmxg/editor-core';
import { jobStatus } from './storyboard-ui.js';

const props = defineProps({
  jobs: { type: Array, default: () => [] },
  runner: { type: String, default: '' },
  canAdd: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['add', 'run', 'cancel', 'remove', 'retry', 'move']);
const form = reactive({ preset: 'draft', name: '' });
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
      <div class="seg" role="radiogroup" aria-label="Preset">
        <button v-for="(p, k) in PRESETS" :id="`q-preset-${k}`" :key="k" type="button" role="radio" :aria-checked="form.preset === k" :aria-label="`Preset ${p.label}`" :title="p.label" :class="{ on: form.preset === k }" :disabled="disabled" @click="form.preset = k">{{ k }}</button>
      </div>
      <input id="q-name" v-model="form.name" aria-label="Export file name" placeholder="file name (automatic)" :disabled="disabled" @focus="$event.target.select()">
      <button id="q-add" type="button" aria-label="Add the short to the queue" :disabled="disabled || !canAdd" @click="emit('add', { preset: form.preset, name: form.name.trim() || null })">Add</button>
      <button id="q-run" type="button" class="play" :aria-label="running() ? 'Rendering' : 'Render the queue'" :disabled="disabled || running() || !queued()" @click="emit('run')">{{ running() ? 'Rendering…' : 'Render' }}</button>
    </div>
    <ol class="q-jobs" aria-label="Jobs">
      <li v-for="j in jobs" :id="`q-${j.id}`" :key="j.id" class="q-job" :class="j.state">
        <span class="q-label" :title="j.spec.ref">{{ j.label }}</span>
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
.q-form input { flex: 1; min-width: 100px; }
.q-jobs { list-style: none; margin: 0; padding: 4px 0; overflow: auto; }
.q-job { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; padding: 5px 10px; border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent); font-size: 12px; }
.q-job progress { grid-column: 1 / -1; width: 100%; }
.q-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.q-status { grid-column: 1; color: var(--muted); word-break: break-word; }
.q-actions { grid-row: 1 / span 2; grid-column: 2; display: flex; gap: 3px; align-items: center; } .q-actions button { padding: 1px 6px; font-size: 11px; }
.q-job.done .q-status { color: #2e9d55; } .q-job.failed .q-status { color: #c0392b; }
.q-empty { padding: 8px 10px; font-size: 12px; }
</style>
