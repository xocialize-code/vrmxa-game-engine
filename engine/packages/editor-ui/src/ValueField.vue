<script setup>
// One prop's editor, generated from its JSON Schema and the registry's meta (AB-T-0599): a number field, check box,
// menu, text, colour, node or asset slot, a vector, a list of rows (add, remove, move; each row its own fields), a struct
// (its known fields, then any unknown keys, which are kept), a map (renamable keys), a curve (keys with a preview), a
// choice between an anyOf's branches. It recurses for rows and fields. Every edit emits the whole new value once
// (`change`), so the app makes one undo step of it; a number drag emits `gesture` around its live changes.
// Ids and accessible names come from the parent's: `prop-lines-0-text`, "lines 1 text" (./fields.js childOf).
// M5 W6 (AB-T-0606): an asset slot (a prop naming a project file, `meta.assetTypes`) takes a file dragged from the assets
// panel when its kind fits and refuses the rest; a node slot takes a row dragged from the scene tree (assets-ui.js's rules).
import { computed, ref, watch } from 'vue';
import NumberField from './NumberField.vue';
import { draggedKind, dropVerdict, dropEffectFor, fileKind, ASSET_MIME, NODE_MIME } from './assets-ui.js';
import {
  plain, widgetOf, fitBranch, branchesOf, branchIndex, defaultFor, matches, setIn, listAdd, listRemove, listMove, rowActions,
  mapRename, mapAdd, mapRemove, freshKey, structRows, rowTitle, curvePoints, nextCurveKey, childOf, schemaOfValue,
} from './fields.js';

const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  schema: { type: Object, default: () => ({}) },
  meta: { type: Object, default: () => ({}) },
  value: { default: undefined },
  /** What shows when the value is unset (the prop's default). */
  fallback: { default: undefined },
  /** Several nodes differ here: show no value, and say so in the name. */
  mixed: { type: Boolean, default: false },
  /** Clearing it (an empty text, say) unsets it rather than writing an empty value. */
  optional: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false },
  /** Node ids, for a node slot. */
  nodes: { type: Array, default: () => [] },
  /**
   * A vector on several nodes: each axis's common value, null where they differ. An axis edit then emits
   * `axis(i, value)`, so each node keeps its own other axes, instead of `change` with one whole vector.
   */
  axes: { type: Array, default: null },
});
const emit = defineEmits(['change', 'gesture', 'axis']);

const shown = computed(() => (props.value !== undefined ? props.value : props.fallback));
const widget = computed(() => widgetOf(props.schema, props.meta, shown.value));
const name = computed(() => (props.mixed ? `${props.label} (mixed values)` : props.label));
// drops on an asset or node slot: the drag's kind decides while it hovers, the dropped data again on drop
const slotOf = () => (widget.value === 'node' ? { slot: 'node' } : { slot: 'prop', types: props.meta?.assetTypes ?? [] });
const refusing = ref('');

function over(e) {
  if (props.disabled) return;
  const v = dropVerdict(draggedKind(e.dataTransfer?.types), slotOf());
  refusing.value = v.ok ? '' : v.reason;
  if (v.ok) { e.preventDefault(); e.dataTransfer.dropEffect = dropEffectFor(slotOf()); } // one the drag allows (assets-ui.js)
}
function dropped(e) {
  refusing.value = '';
  if (props.disabled) return;
  if (widget.value === 'node') { const id = e.dataTransfer?.getData(NODE_MIME); if (id && (!props.nodes.length || props.nodes.includes(id))) setNode(id); return; }
  const ref = e.dataTransfer?.getData(ASSET_MIME);
  if (ref && dropVerdict(fileKind(ref), slotOf()).ok) setText(ref);
}
const child = (k) => childOf({ id: props.id, label: props.label }, k);
const set = (v) => emit('change', plain(v));
const gesture = (k) => emit('gesture', k);

// numbers
const isInt = computed(() => props.schema?.type === 'integer');
const numOpts = computed(() => ({
  min: props.schema?.minimum, max: props.schema?.maximum,
  step: props.meta?.step ?? (isInt.value ? 1 : 0.01), precision: props.meta?.precision ?? (isInt.value ? 0 : 3), unit: props.meta?.unit ?? '',
}));

// text
const setText = (raw) => set(raw === '' && props.optional ? undefined : raw);
const MIXED = '__mixed';
const setNode = (raw) => { if (raw !== MIXED) setText(raw); };
function setJson(raw) { try { set(raw === '' ? undefined : JSON.parse(raw)); } catch { /* not JSON: kept as it was */ } }

