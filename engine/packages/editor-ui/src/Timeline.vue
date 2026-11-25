<script setup>
// The timeline panel (M2 W5): transport, ruler, track headers and lanes, all placed by one TimelineGeometry (pixels per
// frame + the first visible frame), so they can't drift apart. Keys, clips and shots move by drag (snapping to frames,
// markers, shot edges, other keys and the playhead, within 8 px at any zoom) or by the arrow keys; each move is one undo
// step, committed on release. The panel holds no engine objects: it reads plain data (`data`) and emits commands.
// Shared by the editor and the creator (M4 W5, @vrmxg/editor-ui); what an edit becomes is in timeline-ui.js, tested in Node.
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { TimelineGeometry, snapTargets, snapFrame, SNAP_PX, timecode, CLIP_TRACKS, CHANNEL_TRACKS } from '@vrmxg/editor-core';
// M5 W4: frame fields that take arithmetic and arrow keys; the selection's aren't dragged, since a move re-sorts keys and
// clips and the selection keeps its index (a drag passing a neighbour would go on with the neighbour)
import NumberField from './NumberField.vue';
import { TRACK_TYPES, EASES, needsTarget, itemLabel, selectionOf, isSelected, moveCommand, removeCommand, fieldCommand, trackSpec, clipSpec, keyCommand, nudgeCommand } from './timeline-ui.js';

const props = defineProps({ data: { type: Object, default: null }, disabled: { type: Boolean, default: false } });
const emit = defineEmits(['cmd', 'scrub', 'transport', 'select']);

const HEAD = 190, ROW = 30, RULER = 26;
const lanes = ref(null);
const width = ref(800);
const g = reactive(new TimelineGeometry({ pxPerFrame: 3 }));
const sel = ref(null);          // { row, kind, index, channel?, id? } the selected item
const drag = ref(null);         // { item, row, mode: 'move' | 'start' | 'end' | 'scrub', from, start, end, dx0, targets, moved }
const form = reactive({ type: 'animation', target: '', path: 'props.intensity', channel: 'happy', value: '1', clipLen: 24, shotLen: 48, camera: '', marker: 'beat' });

const d = computed(() => props.data);
const rows = computed(() => d.value?.rows ?? []);
const fps = computed(() => d.value?.fps ?? 24);
const ticks = computed(() => g.ticks(width.value, fps.value));
const x = (f) => g.x(f);
const tracks = computed(() => d.value?.seq.tracks ?? []);
const trackOf = (id) => tracks.value.find((t) => t.id === id);
const selectedRow = computed(() => (sel.value ? rows.value.find((r) => r.id === sel.value.row) : null));
const selectedTrack = computed(() => (sel.value && sel.value.row !== 'shots' ? trackOf(sel.value.row) : null));
const selectedItem = computed(() => {
  if (!sel.value) return null;
  const s = d.value?.seq;
  if (sel.value.kind === 'shot') return s?.shots.find((x) => x.id === sel.value.id) ?? null;
  const t = selectedTrack.value; if (!t) return null;
  if (sel.value.kind === 'clip') return t.clips?.[sel.value.index] ?? null;
  if (sel.value.kind === 'key') { const ks = sel.value.channel ? t.keys?.[sel.value.channel] : t.keys; return ks?.[sel.value.index] ?? null; }
  return null;
});
const types = TRACK_TYPES;
const send = (c) => { if (c) emit('cmd', ...c); };
watch(sel, (s) => emit('select', s ? { ...s } : null)); // the creator's storyboard follows the selected shot

function measure() { if (lanes.value) width.value = lanes.value.clientWidth - HEAD; }
let ro = null;
onMounted(() => { measure(); ro = new ResizeObserver(measure); ro.observe(lanes.value); fit(); addEventListener('keydown', onKey); });
onBeforeUnmount(() => { ro?.disconnect(); removeEventListener('keydown', onKey); });
watch(() => d.value?.seq.duration, () => { if (g.x(d.value?.duration ?? 0) < 40) fit(); });
// a choice the open document no longer has (another sequence was opened, a camera was deleted) falls back to the first
watch(() => d.value?.nodes, (n) => { if (n?.length && !n.includes(form.target)) form.target = d.value.characters[0] ?? n[0]; }, { immediate: true });
watch(() => d.value?.cameras, (c) => { if (!c?.includes(form.camera) && form.camera !== 'camera') form.camera = c?.[0] ?? ''; }, { immediate: true });
watch(() => d.value?.set + (d.value?.seq.tracks.length ?? 0), () => { if (sel.value && !selectedRow.value) sel.value = null; });

