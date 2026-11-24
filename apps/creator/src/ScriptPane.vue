<script setup>
// The script pane (M4 W5): the short's Fountain script with line numbers, its errors by line (click one to go there),
// and find and replace. Typing applies a moment after it stops (the host re-scripts the sequence as one undo step);
// Apply (⌘↩) applies now. The pane holds only the text being typed; the host owns what was applied.
import { computed, ref, watch, nextTick } from 'vue';

const props = defineProps({
  text: { type: String, default: '' },
  file: { type: String, default: '' },
  errors: { type: Array, default: () => [] },
  warnings: { type: Array, default: () => [] },
  pending: { type: Boolean, default: false },
  dirty: { type: Boolean, default: false },
  last: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['edit', 'apply']);
const area = ref(null), gutter = ref(null);
const local = ref(props.text);
// the host's text wins unless the person is typing something it hasn't seen (undo and redo bring the script back)
watch(() => props.text, (t) => { if (t !== local.value) local.value = t; });
const lines = computed(() => local.value.split('\n').length);
const errorAt = computed(() => new Set(props.errors.map((e) => e.line)));
const find = ref(''), replace = ref(''), found = ref('');

function onInput(e) { local.value = e.target.value; emit('edit', local.value); }
function sync() { if (gutter.value && area.value) gutter.value.scrollTop = area.value.scrollTop; }
function onKey(e) { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); emit('apply'); } }

/** Put the caret at the start of a line and scroll it into view. */
async function goToLine(n) {
  await nextTick();
  const el = area.value; if (!el) return;
  const at = local.value.split('\n').slice(0, Math.max(0, n - 1)).reduce((a, l) => a + l.length + 1, 0);
  el.focus();
  el.setSelectionRange(at, at + (local.value.split('\n')[n - 1]?.length ?? 0));
  el.scrollTop = Math.max(0, (n - 4) * 18);
  sync();
}

/**
 * A find or replace field selects what it holds when it takes focus, as a browser's find bar does: typing a new term
 * replaces the old one. Tabbing in already did this; focus given by assistive technology (and AppProbe) did not, so new
 * text was appended whenever Select All couldn't reach the field: ⌘A acts only while the app is active (AB-T-0598).
 */
function selectAll(e) { e.target.select(); }

/** Replace every match of the find field (plain text), as one edit. */
function replaceAll() {
  const f = find.value;
  if (!f) return;
  const n = local.value.split(f).length - 1;
  found.value = n ? `replaced ${n}` : 'not found';
  if (!n) return;
  local.value = local.value.split(f).join(replace.value);
  emit('edit', local.value);
  emit('apply');
}
defineExpose({ goToLine });
</script>

<template>
  <section class="script" aria-label="Script pane">
    <div class="sp-head">
      <h2>Script</h2>
      <output id="script-state" class="muted" :aria-label="`Script ${file} ${errors.length ? `${errors.length} error${errors.length > 1 ? 's' : ''}` : pending ? 'typing' : 'applied'} ${dirty ? 'unsaved' : 'saved'}`">{{ file }} · {{ errors.length ? `${errors.length} error${errors.length > 1 ? 's' : ''}` : pending ? 'typing…' : 'applied' }}{{ dirty ? ' · unsaved' : '' }}</output>
      <button id="script-apply" type="button" aria-label="Apply script" title="Re-script the sequence now (⌘↩); typing applies on its own a moment after you stop" :disabled="disabled || !pending" @click="emit('apply')">Apply</button>
    </div>
    <div class="sp-find" role="search" aria-label="Find and replace">
      <input id="script-find" v-model="find" aria-label="Find in script" placeholder="Find" :disabled="disabled" @focus="selectAll">
      <input id="script-replace" v-model="replace" aria-label="Replace with" placeholder="Replace" :disabled="disabled" @focus="selectAll">
      <button id="script-replace-all" type="button" aria-label="Replace all in script" :disabled="disabled || !find" @click="replaceAll">Replace</button>
      <output id="script-found" class="muted" :aria-label="found ? `Find: ${found}` : 'Find'">{{ found }}</output>
    </div>
    <div class="sp-body">
      <div ref="gutter" class="sp-gutter" aria-hidden="true"><div v-for="n in lines" :key="n" :class="{ err: errorAt.has(n) }">{{ n }}</div></div>
      <textarea id="script" ref="area" :value="local" aria-label="Script" spellcheck="false" :disabled="disabled" @input="onInput" @scroll="sync" @keydown="onKey" />
    </div>
    <ul v-if="errors.length" id="script-errors" class="sp-errors" aria-label="Script errors">
      <li v-for="e in errors" :key="e.line + e.text"><button type="button" :aria-label="`Error at line ${e.text}`" @click="goToLine(e.line)">{{ e.text }}</button></li>
    </ul>
    <ul v-if="warnings.length" class="sp-warnings" aria-label="Script warnings">
      <li v-for="(w, i) in warnings" :key="i">{{ w }}</li>
    </ul>
    <output v-if="last" id="script-last" class="muted sp-last" :aria-label="`Last re-script: ${last}`">{{ last }}</output>
  </section>
</template>

<style>
.script { display: flex; flex-direction: column; min-height: 0; flex: 1; }
.sp-head { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--line); }
.sp-head h2 { flex: none; } .sp-head output { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.sp-find { display: flex; gap: 4px; padding: 4px 10px; border-bottom: 1px solid var(--line); align-items: center; }
.sp-find input { flex: 1; min-width: 0; font-size: 12px; }
.sp-find output { font-size: 11px; white-space: nowrap; }
.sp-body { display: flex; flex: 1; min-height: 0; }
.sp-gutter { flex: none; width: 34px; overflow: hidden; padding: 6px 4px 6px 0; text-align: right; color: var(--muted); font: 12px/18px ui-monospace, monospace; background: var(--bg); border-right: 1px solid var(--line); box-sizing: border-box; }
.sp-gutter .err { color: #fff; background: #c0392b; border-radius: 3px; }
.sp-body textarea { flex: 1; min-width: 0; resize: none; border: 0; border-radius: 0; padding: 6px 8px; font: 12px/18px ui-monospace, monospace; background: var(--panel); white-space: pre; overflow: auto; outline: none; }
.sp-errors, .sp-warnings { list-style: none; margin: 0; padding: 4px 10px; max-height: 96px; overflow: auto; border-top: 1px solid var(--line); font-size: 12px; }
.sp-errors button { border: 0; background: none; color: #c0392b; padding: 1px 0; text-align: left; }
.sp-warnings li { color: #a66a00; }
.sp-last { display: block; padding: 3px 10px; font-size: 11px; border-top: 1px solid var(--line); }
</style>