// enum: options by index, so numbers and strings both round-trip
const enumIndex = computed(() => (props.mixed ? '' : String((props.schema?.enum ?? []).findIndex((e) => JSON.stringify(e) === JSON.stringify(shown.value)))));
const setEnum = (i) => { if (i !== '') set(props.schema.enum[Number(i)]); };

// a value of several types (a flag's value): a kind menu beside the value
const KINDS = { string: 'text', number: 'number', integer: 'whole number', boolean: 'yes / no' };
const scalarKinds = computed(() => (Array.isArray(props.schema?.type) ? props.schema.type : ['string', 'number', 'boolean']).filter((t) => KINDS[t]));
const scalarKind = computed(() => { const v = shown.value; const t = typeof v === 'number' ? (Number.isInteger(v) && scalarKinds.value.includes('integer') ? 'integer' : 'number') : typeof v; return scalarKinds.value.includes(t) ? t : scalarKinds.value[0]; });
function setKind(t) {
  const v = shown.value;
  set(t === 'boolean' ? !!v && v !== 'false' : t === 'number' || t === 'integer' ? (Number.isFinite(Number(v)) && v !== true && v !== false ? Number(v) : 0) : v === undefined ? '' : String(v));
}

// a choice between anyOf branches; one whose new value wouldn't be valid waits for its first edit
const branches = computed(() => branchesOf(props.schema));
const picked = ref(null);
watch(() => JSON.stringify(props.value), () => { picked.value = null; }); // another node or row: its own branch
const branch = computed(() => picked.value ?? branchIndex(props.schema, shown.value));
const branchSchema = computed(() => branches.value[branch.value]?.schema ?? {});
const branchValue = computed(() => (matches(branchSchema.value, shown.value) || picked.value === null ? shown.value : undefined));
function pickBranch(i) {
  const n = Number(i);
  const b = branches.value[n]?.schema ?? {};
  const v = defaultFor(b);
  if (v !== undefined && matches(b, v)) { picked.value = null; set(v); } else picked.value = n;
}
const setBranchValue = (v) => { picked.value = null; set(v); };

// vectors
const AXES = ['x', 'y', 'z', 'w'];
const vecLen = computed(() => props.schema?.minItems ?? (Array.isArray(shown.value) ? shown.value.length : 3));
const vecOf = () => (Array.isArray(shown.value) ? [...shown.value] : new Array(vecLen.value).fill(0));
const setAxis = (i, v) => { if (props.axes) { emit('axis', i, v); return; } const a = vecOf(); a[i] = v; set(a); };
const axisValue = (i) => (props.axes ? (props.axes[i] ?? undefined) : props.mixed ? undefined : vecOf()[i]);
const axisMixed = (i) => (props.axes ? props.axes[i] === null : props.mixed);

// lists
const items = computed(() => (Array.isArray(shown.value) ? shown.value : []));
const itemSchema = (item) => (props.schema?.items && Object.keys(props.schema.items).length ? props.schema.items : items.value.length ? schemaOfValue(item) : {});
const listSchema = computed(() => props.schema ?? {});
const actions = (i) => rowActions(items.value, i, listSchema.value);
function addRow() {
  const s = props.schema?.items ?? (items.value.length ? schemaOfValue(items.value.at(-1)) : { type: 'string' });
  const last = items.value.at(-1);
  const fresh = defaultFor(s);
  set(listAdd(items.value, fresh !== undefined ? fresh : last !== undefined ? last : ''));
}
const BLOCKS = ['list', 'struct', 'map', 'curve', 'choice'];
const rowIsBlock = (item) => BLOCKS.includes(widgetOf(itemSchema(item), {}, item));
// an unset optional field that would be a block (a line's condition, its choices) waits behind a button
const folded = (r) => !r.set && !r.required && BLOCKS.includes(widgetOf(r.schema, {}, r.schema.default));
const unfold = (r) => { const v = defaultFor(r.schema); setField(r.key, v === undefined ? {} : v); };

// structs
const struct = computed(() => structRows(props.schema, shown.value));
const structValue = computed(() => (shown.value && typeof shown.value === 'object' && !Array.isArray(shown.value) ? shown.value : {}));
const newKey = ref('');
// a discriminator changed (a condition's test): fitBranch keeps what the new branch allows and adds what it needs
const setField = (k, v) => set(fitBranch(props.schema, setIn(structValue.value, [k], v)));
function addKey(map = false) {
  const k = newKey.value.trim() || freshKey(structValue.value, 'key');
  const vs = map ? props.schema?.additionalProperties : struct.value.valueSchema;
  const v = vs ? defaultFor(vs) : '';
  newKey.value = '';
  set(mapAdd(structValue.value, k, v === undefined ? '' : v));
}

