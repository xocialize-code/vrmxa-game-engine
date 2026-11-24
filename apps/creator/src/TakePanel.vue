<script setup>
// The take panel (M4 W9): who performs and how, Record and Stop, then Keep or Discard, and the takes kept in the short.
// It shows the deck's state (takes.js status()) and says what the person asked for; the window (App.vue) calls the deck.
import { ref } from 'vue';

const props = defineProps({
  /** takes.js TakeDeck.status() */ st: { type: Object, required: true },
  /** the deck's state in one line (takeLine) */ line: { type: String, default: '' },
  /** the shell's cameras, for a face take: [{ id, name }] */ cameras: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['kind', 'target', 'channel', 'device', 'start', 'stop', 'keep', 'discard', 'remove', 'say']);
const KINDS = [['puppet', 'Puppet'], ['director', 'Director'], ['face', 'Face']];
const CHANNELS = [['blink', 'Blink'], ['mouth', 'Mouth'], ['smile', 'Smile'], ['brows', 'Brows'], ['head', 'Head']];
const words = ref('');
const n = (id) => id.replace(/^take-/, '');
const idle = () => props.st.state === 'idle';
function say() { const t = words.value.trim(); if (!t) return; emit('say', t); words.value = ''; }
</script>

<template>
  <section class="takes" aria-label="Takes">
    <div class="dock-head">
      <h2>Takes</h2>
      <button v-if="st.state === 'recording'" id="take-stop" type="button" class="rec on" aria-label="Stop the take" @click="emit('stop')">■ Stop</button>
      <button v-else id="take-record" type="button" class="rec" aria-label="Record a take" :disabled="disabled || !idle() || !st.performers.length" title="Record from the playhead" @click="emit('start')">● Record</button>
    </div>
    <div class="take-row">
      <div class="seg" role="radiogroup" aria-label="Kind of take">
        <button v-for="[k, label] in KINDS" :id="`take-kind-${k}`" :key="k" type="button" role="radio" :aria-checked="st.kind === k" :aria-label="`${label} take`" :class="{ on: st.kind === k }" :disabled="disabled || !idle()" @click="emit('kind', k)">{{ label }}</button>
      </div>
    </div>
    <div class="take-row">
      <div class="seg" role="radiogroup" aria-label="Who performs">
        <button v-for="p in st.performers" :id="`take-who-${p.id}`" :key="p.id" type="button" role="radio" :aria-checked="(st.target ?? st.performers[0]?.id) === p.id" :aria-label="`${p.name} performs`" :class="{ on: (st.target ?? st.performers[0]?.id) === p.id }" :disabled="disabled || !idle()" @click="emit('target', p.id)">{{ p.name }}</button>
      </div>
    </div>
    <div v-if="st.kind === 'face'" class="take-row wrap">
      <label v-for="[c, label] in CHANNELS" :key="c" class="check"><input :id="`take-ch-${c}`" type="checkbox" :aria-label="`Record her ${label.toLowerCase()}`" :checked="st.channels.includes(c)" :disabled="disabled || !idle()" @change="emit('channel', c, $event.target.checked)"> {{ label }}</label>
      <select v-if="cameras.length" id="take-camera" aria-label="Camera" :value="st.device ?? ''" :disabled="disabled || !idle()" @change="emit('device', $event.target.value || null)">
        <option value="">The default camera</option>
        <option v-for="c in cameras" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
    </div>
    <p id="take-help" class="small muted help">{{ st.help }}</p>
    <form v-if="st.kind === 'director' && st.state === 'recording'" class="take-row" @submit.prevent="say">
      <input id="take-say" v-model="words" aria-label="What you tell her" placeholder="Tell her…" autocomplete="off">
      <button id="take-say-send" type="submit" aria-label="Say it to her" :disabled="!words.trim()">Say</button>
    </form>
    <ol v-if="st.said.length" id="take-said" class="said small" aria-label="The conversation">
      <li v-for="(l, i) in st.said" :key="i"><span :id="`take-said-${i}`" :aria-label="`${l.who}: ${l.text}`"><strong>{{ l.who }}</strong> {{ l.text }}</span></li>
    </ol>
    <div v-if="st.state === 'review'" class="take-row">
      <button id="take-keep" type="button" class="play" :aria-label="`Keep take ${n(st.pending.id)}`" @click="emit('keep')">Keep</button>
      <button id="take-discard" type="button" :aria-label="`Discard take ${n(st.pending.id)}`" @click="emit('discard')">Discard</button>
    </div>
    <output id="take-status" class="small" :class="{ live: st.state === 'recording' }" :aria-label="line">{{ line }}</output>
    <ul v-if="st.takes.length" class="kept" aria-label="Takes kept in the short">
      <li v-for="t in st.takes" :key="t.id">
        <span :id="`take-item-${t.id}`" :aria-label="`Take ${n(t.id)}: ${t.kind}, ${t.target}, frames ${Math.round(t.from)} to ${Math.round(t.to)}, ${t.tracks.length} tracks${t.log ? '' : ', no log in the project'}`"><strong>Take {{ n(t.id) }}</strong> <span class="muted">{{ t.kind }} · {{ t.name }} · {{ Math.round(t.from) }}–{{ Math.round(t.to) }}</span></span>
        <button :id="`take-remove-${t.id}`" type="button" :aria-label="`Remove take ${n(t.id)}`" :disabled="disabled || !idle()" title="Take its tracks out of the short (one undo step); its log stays in the project" @click="emit('remove', t.id)">Remove</button>
      </li>
    </ul>
  </section>
</template>

<style>
.takes { border-bottom: 1px solid var(--line); overflow: auto; flex: none; max-height: 42%; }
.takes .take-row { display: flex; align-items: center; gap: 6px; padding: 4px 10px; }
.takes .take-row.wrap { flex-wrap: wrap; gap: 2px 10px; }
.takes select, .takes input:not([type=checkbox]) { min-width: 0; flex: 1; }
.takes .check { white-space: nowrap; font-size: 12px; }
.takes .check input { padding: 0; margin: 0 2px 0 0; vertical-align: -1px; }
.takes .help { margin: 2px 10px 4px; }
.takes .rec { color: #c0392b; font-weight: 600; } .takes .rec.on { background: #c0392b; color: #fff; border-color: #c0392b; }
.takes output { display: block; padding: 2px 10px 6px; word-break: break-word; }
.takes output.live { color: #c0392b; }
.takes .said { margin: 0; padding: 2px 10px 2px 26px; max-height: 84px; overflow: auto; }
.takes .kept { list-style: none; margin: 0; padding: 0 10px 6px; }
.takes .kept li { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
.takes .kept li > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.takes .kept button { font-size: 12px; padding: 1px 6px; }
</style>
