// The page the browsers run (acceptance/m5/dialogue.mjs, dialogue-wkwebview.sh): the scenario with the test game's
// scenes bundled in, and the real GameOverlay mounted over the session: the player's choice is a click on its button.
// ?delay=none | steady | varied picks how long each world takes to load here.
import { createApp, h, nextTick } from 'vue';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { parse } from '@vrmxg/scene';
import GameOverlay from '../../../engine/packages/game-ui/src/GameOverlay.vue';
import counter from '../../../engine/packages/game-ui/test/fixtures/counter.vrmxs?raw';
import ending from '../../../engine/packages/game-ui/test/fixtures/ending.vrmxs?raw';
import { runDialogueScenario, DELAYS } from '../dialogue-scenario.js';

const w = /** @type {any} */ (window);
w.__errors = [];

// Mount the overlay over the session. The answer: redraw from the session now, wait for Vue's DOM, click the button
// whose accessible name is the choice's.
async function mount(flow) {
  let overlay = null;
  const app = createApp({ render: () => h(GameOverlay, { flow, ref: (r) => { overlay = r; } }) });
  app.mount('#stage');
  await nextTick();
  const seen = { clicked: null, labels: [], hud: null };
  return {
    answer: async (_binding, _model, id) => {
      overlay.sync(true); await nextTick(); await nextTick(); // the redraw, then the overlay's focus on the first choice
      const button = /** @type {HTMLButtonElement | null} */ (document.querySelector(`#dialogue-choice-${id}`));
      if (!button) throw new Error(`no button for the choice "${id}" in the overlay`);
      seen.labels = [...document.querySelectorAll('#dialogue-choices button')].map((b) => b.getAttribute('aria-label'));
      seen.hud = ['hud-goal', 'hud-score', 'hud-timer-clock'].map((i) => document.getElementById(i)?.getAttribute('aria-label') ?? null);
      seen.focused = document.activeElement?.id ?? null;
      button.click();
      seen.clicked = button.getAttribute('aria-label');
    },
    dom: () => seen,
    unmount: () => app.unmount(),
  };
}

try {
  installPortableMath();
  const scenes = new Map([['counter.vrmxs', parse(counter)], ['ending.vrmxs', parse(ending)]]);
  const delay = new URLSearchParams(location.search).get('delay') ?? 'varied';
  const result = await runDialogueScenario(await loadRapier(), scenes, { delays: DELAYS[delay] ?? [], sleep: (ms) => new Promise((ok) => setTimeout(ok, ms)), mount });
  w.__result = { ...result, delay, ua: navigator.userAgent };
} catch (e) { w.__errors.push(String(e?.stack ?? e)); }
const r = w.__result;
document.getElementById('out').textContent = r ? JSON.stringify({ final: r.final, all: r.all, recording: r.recording, replay: r.replay, dom: r.dom, view: r.view }, null, 1) : w.__errors.join('\n');
w.READY = true;
