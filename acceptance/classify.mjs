// M4 W3 (AB-T-0575): how the matrix judges a load and its one rerun (acceptance/README.md, "Exactness"). Pure functions,
// no GPU: acceptance/test/classify.test.mjs holds the rule.
//
// A load is clean when every verdict passes and its digest equals the canonical one. Otherwise it is rerun once, and:
//   - a load that failed a functional verdict (an error, a time-out, the wrong backend or a silent fall-back to WebGL,
//     frames that repeat, a scrub that differs, a flat frame, the budget, …) is a failure, whatever the rerun did;
//   - a load whose only faults are pixels that differ (its digest, or the verdicts that compare a load's own frames with
//     each other: the film's two exports, the post exports, a look's first frame against its next, a restored or reused
//     host's frames) may be AB-T-0589, the macOS beta's Metal issue: only when the rerun is clean and the failed load ran
//     while another process loaded the GPU. With a quiet GPU it is a failure.

/**
 * Verdicts that compare pixels within one load: an odd draw shows as one of these. The editor's scrub (scrubSame) is not
 * one of them: its frames differ every time (AB-T-0590), and a scrub is a different path from the export by design.
 */
export const EXACTNESS_VERDICTS = new Set(['filmTwiceIdentical', 'exportsIdentical', 'looksFirstEqualsAgain', 'restoredSame', 'exportAfterStillSame']);

/**
 * One load: 'clean', 'pixels' (only pixel faults: the digest differs and/or exactness verdicts fail) or 'broken' (a
 * functional verdict fails).
 * @param {{ verdicts: Record<string, boolean>, match: boolean | null }} row match: digest = canonical (null: no reference)
 */
export function classifyLoad({ verdicts, match }) {
  const failing = Object.entries(verdicts).filter(([, v]) => !v).map(([k]) => k);
  if (failing.some((k) => !EXACTNESS_VERDICTS.has(k))) return { kind: 'broken', failing };
  if (failing.length || match === false) return { kind: 'pixels', failing };
  return { kind: 'clean', failing };
}

/**
 * A failed load and its rerun: { outcome: 'incident' | 'failure', why }. `loaded`: whether the failed load ran under
 * another process's GPU load (true, false, or null when it wasn't sampled).
 * @param {{ verdicts: Record<string, boolean>, match: boolean | null, loaded: boolean | null }} failed
 * @param {{ verdicts: Record<string, boolean>, match: boolean | null }} rerun
 */
export function classifyRerun(failed, rerun) {
  const f = classifyLoad(failed), r = classifyLoad(rerun);
  if (f.kind === 'clean') throw new Error('classifyRerun: the load was clean');
  if (f.kind === 'broken') return { outcome: 'failure', why: `the load failed ${f.failing.filter((k) => !EXACTNESS_VERDICTS.has(k)).join(', ')}: not a pixel difference, so not AB-T-0589` };
  if (r.kind !== 'clean') return { outcome: 'failure', why: r.kind === 'broken' ? `the rerun failed ${r.failing.join(', ')}` : 'the rerun differs too' };
  if (failed.loaded === true) return { outcome: 'incident', why: 'pixels differed while another process loaded the GPU, and the rerun is clean: AB-T-0589 (AB-D-0278)' };
  return { outcome: 'failure', why: `the rerun is clean, but the GPU was ${failed.loaded === null ? 'not sampled' : 'quiet'} during the failed load: not AB-T-0589` };
}
