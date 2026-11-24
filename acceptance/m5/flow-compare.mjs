// What "the same run" means for the game flow check, used by flow.mjs (Node against Chromium) and
// flow-wkwebview-summary.mjs (Node against WKWebView): every step's hashes, the steps the scenes changed on, the save
// and the checkpoint as files, and both of them played on to the end.
import { unpackRun, compareRuns } from '@vrmxg/snapshot';

// JSON with every object's keys sorted: the WKWebView harness hands results over through Swift's JSON, which sorts
// keys, so two equal results may print in different orders. The hashes are made in the page and aren't affected.
const sortDeep = (v) => (Array.isArray(v) ? v.map(sortDeep) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep(v[k])])) : v);
const canon = (v) => JSON.stringify(sortDeep(v));

/** @param {any} node Node's result @param {any} other another runtime's @returns {{ same: boolean, problems: string[] }} */
export function compareFlow(node, other) {
  const problems = [];
  if (!other?.run) return { same: false, problems: ['no result'] };
  const d = compareRuns(unpackRun(node.run), unpackRun(other.run));
  if (d) problems.push(`the run diverges at step ${d.step} in ${d.component}${d.components.length > 1 ? ` (and ${d.components.slice(1, 6).join(', ')})` : ''}`);
  const eq = (name, a, b) => { if (canon(a) !== canon(b)) problems.push(`${name}: ${canon(b)} against Node's ${canon(a)}`); };
  eq('steps', node.steps, other.steps);
  eq('final hash', node.final, other.final);
  eq('all steps\' hash', node.all, other.all);
  eq('scene changes', node.changes, other.changes);
  eq('worlds built', node.worlds, other.worlds);
  eq('outcomes', node.outcomes, other.outcomes);
  eq('checkpoints written', node.checkpoints, other.checkpoints);
  eq('the final view', node.view, other.view);
  for (const k of ['save', 'checkpoint']) {
    if (!other[k]?.same) problems.push(`the loaded ${k} doesn't go on as the unbroken run: ${JSON.stringify(other[k]?.diverges ?? null)}`);
    eq(`the ${k} file`, node[k].file, other[k]?.file);
    eq(`the ${k}'s step`, node[k].from, other[k]?.from);
    eq(`the loaded ${k}'s final hash`, node[k].final, other[k]?.final);
  }
  return { same: problems.length === 0, problems };
}

/** A result without its bulk (the packed run and the per-step words), for a results file. */
export function brief(r) {
  if (!r) return r;
  const { run, words, view, ...rest } = r;
  return { ...rest, score: view?.score ?? null, scene: view?.scene ?? null };
}
