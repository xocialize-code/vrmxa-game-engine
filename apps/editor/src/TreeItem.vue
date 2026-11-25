<script setup>
// One row of the scene tree and its children. Click selects (shift adds); drag a row onto another to move it under
// that node, or onto an inspector node slot. Plain data in, events out: the session lives in the host.
// M5 W6: a prefab instance's inner nodes are rows too (`inner`: selected and edited as overrides, never moved), a dot
// marks what an instance overrides, a row folds (an instance starts folded), and a search's matches are highlighted.
defineOptions({ name: 'TreeItem' });
const props = defineProps({ item: Object, selected: Array, depth: { type: Number, default: 0 } });
const emit = defineEmits(['select', 'reparent', 'fold']);
const onDrag = (e) => { if (props.item.inner) { e.preventDefault(); return; } e.dataTransfer.setData('text/x-vrmxg-node', props.item.id); e.dataTransfer.effectAllowed = 'copyMove'; };
const onDrop = (e) => { const id = e.dataTransfer.getData('text/x-vrmxg-node'); if (id && id !== props.item.id && !props.item.inner) emit('reparent', id, props.item.id); };
const name = () => `${props.item.label}, ${props.item.type}${props.item.inner ? ', prefab node' : ''}${props.item.overridden ? ', overridden' : ''}${props.item.folded ? `, ${props.item.folded} inside` : ''}${props.item.match ? ', matches the search' : ''}`;
</script>

<template>
  <li role="none">
    <div :id="`node-${item.id}`" class="row" role="treeitem" :aria-selected="selected.includes(item.id)" :aria-expanded="item.canFold ? !item.folded : undefined" :aria-level="depth + 1" :aria-label="name()"
         :class="{ sel: selected.includes(item.id), primary: selected.at(-1) === item.id, inner: item.inner, match: item.match }" :style="{ paddingLeft: `${8 + depth * 14}px` }"
         :draggable="!item.inner" tabindex="-1" @click="emit('select', item.id, $event.shiftKey)" @keydown.enter.prevent="emit('select', item.id, false)" @dragstart="onDrag" @dragover.prevent @drop.stop.prevent="onDrop">
      <button v-if="item.canFold" :id="`fold-${item.id}`" type="button" class="disc" :aria-label="`${item.folded ? 'Expand' : 'Collapse'} ${item.label}`" @click.stop="emit('fold', item.id)">{{ item.folded ? '▸' : '▾' }}</button>
      <span v-else class="disc-space" />
      <span v-if="item.overridden" class="ov-mark" title="Overrides its prefab" aria-hidden="true">●</span>
      <span class="name">{{ item.label }}</span>
      <span v-if="item.folded" class="badge" aria-hidden="true">{{ item.folded }}</span>
      <span class="type">{{ item.type }}</span>
    </div>
    <ul v-if="item.children.length" role="group">
      <TreeItem v-for="c in item.children" :key="c.id" :item="c" :selected="selected" :depth="depth + 1" @select="(...a) => emit('select', ...a)" @reparent="(...a) => emit('reparent', ...a)" @fold="(...a) => emit('fold', ...a)" />
    </ul>
  </li>
</template>
