<script setup>
// A node's behaviours in the inspector (M6 W1, AB-T-0638): each one's params as fields from its schema (the registry's,
// or a project behaviour's static describe), removed by its ×; another added from the behaviours its type takes. The app
// turns each event into one undo step (EditorSession addBehaviour, removeBehaviour, setBehaviourParam).
import { ref } from 'vue';
import FieldRows from './FieldRows.vue';
import { idPart } from './fields.js';

const props = defineProps({
  /** wiring-ui.js wiringView's data. */
  wiring: { type: Object, required: true },
  /** Node ids, for node params. */
  nodes: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['add', 'remove', 'param', 'gesture']);
const pick = ref('');
function add() { const u = pick.value; if (!u) return; pick.value = ''; emit('add', u); }
const bid = (use) => `beh-${idPart(use)}`;
</script>

<template>
  <section id="behaviours" class="wiring" :aria-label="`Behaviours of ${wiring.id}: ${wiring.behaviours.length ? wiring.behaviours.map((b) => b.use).join(', ') : 'none'}`">
    <h3>Behaviours</h3>
    <p v-if="!wiring.behaviours.length" class="muted small">None. A behaviour is code the node runs (the engine's, or one of the project's).</p>
    <div v-for="b in wiring.behaviours" :id="bid(b.use)" :key="b.use" class="wiring-item" role="group" :aria-label="`Behaviour ${b.use}${b.project ? ' (the project\'s)' : ''}${b.known ? '' : ' (unknown: its params are kept as they are)'}`">
      <div class="insp-row wiring-head">
        <strong class="mono">{{ b.use }}</strong><span v-if="b.project" class="muted small"> · project</span><span v-if="!b.known" class="muted small"> · unknown</span>
        <button :id="`${bid(b.use)}--remove`" type="button" class="vf-tool" :aria-label="`Remove behaviour ${b.use}`" :disabled="disabled" @click="emit('remove', b.use)">×</button>
      </div>
      <p v-if="b.description" class="muted small">{{ b.description }}</p>
      <FieldRows :fields="b.fields" :id-base="bid(b.use)" :owner="b.use" :nodes="nodes" :disabled="disabled" @change="(k, v) => emit('param', b.use, k, v)" @gesture="emit('gesture', $event)" />
    </div>
    <div class="insp-row">
      <select id="beh-add" v-model="pick" aria-label="Behaviour to add" :disabled="disabled || !wiring.addable.length">
        <option value="">Add a behaviour…</option>
        <option v-for="a in wiring.addable" :key="a.name" :value="a.name" :title="a.description">{{ a.name }}</option>
      </select>
      <button id="beh-add-button" type="button" :aria-label="pick ? `Add behaviour ${pick}` : 'Add a behaviour (pick one first)'" :disabled="disabled || !pick" @click="add">Add</button>
    </div>
  </section>
</template>