/** Zoom to show the whole sequence. */
function fit() { const dur = Math.max(24, d.value?.duration ?? 240); g.pxPerFrame = Math.max(0.25, (width.value - 20) / dur); g.visibleStart = 0; }

// ---------------------------------------------------------------- pointer: scrub, drag, zoom
const frameOfEvent = (e) => g.frameAt(e.clientX - lanes.value.getBoundingClientRect().left - HEAD);

function onRulerDown(e) {
  if (props.disabled) return;
  e.target.setPointerCapture(e.pointerId);
  drag.value = { mode: 'scrub' };
  emit('scrub', Math.max(0, Math.round(frameOfEvent(e))));
}

function onItemDown(e, row, item, mode = 'move') {
  if (props.disabled) return;
  e.stopPropagation();
  e.target.setPointerCapture(e.pointerId);
  sel.value = selectionOf(row, item);
  const except = item.kind === 'shot' ? { shot: item.id } : { track: row.id, index: item.index, channel: item.channel ?? null };
  drag.value = { item, row, mode, from: frameOfEvent(e), start: item.start, end: item.end, targets: snapTargets(d.value.seq, { except, playhead: d.value.playhead }), moved: false };
}

function onMove(e) {
  const dr = drag.value; if (!dr) return;
  if (dr.mode === 'scrub') { emit('scrub', Math.max(0, Math.round(frameOfEvent(e)))); return; }
  const delta = frameOfEvent(e) - dr.from, tol = g.frames(SNAP_PX);
  if (Math.abs(delta) * g.pxPerFrame < 2 && !dr.moved) return;
  dr.moved = true;
  if (dr.mode === 'move') {
    const len = (dr.item.end ?? dr.item.start) - dr.item.start;
    // snap whichever edge is nearer a target
    const a = snapFrame(dr.item.start + delta, dr.targets, tol), b = dr.item.end !== undefined ? snapFrame(dr.item.end + delta, dr.targets, tol) : null;
    const start = b && b.snapped && (!a.snapped || Math.abs(b.frame - (dr.item.end + delta)) < Math.abs(a.frame - (dr.item.start + delta))) ? b.frame - len : a.frame;
    dr.start = Math.max(0, start); dr.end = dr.item.end !== undefined ? dr.start + len : undefined;
  } else if (dr.mode === 'start') dr.start = Math.min(snapFrame(dr.item.start + delta, dr.targets, tol).frame, dr.item.end - 1);
  else if (dr.mode === 'end') dr.end = Math.max(snapFrame(dr.item.end + delta, dr.targets, tol).frame, dr.item.start + 1);
}

function onUp() {
  const dr = drag.value; drag.value = null;
  if (!dr || dr.mode === 'scrub' || !dr.moved) return;
  commitMove(dr.row, dr.item, dr.start, dr.end, dr.mode);
}

function commitMove(row, item, start, end, mode = 'move') { send(moveCommand(row, item, start, end, mode)); }

function onWheel(e) {
  if (e.ctrlKey || e.metaKey) { // pinch, or ⌘ + wheel: zoom about the pointer
    const anchor = frameOfEvent(e);
    g.zoom(g.pxPerFrame * Math.exp(-e.deltaY * 0.01), anchor);
  } else g.scroll(g.visibleStart + g.frames(e.deltaX || e.deltaY));
}

/** Where an item draws: being dragged, its drag position; else its own. */
const spanOf = (row, item) => {
  const dr = drag.value;
  if (dr && dr.moved && dr.item.key === item.key) return { start: dr.start, end: dr.end ?? item.end };
  return { start: item.start, end: item.end };
};
const isSel = (row, item) => isSelected(sel.value, row, item);