// curves
const keys = computed(() => (Array.isArray(shown.value) ? shown.value : []));
const curve = computed(() => curvePoints(keys.value));
const setKey = (i, j, v) => set(setIn(keys.value, [i, j], v));
</script>

<template>
  <!-- numbers -->
  <NumberField v-if="widget === 'number'" :id="id" :label="label" :value="typeof shown === 'number' ? shown : undefined" :mixed="mixed" :min="numOpts.min" :max="numOpts.max" :step="numOpts.step" :precision="numOpts.precision" :integer="isInt" :unit="numOpts.unit" :disabled="disabled" @change="set" @gesture="gesture" />

  <input v-else-if="widget === 'boolean'" :id="id" type="checkbox" :checked="!mixed && !!shown" :indeterminate="mixed" :aria-label="name" :disabled="disabled" @change="set($event.target.checked)">

  <select v-else-if="widget === 'enum'" :id="id" :value="enumIndex" :aria-label="name" :disabled="disabled" @change="setEnum($event.target.value)">
    <option v-if="mixed" value="">(mixed)</option>
    <option v-for="(o, i) in schema.enum" :key="i" :value="String(i)">{{ o === null ? '(none)' : o }}</option>
  </select>

  <input v-else-if="widget === 'string'" :id="id" :value="mixed ? '' : (shown ?? '')" :placeholder="mixed ? 'mixed' : ''" :aria-label="name" :disabled="disabled" @change="setText($event.target.value)">

  <input v-else-if="widget === 'color'" :id="id" type="color" :value="mixed ? '#808080' : (shown ?? '#ffffff')" :aria-label="name" :disabled="disabled" @change="set($event.target.value)">

  <select v-else-if="widget === 'node'" :id="id" :value="mixed ? MIXED : (shown ?? '')" :aria-label="name" :disabled="disabled" @change="setNode($event.target.value)" @dragenter="over" @dragover="over" @dragleave="refusing = ''" @drop.prevent="dropped">
    <option v-if="mixed" :value="MIXED">(mixed)</option>
    <option value="">(none)</option>
    <option v-for="n in nodes" :key="n" :value="n">{{ n }}</option>
  </select>

  <input v-else-if="widget === 'asset'" :id="id" class="mono" :class="{ refusing }" :value="mixed ? '' : (shown ?? '')" :placeholder="mixed ? 'mixed' : 'project path'" :aria-label="refusing ? `${name}: refuses ${refusing}` : name" :title="refusing" :disabled="disabled" @change="setText($event.target.value)" @dragenter="over" @dragover="over" @dragleave="refusing = ''" @drop.prevent="dropped">

  <output v-else-if="widget === 'const'" :id="id" :aria-label="`${label} ${shown}`">{{ shown }}</output>

  <!-- a vector: one number field per axis -->
  <span v-else-if="widget === 'vec'" class="vf-vec" role="group" :aria-label="name">
    <NumberField v-for="(a, i) in AXES.slice(0, vecLen)" :id="`${id}-${a}`" :key="a" :label="`${label} ${a.toUpperCase()}`" :grip="a.toUpperCase()" :value="axisValue(i)" :mixed="axisMixed(i)" :step="meta.step ?? 0.01" :precision="meta.precision ?? 3" :unit="meta.unit ?? ''" :disabled="disabled" @change="setAxis(i, $event)" @gesture="gesture" />
  </span>

  <!-- a value of one of several types -->
  <span v-else-if="widget === 'scalar'" class="vf-scalar">
    <select :id="`${id}--kind`" :value="scalarKind" :aria-label="`${label} kind`" :disabled="disabled" @change="setKind($event.target.value)">
      <option v-for="t in scalarKinds" :key="t" :value="t">{{ KINDS[t] }}</option>
    </select>
    <ValueField :id="id" :label="label" :schema="{ type: scalarKind }" :value="shown" :mixed="mixed" :optional="false" :disabled="disabled" @change="set" @gesture="gesture" />
  </span>

  <!-- one of an anyOf's branches -->
  <div v-else-if="widget === 'choice'" class="vf-choice">
    <select :id="`${id}--kind`" :value="String(branch)" :aria-label="`${label} kind`" :disabled="disabled" @change="pickBranch($event.target.value)">
      <option v-for="b in branches" :key="b.index" :value="String(b.index)">{{ b.label }}</option>
    </select>
    <ValueField :id="id" :label="label" :schema="branchSchema" :value="branchValue" :mixed="mixed" :optional="optional" :disabled="disabled" :nodes="nodes" @change="setBranchValue" @gesture="gesture" />
  </div>

  <!-- a list: rows to add, remove and move, each its own fields -->
  <div v-else-if="widget === 'list'" :id="id" class="vf-list" role="group" :aria-label="`${name}, ${items.length} ${items.length === 1 ? 'row' : 'rows'}`">
    <div v-for="(item, i) in items" :key="i" class="vf-row" :class="{ block: rowIsBlock(item) }">
      <div class="vf-row-head">
        <span class="vf-row-title" :title="rowTitle(item, i)">{{ i + 1 }}. {{ rowIsBlock(item) ? rowTitle(item, i) : '' }}</span>
        <ValueField v-if="!rowIsBlock(item)" :id="child(i).id" :label="child(i).label" :schema="itemSchema(item)" :value="item" :optional="false" :disabled="disabled" :nodes="nodes" @change="set(setIn(items, [i], $event))" @gesture="gesture" />
        <span class="vf-row-tools">
          <button :id="`${child(i).id}--up`" type="button" class="vf-tool" :aria-label="`Move ${child(i).label} up`" :disabled="disabled || !actions(i).up" @click="set(listMove(items, i, -1))">↑</button>
          <button :id="`${child(i).id}--down`" type="button" class="vf-tool" :aria-label="`Move ${child(i).label} down`" :disabled="disabled || !actions(i).down" @click="set(listMove(items, i, 1))">↓</button>
          <button :id="`${child(i).id}--remove`" type="button" class="vf-tool" :aria-label="`Remove ${child(i).label}`" :disabled="disabled || !actions(i).remove" @click="set(listRemove(items, i))">×</button>
        </span>
      </div>
      <ValueField v-if="rowIsBlock(item)" :id="child(i).id" :label="child(i).label" :schema="itemSchema(item)" :value="item" :optional="false" :disabled="disabled" :nodes="nodes" @change="set(setIn(items, [i], $event))" @gesture="gesture" />
    </div>
    <button :id="`${id}--add`" type="button" class="vf-add" :aria-label="`Add a row to ${label}`" :disabled="disabled || (schema.maxItems !== undefined && items.length >= schema.maxItems)" @click="addRow">+ Add</button>
  </div>

  <!-- a struct: its fields, then keys the schema doesn't name (kept, editable, removable) -->
  <div v-else-if="widget === 'struct'" :id="id" class="vf-struct" role="group" :aria-label="name">
    <div v-for="r in struct.rows" :key="r.key" class="vf-field" :class="{ unknown: !r.known, unset: !r.set }">
      <span class="vf-key">{{ r.key }}<span v-if="r.required" class="vf-req" aria-hidden="true">*</span></span>
      <button v-if="folded(r)" :id="`${child(r.key).id}--set`" type="button" class="vf-add" :aria-label="`Set ${child(r.key).label}`" :disabled="disabled" @click="unfold(r)">+ {{ r.key }}</button>
      <ValueField v-else :id="child(r.key).id" :label="child(r.key).label" :schema="r.schema" :value="structValue[r.key]" :fallback="r.schema.default" :optional="!r.required" :disabled="disabled" :nodes="nodes" @change="setField(r.key, $event)" @gesture="gesture" />
      <button v-if="r.set && !r.required" :id="`${child(r.key).id}--clear`" type="button" class="vf-tool" :aria-label="`${r.known ? 'Clear' : 'Remove'} ${child(r.key).label}`" :disabled="disabled" @click="setField(r.key, undefined)">×</button>
    </div>
    <div v-if="struct.open" class="vf-addkey">
      <input :id="`${id}--newkey`" v-model="newKey" :aria-label="`New key in ${label}`" placeholder="new key" :disabled="disabled" @keydown.enter.prevent="addKey(false)">
      <button :id="`${id}--addkey`" type="button" class="vf-add" :aria-label="`Add a key to ${label}`" :disabled="disabled" @click="addKey(false)">+ Key</button>
    </div>
  </div>

  <!-- a map: renamable keys, one value schema -->
  <div v-else-if="widget === 'map'" :id="id" class="vf-map" role="group" :aria-label="`${name}, ${Object.keys(structValue).length} entries`">
    <div v-for="(v, k) in structValue" :key="k" class="vf-field">
      <input :id="`${child(k).id}--key`" class="vf-mapkey" :value="k" :aria-label="`${child(k).label} key`" :disabled="disabled" @change="set(mapRename(structValue, k, $event.target.value.trim()))">
      <ValueField :id="child(k).id" :label="child(k).label" :schema="schema.additionalProperties ?? schemaOfValue(v)" :value="v" :optional="false" :disabled="disabled" :nodes="nodes" @change="set(setIn(structValue, [k], $event))" @gesture="gesture" />
      <button :id="`${child(k).id}--remove`" type="button" class="vf-tool" :aria-label="`Remove ${child(k).label}`" :disabled="disabled" @click="set(mapRemove(structValue, k))">×</button>
    </div>
    <div class="vf-addkey">
      <input :id="`${id}--newkey`" v-model="newKey" :aria-label="`New key in ${label}`" placeholder="new key" :disabled="disabled" @keydown.enter.prevent="addKey(true)">
      <button :id="`${id}--addkey`" type="button" class="vf-add" :aria-label="`Add a key to ${label}`" :disabled="disabled" @click="addKey(true)">+ Key</button>
    </div>
  </div>

  <!-- a curve: [frame, value, ease?] keys, with a preview -->
  <div v-else-if="widget === 'curve'" :id="id" class="vf-curve" role="group" :aria-label="`${name}, ${keys.length} keys`">
    <svg class="vf-curve-preview" viewBox="-2 -2 124 44" aria-hidden="true"><polyline :points="curve" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
    <div v-for="(k, i) in keys" :key="i" class="vf-row vf-key-row">
      <NumberField :id="`${child(i).id}-x`" :label="`${child(i).label} frame`" grip="t" :value="k[0]" :step="1" :precision="3" :disabled="disabled" @change="setKey(i, 0, $event)" @gesture="gesture" />
      <NumberField :id="`${child(i).id}-y`" :label="`${child(i).label} value`" grip="v" :value="k[1]" :step="meta.step ?? 0.01" :precision="meta.precision ?? 3" :disabled="disabled" @change="setKey(i, 1, $event)" @gesture="gesture" />
      <button :id="`${child(i).id}--remove`" type="button" class="vf-tool" :aria-label="`Remove ${child(i).label}`" :disabled="disabled" @click="set(listRemove(keys, i))">×</button>
    </div>
    <button :id="`${id}--add`" type="button" class="vf-add" :aria-label="`Add a key to ${label}`" :disabled="disabled" @click="set(listAdd(keys, nextCurveKey(keys)))">+ Key</button>
  </div>

  <!-- untyped and empty: nothing to go by but text -->
  <input v-else :id="id" class="mono" :value="shown === undefined ? '' : JSON.stringify(shown)" placeholder="JSON" :aria-label="`${name} (JSON)`" :disabled="disabled" @change="setJson($event.target.value)">
