// What "the same run" means for the dialogue check, used by dialogue.mjs (Node against Chromium) and
// dialogue-wkwebview-summary.mjs (Node against WKWebView): every step's hashes, the recording (the same choice on the
// same step), the lines said and choices offered, and the replay the same as the live run in that runtime.
import { unpackRun, compareRuns } from '@vrmxg/snapshot';

// keys sorted: the WKWebView harness hands results over through Swift's JSON, which sorts them
const sortDeep = (v) => (Array.isArray(v) ? v.map(sortDeep) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep(v[k])])) : v);
const canon = (v) => JSON.stringify(sortDeep(v));

/** @param {any} node Node's result @param {any} other another runtime's @returns {{ same: boolean, problems: string[] }} */
export function compareDialogue(node, other) {
  const problems = [];
  if (!other?.run) return { same: false, problems: ['no result'] };
  const d = compareRuns(unpackRun(node.run), unpackRun(other.run));
  if (d) problems.push(`the live run diverges at step ${d.step} in ${d.component}`);
  const eq = (name, a, b) => { if (canon(a) !== canon(b)) problems.push(`${name}: ${canon(b)} against Node's ${canon(a)}`); };
  for (const k of ['steps', 'final', 'all', 'recording', 'changes', 'outcomes', 'asked', 'lines', 'view']) eq(k, node[k], other[k]);
  if (!other.replay?.same) problems.push(`the replay doesn't take the live run's path: ${JSON.stringify(other.replay?.diverges ?? null)}`);
  eq('the replay\'s final hash', node.replay.final, other.replay?.final);
  return { same: problems.length === 0, problems };
}

/** A result without its bulk (the packed run), for a results file. */
export function brief(r) { if (!r) return r; const { run, ...rest } = r; return rest; }
