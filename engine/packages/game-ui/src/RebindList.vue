<script setup>
// The rebinding list (M5 W3), for the app's own settings menu: every action with its key and its gamepad button. Press
// a slot, then the new key (Escape cancels) or the new gamepad button; it is used from the next step and saved through
// the settings' store, so it survives a relaunch. A recording replays the same whatever the bindings are: it names
// actions, not keys.
import { ref, shallowRef, computed, onBeforeUnmount } from 'vue';
import { rebindRows, rebindPlan, captureKey, captureButton, describeBinding } from './settings.js';
import { useNav } from './use-nav.js';

const props = defineProps({
  input: { type: [Object, Function], required: true },  // the input service (or a getter: the world's changes with the scene)
  settings: { type: Object, required: true },           // a GameSettings
  labels: { type: Object, default: () => ({}) },        // an action's name in the list ("serve": "Serve")
  hide: { type: Array, default: () => [] },             // actions the list leaves out
});
const emit = defineEmits(['back']);
const root = ref(null), version = ref(0), capturing = ref(null), note = ref('');
/** A capture that would take a key from somewhere else, waiting for the player to confirm: { row, slot, binding, plan, text } */
const pending = shallowRef(null); // shallow: the plan stays plain data (a reactive proxy can't be cloned)
const inputNow = () => (typeof props.input === 'function' ? props.input() : props.input);
const rows = computed(() => { void version.value; return rebindRows(inputNow().bindings(), { labels: props.labels, hide: props.hide }); });
const nav = useNav(root, { input: inputNow, onBack: () => { if (pending.value) keep(); else emit('back'); }, paused: () => capturing.value !== null });
let raf = 0, before = null;

function start(row, slot) {
  if (capturing.value) stop(false); // one capture at a time: a second click replaces the first
  pending.value = null;
  capturing.value = { row, slot }; note.value = '';
  if (slot === 'keyboard') addEventListener('keydown', onKey, true);
  else { before = inputNow().peek().gamepad; raf = requestAnimationFrame(pollPad); }
}
function stop(refocus = true) {
  removeEventListener('keydown', onKey, true);
  if (raf) cancelAnimationFrame(raf);
  raf = 0; before = null;
  const was = capturing.value;
  capturing.value = null;
  if (was && refocus) requestAnimationFrame(() => root.value?.querySelector(`#rebind-${was.row.id}-${was.slot}`)?.focus());
}
function take(binding) {
  if (!capturing.value) return;
  const { row, slot } = capturing.value, input = inputNow();
  const plan = rebindPlan(input.bindings(), row, slot, binding, { labels: props.labels });
  if (plan.conflicts.length) {
    // the key works somewhere else (another action, the other direction of this one): say so, and move it only on a yes
    const where = plan.conflicts.map((c) => c.label).join(' and ');
    pending.value = { row, slot, binding, plan, text: `${describeBinding(binding)} is ${where} now. Move it to ${row.label}?` };
    note.value = pending.value.text;
    stop(false);
    requestAnimationFrame(() => root.value?.querySelector('#rebind-confirm')?.focus());
    return;
  }
  apply(row, slot, plan, '');
  stop();
}
function apply(row, slot, plan, moved) {
  props.settings.rebindAll(inputNow(), plan.changes);
  note.value = `${row.label}: ${slot === 'keyboard' ? 'key' : 'button'} changed${moved}`;
  version.value++;
}
function confirm() {
  const p = pending.value;
  if (!p) return;
  pending.value = null;
  apply(p.row, p.slot, p.plan, `; ${describeBinding(p.binding)} moved from ${p.plan.conflicts.map((c) => c.label).join(' and ')}`);
  requestAnimationFrame(() => root.value?.querySelector(`#rebind-${p.row.id}-${p.slot}`)?.focus());
}
function keep() {
  const p = pending.value;
  pending.value = null; note.value = 'Unchanged';
  if (p) requestAnimationFrame(() => root.value?.querySelector(`#rebind-${p.row.id}-${p.slot}`)?.focus());
}
function onKey(e) {
  e.preventDefault(); e.stopPropagation();
  const b = captureKey(e.code);
  if (b) take(b); else { note.value = 'Unchanged'; stop(); }
}
function pollPad() {
  raf = 0;
  if (!capturing.value) return;
  const now = inputNow().peek().gamepad, b = captureButton(before, now);
  if (b) { take(b); return; }
  before = now ?? before;
  if (!capturing.value) return;
  raf = requestAnimationFrame(pollPad);
}
function reset() { pending.value = null; props.settings.resetBindings(inputNow()); note.value = 'Every action is bound as the game has it'; version.value++; }
const asking = (row, slot) => capturing.value?.row.id === row.id && capturing.value.slot === slot;
onBeforeUnmount(stop);
defineExpose({ focusFirst: () => nav.focusFirst() });
</script>

<template>
  <section ref="root" class="gu-settings gu-rebind" aria-label="Controls" :data-nav-paused="capturing ? '' : null">
    <table class="gu-rebind-table">
      <thead><tr><th scope="col">Action</th><th scope="col">Keyboard</th><th scope="col">Gamepad</th></tr></thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id">
          <th scope="row">{{ r.label }}<span v-if="r.fixed.length" class="gu-fixed"> ({{ r.fixed.join(', ') }})</span></th>
          <template v-if="r.direction !== 0 || r.type === 'button'">
            <td><button :id="`rebind-${r.id}-keyboard`" data-nav type="button" :aria-label="asking(r, 'keyboard') ? `Press a key for ${r.label}, or Escape to cancel` : `${r.label}, keyboard: ${r.keyboard}. Change`" @click="start(r, 'keyboard')">{{ asking(r, 'keyboard') ? 'Press a key…' : r.keyboard }}</button></td>
            <td><button :id="`rebind-${r.id}-gamepad`" data-nav type="button" :aria-label="asking(r, 'gamepad') ? `Press a gamepad button for ${r.label}` : `${r.label}, gamepad: ${r.gamepad}. Change`" @click="start(r, 'gamepad')">{{ asking(r, 'gamepad') ? 'Press a button…' : r.gamepad }}</button></td>
          </template>
          <td v-else colspan="2" class="gu-fixed">{{ r.fixed.join(', ') }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="pending" id="rebind-conflict" class="gu-rebind-conflict" role="alert">{{ pending.text }} <button id="rebind-confirm" data-nav type="button" @click="confirm">Move it</button> <button id="rebind-keep" data-nav type="button" @click="keep">Keep</button></p>
    <p class="gu-rebind-foot"><button id="rebind-reset" data-nav type="button" aria-label="Reset every control to the game's" @click="reset">Reset all</button> <output id="rebind-note" aria-live="polite">{{ note }}</output></p>
  </section>
</template>

<style>
.gu-rebind-table { border-collapse: collapse; }
.gu-rebind-table th, .gu-rebind-table td { padding: 4px 10px 4px 0; text-align: left; }
.gu-rebind-table thead th { font-size: 12px; opacity: 0.7; font-weight: 600; }
.gu-rebind-table td button { min-width: 9em; text-align: left; }
.gu-fixed { opacity: 0.6; font-size: 13px; }
.gu-rebind-conflict { padding: 6px 10px; border-radius: 8px; background: rgba(255, 179, 92, 0.15); }
</style>
