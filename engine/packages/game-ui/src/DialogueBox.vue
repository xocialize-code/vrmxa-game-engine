<script setup>
// The dialogue box (M5 W3): who is speaking, the line word by word as it is said, and the choices once the line asks.
// The line is text in a polite live region (a screen reader says it once, whole; the words only change colour as they
// are said), with the speaker's name first. Plain data in (dialogueModel), events out: `choose` with the choice's id and `advance`. The parent hands them to the
// simulation as recorded inputs; this component changes nothing itself. Choices are buttons in a list, numbered (a digit
// key picks one), with accessible names that say which of how many.
defineProps({ model: { type: Object, required: true } });
const emit = defineEmits(['choose', 'advance']);
</script>

<template>
  <section id="dialogue" class="gu-dialogue" role="dialog" aria-modal="false" :aria-label="model.name ? `Conversation with ${model.name}` : 'Conversation'">
    <div class="gu-line-area" aria-live="polite">
      <p id="dialogue-line" class="gu-line"><strong v-if="model.name" class="gu-name">{{ model.name }}<span class="gu-sr">: </span></strong><span v-for="(w, i) in model.words" :key="i" :class="i < model.spoken ? 'said' : 'unsaid'">{{ i + 1 < model.words.length ? `${w} ` : w }}</span></p>
    </div>
    <ol v-if="model.asking" id="dialogue-choices" class="gu-choices" aria-label="Choices">
      <li v-for="c in model.choices" :key="c.id">
        <button :id="`dialogue-choice-${c.id}`" type="button" data-nav class="gu-choice" :aria-label="c.label" @click="emit('choose', c.id)">
          <span v-if="c.key" class="gu-num" aria-hidden="true">{{ c.key }}</span>{{ c.text }}
        </button>
      </li>
    </ol>
    <button v-else-if="model.canAdvance" id="dialogue-continue" type="button" data-nav class="gu-continue" aria-label="Continue" @click="emit('advance')">Continue</button>
  </section>
</template>

<style>
.gu-dialogue { position: absolute; left: 50%; bottom: 24px; transform: translateX(-50%); width: min(720px, calc(100% - 32px)); padding: 14px 18px; border-radius: 14px; background: rgba(250, 248, 242, 0.96); color: #1d1f24; font: 500 17px/1.45 system-ui, sans-serif; box-shadow: 0 6px 24px rgba(0, 0, 0, 0.3); pointer-events: auto; }
.gu-line { margin: 0; min-height: 2.9em; }
.gu-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.gu-name { display: block; font-size: 13px; letter-spacing: 0.02em; text-transform: uppercase; color: #8a4b22; }
.gu-line .unsaid { color: #a3a6ad; }
.gu-choices { display: flex; flex-direction: column; gap: 6px; margin: 10px 0 0; padding: 0; list-style: none; }
.gu-choice, .gu-continue { display: block; width: 100%; padding: 8px 12px; border: 1px solid #d8d3c6; border-radius: 9px; background: #fff; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.gu-continue { width: auto; margin: 8px 0 0 auto; }
.gu-choice:focus-visible, .gu-continue:focus-visible, .gu-choice:hover { outline: none; border-color: #0a7cff; box-shadow: 0 0 0 3px rgba(10, 124, 255, 0.35); }
.gu-num { display: inline-block; width: 1.4em; margin-right: 8px; border-radius: 4px; background: #eee9dc; text-align: center; font-weight: 700; }
</style>
