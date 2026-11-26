<script setup>
// Rows of fields from a registry schema (M6 W1): a behaviour's params, a connection's arguments. Each row is the field's
// widget (ValueField: no JSON typed), with a pin that writes the value it shows while unset (its default) into the file,
// and a clear that takes a set value back out. Every change is emitted once, so the app makes one undo step of it.
import ValueField from './ValueField.vue';
import { idPart, pinValue } from './fields.js';

const props = defineProps({
  /** The fields (fields.js propFields). */
  fields: { type: Array, default: () => [] },
  /** The element id every row's id starts with. */
  idBase: { type: String, required: true },
  /** What each row's accessible name starts with ("tableZone", "say"). */
  owner: { type: String, default: '' },
  /** Node ids, for node slots. */
  nodes: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['change', 'gesture']);
const BLOCK = new Set(['list', 'struct', 'map', 'curve', 'choice']);
const rid = (f) => `${props.idBase}-${idPart(f.key)}`;
const label = (f) => (props.owner ? `${props.owner} ${f.key}` : f.key);
</script>

<template>
  <div v-for="f in fields.filter((x) => x.visible !== false)" :key="f.key" class="fr-row insp-prop" :class="{ set: f.set, block: BLOCK.has(f.widget), off: f.enabled === false }" :title="f.description">
    <div class="insp-row">
      <span class="insp-key">{{ f.key }}<span v-if="f.unit" class="muted"> ({{ f.unit }})</span></span>
      <span class="clip-btns">
        <button v-if="!f.set" :id="`${rid(f)}--pin`" type="button" class="clip" :aria-label="`Write ${label(f)} into the file (${JSON.stringify(pinValue(f))})`" :title="`Write the value shown (${JSON.stringify(pinValue(f))}) into the file, so it stays when the default changes`" :disabled="disabled || f.enabled === false" @click="emit('change', f.key, pinValue(f))">＝</button>
        <button v-else :id="`${rid(f)}--clear`" type="button" class="clip" :aria-label="`Clear ${label(f)}`" title="Back to the default" :disabled="disabled || f.enabled === false" @click="emit('change', f.key, undefined)">↺</button>
      </span>
      <ValueField
        v-if="!BLOCK.has(f.widget)" :id="rid(f)" :label="label(f)" :schema="f.schema" :meta="f.meta" :value="f.value" :fallback="f.default"
        :disabled="disabled || f.enabled === false" :nodes="nodes" @change="emit('change', f.key, $event)" @gesture="emit('gesture', $event)"
      />
    </div>
    <ValueField
      v-if="BLOCK.has(f.widget)" :id="rid(f)" :label="label(f)" :schema="f.schema" :meta="f.meta" :value="f.value" :fallback="f.default"
      :disabled="disabled || f.enabled === false" :nodes="nodes" @change="emit('change', f.key, $event)" @gesture="emit('gesture', $event)"
    />
  </div>
</template>
