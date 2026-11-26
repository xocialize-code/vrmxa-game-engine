<script setup>
// The project settings panel (M6 W3, AB-T-0646): the game (title, id, version), its scenes (the entry and the scenes it
// can reach), its controls (every action's key and gamepad button, rebound by pressing the new one; the game's own
// actions added and removed) and its physics layers (names, and which pairs collide). Each change is one undo step of
// the project's settings (project-settings.js) and is written to game.json at once. The text fields are
// @vrmxg/editor-ui's ValueField, as in the inspector.
import { ref, onBeforeUnmount } from 'vue';
import ValueField from '@vrmxg/editor-ui/ValueField.vue';
import { captureKey, captureButton, describeBinding } from '@vrmxg/game-ui';

const props = defineProps({
  view: { type: Object, required: true }, // ProjectSettings.view()
  disabled: { type: Boolean, default: false },
  plan: { type: Function, required: true }, // (rowId, slot, binding) → { conflicts }: where that key works now
});
const emit = defineEmits(['op', 'undo', 'redo', 'close']);
const op = (name, ...args) => emit('op', name, ...args);

// ---------------------------------------------------------------- capturing a key or a gamepad button
const capturing = ref(null); // { row, slot }
const pending = ref(null);   // a capture whose key works elsewhere: { row, slot, binding, text }
const note = ref('');
let raf = 0, before = null;
const pads = () => [...(navigator.getGamepads?.() ?? [])].find((p) => p) ?? null;
function start(row, slot) {
  stop(); pending.value = null; note.value = '';
  capturing.value = { row, slot };
  if (slot === 'keyboard') addEventListener('keydown', onKey, true);
  else { before = pads(); raf = requestAnimationFrame(pollPad); }
}
function stop() {
  removeEventListener('keydown', onKey, true);
  if (raf) cancelAnimationFrame(raf);
  raf = 0; before = null; capturing.value = null;
}
function take(binding) {
  const c = capturing.value;
  stop();
  if (!c) return;
  const p = props.plan(c.row.id, c.slot, binding);
  if (p.conflicts.length) {
    pending.value = { row: c.row, slot: c.slot, binding, text: `${describeBinding(binding)} is ${p.conflicts.map((x) => x.label).join(' and ')} now. Move it to ${c.row.label}?` };
    return;
  }
  op('rebind', c.row.id, c.slot, binding);
  note.value = `${c.row.label}: ${describeBinding(binding)}`;
}
function onKey(e) {
  e.preventDefault(); e.stopPropagation();
  const b = captureKey(e.code); // Escape gives none: the capture ends with nothing changed
  if (b) take(b); else { stop(); note.value = 'Unchanged'; }
}
function pollPad() {
  raf = 0;
  if (!capturing.value) return;
  const now = pads(), b = captureButton(before, now);
  if (b) { take(b); return; }
  before = now ?? before;
  raf = requestAnimationFrame(pollPad);
}
function confirmMove() { const p = pending.value; pending.value = null; if (p) { op('rebind', p.row.id, p.slot, p.binding); note.value = `${p.row.label}: ${describeBinding(p.binding)} (moved)`; } }
const asking = (row, slot) => capturing.value?.row.id === row.id && capturing.value.slot === slot;
onBeforeUnmount(stop);

// ---------------------------------------------------------------- actions and layers
const newAction = ref(''), newActionType = ref('button'), newLayer = ref('');
const addAction = () => { if (newAction.value.trim()) { op('addAction', newAction.value.trim(), newActionType.value); newAction.value = ''; } };
const layersWith = (fn) => op('setLayers', fn([...props.view.layers]));
const renameLayer = (i, name) => layersWith((l) => { l[i] = name; return l; });
const moveLayer = (i, by) => layersWith((l) => { const [x] = l.splice(i, 1); l.splice(i + by, 0, x); return l; });
const removeLayer = (i) => layersWith((l) => { l.splice(i, 1); return l; });
// the first layer added to a game with none keeps "default" (where every collider is now) first, unless it is "default"
const addLayer = () => { const n = newLayer.value.trim(); if (n) { layersWith((l) => [...(l.length || n === 'default' ? l : ['default']), n]); newLayer.value = ''; } };
const S = (o) => ({ type: 'string', ...o });
</script>

