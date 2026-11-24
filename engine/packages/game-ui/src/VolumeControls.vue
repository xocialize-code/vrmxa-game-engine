<script setup>
// Volume per audio bus (M5 W3), for the app's own settings menu: a slider and a mute button per bus. Changes apply to
// the audio output at once and are saved through the settings' store. Reachable from the keyboard (Tab, arrows) and a
// gamepad (the d-pad or stick moves between controls, left and right change a slider, A presses, B is `back`).
import { ref, computed } from 'vue';
import { volumeRows } from './settings.js';
import { useNav } from './use-nav.js';

const props = defineProps({
  settings: { type: Object, required: true },           // a GameSettings
  audio: { type: Object, default: null },               // @vrmxg/audio's AudioOutput (or anything with setBus)
  input: { type: [Object, Function], default: null },   // the input service whose gamepad navigates (or a getter)
});
const emit = defineEmits(['back']);
const root = ref(null), version = ref(0);
const rows = computed(() => { void version.value; return volumeRows(props.settings.data); });
const inputNow = () => (typeof props.input === 'function' ? props.input() : props.input);
const nav = useNav(root, { input: inputNow, onBack: () => emit('back') });
function setVolume(bus, percent) { props.settings.setVolume(bus, { volume: Number(percent) / 100 }, props.audio); version.value++; }
function toggle(bus, muted) { props.settings.setVolume(bus, { muted: !muted }, props.audio); version.value++; }
defineExpose({ focusFirst: () => nav.focusFirst() });
</script>

<template>
  <section ref="root" class="gu-settings gu-volume" aria-label="Volume">
    <div v-for="r in rows" :key="r.bus" class="gu-row">
      <label :for="`volume-${r.bus}`" class="gu-row-label">{{ r.label }}</label>
      <input :id="`volume-${r.bus}`" data-nav type="range" min="0" max="100" step="5" :value="r.percent" :aria-label="`${r.label} volume`" :aria-valuetext="`${r.percent} percent${r.muted ? ', muted' : ''}`" @input="setVolume(r.bus, $event.target.value)">
      <output :for="`volume-${r.bus}`" class="gu-percent" aria-hidden="true">{{ r.percent }}%</output>
      <button :id="`mute-${r.bus}`" data-nav type="button" class="gu-mute" :aria-pressed="r.muted ? 'true' : 'false'" :aria-label="`Mute ${r.label}`" @click="toggle(r.bus, r.muted)">{{ r.muted ? 'Muted' : 'Mute' }}</button>
    </div>
  </section>
</template>

<style>
.gu-settings { display: flex; flex-direction: column; gap: 8px; font: 500 15px/1.4 system-ui, sans-serif; }
.gu-row { display: grid; grid-template-columns: 9em 1fr 3.5em auto; align-items: center; gap: 10px; }
.gu-percent { font-variant-numeric: tabular-nums; text-align: right; }
.gu-settings button { padding: 4px 10px; border-radius: 7px; border: 1px solid currentColor; background: none; color: inherit; font: inherit; cursor: pointer; }
.gu-settings button[aria-pressed="true"] { background: rgba(255, 90, 90, 0.2); }
.gu-settings :focus-visible { outline: 3px solid #0a7cff; outline-offset: 2px; }
</style>
