// The page the browsers run (acceptance/m5/flow.mjs, flow-wkwebview.sh): the scenario, with the fixture's scenes bundled
// in. ?delay=none | steady | varied picks how long each world takes to load here.
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { parse } from '@vrmxg/scene';
import title from '../../../engine/packages/game/test/fixtures/title.vrmxs?raw';
import level from '../../../engine/packages/game/test/fixtures/level.vrmxs?raw';
import ending from '../../../engine/packages/game/test/fixtures/ending.vrmxs?raw';
import { runFlowScenario, DELAYS } from '../flow-scenario.js';

const w = /** @type {any} */ (window);
w.__errors = [];
try {
  installPortableMath();
  const scenes = new Map([['title.vrmxs', parse(title)], ['level.vrmxs', parse(level)], ['ending.vrmxs', parse(ending)]]);
  const delay = new URLSearchParams(location.search).get('delay') ?? 'varied';
  const result = await runFlowScenario(await loadRapier(), scenes, { delays: DELAYS[delay] ?? [], sleep: (ms) => new Promise((ok) => setTimeout(ok, ms)) });
  w.__result = { ...result, delay, ua: navigator.userAgent };
} catch (e) { w.__errors.push(String(e?.stack ?? e)); }
const r = w.__result;
document.getElementById('out').textContent = r ? JSON.stringify({ final: r.final, all: r.all, changes: r.changes, save: r.save, checkpoint: r.checkpoint, loading: r.loading }, null, 1) : w.__errors.join('\n');
w.READY = true;
