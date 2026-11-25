<script setup>
// The number field (AB-T-0600): drag the grip, or the number itself, across to scrub it (Shift fine, Alt coarse);
// arrow keys step; type a value or arithmetic ("1.5 * 2 + 0.25") and Return or leave the field to commit; Escape puts it
// back. A drag emits `gesture` 'begin', live `change`s, then 'end' (or 'cancel' on Escape): the app makes it one undo
// step. A real <input> with an id and an accessible name, so AppProbe's set_value commits it (the input's change event).
// Several nodes with different values: `mixed` (empty, "—", and "(mixed values)" in its name); typing sets them all.
// Its decisions are ./numbers.js.
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { DRAG_THRESHOLD, dragTo, fillOf, formatNumber, parseNumber, stepBy } from './numbers.js';

const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  value: { type: Number, default: undefined },
  mixed: { type: Boolean, default: false },
  min: { type: Number, default: undefined },
  max: { type: Number, default: undefined },
  step: { type: Number, default: 0.01 },
  precision: { type: Number, default: 3 },
  integer: { type: Boolean, default: false },
  unit: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  grip: { type: String, default: '↔' },
  /** Drag to change it (false: type and arrow keys only, for a value whose edit reorders what holds it). */
  scrub: { type: Boolean, default: true },
});
const emit = defineEmits(['change', 'gesture']);

const opts = () => ({ min: props.min, max: props.max, integer: props.integer, precision: props.integer ? 0 : props.precision, step: props.integer ? Math.max(1, Math.round(props.step)) : props.step });
const shown = () => (props.mixed ? '' : formatNumber(props.value, props.integer ? 0 : props.precision));
const input = ref(null);
const focused = ref(false);
const text = ref(shown());
let committed = text.value; // the text the field last showed or committed: an unchanged field commits nothing
/** Show `t`, in the input at once too: a change or blur event that follows (Return, Escape) then sees nothing new. */
function show(t) { text.value = t; committed = t; if (input.value) input.value.value = t; }
watch(() => [props.value, props.mixed, props.precision], () => { if (!focused.value || drag) show(shown()); });

const fill = computed(() => (props.mixed ? null : fillOf(props.value, props.min, props.max)));
const name = computed(() => (props.mixed ? `${props.label} (mixed values)` : props.label));
const title = computed(() => (props.mixed ? 'Mixed values' : props.value === undefined ? '' : `${formatNumber(props.value, 6)}${props.unit ? ` ${props.unit}` : ''}`));

function commit(raw) {
  if (raw === committed) return;
  const v = parseNumber(raw, opts());
  if (v === null) { show(shown()); return; }
  show(formatNumber(v, opts().precision));
  emit('change', v);
}
const onChange = (e) => commit(e.target.value);

/** @type {null | { x: number, start: number, moved: boolean, fromInput: boolean, last: number }} */
let drag = null;
// Escape during a drag reaches the window, not the field (a grip drag never focuses it): listen there while dragging,
// first, so an app's own Escape (the timeline's: clear the selection) doesn't unmount the field mid-drag.
function onEscape(e) { if (e.key === 'Escape' && drag?.moved) { e.preventDefault(); e.stopImmediatePropagation(); endDrag('cancel'); } }
function endDrag(kind) {
  const d = drag; drag = null;
  globalThis.removeEventListener?.('keydown', onEscape, true);
  if (d?.moved) emit('gesture', kind);
  return d;
}
function onDown(e, fromInput) {
  if (!props.scrub || props.disabled || e.button !== 0 || (fromInput && focused.value)) return;
  if (props.mixed && !fromInput) return; // no common value to drag from: type one
  drag = { x: e.clientX, start: props.value ?? 0, moved: false, fromInput, last: props.value ?? 0 };
  e.currentTarget.setPointerCapture?.(e.pointerId);
  e.preventDefault(); // a press without a drag focuses the field on release
}
function onMove(e) {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  if (!drag.moved) {
    if (Math.abs(dx) < DRAG_THRESHOLD || props.mixed) return;
    drag.moved = true;
    globalThis.addEventListener?.('keydown', onEscape, true);
    emit('gesture', 'begin');
  }
  const v = dragTo(drag.start, dx, { ...opts(), shiftKey: e.shiftKey, altKey: e.altKey });
  if (v === drag.last) return;
  drag.last = v;
  show(formatNumber(v, opts().precision));
  emit('change', v);
}
function onUp(e) {
  if (!drag) return;
  try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch { /* already released */ }
  const d = endDrag(e.type === 'pointercancel' ? 'cancel' : 'end');
  if (d.moved) { e.preventDefault(); return; }
  if (d.fromInput) { input.value?.focus(); input.value?.select(); }
}
// a field taken away mid-drag (its row removed, the selection changed) still closes its gesture
onBeforeUnmount(() => { if (drag) endDrag('end'); });
function onKey(e) {
  if (e.key === 'Enter') { commit(e.target.value); e.target.blur(); }
  else if (e.key === 'Escape') { show(shown()); e.target.blur(); }
  else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !props.mixed) {
    e.preventDefault();
    const v = stepBy(props.value ?? 0, e.key === 'ArrowUp' ? 1 : -1, { ...opts(), shiftKey: e.shiftKey, altKey: e.altKey });
    show(formatNumber(v, opts().precision));
    if (v !== props.value) emit('change', v);
  }
}
function onFocus() { focused.value = true; committed = text.value; }
function onBlur(e) { commit(e.target.value); focused.value = false; show(shown()); }
</script>

<template>
  <span class="num" :class="{ mixed, disabled, still: !scrub }" :title="title">
    <span class="num-grip" aria-hidden="true" @pointerdown="onDown($event, false)" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp">{{ grip }}</span>
    <span v-if="fill !== null" class="num-fill" aria-hidden="true" :style="{ width: `calc((100% - 16px) * ${fill})` }" />
    <input
      :id="id" ref="input" v-model="text" class="num-input" type="text" inputmode="decimal" spellcheck="false" autocomplete="off"
      :aria-label="name" :placeholder="mixed ? '—' : placeholder" :disabled="disabled"
      @focus="onFocus" @blur="onBlur" @change="onChange" @keydown="onKey"
      @pointerdown="onDown($event, true)" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp"
    >
  </span>
</template>

<style>
.num { position: relative; display: inline-flex; align-items: stretch; min-width: 0; }
.num-grip { flex: 0 0 14px; display: flex; align-items: center; justify-content: center; cursor: ew-resize; color: var(--muted, #888); font-size: 10px; user-select: none; touch-action: none; }
.num.mixed .num-grip, .num.disabled .num-grip, .num.still .num-grip { cursor: default; opacity: 0.5; }
.num.still .num-input { cursor: text; }
.num-fill { position: absolute; left: 16px; bottom: 1px; height: 2px; background: var(--accent, #4a8cff); opacity: 0.6; pointer-events: none; }
.num-input { flex: 1 1 auto; min-width: 0; width: 100%; font-variant-numeric: tabular-nums; cursor: ew-resize; }
.num-input:focus { cursor: text; }
</style>