</template>

<style>
.vf-vec { display: flex; gap: 4px; min-width: 0; flex: 1 1 auto; }
.vf-vec .num { flex: 1 1 0; }
.vf-scalar, .vf-choice { display: flex; gap: 4px; flex-wrap: wrap; align-items: flex-start; min-width: 0; }
.vf-list, .vf-struct, .vf-map, .vf-curve { display: flex; flex-direction: column; gap: 4px; width: 100%; min-width: 0; border-left: 2px solid var(--line, #3335); padding-left: 6px; box-sizing: border-box; }
.vf-row { display: flex; flex-direction: column; gap: 2px; }
.vf-row-head { display: flex; align-items: center; gap: 4px; min-width: 0; }
.vf-row-head > :not(.vf-row-title):not(.vf-row-tools) { flex: 1 1 auto; min-width: 0; }
.vf-row-title { color: var(--muted, #888); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vf-row.block .vf-row-title { flex: 1 1 auto; }
.vf-row-tools { display: flex; gap: 2px; margin-left: auto; }
.vf-tool { padding: 0 4px; min-width: 18px; line-height: 16px; font-size: 11px; }
.vf-field { display: flex; align-items: flex-start; gap: 4px; min-width: 0; }
.vf-field > .vf-key, .vf-field > .vf-mapkey { flex: 0 0 72px; width: 72px; overflow: hidden; text-overflow: ellipsis; font-size: 11px; color: var(--muted, #888); padding-top: 3px; }
.vf-field > :nth-child(2) { flex: 1 1 auto; min-width: 0; }
.vf-field.unset > .vf-key { font-style: italic; }
.vf-field.unknown > .vf-key { color: var(--warn, #c90); }
.vf-req { color: var(--accent, #4a8cff); }
.vf-addkey { display: flex; gap: 4px; }
.vf-addkey input { flex: 1 1 auto; min-width: 0; }
.vf-add, .vf-field > .vf-add { align-self: flex-start; flex: 0 0 auto; font-size: 11px; }
.vf-curve-preview { width: 100%; height: 40px; color: var(--accent, #4a8cff); }
.vf-key-row { flex-direction: row; gap: 4px; }
.vf-key-row .num { flex: 1 1 0; }
</style>
