// The page the browsers run (acceptance/m4/script-*.mjs|sh): the scenario, hashed with SHA-256 by the page itself.
import script from '../../../content/sample/scripts/cafe-order.fountain?raw';
import set from '../../../content/sample/cafe.vrmxs?raw';
import marks from '../../../content/sample/scripts/cafe-marks.json';
import { runScenario } from '../script-scenario.js';

const hex = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const w = /** @type {any} */ (window);
w.__errors = [];
try {
  const out = runScenario({ script, set: JSON.parse(set), marks: marks.marks });
  w.__result = { sample: { sha256: await hex(out.sample), bytes: out.sample.length }, rescript: { sha256: await hex(out.rescript), bytes: out.rescript.length }, ua: navigator.userAgent };
} catch (e) { w.__errors.push(String(e?.stack ?? e)); }
document.getElementById('out').textContent = JSON.stringify(w.__result ?? w.__errors, null, 1);
w.READY = true;
