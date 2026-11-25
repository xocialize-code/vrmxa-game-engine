<script setup>
// The inspector: generated from the registry for the selection's node types (their props' schemas, widgets and
// conditions), plus name, parent and transform. M5 W4: each prop gets a real widget from @vrmxg/editor-ui (vectors, lists
// of structs, maps, curves; no JSON boxes, AB-T-0599), numbers are fields you drag or type arithmetic into (AB-T-0600),
// several selected nodes are edited at once with a mixed state where they differ (AB-T-0601), and a prop whose
// visibleIf doesn't hold is hidden (its value kept) and one whose enabledIf doesn't is disabled (AB-T-0602).
// Every edit commits once (Return, leaving a field, a press), so one edit is one undo step; a drag is one gesture.
// M5 W6: an inner node of a prefab instance is edited here too, its edits the instance's overrides: a dot before each
// field the instance overrides reverts it (AB-T-0603), and the Overrides list is the instance's diff against its prefab,
// with Revert and Apply per field and for all of them. A node's asset is a slot an asset of the right kind drops on (or
// the panel's picked file, by Use), the wrong kind refused (AB-T-0606). Each field, and the transform, copies and pastes
// into a field of the same type (AB-T-0607).
import { computed, ref } from 'vue';
import NumberField from '@vrmxg/editor-ui/NumberField.vue';
import ValueField from '@vrmxg/editor-ui/ValueField.vue';
import { idPart, pasteVerdict, draggedKind, dropVerdict, fileKind, ASSET_MIME } from '@vrmxg/editor-ui';

const props = defineProps({
  data: Object,
  /** The field clipboard (a copied value or transform), for the Paste buttons. */
  clip: { type: Object, default: null },
  /** The assets panel's picked file, for the asset slot's Use button. */
  picked: { type: String, default: '' },
});
const emit = defineEmits(['rename', 'parent', 'axis', 'prop', 'propAxis', 'gesture', 'select', 'revert', 'ovRevert', 'ovApply', 'ovRevertAll', 'ovApplyAll', 'ovCopy', 'slotAsset', 'fieldCopy', 'fieldPaste', 'xformCopy', 'xformPaste']);
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
const XFIELD = { p: 'transform.p', r: 'transform.q', s: 'transform.s' };
const ovName = (what, ov) => `${what} overrides the prefab (prefab: ${ov.base}): revert`;
const canPaste = (p) => pasteVerdict(props.clip, { ...p, nodes: props.data?.nodes });
const canPastePart = () => pasteVerdict(props.clip, { kind: 'part' });
const canPasteAll = () => pasteVerdict(props.clip, { kind: 'transform' });
const rowId = (e) => idPart(e.key);
// the asset slot: a drag of the right kind shows it takes it; the wrong kind says why it won't
const slotState = ref('');
const slot = () => ({ slot: 'asset', types: props.data?.assetSlot?.types ?? [] });
function slotOver(e) {
  const v = dropVerdict(draggedKind(e.dataTransfer?.types), slot());
  slotState.value = v.ok ? 'takes' : `refuses: ${v.reason}`;
  if (v.ok) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } else if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
}
function slotDrop(e) {
  slotState.value = '';
  const ref = e.dataTransfer?.getData(ASSET_MIME);
  if (ref && dropVerdict(fileKind(ref), slot()).ok) emit('slotAsset', ref);
}
const pickedFits = () => !!props.picked && dropVerdict(fileKind(props.picked), slot()).ok && props.picked !== props.data?.assetSlot?.ref;
</script>