<template>
  <div class="ask-back">
    <section id="project-settings" class="sheet settings" role="dialog" aria-label="Project settings" aria-modal="true">
      <div class="row">
        <h2>Project Settings <span class="muted small">· {{ view.file }}{{ view.exists ? '' : ' (made by your first change)' }}</span></h2>
        <span class="row-tools">
          <button id="settings-undo" type="button" :disabled="!view.history.undo || disabled" :aria-label="view.history.undo ? `Undo ${view.history.undo}` : 'Undo'" :title="view.history.undo ?? ''" @click="emit('undo')">Undo</button>
          <button id="settings-redo" type="button" :disabled="!view.history.redo || disabled" :aria-label="view.history.redo ? `Redo ${view.history.redo}` : 'Redo'" :title="view.history.redo ?? ''" @click="emit('redo')">Redo</button>
          <button id="settings-done" type="button" class="play" aria-label="Close the project settings" @click="stop(); emit('close')">Done</button>
        </span>
      </div>
      <pre v-if="view.error" id="settings-error" class="error-text" role="alert">{{ view.error }}</pre>

      <div class="settings-cols">
        <section aria-label="Game">
          <h3>Game</h3>
          <div class="field"><span>Title</span><ValueField id="settings-title" label="Game title" :schema="S({})" :value="view.title" :optional="false" :disabled="disabled" @change="(v) => op('setTitle', v ?? '')" /></div>
          <div class="field"><span>Id</span><ValueField id="settings-id" label="Game id" :schema="S({ pattern: '^[a-z0-9][a-z0-9-]{0,63}$' })" :value="view.id" :optional="false" :disabled="disabled" @change="(v) => op('setId', v ?? '')" /></div>
          <div class="field"><span>Version</span><ValueField id="settings-release" label="Game version" :schema="S({})" :value="view.release" :disabled="disabled" @change="(v) => op('setRelease', v ?? '')" /></div>

          <h3>Scenes</h3>
          <div class="field"><span>Starts in</span><ValueField id="settings-entry" label="Entry scene" :schema="{ enum: view.scenes.map((s) => s.ref) }" :value="view.entry || undefined" :disabled="disabled || !view.scenes.length" @change="(v) => op('setEntry', v)" /></div>
          <ul class="plain" aria-label="Scenes in the game">
            <li v-for="s in view.scenes" :key="s.ref"><label><input :id="`settings-scene-${s.ref}`" type="checkbox" :checked="s.included" :disabled="disabled || s.entry" :aria-label="`${s.ref} is in the game${s.entry ? ' (the entry)' : ''}`" @change="op('setScene', s.ref, $event.target.checked)"> {{ s.ref }}<span v-if="s.entry" class="muted small"> (entry)</span></label></li>
          </ul>

          <h3>Physics layers</h3>
          <p class="muted small">A collider names its layer (its Layer prop); none is on the first. {{ view.layers.length ? '' : 'One layer, "default", until you add one.' }}</p>
          <ol class="plain layers" aria-label="Physics layers">
            <li v-for="(l, i) in view.layers" :key="`${i}-${l}`">
              <input :id="`settings-layer-${i}`" :value="l" class="mono" :aria-label="`Layer ${i + 1} name`" :disabled="disabled" @change="renameLayer(i, $event.target.value)">
              <button type="button" :aria-label="`Move ${l} up`" :disabled="disabled || i === 0" @click="moveLayer(i, -1)">↑</button>
              <button type="button" :aria-label="`Move ${l} down`" :disabled="disabled || i === view.layers.length - 1" @click="moveLayer(i, 1)">↓</button>
              <button type="button" :aria-label="`Remove layer ${l}`" :disabled="disabled" @click="removeLayer(i)">Remove</button>
            </li>
          </ol>
          <div class="row-tools"><input id="settings-new-layer" v-model="newLayer" class="mono" placeholder="player" aria-label="New layer name" :disabled="disabled" @keydown.enter="addLayer"><button id="settings-add-layer" type="button" aria-label="Add layer" :disabled="disabled || !newLayer.trim()" @click="addLayer">Add Layer</button></div>
          <div v-if="view.layers.length > 1" class="matrix" role="group" aria-label="Which layers collide" :style="{ gridTemplateColumns: `auto repeat(${view.layers.length}, minmax(3em, auto))` }">
            <span /><span v-for="l in view.layers" :key="l" class="muted small" aria-hidden="true">{{ l }}</span>
            <template v-for="(r, i) in view.matrix" :key="r.layer">
              <span class="muted small" aria-hidden="true">{{ r.layer }}</span>
              <span v-for="(c, j) in r.with" :key="c.layer"><input v-if="j >= i" :id="`settings-collide-${r.layer}-${c.layer}`" type="checkbox" :checked="c.on" :disabled="disabled" :aria-label="`${r.layer} collides with ${c.layer}`" @change="op('setCollides', r.layer, c.layer, $event.target.checked)"></span>
            </template>
          </div>
        </section>

        <section aria-label="Controls">
          <h3>Controls <span class="muted small">{{ view.inputFile ? `· ${view.inputFile}` : view.defaultControls ? '· the engine\'s defaults' : '' }}</span></h3>
          <!-- a grid, not a table: WebKit gives a table's cells to accessibility twice (by row and by column) -->
          <div class="controls" role="list" aria-label="Controls">
            <div class="controls-head" aria-hidden="true"><span>Action</span><span>Keyboard</span><span>Gamepad</span></div>
            <div v-for="r in view.rows" :key="r.id" class="controls-row" role="listitem" :aria-label="r.label">
              <span>{{ r.label }}<span v-if="r.fixed.length" class="muted small"> ({{ r.fixed.join(', ') }})</span></span>
              <template v-if="r.direction !== 0 || r.type === 'button'">
                <button :id="`settings-bind-${r.id}-keyboard`" type="button" class="bind" :disabled="disabled" :aria-label="asking(r, 'keyboard') ? `Press a key for ${r.label}, or Escape to cancel` : `${r.label}, keyboard: ${r.keyboard}. Change`" @click="start(r, 'keyboard')">{{ asking(r, 'keyboard') ? 'Press a key…' : r.keyboard }}</button>
                <button :id="`settings-bind-${r.id}-gamepad`" type="button" class="bind" :disabled="disabled" :aria-label="asking(r, 'gamepad') ? `Press a gamepad button for ${r.label}` : `${r.label}, gamepad: ${r.gamepad}. Change`" @click="start(r, 'gamepad')">{{ asking(r, 'gamepad') ? 'Press a button…' : r.gamepad }}</button>
              </template>
              <span v-else class="muted small wide">{{ r.fixed.join(', ') }}</span>
            </div>
          </div>
          <p v-if="pending" id="settings-rebind-conflict" class="conflict" role="alert">{{ pending.text }} <button id="settings-rebind-move" type="button" @click="confirmMove">Move It</button> <button id="settings-rebind-keep" type="button" @click="pending = null; note = 'Unchanged'">Keep</button></p>
          <p class="row-tools"><button id="settings-reset-controls" type="button" aria-label="Reset the controls to the engine's defaults" :disabled="disabled" @click="op('resetControls')">Default Controls</button> <output id="settings-note" aria-live="polite">{{ note }}</output></p>

          <h4>Actions</h4>
          <ul class="plain" aria-label="The game's actions">
            <li v-for="a in view.actions" :key="a.name"><span class="mono">{{ a.name }}</span> <span class="muted small">{{ a.type }}, {{ a.bindings }} bound</span> <button type="button" :aria-label="`Remove action ${a.name}`" :disabled="disabled" @click="op('removeAction', a.name)">Remove</button></li>
          </ul>
          <div class="row-tools">
            <input id="settings-new-action" v-model="newAction" class="mono" placeholder="serve" aria-label="New action name" :disabled="disabled" @keydown.enter="addAction">
            <select id="settings-new-action-type" v-model="newActionType" aria-label="New action type" :disabled="disabled"><option value="button">Button</option><option value="axis">Axis</option></select>
            <button id="settings-add-action" type="button" aria-label="Add action" :disabled="disabled || !newAction.trim()" @click="addAction">Add Action</button>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>

