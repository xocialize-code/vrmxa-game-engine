<script setup>
// One row of the scene tree and its children. Click selects (shift adds); drag a row onto another to move it under
// that node. Plain data in, events out: the session lives in the host.
defineOptions({ name: 'TreeItem' });
const props = defineProps({ item: Object, selected: Array, depth: { type: Number, default: 0 } });
const emit = defineEmits(['select', 'reparent']);
const onDrag = (e) => { e.dataTransfer.setData('text/x-vrmxg-node', props.item.id); e.dataTransfer.effectAllowed = 'move'; };
const onDrop = (e) => { const id = e.dataTransfer.getData('text/x-vrmxg-node'); if (id && id !== props.item.id) emit('reparent', id, props.item.id); };
</script>

<template>
  <li role="none">
    <div :id="`node-${item.id}`" class="row" role="treeitem" :aria-selected="selected.includes(item.id)" :aria-expanded="item.children.length ? true : undefined" :aria-label="`${item.label}, ${item.type}`"
         :class="{ sel: selected.includes(item.id), primary: selected.at(-1) === item.id }" :style="{ paddingLeft: `${8 + depth * 14}px` }"
         draggable="true" @click="emit('select', item.id, $event.shiftKey)" @dragstart="onDrag" @dragover.prevent @drop.stop.prevent="onDrop">
      <span class="name">{{ item.label }}</span><span class="type">{{ item.type }}</span>
    </div>
    <ul v-if="item.children.length" role="group">
      <TreeItem v-for="c in item.children" :key="c.id" :item="c" :selected="selected" :depth="depth + 1" @select="(...a) => emit('select', ...a)" @reparent="(...a) => emit('reparent', ...a)" />
    </ul>
  </li>
</template>