// ---------------------------------------------------------------- keys: arrows nudge the selection, Delete removes it
const typing = () => /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '');
function onKey(e) {
  if (!d.value || props.disabled || typing() || e.metaKey || e.ctrlKey) return;
  if (e.key === ' ') { e.preventDefault(); emit('transport', 'play'); return; }
  if (!sel.value) { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); emit('scrub', Math.max(0, Math.round(d.value.playhead) + (e.key === 'ArrowLeft' ? -1 : 1))); } return; }
  const row = selectedRow.value, item = row?.items.find((i) => isSel(row, i));
  if (!item) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    send(nudgeCommand(row, item, e.key === 'ArrowLeft' ? -1 : 1, e.shiftKey));
  } else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); }
  else if (e.key === 'Escape') sel.value = null;
}

// ---------------------------------------------------------------- commands from the forms
const ph = () => Math.round(d.value?.playhead ?? 0);
// the frame field keeps what is being typed: a re-render while it has focus (the preview rebuilding) must not reset it
const frameText = ref('0'), frameFocus = ref(false);
watch(() => d.value?.playhead, () => { if (!frameFocus.value) frameText.value = String(ph()); }, { immediate: true });
function addTrack() {
  if (needsTarget(form.type) && form.type !== 'property' && form.type !== 'transform' && !d.value.characters.includes(form.target)) form.target = d.value.characters[0] ?? '';
  emit('cmd', 'addTrack', trackSpec(form));
}
function addShot() { const s = ph(); emit('cmd', 'addShot', { start: s, end: s + Number(form.shotLen), camera: form.camera || undefined, name: `Shot ${(d.value?.seq.shots.length ?? 0) + 1}` }); }
function addKey() { send(keyCommand(selectedTrack.value, form, ph())); }
function addClip() {
  const t = selectedTrack.value; if (!t) return;
  const c = clipSpec(t, form, ph(), d.value.characters);
  if (c) emit('cmd', 'addClip', t.id, c);
}
function removeSelected() { send(removeCommand(sel.value)); sel.value = null; }
function setField(field, raw) { send(fieldCommand(sel.value, field, raw)); }
/** Select an item without dragging it (a click, or an accessibility press). */
// picking an item leaves any field being typed in, so the arrows nudge it (an accessibility press focuses nothing)
const pick = (row, item) => {
  if (drag.value) return;
  sel.value = selectionOf(row, item);
  if (typing()) /** @type {HTMLElement} */ (document.activeElement).blur();
};
defineExpose({ fit, select: (s) => { sel.value = s; } });
</script>

