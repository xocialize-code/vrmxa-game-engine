<script setup>
// The one seam for everything player-facing over the game (M5 W1). M5 W3's @vrmxg/game-ui (the HUD, interaction prompts,
// dialogue boxes and choices, speech bubbles, captions) mounts here and nowhere else: wiring it in is a change to this
// file. It is handed what that package binds to:
//
//   session   the play session (apps/game/src/session.js): `session.flow` is the GameFlow (view(), on(), version);
//             `session.tree` the world being played; null between games
//   input     () => the input service of the world being played (@vrmxg/input), where a choice becomes a recorded,
//             latched input; null between games
//   settings  the settings store (settings.js): `value.volume`, `value.bindings`, set(patch), on(fn)
//   version   changes whenever the game's view may have (a step, a scene change, an event): re-read the session then
//   playing   true while the game steps (no menu is open)
//
// Until then it draws nothing: the game app has no HUD of its own (M5-PLAN W1/W3 split).
defineProps({
  session: { type: Object, default: null },
  input: { type: Function, required: true },
  settings: { type: Object, required: true },
  version: { type: Number, default: 0 },
  playing: { type: Boolean, default: false },
});
</script>

<template>
  <div class="game-overlay" data-seam="game-ui" aria-hidden="true" />
</template>

<style scoped>
.game-overlay { position: absolute; inset: 0; pointer-events: none; }
</style>
