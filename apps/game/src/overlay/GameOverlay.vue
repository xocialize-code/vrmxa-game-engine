<script setup>
// The one seam for everything player-facing over the game (M5 W1): M5 W3's @vrmxg/game-ui overlay (the HUD, interaction
// prompts, dialogue boxes and choices, captions) is mounted here and nowhere else.
//
//   session   the play session (apps/game/src/session.js): `session.flow` is the GameFlow the overlay binds to; null
//             between games. A new game, or a load from the title, makes a new flow: the overlay is mounted again for it
//   settings  the player's volumes and bindings (@vrmxg/game-ui's GameSettings): the overlay puts them on every world
//   version   changes whenever the game's view may have (a step, a scene change, an event)
//
// A choice goes to the simulation as a recorded input (input.choose('dialogue.choose', id)), latched by the next step;
// while a conversation is on screen the overlay holds the devices with its own claim, which the menus' claim
// (input.hold('menu'), host.js) never releases.
import { computed } from 'vue';
import GameUiOverlay from '@vrmxg/game-ui/GameOverlay.vue';

const props = defineProps({
  session: { type: Object, default: null },
  settings: { type: Object, default: null },
  version: { type: Number, default: 0 },
});

const keys = new WeakMap(); let next = 0;
const flow = computed(() => { void props.version; return props.session?.flow ?? null; });
const flowKey = computed(() => { const f = flow.value; if (!f) return 0; if (!keys.has(f)) keys.set(f, ++next); return keys.get(f); });
</script>

<template>
  <div class="game-overlay" data-seam="game-ui">
    <GameUiOverlay v-if="flow" :key="flowKey" :flow="flow" :settings="settings" />
  </div>
</template>

<style scoped>
.game-overlay { position: absolute; inset: 0; pointer-events: none; }
.game-overlay :deep(button) { pointer-events: auto; }
</style>