<template>
  <section class="timeline" aria-label="Timeline" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp">
    <div class="tl-bar" role="toolbar" aria-label="Timeline controls">
      <button id="tl-start" type="button" aria-label="Go to start" :disabled="disabled" @click="emit('scrub', d?.range ? d.range[0] : 0)">⏮</button>
      <button id="tl-prev" type="button" aria-label="Previous frame" :disabled="disabled" @click="emit('scrub', Math.max(0, ph() - 1))">◀︎</button>
      <button id="tl-play" type="button" class="play" :disabled="disabled" :aria-label="d?.playing ? 'Pause sequence' : 'Play sequence'" @click="emit('transport', 'play')">{{ d?.playing ? '❚❚' : '▶' }}</button>
      <button id="tl-next" type="button" aria-label="Next frame" :disabled="disabled" @click="emit('scrub', ph() + 1)">▶︎</button>
      <label class="field">Frame <input id="tl-frame" v-model="frameText" type="text" inputmode="numeric" class="num" aria-label="Frame" :disabled="disabled" @focus="frameFocus = true; $event.target.select()" @blur="frameFocus = false; frameText = String(ph())" @change="emit('scrub', Math.max(0, Number(frameText) || 0))"></label>
      <output id="tl-time" :aria-label="`Time ${timecode(ph(), fps)} of ${timecode(d?.duration ?? 0, fps)}`">{{ timecode(ph(), fps) }} / {{ timecode(d?.duration ?? 0, fps) }}</output>
      <span class="sep" />
      <button id="tl-in" type="button" aria-label="Set range in" :disabled="disabled" @click="emit('transport', 'in')">In</button>
      <button id="tl-out" type="button" aria-label="Set range out" :disabled="disabled" @click="emit('transport', 'out')">Out</button>
      <button id="tl-clear-range" type="button" aria-label="Clear range" :disabled="disabled || !d?.range" @click="emit('transport', 'clear')">✕</button>
      <label class="field"><input id="tl-loop" type="checkbox" :checked="d?.loop" aria-label="Loop" @change="emit('transport', 'loop', $event.target.checked)"> Loop</label>
      <span class="sep" />
      <div class="seg" role="radiogroup" aria-label="Preview camera">
        <button id="tl-cam-seq" type="button" role="radio" :aria-checked="d?.previewCamera === 'sequence'" :class="{ on: d?.previewCamera === 'sequence' }" aria-label="Sequence camera" @click="emit('transport', 'camera', 'sequence')">Shot</button>
        <button id="tl-cam-editor" type="button" role="radio" :aria-checked="d?.previewCamera === 'editor'" :class="{ on: d?.previewCamera === 'editor' }" aria-label="Editor camera" @click="emit('transport', 'camera', 'editor')">Editor</button>
      </div>
      <label class="field"><input id="tl-angles" type="checkbox" :checked="d?.angles" aria-label="Angles" @change="emit('transport', 'angles', $event.target.checked)"> Angles</label>
      <button id="tl-edit-view" type="button" :aria-pressed="d?.view === 'edit'" aria-label="Edit view" :disabled="d?.view === 'edit'" @click="emit('transport', 'edit')">Edit view</button>
      <button id="tl-fit" type="button" aria-label="Zoom to fit" @click="fit">Fit</button>
      <output id="tl-scrub" class="muted" :aria-label="d?.scrub ? `Showing frame ${d.scrub.frame} step ${d.scrub.step} alpha ${d.scrub.alpha} world ${d.scrub.hash}` : (d?.building ? 'Building preview' : 'No preview')">{{ d?.building ? 'building preview…' : d?.scrub ? `frame ${d.scrub.frame} · step ${d.scrub.step} α ${d.scrub.alpha} · ${d.scrub.restored === null ? 'stepped' : `from ${d.scrub.restored}`} +${d.scrub.stepped} · ${d.scrub.ms} ms · ${d.scrub.hash}` : '' }}</output>
    </div>

    <div class="tl-body">
      <div ref="lanes" class="tl-lanes" @wheel.prevent="onWheel">
        <div class="tl-ruler" :style="{ height: `${RULER}px` }" aria-label="Ruler" @pointerdown="onRulerDown">
          <div class="tl-corner" :style="{ width: `${HEAD}px` }">{{ d?.set ? `in ${d.set}` : '' }}</div>
          <div class="tl-ticks" :style="{ left: `${HEAD}px` }">
            <div v-if="d?.range" class="tl-range" :style="{ left: `${x(d.range[0])}px`, width: `${x(d.range[1]) - x(d.range[0])}px` }" />
            <div v-for="t in ticks.ticks" :key="t.frame" class="tl-tick" :class="{ major: t.major }" :style="{ left: `${t.x}px` }"><span v-if="t.label">{{ t.label }}</span></div>
            <div v-for="(m, i) in d?.seq.markers ?? []" :key="`m${i}`" class="tl-marker" :style="{ left: `${x(m.frame)}px` }" :title="`${m.name} @${m.frame}`">◆</div>
          </div>
        </div>
        <div class="tl-rows" role="tree" aria-label="Tracks">
          <div v-for="row in rows" :key="row.id" class="tl-row" :class="[row.kind, { selrow: sel?.row === row.id }]" :style="{ height: `${ROW}px` }" role="treeitem" :aria-label="`${row.kind === 'shots' ? 'Shots' : `Track ${row.label}, ${row.type}`}, ${row.items.length} items`">
            <div class="tl-head" :style="{ width: `${HEAD}px` }">
              <span class="tl-type">{{ row.type }}</span>
              <button :id="`tl-head-${row.id}`" type="button" class="tl-name" :title="row.label" :aria-label="`Select ${row.kind === 'shots' ? 'shots' : `track ${row.id}`}`" :aria-pressed="sel?.row === row.id" @click="sel = { row: row.id, kind: 'row' }">{{ row.label }}</button>
              <button v-if="row.kind !== 'shots'" type="button" class="tl-del" :aria-label="`Delete track ${row.id}`" :disabled="disabled" @click.stop="emit('cmd', 'removeTrack', row.id)">✕</button>
            </div>
            <div class="tl-lane" :style="{ left: `${HEAD}px` }">
              <template v-for="item in row.items" :key="item.key">
                <div v-if="item.kind !== 'key'" class="tl-clip" :class="[item.kind, { sel: isSel(row, item) }]" role="button" :aria-label="itemLabel(item)" :aria-selected="isSel(row, item)"
                  :style="{ left: `${x(spanOf(row, item).start)}px`, width: `${Math.max(3, x(spanOf(row, item).end) - x(spanOf(row, item).start))}px` }"
                  @pointerdown="onItemDown($event, row, item)" @click="pick(row, item)">
                  <span class="tl-edge l" @pointerdown="onItemDown($event, row, item, 'start')" /><span class="tl-clabel">{{ item.label }}</span><span class="tl-edge r" @pointerdown="onItemDown($event, row, item, 'end')" />
                </div>
                <div v-else class="tl-key" :class="{ sel: isSel(row, item) }" role="button" :aria-label="itemLabel(item)" :aria-selected="isSel(row, item)" :title="itemLabel(item)"
                  :style="{ left: `${x(spanOf(row, item).start)}px` }" @pointerdown="onItemDown($event, row, item)" @click="pick(row, item)" />
              </template>
            </div>
          </div>
          <div class="tl-playhead" :style="{ left: `${HEAD + x(d?.playhead ?? 0)}px` }" aria-hidden="true" />
        </div>
      </div>

      <aside class="tl-side" aria-label="Timeline edit">
        <div class="tl-form">
          <div class="chips" role="radiogroup" aria-label="Track type">
            <button v-for="t in types" :id="`tl-type-${t}`" :key="t" type="button" role="radio" :aria-checked="form.type === t" :aria-label="`Track type ${t}`" :class="{ on: form.type === t }" :disabled="disabled" @click="form.type = t">{{ t }}</button>
          </div>
          <div v-if="needsTarget(form.type) && form.type !== 'property' && form.type !== 'transform'" class="chips" role="radiogroup" aria-label="Track target">
            <button v-for="n in d?.characters ?? []" :id="`tl-target-${n}`" :key="n" type="button" role="radio" :aria-checked="form.target === n" :aria-label="`Target ${n}`" :class="{ on: form.target === n }" :disabled="disabled" @click="form.target = n">{{ n }}</button>
          </div>
          <label v-if="form.type === 'property' || form.type === 'transform'" class="field">Target <select id="tl-track-target" v-model="form.target" aria-label="Track target" :disabled="disabled"><option v-for="n in d?.nodes ?? []" :key="n" :value="n">{{ n }}</option></select></label>
          <label v-if="form.type === 'property'" class="field">Path <input id="tl-track-path" @focus="$event.target.select()" v-model="form.path" aria-label="Property path" :disabled="disabled"></label>
          <button id="tl-add-track" type="button" aria-label="Add track" :disabled="disabled" @click="addTrack">Add track</button>
        </div>
        <div class="tl-form">
          <div class="chips" role="radiogroup" aria-label="Camera">
            <button v-for="c in d?.cameras ?? []" :id="`tl-cam-${c}`" :key="c" type="button" role="radio" :aria-checked="form.camera === c" :aria-label="`Camera ${c}`" :class="{ on: form.camera === c }" :disabled="disabled" @click="form.camera = c">{{ c }}</button>
          </div>
          <button id="tl-cam-from-view" type="button" aria-label="Camera from view" title="A virtual camera where the editor's view is" :disabled="disabled" @click="emit('transport', 'cameraFromView')">Camera from view</button>
          <label class="field">Length <NumberField id="tl-shot-length" label="Shot length" :value="Number(form.shotLen)" :min="1" :step="1" integer :disabled="disabled" @change="form.shotLen = $event" /></label>
          <button id="tl-add-shot" type="button" aria-label="Add shot at playhead" :disabled="disabled" @click="addShot">Add shot</button>
          <button id="tl-add-marker" type="button" aria-label="Add marker at playhead" :disabled="disabled" @click="emit('cmd', 'addMarker', ph(), form.marker || 'marker')">Marker</button>
        </div>
        <div class="tl-form">
          <label class="field">Value <input id="tl-value" @focus="$event.target.select()" v-model="form.value" aria-label="Key value or clip text" :disabled="disabled"></label>
          <label v-if="selectedTrack && CHANNEL_TRACKS.has(selectedTrack.type)" class="field">Channel <input id="tl-channel" @focus="$event.target.select()" v-model="form.channel" aria-label="Channel" :disabled="disabled"></label>
          <label class="field">Clip <NumberField id="tl-clip-length" label="Clip length" :value="Number(form.clipLen)" :min="1" :step="1" integer :disabled="disabled" @change="form.clipLen = $event" /></label>
          <button id="tl-add-key" type="button" aria-label="Add key at playhead" :disabled="disabled || !selectedTrack || CLIP_TRACKS.has(selectedTrack.type)" @click="addKey">Key</button>
          <button id="tl-add-clip" type="button" aria-label="Add clip at playhead" :disabled="disabled || !selectedTrack || !CLIP_TRACKS.has(selectedTrack.type)" @click="addClip">Clip</button>
        </div>
        <div v-if="selectedItem" id="tl-selection" class="tl-form sel" role="group" :aria-label="`Selected ${sel.kind} in ${sel.row}`">
          <template v-if="sel.kind === 'key'">
            <label class="field">Frame <NumberField id="tl-sel-frame" label="Key frame" :value="selectedItem[0]" :step="1" integer :scrub="false" :disabled="disabled" @change="setField('frame', $event)" /></label>
            <label class="field">Value <input id="tl-sel-value" :value="JSON.stringify(selectedItem[1])" aria-label="Key value" :disabled="disabled" @change="setField('value', $event.target.value)"></label>
            <label class="field">Ease <select id="tl-sel-ease" :value="selectedItem[2] ?? ''" aria-label="Key ease" :disabled="disabled" @change="setField('ease', $event.target.value)"><option v-for="e in EASES" :key="e" :value="e">{{ e || '(linear)' }}</option></select></label>
          </template>
          <template v-else>
            <label class="field">Start <NumberField id="tl-sel-start" label="Start frame" :value="selectedItem.start" :step="1" integer :scrub="false" :disabled="disabled" @change="setField('start', $event)" /></label>
            <label class="field">End <NumberField id="tl-sel-end" label="End frame" :value="selectedItem.end" :step="1" integer :scrub="false" :disabled="disabled" @change="setField('end', $event)" /></label>
            <label v-if="sel.kind === 'shot'" class="field">Name <input id="tl-sel-name" :value="selectedItem.name ?? ''" aria-label="Shot name" :disabled="disabled" @change="setField('name', $event.target.value)"></label>
            <label v-if="selectedTrack?.type === 'camera'" class="field">Camera <select id="tl-sel-camera" :value="selectedItem.camera" aria-label="Clip camera" :disabled="disabled" @change="setField('camera', $event.target.value)"><option v-for="c in d?.cameras ?? []" :key="c" :value="c">{{ c }}</option></select></label>
            <label v-if="selectedTrack?.type === 'dialogue'" class="field">Text <input id="tl-sel-text" :value="selectedItem.text ?? ''" aria-label="Line text" :disabled="disabled" @change="setField('text', $event.target.value)"></label>
            <button v-if="selectedTrack?.type === 'dialogue'" id="tl-regenerate" type="button" aria-label="Regenerate line audio" title="Speak the line's text again with the TTS voice: new audio and timings, one undo step" :disabled="disabled" @click="emit('transport', 'regenerate', { row: sel.row, index: sel.index, text: selectedItem.text ?? '' })">Regenerate</button>
            <label v-if="selectedTrack?.type === 'animation'" class="field">Slot <input id="tl-sel-slot" :value="selectedItem.slot ?? ''" aria-label="Animation slot" :disabled="disabled" @change="setField('slot', $event.target.value)"></label>
            <label v-if="selectedTrack?.type === 'lookAt'" class="field">At <select id="tl-sel-at" :value="selectedItem.at" aria-label="Look at" :disabled="disabled" @change="setField('at', $event.target.value)"><option v-for="n in [...(d?.characters ?? []), 'camera']" :key="n" :value="n">{{ n }}</option></select></label>
            <label v-if="selectedTrack?.type === 'simulation'" class="field">Mode <select id="tl-sel-mode" :value="selectedItem.mode" aria-label="Simulation mode" :disabled="disabled" @change="setField('mode', $event.target.value)"><option value="live">live</option><option value="baked">baked</option></select></label>
          </template>
          <button id="tl-delete" type="button" aria-label="Delete selected item" :disabled="disabled" @click="removeSelected">Delete</button>
        </div>
        <p v-if="d?.angles && d.angleNames.length" class="muted small" :aria-label="`Angles: shot, ${d.angleNames.join(', ')}`">Angles: shot, {{ d.angleNames.join(', ') }}</p>
      </aside>
    </div>
  </section>
