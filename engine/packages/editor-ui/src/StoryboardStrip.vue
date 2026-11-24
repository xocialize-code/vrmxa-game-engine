<script setup>
// The storyboard strip (M4 W5): one card per shot in film order, from @vrmxg/coverage's storyboard() and the
// thumbnails rendered for it (a card without one shows its camera and the line it came from). Clicking a card selects
// the shot; the parent scrubs to its thumbnail frame. Plain data in, events out, like the timeline.
import { computed } from 'vue';
import { storyCards } from './storyboard-ui.js';

const props = defineProps({
  board: { type: Object, default: null },
  thumbs: { type: Object, default: () => ({}) },
  beats: { type: Object, default: () => ({}) },
  playhead: { type: Number, default: -1 },
  selected: { type: String, default: null },
  status: { type: String, default: '' },
});
const emit = defineEmits(['pick', 'line']);
const cards = computed(() => storyCards(props.board, { thumbs: props.thumbs, beats: props.beats, playhead: props.playhead, selected: props.selected }));
</script>

<template>
  <section class="storyboard" aria-label="Storyboard">
    <div class="sb-head"><h2>Storyboard</h2><output id="sb-status" class="muted" :aria-label="`Storyboard ${cards.length} shots${status ? `, ${status}` : ''}`">{{ cards.length }} shots{{ status ? ` · ${status}` : '' }}</output></div>
    <ol class="sb-strip" role="listbox" aria-label="Shots" aria-orientation="horizontal">
      <li v-for="c in cards" :id="`sb-${c.id}`" :key="c.id" class="sb-card" :class="{ current: c.current, sel: c.selected, hand: c.hand, warn: !!(c.crossesLine || c.inGeometry) }" role="option" :aria-selected="c.selected" :aria-label="c.label" tabindex="0"
        @click="emit('pick', c.id, c.frame)" @keydown.enter="emit('pick', c.id, c.frame)">
        <div class="sb-thumb">
          <img v-if="c.thumb" :src="c.thumb" :alt="`Shot ${c.name} at frame ${c.frame}`">
          <span v-else class="sb-cam">{{ c.camera || 'no camera' }}</span>
          <span class="sb-num">{{ c.name }}</span>
        </div>
        <div class="sb-meta">
          <span class="sb-time">{{ c.time }}</span>
          <span v-if="c.notes.length" class="sb-notes" :title="[c.crossesLine, c.inGeometry].filter(Boolean).join('; ')">{{ c.notes.join(' · ') }}</span>
        </div>
        <button v-if="c.line" type="button" class="sb-line" :aria-label="`Script line ${c.line} for shot ${c.name}`" :title="c.text" @click.stop="emit('line', c.line)">{{ c.line }}: {{ c.text }}</button>
      </li>
    </ol>
  </section>
</template>

<style>
.storyboard { display: flex; flex-direction: column; min-height: 0; min-width: 0; background: var(--panel); border-top: 1px solid var(--line); }
.sb-head { display: flex; align-items: center; gap: 8px; padding: 4px 10px; border-bottom: 1px solid var(--line); }
.sb-head h2 { flex: none; }
.sb-strip { display: flex; gap: 8px; list-style: none; margin: 0; padding: 8px 10px; overflow-x: auto; overflow-y: hidden; }
.sb-card { flex: none; width: 168px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); cursor: pointer; overflow: hidden; outline: none; }
.sb-card.current { border-color: #ff4245; }
.sb-card.sel, .sb-card:focus-visible { box-shadow: 0 0 0 2px #0091ff; }
.sb-card.warn .sb-notes { color: #d9822b; }
.sb-thumb { position: relative; aspect-ratio: 16 / 9; background: #0e1014; display: flex; align-items: center; justify-content: center; }
.sb-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.sb-cam { color: #9aa1ad; font-size: 11px; padding: 0 6px; text-align: center; word-break: break-all; }
.sb-num { position: absolute; left: 4px; top: 3px; padding: 0 5px; border-radius: 4px; background: rgba(10, 12, 16, 0.72); color: #fff; font: 600 11px/1.5 ui-monospace, monospace; }
.sb-meta { display: flex; justify-content: space-between; gap: 6px; padding: 3px 6px 0; font-size: 11px; color: var(--muted); }
.sb-line { display: block; width: 100%; margin: 0; padding: 2px 6px 4px; border: 0; border-radius: 0; background: none; text-align: left; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