<template>
  <section class="inspector" aria-label="Inspector">
    <h2>Inspector</h2>
    <p v-if="!data" class="muted">Nothing selected.</p>
    <form v-else @submit.prevent>
      <p class="kind"><strong id="inspector-id" :aria-label="heading">{{ data.multi ? `${data.ids.length} nodes` : data.id }}</strong> · {{ data.types.join(', ') }}</p>
      <p v-if="data.multi" id="inspector-multi" class="muted small" :aria-label="`Editing ${data.ids.length} nodes: ${data.ids.join(', ')}`">Editing {{ data.ids.join(', ') }}: a change sets every one, as one undo step.</p>
      <p v-else class="muted small">{{ data.description }}</p>
      <p v-if="data.inner" id="inspector-inner" class="small inner-note" :aria-label="`Prefab node ${data.inner.target} of ${data.inner.instance}, from ${data.inner.ref}: edits are the instance's overrides`">
        Prefab node <strong>{{ data.inner.target }}</strong> of {{ data.inner.instance }} ({{ data.inner.ref }}): an edit here overrides the prefab for this instance.
      </p>
      <div
        v-if="data.assetSlot" id="slot-asset" class="slot" :class="{ takes: slotState === 'takes', refuses: slotState.startsWith('refuses') }" role="group"
        :aria-label="`Asset slot: ${data.assetSlot.ref ?? 'empty'}; takes ${data.assetSlot.types.join(' or ')}${slotState ? `; ${slotState}` : ''}`"
        @dragenter="slotOver" @dragover="slotOver" @dragleave="slotState = ''" @drop.prevent="slotDrop"
      >
        <span class="slot-key">Asset</span>
        <span id="slot-asset-ref" class="slot-ref mono" :title="data.assetSlot.ref ?? ''">{{ data.assetSlot.ref ?? 'drop a file here' }}</span>
        <button id="slot-asset-use" type="button" :disabled="!pickedFits()" :aria-label="picked ? `Use ${picked} as the asset` : 'Use the picked asset (pick one in the assets panel)'" :title="picked ? `Use ${picked}` : 'Pick a file in the assets panel first'" @click="emit('slotAsset', picked)">Use</button>
        <span v-if="slotState.startsWith('refuses')" id="slot-asset-why" class="slot-why" role="status">{{ slotState.slice(9) }}</span>
      </div>
      <p v-else-if="data.asset" class="small" :aria-label="`Asset ${data.asset}`">Asset: {{ data.asset }}</p>
      <div v-if="!data.inner" class="insp-row insp-select">
        <select id="inspector-also" value="" aria-label="Also select" title="Add a node to the selection (as Shift-click does), to edit them together" @change="also">
          <option value="">Also select…</option>
          <option v-for="id in others" :key="id" :value="id">{{ id }}</option>
        </select>
        <button v-if="data.sameType.length > data.ids.length" id="inspector-select-type" type="button" :aria-label="`Select every ${data.type}`" :title="`Select all ${data.sameType.length} ${data.type} nodes, to edit them together`" @click="emit('select', data.sameType, false)">All {{ data.sameType.length }} {{ data.type }}</button>
      </div>
      <template v-if="!data.multi">
        <div class="insp-row"><span class="insp-key"><button v-if="data.ov?.name" id="ov-name" type="button" class="ov-dot" :aria-label="ovName('Name', data.ov.name)" :title="`Overridden: the prefab has ${data.ov.name.base}. Click to revert.`" @click="emit('revert', 'name')">●</button>Name</span><input id="field-name" :value="data.name" aria-label="Name" @change="emit('rename', $event.target.value)"></div>
        <label v-if="!data.inner" class="insp-row">Parent
          <select id="field-parent" :value="data.parent ?? ''" aria-label="Parent" @change="emit('parent', $event.target.value || null)">
            <option value="">(scene)</option>
            <option v-for="id in data.nodes.filter((x) => x !== data.id)" :key="id" :value="id">{{ id }}</option>
          </select>
        </label>
      </template>
      <div class="insp-row xform-head">
        <span class="muted small">Transform</span>
        <span class="clip-btns">
          <button id="xform-copy" type="button" class="clip" aria-label="Copy the transform" title="Copy position, rotation and scale" @click="emit('xformCopy', 'all')">Copy</button>
          <button id="xform-paste" type="button" class="clip" :disabled="!canPasteAll().ok" :aria-label="canPasteAll().ok ? 'Paste the transform' : `Paste the transform (${canPasteAll().reason})`" @click="emit('xformPaste', 'all')">Paste</button>
        </span>
      </div>
      <fieldset v-for="x in XFORM" :key="x.part" class="xform"><legend>
        <button v-if="data.ov?.[x.part]" :id="`ov-${x.id}`" type="button" class="ov-dot" :aria-label="ovName(x.name, data.ov[x.part])" :title="`Overridden: the prefab has ${data.ov[x.part].base}. Click to revert.`" @click="emit('revert', XFIELD[x.part])">●</button>{{ x.legend }}
        <span class="clip-btns">
          <button :id="`${x.id}-copy`" type="button" class="clip" :aria-label="`Copy ${x.name}`" @click="emit('xformCopy', x.part)">⧉</button>
          <button :id="`${x.id}-paste`" type="button" class="clip" :disabled="!canPastePart().ok" :aria-label="canPastePart().ok ? `Paste into ${x.name}` : `Paste into ${x.name} (${canPastePart().reason})`" @click="emit('xformPaste', x.part)">⎘</button>
        </span>
      </legend>
        <NumberField
          v-for="(a, i) in AXES" :id="`${x.id}-${a.toLowerCase()}`" :key="a" :label="`${x.name} ${a}`" :grip="a"
          :value="data[x.part][i] ?? undefined" :mixed="data[x.part][i] === null" :step="x.step" :precision="x.precision"
          @change="emit('axis', x.part, i, $event)" @gesture="emit('gesture', $event)"
        />
      </fieldset>
      <h3 v-if="data.props.length">Properties</h3>
      <div v-for="p in shown" :key="`${data.ids.join(',')}:${p.key}`" class="insp-prop" :class="{ set: p.set, block: BLOCK.has(p.widget), off: !p.enabled, mixed: p.mixed }" :title="why(p)">
        <div class="insp-row">
          <span class="insp-key"><button v-if="p.ov" :id="`ov-${p.key}`" type="button" class="ov-dot" :aria-label="ovName(p.key, p.ov)" :title="`Overridden: the prefab has ${p.ov.base}. Click to revert.`" @click="emit('revert', `props.${p.key}`)">●</button>{{ p.key }}<span v-if="p.unit" class="muted"> ({{ p.unit }})</span></span>
          <span class="clip-btns">
            <button :id="`copy-${p.key}`" type="button" class="clip" :aria-label="`Copy ${p.key}`" :disabled="p.mixed" @click="emit('fieldCopy', p)">⧉</button>
            <button :id="`paste-${p.key}`" type="button" class="clip" :disabled="!p.enabled || !canPaste(p).ok" :aria-label="canPaste(p).ok ? `Paste into ${p.key}` : `Paste into ${p.key} (${canPaste(p).reason})`" @click="emit('fieldPaste', p, canPaste(p).value)">⎘</button>
          </span>
          <ValueField
            v-if="!BLOCK.has(p.widget)" :id="`prop-${p.key}`" :label="p.key" :schema="p.schema" :meta="p.meta" :value="p.value" :fallback="p.default"
            :mixed="p.mixed" :axes="data.multi && p.widget === 'vec' ? p.axes : null" :disabled="!p.enabled" :nodes="data.nodes"
            @change="emit('prop', p.key, $event)" @axis="(i, v) => emit('propAxis', p.key, i, v)" @gesture="emit('gesture', $event)"
          />
          <button v-if="p.set" type="button" class="reset" :aria-label="`Reset ${p.key}`" title="Back to the default" :disabled="!p.enabled" @click="emit('prop', p.key, undefined)">↺</button>
        </div>
        <!-- a list or struct that differs between the selected nodes isn't edited as one: an edit would replace each node's whole value -->
        <p v-if="BLOCK.has(p.widget) && p.mixed" :id="`prop-${p.key}--mixed`" class="muted small" :aria-label="`${p.key} (mixed values): select one node to edit it`">Mixed values: select one node to edit {{ p.key }}.</p>
        <ValueField
          v-else-if="BLOCK.has(p.widget)" :id="`prop-${p.key}`" :label="p.key" :schema="p.schema" :meta="p.meta"
          :value="p.value" :fallback="p.default" :disabled="!p.enabled" :nodes="data.nodes"
          @change="emit('prop', p.key, $event)" @gesture="emit('gesture', $event)"
        />
      </div>
      <p v-if="hidden.length" id="props-hidden" class="muted small" :aria-label="`Hidden by their conditions: ${hidden.map((p) => p.key).join(', ')}`" :title="hidden.map((p) => `${p.key}: shown when ${p.visibleIf}`).join('\n')">
        Hidden: {{ hidden.map((p) => p.key).join(', ') }} (their values are kept)
      </p>
      <p v-if="data.behaviours.length" class="small">Behaviours: {{ data.behaviours.join(', ') }}</p>
      <section v-if="data.overrides" id="overrides" class="overrides" :aria-label="`Prefab overrides of ${data.overrides.id}`">
        <h3>Overrides <span class="muted">· {{ data.overrides.ref }}</span></h3>
        <p id="overrides-summary" class="muted small" :aria-label="`${data.overrides.id}: ${data.overrides.entries.length} overrides of ${data.overrides.ref}; ${data.overrides.users} instances of it in this scene`">
          {{ data.overrides.entries.length ? `${data.overrides.entries.length} override${data.overrides.entries.length === 1 ? '' : 's'}` : 'No overrides: the instance is the prefab as it is' }} · {{ data.overrides.users }} instance{{ data.overrides.users === 1 ? '' : 's' }} of it in this scene
        </p>
        <ul class="ov-list">
          <li v-for="e in data.overrides.entries" :id="`ov-row-${rowId(e)}`" :key="e.key" :class="{ stale: e.missing }" :aria-label="`${e.target} ${e.label}: ${e.change === 'added' ? `added ${e.value}` : e.change === 'removed' ? `${e.base}, removed` : `${e.base} to ${e.value}`}${e.missing ? ' (the prefab has no such node)' : ''}`">
            <span class="ov-what"><span class="ov-target">{{ e.target }}</span> {{ e.label }}</span>
            <span class="ov-diff mono"><del v-if="e.change !== 'added'">{{ e.base }}</del><span v-if="e.change === 'changed'"> → </span><ins v-if="e.change !== 'removed'">{{ e.value }}</ins><em v-if="e.change === 'removed'"> removed</em></span>
            <span class="ov-btns">
              <button :id="`ov-revert-${rowId(e)}`" type="button" :aria-label="`Revert ${e.target} ${e.label}`" @click="emit('ovRevert', e.target, e.field)">Revert</button>
              <button :id="`ov-apply-${rowId(e)}`" type="button" :disabled="e.missing || !data.overrides.loaded" :aria-label="`Apply ${e.target} ${e.label} to ${data.overrides.ref}`" @click="emit('ovApply', e.target, e.field, e.label)">Apply</button>
            </span>
          </li>
        </ul>
        <div class="ov-all">
          <button id="ov-revert-all" type="button" :disabled="!data.overrides.entries.length" :aria-label="`Revert all overrides of ${data.overrides.id}`" @click="emit('ovRevertAll')">Revert All</button>
          <button id="ov-apply-all" type="button" :disabled="!data.overrides.entries.some((e) => !e.missing) || !data.overrides.loaded" :aria-label="`Apply all overrides of ${data.overrides.id} to ${data.overrides.ref}`" @click="emit('ovApplyAll')">Apply All…</button>
          <button id="ov-copy" type="button" :disabled="!data.overrides.entries.length" aria-label="Copy the overrides as text" title="The diff as text, for a teammate or an agent" @click="emit('ovCopy', data.overrides.text)">Copy as Text</button>
        </div>
      </section>
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
.ov-dot { border: 0; background: none; color: var(--accent); padding: 0 4px 0 0; font-size: 10px; cursor: pointer; line-height: 1; }
.clip-btns { display: inline-flex; gap: 2px; flex: none; }
.clip { padding: 0 4px; font-size: 11px; line-height: 1.4; opacity: 0.35; }
.insp-row:hover .clip, .xform legend:hover .clip, .clip:focus-visible, .insp-row:focus-within .clip { opacity: 1; }
.xform legend { display: flex; align-items: center; gap: 4px; } .xform legend .clip-btns { margin-left: auto; }
.inner-note { padding: 4px 6px; border-left: 2px solid var(--accent); background: color-mix(in srgb, var(--sel) 50%, transparent); }
.slot { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 6px 0; padding: 4px 6px; border: 1px dashed var(--line); border-radius: 6px; }
.slot.takes { border-color: var(--accent); background: color-mix(in srgb, var(--sel) 60%, transparent); }
.slot.refuses { border-color: #c0392b; }
.slot-key { color: var(--muted); } .slot-ref { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.slot-why { width: 100%; color: #c0392b; font-size: 11px; }
.overrides { margin-top: 12px; border-top: 1px solid var(--line); }
.ov-list { list-style: none; margin: 4px 0; padding: 0; }
.ov-list li { display: grid; grid-template-columns: 1fr auto; gap: 2px 6px; padding: 4px 0; border-bottom: 1px solid var(--line); font-size: 12px; }
.ov-list li.stale { opacity: 0.6; }
.ov-what { min-width: 0; overflow: hidden; text-overflow: ellipsis; } .ov-target { color: var(--muted); }
.ov-diff { grid-column: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .ov-diff del { color: var(--muted); } .ov-diff ins { text-decoration: none; color: var(--accent); }
.ov-btns { grid-column: 2; grid-row: 1 / span 2; display: flex; gap: 4px; align-items: center; } .ov-btns button { padding: 1px 6px; font-size: 11px; }
.ov-all { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.inspector .vf-struct input, .inspector .vf-list input:not([type=checkbox]), .inspector .vf-map input, .inspector .vf-struct select, .inspector .vf-list select { width: 100%; min-width: 0; box-sizing: border-box; }
</style>