</template>

<style>
.timeline { display: flex; flex-direction: column; background: var(--panel); border-top: 1px solid var(--line); min-height: 0; min-width: 0; overflow: hidden; user-select: none; }
.tl-bar { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-bottom: 1px solid var(--line); flex-wrap: nowrap; overflow-x: auto; }
.tl-bar input[type=number], .tl-bar input.num { width: 64px; }
.tl-bar output { white-space: nowrap; font-size: 12px; }
.tl-body { display: flex; flex: 1; min-height: 0; }
.tl-lanes { position: relative; flex: 1; overflow-y: auto; overflow-x: hidden; min-width: 0; }
.tl-ruler { position: sticky; top: 0; z-index: 2; display: flex; background: var(--panel); border-bottom: 1px solid var(--line); cursor: ew-resize; }
.tl-corner { flex: none; font-size: 11px; color: var(--muted); padding: 5px 8px; box-sizing: border-box; border-right: 1px solid var(--line); overflow: hidden; white-space: nowrap; }
.tl-ticks { position: absolute; top: 0; right: 0; bottom: 0; overflow: hidden; }
.tl-tick { position: absolute; bottom: 0; height: 6px; border-left: 1px solid var(--line); }
.tl-tick.major { height: 100%; border-color: var(--muted); }
.tl-tick span { position: absolute; left: 3px; top: 3px; font-size: 10px; color: var(--muted); white-space: nowrap; }
.tl-range { position: absolute; top: 0; bottom: 0; background: color-mix(in srgb, var(--accent) 22%, transparent); }
.tl-marker { position: absolute; bottom: -2px; transform: translateX(-50%); color: #d9a400; font-size: 10px; }
.tl-rows { position: relative; }
.tl-row { position: relative; display: flex; border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent); }
.tl-row.selrow { background: color-mix(in srgb, var(--sel) 35%, transparent); }
.tl-head { flex: none; display: flex; align-items: center; gap: 6px; padding: 0 6px; box-sizing: border-box; border-right: 1px solid var(--line); background: var(--panel); position: relative; z-index: 1; }
.tl-type { font-size: 10px; color: var(--muted); width: 58px; overflow: hidden; } .tl-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; text-align: left; border: 0; background: none; padding: 2px 0; }
.tl-del { padding: 0 5px; font-size: 10px; }
.tl-lane { position: absolute; top: 0; bottom: 0; right: 0; overflow: hidden; }
.tl-clip { position: absolute; top: 4px; bottom: 4px; display: flex; align-items: center; border-radius: 4px; background: color-mix(in srgb, var(--accent) 55%, var(--panel)); color: #fff; font-size: 11px; overflow: hidden; cursor: grab; box-sizing: border-box; }
.tl-clip.shot { background: color-mix(in srgb, #8e6bd8 65%, var(--panel)); }
.tl-clip.sel, .tl-key.sel { outline: 2px solid #0091ff; outline-offset: 0; }
.tl-clabel { flex: 1; padding: 0 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
.tl-edge { width: 6px; align-self: stretch; cursor: ew-resize; flex: none; } .tl-edge:hover { background: rgba(255, 255, 255, 0.35); }
.tl-key { position: absolute; top: 50%; width: 10px; height: 10px; margin: -5px 0 0 -5px; transform: rotate(45deg); background: #e8b931; border: 1px solid #8a6a00; cursor: grab; box-sizing: border-box; }
.tl-playhead { position: absolute; top: 0; bottom: 0; width: 0; border-left: 2px solid #ff4245; pointer-events: none; z-index: 3; }
.tl-side { flex: none; width: 260px; border-left: 1px solid var(--line); overflow-y: auto; padding: 4px 8px; }
.tl-form { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; padding: 5px 0; border-bottom: 1px solid var(--line); }
.tl-form .field input, .tl-form .field select { width: 110px; box-sizing: border-box; }
.chips { display: flex; flex-wrap: wrap; gap: 3px; width: 100%; } .chips button { padding: 1px 6px; font-size: 11px; } .chips button.on { background: var(--accent); color: #fff; border-color: var(--accent); }
.tl-form.sel { background: color-mix(in srgb, var(--sel) 30%, transparent); }
</style>
