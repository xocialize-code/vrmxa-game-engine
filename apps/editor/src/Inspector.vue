<script setup>
// The inspector: generated from the registry for the selection's node types (their props' schemas, widgets and
// conditions), plus name, parent and transform. M5 W4: each prop gets a real widget from @vrmxg/editor-ui (vectors, lists
// of structs, maps, curves; no JSON boxes, AB-T-0599), numbers are fields you drag or type arithmetic into (AB-T-0600),
// several selected nodes are edited at once with a mixed state where they differ (AB-T-0601), and a prop whose
// visibleIf doesn't hold is hidden (its value kept) and one whose enabledIf doesn't is disabled (AB-T-0602).
// Every edit commits once (Return, leaving a field, a press), so one edit is one undo step; a drag is one gesture.
import { computed } from 'vue';
import NumberField from '@vrmxg/editor-ui/NumberField.vue';
import ValueField from '@vrmxg/editor-ui/ValueField.vue';

const props = defineProps({ data: Object });
const emit = defineEmits(['rename', 'parent', 'axis', 'prop', 'propAxis', 'gesture', 'select']);
const others = computed(() => (props.data ? props.data.nodes.filter((x) => !props.data.ids.includes(x)) : []));
function also(e) { const id = e.target.value; e.target.value = ''; if (id) emit('select', [id], true); }
const AXES = ['X', 'Y', 'Z'];
const XFORM = [
  { part: 'p', legend: 'Position (m)', id: 'pos', name: 'Position', step: 0.01, precision: 3 },
  { part: 'r', legend: 'Rotation (°)', id: 'rot', name: 'Rotation', step: 1, precision: 2 },
  { part: 's', legend: 'Scale', id: 'scale', name: 'Scale', step: 0.01, precision: 3 },
];
const BLOCK = new Set(['list', 'struct', 'map', 'curve', 'choice']);
const shown = computed(() => (props.data?.props ?? []).filter((p) => p.visible));
const hidden = computed(() => (props.data?.props ?? []).filter((p) => !p.visible));
const heading = computed(() => {
  const d = props.data;
  if (!d) return '';
  return d.multi ? `${d.ids.length} nodes: ${d.ids.join(', ')}` : `Node ${d.id}`;
});
const why = (p) => [p.description, p.visibleIf ? `Shown when ${p.visibleIf}.` : '', !p.enabled && p.enabledIf ? `Editable when ${p.enabledIf}.` : ''].filter(Boolean).join(' ');
</script>

