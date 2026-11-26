<script setup>
// New Project (M6 W3, AB-T-0646): pick a template, name the game, then Create… asks the Mac shell for the folder
// (project.create) and opens the new project. The id follows the title until it is typed in itself.
import { computed, reactive, watch } from 'vue';
import { gameIdFrom } from './projects.js';

const props = defineProps({
  templates: { type: Array, default: () => [] }, // [{ id, title, description, files }]
  canCreate: { type: Boolean, default: false },  // the Mac app: a browser has no folder to make it in
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
});
const emit = defineEmits(['create', 'cancel']);
const form = reactive({ template: '', title: 'New Game', id: 'new-game', idTyped: false });
watch(() => props.templates, (list) => { if (!list.some((t) => t.id === form.template)) form.template = list.at(-1)?.id ?? ''; }, { immediate: true });
watch(() => form.title, (t) => { if (!form.idTyped) form.id = gameIdFrom(t); });
const idOk = computed(() => /^[a-z0-9][a-z0-9-]{0,63}$/.test(form.id));
const ready = computed(() => props.canCreate && !props.busy && !!form.template && !!form.title.trim() && idOk.value);
const create = () => { if (ready.value) emit('create', { template: props.templates.find((t) => t.id === form.template), title: form.title.trim(), id: form.id }); };
</script>

<template>
  <div class="ask-back">
    <section id="new-project" class="sheet new-project" role="dialog" aria-label="New project" aria-modal="true">
      <div class="row"><h2>New Project</h2></div>
      <div class="templates" role="radiogroup" aria-label="Template">
        <button v-for="t in templates" :id="`template-${t.id}`" :key="t.id" type="button" role="radio" class="template" :class="{ on: form.template === t.id }"
                :aria-checked="form.template === t.id" :aria-label="`Template ${t.title}: ${t.description}`" @click="form.template = t.id">
          <strong>{{ t.title }}</strong><span class="muted small">{{ t.description }}</span><span class="muted small">{{ t.files.length }} files</span>
        </button>
      </div>
      <label class="field">Game title <input id="new-project-title" v-model="form.title" aria-label="Game title" @keydown.enter="create"></label>
      <label class="field">Game id <input id="new-project-id" v-model="form.id" class="mono" aria-label="Game id" :aria-invalid="!idOk" title="Lowercase letters, digits and hyphens: the build's folder name" @input="form.idTyped = true" @keydown.enter="create"></label>
      <p v-if="!idOk" class="muted small" role="status">An id is lowercase letters, digits and hyphens.</p>
      <p v-if="!canCreate" class="muted small" role="status">New Project needs the Mac app: a browser has no folder to make it in.</p>
      <p class="muted small">Create asks where the project's folder goes and what it is called (a new or empty folder).</p>
      <pre v-if="error" id="new-project-error" class="error-text" role="alert">{{ error }}</pre>
      <div class="row end">
        <button id="new-project-cancel" type="button" aria-label="Cancel" @click="emit('cancel')">Cancel</button>
        <button id="new-project-create" type="button" class="play" :disabled="!ready" aria-label="Create project" @click="create">{{ busy ? 'Creating…' : 'Create…' }}</button>
      </div>
    </section>
  </div>
</template>

<style>
.new-project { width: min(560px, 92vw); display: flex; flex-direction: column; gap: 10px; }
.new-project .templates { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.new-project .template { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; text-align: left; padding: 10px; border-radius: 8px; }
.new-project .template.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); background: var(--sel); }
.new-project .field { justify-content: space-between; } .new-project .field input { width: 60%; }
.new-project .row.end { justify-content: flex-end; gap: 8px; }
.error-text { color: #c0392b; white-space: pre-wrap; margin: 0; font: 12px/1.4 ui-monospace, monospace; }
</style>
