<script setup>
// The assets panel (M5 W6, AB-T-0606), shared by the editor and the creator: the project's files as tiles with
// thumbnails, type filters, a search field and the project's folders. Drag a tile onto the viewport to place it, or onto
// an inspector slot of the right type (the drag carries the file's kind, so a slot refuses the wrong one while you hover);
// Add places it where the view looks; its Pick button (the tile's picture and name) picks it, for a slot's Use button
// (no drag needed). Plain data in, events
// out; the decisions are assets-ui.js's.
import { computed, ref } from 'vue';
import { ASSET_FILTERS, ASSET_DRAG_ALLOWED, filterAssets, filterCounts, assetFolders, dragTypes } from './assets-ui.js';
import { idPart } from './fields.js';

const props = defineProps({
  /** assetEntries(...) with `thumb` (an image URL, or null while it draws or when the file has none) */
  entries: { type: Array, default: () => [] },
  /** The picked file (a slot's Use button takes it). */
  picked: { type: String, default: '' },
  disabled: Boolean,
  /** Show each tile's Add button (the editor places files; a picker may not). */
  addable: { type: Boolean, default: true },
  /** A line about the thumbnails ("drawing 3 of 20"), or ''. */
  status: { type: String, default: '' },
});
const emit = defineEmits(['add', 'pick']);
const filter = ref('all'), query = ref(''), folder = ref('');
const counts = computed(() => filterCounts(props.entries));
const folders = computed(() => assetFolders(props.entries));
const shown = computed(() => filterAssets(props.entries, { filter: filter.value, query: query.value, folder: folder.value }));
const addId = (ref) => `add-${ref.replace(/[^A-Za-z0-9]+/g, '-')}`; // the editor's earlier asset list's ids, kept for its scenarios
const tileId = (ref) => `asset-${ref.replace(/[^A-Za-z0-9]+/g, '-')}`;
const pickId = (ref) => `pick-${ref.replace(/[^A-Za-z0-9]+/g, '-')}`;
function dragStart(e, entry) {
  for (const [type, data] of Object.entries(dragTypes(entry))) e.dataTransfer.setData(type, data);
  e.dataTransfer.effectAllowed = ASSET_DRAG_ALLOWED;
}
const tileName = (e) => `${e.label} ${e.ref}${e.nodeType ? '' : ' (not placed in a scene)'}${e.thumb ? ', thumbnail' : ''}${props.picked === e.ref ? ', picked' : ''}`;
</script>

<template>
  <section class="assets-panel" aria-label="Assets">
    <div class="ap-head">
      <div class="ap-filters" role="radiogroup" aria-label="Asset type">
        <button
          v-for="f in ASSET_FILTERS" :id="`assets-filter-${f.id}`" :key="f.id" type="button" role="radio" :aria-checked="filter === f.id" :class="{ on: filter === f.id }"
          :aria-label="`${f.label} (${counts[f.id]})`" :disabled="f.id !== 'all' && !counts[f.id]" @click="filter = f.id"
        >{{ f.label }}<span class="ap-count">{{ counts[f.id] }}</span></button>
      </div>
      <input id="assets-search" v-model="query" type="search" placeholder="Search" aria-label="Search assets">
      <slot name="head" />
    </div>
    <div class="ap-body">
      <ul class="ap-folders" role="listbox" aria-label="Folders">
        <li
          v-for="f in folders" :id="`assets-folder-${f.path ? idPart(f.path) : 'all'}`" :key="f.path" role="option" :aria-selected="folder === f.path" :aria-label="`${f.path || 'All folders'} (${f.count})`"
          :class="{ on: folder === f.path }" :style="{ paddingLeft: `${6 + f.depth * 10}px` }" tabindex="0" @click="folder = f.path" @keydown.enter.prevent="folder = f.path"
        >{{ f.name }} <span class="ap-count">{{ f.count }}</span></li>
      </ul>
      <ul class="ap-tiles" role="list" aria-label="Asset files" :aria-description="`${shown.length} shown`">
        <li
          v-for="e in shown" :id="tileId(e.ref)" :key="e.ref" class="ap-tile" :class="{ picked: picked === e.ref }" role="listitem" draggable="true" :title="e.ref" :aria-label="tileName(e)"
          @dragstart="dragStart($event, e)"
        >
          <button :id="pickId(e.ref)" type="button" class="ap-pick" :aria-pressed="picked === e.ref" :aria-label="`Pick ${e.ref}`" @click="emit('pick', e.ref)">
            <span class="ap-thumb" :data-kind="e.kind"><img v-if="e.thumb" :src="e.thumb" alt="" draggable="false"><span v-else class="ap-glyph">{{ e.label }}</span></span>
            <span class="ap-name">{{ e.name }}</span>
            <span class="ap-kind">{{ e.label }}</span>
          </button>
          <button v-if="addable" :id="addId(e.ref)" type="button" :disabled="!e.nodeType || disabled" :aria-label="`Add ${e.ref}`" :title="e.nodeType ? `Add as ${e.nodeType}` : 'Not placed in a scene'" @click.stop="emit('add', e.ref)">Add</button>
        </li>
        <li v-if="!shown.length" class="ap-empty muted" role="listitem">No files match.</li>
      </ul>
    </div>
    <output v-if="status" id="assets-status" class="ap-status" :aria-label="`Thumbnails: ${status}`">{{ status }}</output>
  </section>
</template>

<style>
.assets-panel { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.ap-head { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.ap-filters { display: inline-flex; flex-wrap: wrap; gap: 2px; }
.ap-filters button { padding: 2px 7px; font-size: 12px; }
.ap-filters button.on { background: var(--accent); color: #fff; border-color: var(--accent); }
.ap-count { margin-left: 4px; opacity: 0.7; font-size: 11px; }
.ap-head input[type=search] { flex: 1 1 120px; min-width: 80px; }
.ap-body { display: flex; flex: 1; min-height: 0; }
.ap-folders { list-style: none; margin: 0; padding: 4px 0; width: 150px; flex: none; overflow: auto; border-right: 1px solid var(--line); font-size: 12px; }
.ap-folders li { padding: 2px 8px; cursor: default; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ap-folders li.on { background: var(--sel); }
.ap-tiles { list-style: none; margin: 0; padding: 6px; flex: 1; overflow: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 6px; align-content: start; }
.ap-tile { display: flex; flex-direction: column; gap: 2px; padding: 4px; border: 1px solid var(--line); border-radius: 6px; cursor: grab; min-width: 0; }
.ap-tile.picked { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.ap-thumb { display: flex; align-items: center; justify-content: center; aspect-ratio: 1; background: var(--bg); border-radius: 4px; overflow: hidden; }
.ap-thumb img { width: 100%; height: 100%; object-fit: contain; }
.ap-glyph { font-size: 11px; color: var(--muted); }
.ap-name { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ap-kind { font-size: 10px; color: var(--muted); }
.ap-tile > button:not(.ap-pick) { padding: 1px 6px; font-size: 11px; }
.ap-pick { display: flex; flex-direction: column; gap: 2px; padding: 0; border: 0; background: none; text-align: left; min-width: 0; cursor: inherit; }
.ap-empty { grid-column: 1 / -1; }
.ap-status { padding: 2px 10px; font-size: 11px; color: var(--muted); }
</style>