<template>
  <section class="inspector" aria-label="Inspector">
    <h2>Inspector</h2>
    <p v-if="!data" class="muted">Nothing selected.</p>
    <form v-else @submit.prevent>
      <p class="kind"><strong id="inspector-id" :aria-label="heading">{{ data.multi ? `${data.ids.length} nodes` : data.id }}</strong> · {{ data.types.join(', ') }}</p>
      <p v-if="data.multi" id="inspector-multi" class="muted small" :aria-label="`Editing ${data.ids.length} nodes: ${data.ids.join(', ')}`">Editing {{ data.ids.join(', ') }}: a change sets every one, as one undo step.</p>
      <p v-else class="muted small">{{ data.description }}</p>
      <p v-if="data.asset" class="small" :aria-label="`Asset ${data.asset}`">Asset: {{ data.asset }}</p>
      <div class="insp-row insp-select">
        <select id="inspector-also" value="" aria-label="Also select" title="Add a node to the selection (as Shift-click does), to edit them together" @change="also">
          <option value="">Also select…</option>
          <option v-for="id in others" :key="id" :value="id">{{ id }}</option>
        </select>
        <button v-if="data.sameType.length > data.ids.length" id="inspector-select-type" type="button" :aria-label="`Select every ${data.type}`" :title="`Select all ${data.sameType.length} ${data.type} nodes, to edit them together`" @click="emit('select', data.sameType, false)">All {{ data.sameType.length }} {{ data.type }}</button>
      </div>
      <template v-if="!data.multi">
        <label class="insp-row">Name <input id="field-name" :value="data.name" aria-label="Name" @change="emit('rename', $event.target.value)"></label>
        <label class="insp-row">Parent
          <select id="field-parent" :value="data.parent ?? ''" aria-label="Parent" @change="emit('parent', $event.target.value || null)">
            <option value="">(scene)</option>
            <option v-for="id in data.nodes.filter((x) => x !== data.id)" :key="id" :value="id">{{ id }}</option>
          </select>
        </label>
      </template>
      <fieldset v-for="x in XFORM" :key="x.part" class="xform"><legend>{{ x.legend }}</legend>
        <NumberField
          v-for="(a, i) in AXES" :id="`${x.id}-${a.toLowerCase()}`" :key="a" :label="`${x.name} ${a}`" :grip="a"
          :value="data[x.part][i] ?? undefined" :mixed="data[x.part][i] === null" :step="x.step" :precision="x.precision"
          @change="emit('axis', x.part, i, $event)" @gesture="emit('gesture', $event)"
        />
      </fieldset>
      <h3 v-if="data.props.length">Properties</h3>
      <div v-for="p in shown" :key="`${data.ids.join(',')}:${p.key}`" class="insp-prop" :class="{ set: p.set, block: BLOCK.has(p.widget), off: !p.enabled, mixed: p.mixed }" :title="why(p)">
        <div class="insp-row">
          <span class="insp-key">{{ p.key }}<span v-if="p.unit" class="muted"> ({{ p.unit }})</span><span v-if="p.mixed && BLOCK.has(p.widget)" class="muted"> · mixed: showing {{ data.id }}'s</span></span>
          <ValueField
            v-if="!BLOCK.has(p.widget)" :id="`prop-${p.key}`" :label="p.key" :schema="p.schema" :meta="p.meta" :value="p.value" :fallback="p.default"
            :mixed="p.mixed" :axes="data.multi && p.widget === 'vec' ? p.axes : null" :disabled="!p.enabled" :nodes="data.nodes"
            @change="emit('prop', p.key, $event)" @axis="(i, v) => emit('propAxis', p.key, i, v)" @gesture="emit('gesture', $event)"
          />
          <button v-if="p.set" type="button" class="reset" :aria-label="`Reset ${p.key}`" title="Back to the default" :disabled="!p.enabled" @click="emit('prop', p.key, undefined)">↺</button>
        </div>
        <ValueField
          v-if="BLOCK.has(p.widget)" :id="`prop-${p.key}`" :label="p.mixed ? `${p.key} (mixed values)` : p.key" :schema="p.schema" :meta="p.meta"
          :value="p.mixed ? data.primaryProps?.[p.key] : p.value" :fallback="p.default" :disabled="!p.enabled" :nodes="data.nodes"
          @change="emit('prop', p.key, $event)" @gesture="emit('gesture', $event)"
        />
      </div>
      <p v-if="hidden.length" id="props-hidden" class="muted small" :aria-label="`Hidden by their conditions: ${hidden.map((p) => p.key).join(', ')}`" :title="hidden.map((p) => `${p.key}: shown when ${p.visibleIf}`).join('\n')">
        Hidden: {{ hidden.map((p) => p.key).join(', ') }} (their values are kept)
      </p>
      <p v-if="data.behaviours.length" class="small">Behaviours: {{ data.behaviours.join(', ') }}</p>
    </form>
  </section>
</template>

<style>
.inspector .xform { display: flex; gap: 4px; border: 0; padding: 0; margin: 8px 0; flex-wrap: wrap; min-width: 0; }
.inspector .xform legend { color: var(--muted); padding: 0; margin-bottom: 4px; width: 100%; }
.inspector .xform .num { flex: 1 1 0; min-width: 0; }
.inspector .num-input { width: 100%; box-sizing: border-box; }
.insp-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin: 6px 0; min-width: 0; }
.insp-row > input, .insp-row > select { width: 150px; max-width: 60%; box-sizing: border-box; }
.insp-prop .insp-row > .num, .insp-prop .insp-row > input:not([type=checkbox]), .insp-prop .insp-row > select, .insp-prop .insp-row > .vf-vec { flex: 0 1 150px; max-width: 60%; box-sizing: border-box; }
.insp-select > select { flex: 1 1 auto; width: auto; max-width: none; }
.insp-key { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.insp-prop.set .insp-key { color: var(--ink); }
.insp-prop.off .insp-key { opacity: 0.55; }
.insp-prop.block { margin-bottom: 8px; }
.insp-prop.block > .insp-row { margin-bottom: 2px; }
.inspector .vf-struct input, .inspector .vf-list input:not([type=checkbox]), .inspector .vf-map input, .inspector .vf-struct select, .inspector .vf-list select { width: 100%; min-width: 0; box-sizing: border-box; }
</style>
