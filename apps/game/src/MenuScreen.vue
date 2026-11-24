<script setup>
// One menu screen (M5 W1): a dialog with a heading and real controls. Focus starts on its first control; the arrows (and
// a gamepad, through `command`) move it, Escape (B) goes back. AppProbe and screen readers read the controls' names.
import { ref, onMounted, nextTick } from 'vue';
import { focusFirst, menuCommand } from './menus.js';
import { keyCommand } from './nav.js';

const props = defineProps({ id: { type: String, required: true }, title: { type: String, required: true }, focus: { type: String, default: null } });
const emit = defineEmits(['back']);
const root = ref(null);

onMounted(async () => { await nextTick(); if (root.value) focusFirst(root.value, props.focus); });

/** A gamepad's command (or a key's): → true when the menu used it. */
function command(c) { return root.value ? menuCommand(root.value, c, { back: () => emit('back') }) : false; }

function onKey(e) {
  const c = keyCommand(e);
  if (!c) return;
  // a select keeps its own arrows on the Mac only while its list is open; here up and down move between controls
  if ((c === 'left' || c === 'right') && e.target instanceof HTMLInputElement && e.target.type === 'range') return; // the slider's own
  if (command(c)) { e.preventDefault(); e.stopPropagation(); }
}

defineExpose({ command, focusFirst: () => root.value && focusFirst(root.value, props.focus) });
</script>

<template>
  <section :id="id" ref="root" class="menu" role="dialog" :aria-label="title" @keydown="onKey">
    <h1 class="menu-title">{{ title }}</h1>
    <slot />
  </section>
</template>
