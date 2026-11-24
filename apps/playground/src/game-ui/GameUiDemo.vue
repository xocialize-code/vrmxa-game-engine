<script setup>
// The demo page: the canvas, @vrmxg/game-ui's GameOverlay over it, and a small settings panel of the demo's own (the
// game app's menus are W1's) with the package's VolumeControls and RebindList inside. Escape or a gamepad's Menu button
// opens it; B or Escape closes it. Open http://localhost:5181/game-ui.html (npm run dev -w @vrmxg/playground).
import { ref, shallowRef, onMounted, onBeforeUnmount, nextTick } from 'vue';
import GameOverlay from '@vrmxg/game-ui/GameOverlay.vue';
import VolumeControls from '@vrmxg/game-ui/VolumeControls.vue';
import RebindList from '@vrmxg/game-ui/RebindList.vue';
import { useNav } from '@vrmxg/game-ui/use-nav.js';
import { Demo } from './demo.js';

const canvas = ref(null), stage = ref(null), volume = ref(null), menuRoot = ref(null);
const demo = shallowRef(null), flow = shallowRef(null), session = ref(0), menu = ref(false), error = ref('');
let resize = null, wasMenu = false, menuRaf = 0;

// the menu is one navigation scope: the gamepad moves across the volume list, the rebinding list and the buttons
useNav(menuRoot, { input: () => demo.value?.input, onBack: () => closeMenu() });

async function openMenu() { menu.value = true; demo.value.paused = true; await nextTick(); volume.value?.focusFirst(); }
function closeMenu() { menu.value = false; demo.value.paused = false; canvas.value?.focus(); }
async function newGame() { flow.value = await demo.value.newGame(); session.value++; closeMenu(); }
function onKey(e) { if (!e.defaultPrevented && e.code === 'Escape' && !menu.value) { e.preventDefault(); openMenu(); } } // (the menu's own Escape closes it first)
// a gamepad's Menu button opens the settings, as Escape does (the overlay's navigation takes it from there)
function pollMenu() {
  menuRaf = requestAnimationFrame(pollMenu);
  const pressed = (demo.value?.input?.peek().gamepad?.buttons[9] ?? 0) > 0.5;
  if (pressed && !wasMenu && !menu.value) openMenu();
  wasMenu = pressed;
}

onMounted(async () => {
  try {
    demo.value = await new Demo().start(canvas.value);
    flow.value = demo.value.flow;
    resize = () => demo.value.resize(stage.value.clientWidth, stage.value.clientHeight);
    resize(); addEventListener('resize', resize); addEventListener('keydown', onKey);
    menuRaf = requestAnimationFrame(pollMenu);
    window.__demo = demo.value; // for checks in a browser: the session, the settings
  } catch (e) { error.value = String(e?.stack ?? e); window.__errors.push(error.value); }
});
onBeforeUnmount(() => { removeEventListener('resize', resize); removeEventListener('keydown', onKey); cancelAnimationFrame(menuRaf); demo.value?.dispose(); });
</script>

<template>
  <main class="demo">
    <div ref="stage" class="stage">
      <canvas ref="canvas" class="canvas" tabindex="0" aria-label="Game view: Hana's counter" />
      <GameOverlay v-if="flow" :key="session" :flow="flow" :settings="demo.settings" />
      <section v-if="menu && demo" ref="menuRoot" class="menu" role="dialog" aria-label="Settings">
        <h2>Settings</h2>
        <VolumeControls ref="volume" :settings="demo.settings" :input="() => demo.input" @back="closeMenu" />
        <h3>Controls</h3>
        <RebindList :input="() => demo.input" :settings="demo.settings" :hide="['look_x', 'look_y', 'zoom', 'camera_next']" @back="closeMenu" />
        <p class="menu-foot"><button id="menu-resume" type="button" data-nav @click="closeMenu">Resume</button> <button id="menu-new" type="button" data-nav @click="newGame">New game</button></p>
      </section>
    </div>
    <p class="help">D or → pushes the ball (when Hana is done talking). Answer with the mouse, 1–3, the arrows and Enter, or a gamepad's d-pad and A. Escape (or Menu on a gamepad) opens the settings; settings are kept in this browser.</p>
    <pre v-if="error" class="error">{{ error }}</pre>
  </main>
</template>

<style>
html, body { margin: 0; height: 100%; background: #111318; color: #e8e9ec; font: 14px/1.4 system-ui, sans-serif; }
.demo { display: flex; flex-direction: column; height: 100%; }
.stage { position: relative; flex: 1; min-height: 0; }
.canvas { display: block; width: 100%; height: 100%; outline: none; }
.menu { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); max-height: 90%; overflow: auto; padding: 16px 22px; border-radius: 14px; background: rgba(24, 26, 32, 0.97); box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5); }
.menu h2, .menu h3 { margin: 0 0 8px; } .menu h3 { margin-top: 14px; }
.menu-foot button { padding: 6px 14px; border-radius: 8px; border: 1px solid currentColor; background: none; color: inherit; font: inherit; }
.help { margin: 0; padding: 6px 12px; color: #9aa1ad; }
.error { color: #ff8080; white-space: pre-wrap; padding: 8px 12px; }
</style>
