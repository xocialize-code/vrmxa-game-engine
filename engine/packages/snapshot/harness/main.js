// The harness in a browser (headless Chromium through chromium.mjs, WKWebView through wkwebview.sh):
// ?mode=det runs the determinism case (&inject=N adds the Math.random bug), ?mode=budget the budget case.
// Sets window.__result and window.READY for the runners.
import { loadRapier } from '@vrmxg/physics';
import { loadAssets, runDeterminism, runBudget } from './world.js';

const q = new URLSearchParams(location.search);
const mode = q.get('mode') ?? 'det', inject = q.has('inject') ? Number(q.get('inject')) : -1;
const files = {
  bytes: async (p) => new Uint8Array(await (await fetch(`models/${p}`)).arrayBuffer()),
  json: async (p) => (await fetch(`models/${p}`)).json(),
};
const now = () => performance.now(); // timing only
window.__errors = [];
try {
  const R = await loadRapier();
  const assets = await loadAssets(files);
  const result = { mode, inject, ua: navigator.userAgent, origin: location.protocol };
  if (mode === 'det') result.determinism = await runDeterminism(R, assets, { now, inject });
  if (mode === 'budget') result.budget = await runBudget(R, assets, { now });
  window.__result = result;
  document.getElementById('out').textContent = JSON.stringify({ ...result, determinism: result.determinism && { ...result.determinism, run: `${result.determinism.run.steps.length} steps` } }, null, 1);
} catch (e) {
  window.__errors.push(String(e?.stack ?? e));
  document.getElementById('out').textContent = String(e?.stack ?? e);
}
window.READY = true;