<style>
.settings { width: min(980px, 94vw); max-height: 84vh; }
.settings > .row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.settings-cols { display: grid; grid-template-columns: 1fr 1.2fr; gap: 24px; }
.settings .field { justify-content: space-between; margin: 6px 0; } .settings .field input:not([type=checkbox]), .settings .field select { width: 220px; box-sizing: border-box; }
.settings .row-tools { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.settings .plain { list-style: none; margin: 0; padding: 0; } .settings .plain li { padding: 2px 0; display: flex; align-items: center; gap: 6px; }
.settings .layers input { width: 140px; }
.settings table { border-collapse: collapse; } .settings th, .settings td { padding: 3px 8px 3px 0; text-align: left; font-weight: normal; }
.settings thead th { font-size: 12px; color: var(--muted); }
.settings .controls-head, .settings .controls-row { display: grid; grid-template-columns: 1fr 9.5em 9.5em; gap: 6px; align-items: center; padding: 2px 0; }
.settings .controls-head { font-size: 12px; color: var(--muted); } .settings .controls .wide { grid-column: 2 / 4; }
.settings .controls .bind { text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.settings .matrix { display: inline-grid; gap: 2px 8px; align-items: center; justify-items: center; margin-top: 6px; }
.settings h4 { font-size: 12px; color: var(--muted); margin: 12px 0 4px; }
.settings .conflict { padding: 6px 10px; border-radius: 8px; background: rgba(255, 179, 92, 0.15); }
</style>
