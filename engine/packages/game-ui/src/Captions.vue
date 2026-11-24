<script setup>
// Captions (M5 W3): what each speaker is saying now that the dialogue box isn't showing (captionsModel): a greeting, a
// line the director gave. Plain data in.
defineProps({ lines: { type: Array, default: () => [] } });
</script>

<template>
  <ul id="captions" class="gu-captions" aria-label="Captions" aria-live="polite">
    <li v-for="l in lines" :id="`caption-${l.actor}`" :key="l.actor" :aria-label="l.label"><b aria-hidden="true">{{ l.name }}</b> <span aria-hidden="true">{{ l.text }}</span></li>
  </ul>
</template>

<style>
.gu-captions { position: absolute; left: 0; right: 0; bottom: 12%; display: flex; flex-direction: column; align-items: center; gap: 4px; margin: 0; padding: 0; list-style: none; pointer-events: none; }
.gu-captions li { max-width: 70ch; padding: 4px 10px; border-radius: 6px; background: rgba(0, 0, 0, 0.72); color: #fff; font: 500 16px/1.4 system-ui, sans-serif; }
.gu-captions b { color: #ffd27a; }
</style>
