<script setup>
// The HUD (M5 W3): the goal, the score and counters, the timers, what the player carries, the prompt for what is in
// reach, the result, "Saved". Plain data in (hudModel), nothing out: it has no controls. Every readout carries its value
// in its accessible name, so AppProbe and a screen reader read the state, not the layout.
defineProps({ model: { type: Object, required: true } });
</script>

<template>
  <section class="gu-hud" aria-label="Game status">
    <p v-if="model.goal" id="hud-goal" class="gu-goal"><span class="gu-sr">Goal: </span>{{ model.goal.text }}</p>
    <div class="gu-stats">
      <p v-if="model.score" id="hud-score" class="gu-stat"><span class="gu-label">{{ model.score.label }}</span> <span class="gu-value">{{ model.score.value }}</span></p>
      <p v-for="c in model.counters" :id="`hud-counter-${c.key}`" :key="c.key" class="gu-stat"><span class="gu-label">{{ c.label }}</span> <span class="gu-value">{{ c.value }}</span></p>
      <p v-for="t in model.timers" :id="`hud-timer-${t.key}`" :key="t.key" class="gu-stat gu-timer" :class="{ urgent: t.urgent, done: t.done }" role="timer"><span class="gu-label">{{ t.label }}</span> <span class="gu-value">{{ t.text }}</span><span class="gu-sr">{{ `${t.urgent ? ', hurry' : ''}${t.running ? '' : ', stopped'}` }}</span></p>
    </div>
    <ul v-if="model.carrying.length" id="hud-carrying" class="gu-carrying" :aria-label="`Carrying: ${model.carrying.map((c) => c.name).join(', ')}`">
      <li v-for="c in model.carrying" :key="c.id">{{ c.name }}</li>
    </ul>
    <div class="gu-prompt-area" aria-live="polite">
      <p v-if="model.prompt" id="hud-prompt" class="gu-prompt"><template v-if="model.prompt.keys.keyboard || model.prompt.keys.gamepad"><span class="gu-sr">Press </span><kbd v-if="model.prompt.keys.keyboard">{{ model.prompt.keys.keyboard }}</kbd><span v-if="model.prompt.keys.keyboard && model.prompt.keys.gamepad" class="gu-sr"> or </span><kbd v-if="model.prompt.keys.gamepad" class="gu-pad"><span class="gu-sr">Gamepad </span>{{ model.prompt.keys.gamepad.replace('Gamepad ', '') }}</kbd><span class="gu-sr"> to </span></template><span class="gu-action">{{ model.prompt.action }}</span></p>
    </div>
    <div class="gu-status" role="status">
      <p v-if="model.outcome" id="hud-outcome" class="gu-outcome" :class="model.outcome">{{ model.outcome === 'won' ? 'You won' : 'You lost' }}</p>
      <p v-if="model.loading" id="hud-loading" class="gu-loading">Loading</p>
      <p v-for="n in model.notices" :id="`hud-notice-${n.id}`" :key="n.id" class="gu-notice">{{ n.text }}</p>
    </div>
  </section>
</template>

<style>
.gu-hud { position: absolute; inset: 0; pointer-events: none; font: 500 15px/1.35 system-ui, sans-serif; color: #fff; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6); }
.gu-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.gu-goal { position: absolute; top: 14px; left: 16px; margin: 0; max-width: 42ch; padding: 6px 10px; border-radius: 8px; background: rgba(12, 14, 20, 0.55); }
.gu-stats { position: absolute; top: 14px; right: 16px; display: flex; gap: 14px; }
.gu-stat { margin: 0; padding: 6px 10px; border-radius: 8px; background: rgba(12, 14, 20, 0.55); font-variant-numeric: tabular-nums; }
.gu-label { opacity: 0.75; font-size: 12px; margin-right: 4px; }
.gu-value { font-weight: 700; }
.gu-timer.urgent .gu-value { color: #ffb35c; }
.gu-carrying { position: absolute; bottom: 16px; left: 16px; display: flex; gap: 6px; margin: 0; padding: 0; list-style: none; }
.gu-carrying li { padding: 4px 8px; border-radius: 6px; background: rgba(12, 14, 20, 0.55); }
.gu-prompt-area { position: absolute; left: 0; right: 0; bottom: 22%; display: flex; justify-content: center; }
.gu-prompt { margin: 0; padding: 6px 12px; border-radius: 999px; background: rgba(12, 14, 20, 0.7); }
.gu-prompt kbd { display: inline-block; min-width: 1.4em; margin-right: 6px; padding: 1px 6px; border-radius: 5px; background: #fff; color: #111; font: 700 13px/1.4 system-ui, sans-serif; text-align: center; text-shadow: none; }
.gu-prompt kbd.gu-pad { border-radius: 999px; }
.gu-prompt kbd + .gu-action, .gu-prompt kbd + .gu-sr + .gu-action { margin-left: 2px; }
.gu-status { position: absolute; top: 30%; left: 0; right: 0; text-align: center; }
.gu-outcome { margin: 0; font-size: 34px; font-weight: 800; }
.gu-notice, .gu-loading { display: inline-block; margin: 4px; padding: 4px 10px; border-radius: 6px; background: rgba(12, 14, 20, 0.7); }
</style>
