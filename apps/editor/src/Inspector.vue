<script setup>
// The inspector: generated from the registry for the selected node's type (its props' schemas and widgets), plus
// name, parent and transform. Each field commits on change (Return or leaving it), so one edit is one undo step.
const props = defineProps({ data: Object });
const emit = defineEmits(['rename', 'parent', 'position', 'rotation', 'scale', 'prop']);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const vec = (arr, i, v) => arr.map((x, k) => (k === i ? num(v) : x));
const axes = ['X', 'Y', 'Z'];
function setProp(p, raw) {
  let v = raw;
  if (p.widget === 'number') v = raw === '' ? undefined : num(raw);
  else if (p.widget === 'json') { try { v = raw === '' ? undefined : JSON.parse(raw); } catch { return; } }
  else if (p.widget === 'node' || p.widget === 'enum' || p.widget === 'string' || p.widget === 'asset') v = raw === '' ? undefined : raw;
  emit('prop', p.key, v);
}
const shown = (p) => (p.value !== undefined ? p.value : p.default);
const jsonText = (p) => (shown(p) === undefined ? '' : JSON.stringify(shown(p)));
</script>

<template>
  <section class="inspector" aria-label="Inspector">
    <h2>Inspector</h2>
    <p v-if="!data" class="muted">Nothing selected.</p>
    <form v-else @submit.prevent>
      <p class="kind"><strong id="inspector-id" :aria-label="`Node ${data.id}`">{{ data.id }}</strong> · {{ data.type }}</p>
      <p class="muted small">{{ data.description }}</p>
      <p v-if="data.asset" class="small" :aria-label="`Asset ${data.asset}`">Asset: {{ data.asset }}</p>
      <label class="field">Name <input id="field-name" :value="data.name" aria-label="Name" @change="emit('rename', $event.target.value)"></label>
      <label class="field">Parent
        <select id="field-parent" :value="data.parent ?? ''" aria-label="Parent" @change="emit('parent', $event.target.value || null)">
          <option value="">(scene)</option>
          <option v-for="id in data.nodes.filter((x) => x !== data.id)" :key="id" :value="id">{{ id }}</option>
        </select>
      </label>
      <fieldset class="vec"><legend>Position (m)</legend>
        <input v-for="(a, i) in axes" :id="`pos-${a.toLowerCase()}`" :key="a" type="number" step="0.05" :value="data.p[i]" :aria-label="`Position ${a}`" @change="emit('position', vec(data.p, i, $event.target.value))">
      </fieldset>
      <fieldset class="vec"><legend>Rotation (°)</legend>
        <input v-for="(a, i) in axes" :id="`rot-${a.toLowerCase()}`" :key="a" type="number" step="5" :value="data.r[i]" :aria-label="`Rotation ${a}`" @change="emit('rotation', vec(data.r, i, $event.target.value))">
      </fieldset>
      <fieldset class="vec"><legend>Scale</legend>
        <input v-for="(a, i) in axes" :id="`scale-${a.toLowerCase()}`" :key="a" type="number" step="0.1" :value="data.s[i]" :aria-label="`Scale ${a}`" @change="emit('scale', vec(data.s, i, $event.target.value))">
      </fieldset>
      <h3 v-if="data.props.length">Properties</h3>
      <div v-for="p in data.props" :key="p.key" class="prop" :class="{ set: p.set }" :title="p.description">
        <label class="field">{{ p.key }}<span v-if="p.unit" class="muted"> ({{ p.unit }})</span>
          <input :id="`prop-${p.key}`" v-if="p.widget === 'boolean'" type="checkbox" :checked="!!shown(p)" :aria-label="p.key" @change="emit('prop', p.key, $event.target.checked)">
          <select :id="`prop-${p.key}`" v-else-if="p.widget === 'enum'" :value="shown(p) ?? ''" :aria-label="p.key" @change="setProp(p, $event.target.value)">
            <option v-for="o in p.enum" :key="String(o)" :value="o">{{ o }}</option>
          </select>
          <select :id="`prop-${p.key}`" v-else-if="p.widget === 'node'" :value="shown(p) ?? ''" :aria-label="p.key" @change="setProp(p, $event.target.value)">
            <option value="">(none)</option>
            <option v-for="id in data.nodes" :key="id" :value="id">{{ id }}</option>
          </select>
          <input :id="`prop-${p.key}`" v-else-if="p.widget === 'color'" type="color" :value="shown(p) ?? '#ffffff'" :aria-label="p.key" @change="emit('prop', p.key, $event.target.value)">
          <input :id="`prop-${p.key}`" v-else-if="p.widget === 'number'" type="number" :min="p.min" :max="p.max" step="any" :value="shown(p)" :aria-label="p.key" @change="setProp(p, $event.target.value)">
          <input :id="`prop-${p.key}`" v-else-if="p.widget === 'string' || p.widget === 'asset'" :value="shown(p) ?? ''" :aria-label="p.key" @change="setProp(p, $event.target.value)">
          <input :id="`prop-${p.key}`" v-else :value="jsonText(p)" class="mono" :aria-label="p.key" @change="setProp(p, $event.target.value)">
        </label>
        <button v-if="p.set" type="button" class="reset" :aria-label="`Reset ${p.key}`" title="Back to the default" @click="emit('prop', p.key, undefined)">↺</button>
      </div>
      <p v-if="data.behaviours.length" class="small">Behaviours: {{ data.behaviours.join(', ') }}</p>
    </form>
  </section>
</template>
