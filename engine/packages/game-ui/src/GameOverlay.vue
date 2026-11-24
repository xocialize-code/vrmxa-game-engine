<script setup>
// The root overlay (M5 W3) an app mounts over its canvas and hands the session: the HUD, the dialogue box and the
// captions, bound to a @vrmxg/game GameFlow (it outlives worlds) through OverlayBinding. Once a frame it asks the binding
// whether anything changed (the step, the game's version, the conversation, the bindings) and redraws only then: it
// updates from the step, never from a wall clock. A choice the player makes goes to the simulation as a recorded input
// (input.choose); while a conversation is going on the overlay has the keyboard and the gamepad (its own claim on them: input.hold).
//
//   <GameOverlay :flow="flow" :settings="settings" />     (in a positioned box over the canvas)
import { ref, shallowRef, nextTick, onMounted, onBeforeUnmount, watch } from 'vue';
import Hud from './Hud.vue';
import DialogueBox from './DialogueBox.vue';
import Captions from './Captions.vue';
import { OverlayBinding } from './overlay.js';
import { hudModel } from './hud.js';
import { choose, advance, choiceForKey } from './dialogue-ui.js';
import { useNav } from './use-nav.js';

const props = defineProps({
  flow: { type: Object, required: true },                // a @vrmxg/game GameFlow
  settings: { type: Object, default: null },             // a GameSettings: put on every world's input service
  player: { type: String, default: null },               // whose prompt and inventory (default: the player's)
  hold: { type: String, default: 'conversation' },       // when the overlay takes the devices: conversation | choice | never
  captions: { type: Boolean, default: true },
  hud: { type: Boolean, default: true },
  model: { type: Object, default: null },                // a model to draw as is (tests, a server render): no binding
});
const emit = defineEmits(['choose', 'advance']);
const root = ref(null);
const empty = { hud: hudModel(null), dialogue: null, captions: [], holding: false };
const state = shallowRef(props.model ?? empty);
let binding = null, raf = 0;

const inputNow = () => props.flow.tree?.services.get('input') ?? null;
const nav = useNav(root, {
  input: inputNow,
  grab: () => state.value.holding, // only while the game's devices are the overlay's: never one key for both
  onKey: (e) => { if (e.repeat) return false; const c = choiceForKey(state.value.dialogue, e.code); if (c) { onChoose(c.id); return true; } return false; },
});

/** Read the session now and redraw if anything changed (`force`: redraw anyway). → the model */
function sync(force = false) {
  if (!binding) return state.value;
  const m = force ? binding.read() : binding.sync();
  if (m) state.value = m;
  return state.value;
}
function onChoose(id) { const input = inputNow(); if (input && choose(input, id)) emit('choose', id); }
function onAdvance() { const input = inputNow(); if (input && advance(input)) emit('advance'); }

// When the conversation asks, or a line starts, focus goes to its first control, while the overlay holds the devices:
// a gamepad or the keys answer at once. (With hold 'choice' or 'never' the game has the keys meanwhile: no focus taken.)
watch(() => (state.value.dialogue && state.value.holding ? `${state.value.dialogue.asking}|${state.value.dialogue.text}` : ''), async (k) => { if (k) { await nextTick(); nav.focusFirst(); } });

function frame() { raf = requestAnimationFrame(frame); sync(); }
onMounted(() => {
  if (props.model) return;
  binding = new OverlayBinding(props.flow, { settings: props.settings, player: props.player, hold: props.hold });
  sync(true);
  raf = requestAnimationFrame(frame);
});
onBeforeUnmount(() => { if (raf) cancelAnimationFrame(raf); binding?.dispose(); binding = null; });
defineExpose({ sync, choose: onChoose, advance: onAdvance });
</script>

<template>
  <div ref="root" class="gu-overlay" role="region" aria-label="Game">
    <Hud v-if="hud" :model="state.hud" />
    <Captions v-if="captions && state.captions.length" :lines="state.captions" />
    <DialogueBox v-if="state.dialogue" :model="state.dialogue" @choose="onChoose" @advance="onAdvance" />
  </div>
</template>

<style>
.gu-overlay { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.gu-overlay button { pointer-events: auto; }
</style>
