// ?deliver=<preset> (M4 W10, AB-T-0582): the creator renders deliveries by itself, for the acceptance and the timing
// receipt (acceptance/m4/delivery-wkwebview.sh). In the Mac app it opens the project folder (VRMXG_SHELL_PROJECT), opens
// the short (`short`, else the first), queues the preset `repeat` times (default 2: two exports of the same short must
// match frame for frame), renders them one after another through the queue's own runner, and writes what happened to
// deliveries/run-<preset>-<backend>.json in the project (and window.__result).
//   seconds=60     render this long (a one-minute timing run over a shorter short: the last shot holds)
//   backend=webgl  draw on WebGL instead of the view's backend; check=redraw: draw each frame twice
//   extras=none    the film alone; also stills, thumbnails, turntable as a comma list
import { openProjectFolder } from './project.js';
import { inShell, call } from '../../shell/js/shell.js';

/** The run's options from the page's query. */
export function deliverOptions(search) {
  const q = new URLSearchParams(search);
  const preset = q.get('deliver');
  if (!preset) return null;
  const list = q.get('extras');
  const extras = list === null ? undefined : list === 'none' ? null : Object.fromEntries(['stills', 'thumbnails', 'turntable'].map((k) => [k, list.split(',').includes(k)]));
  return {
    preset, short: q.get('short'), repeat: Math.max(1, Number(q.get('repeat') ?? 2) | 0), seconds: q.has('seconds') ? Number(q.get('seconds')) : undefined,
    backend: q.get('backend') || null, check: q.get('check') || null, extras,
  };
}

/** What two or more runs of the same job agree on: the film's frames, its sound, every still, thumbnail and turntable. */
export function compareRuns(results, manifests) {
  const same = (f) => { const v = results.map(f); return v.every((x) => x !== undefined && x !== null && x === v[0]); };
  const listSame = (key) => manifests.every((m) => JSON.stringify(m?.[key]?.map((x) => x.hash ?? x.frameDigest)) === JSON.stringify(manifests[0]?.[key]?.map((x) => x.hash ?? x.frameDigest)));
  return {
    runs: results.length,
    frames: same((r) => r.hashesDigest),
    audio: results.every((r) => !r.audioHash) || same((r) => r.audioHash),
    stills: manifests.length ? listSame('stills') : null,
    thumbnails: manifests.length ? listSame('thumbnails') : null,
    turntables: manifests.length ? listSame('turntables') : null,
  };
}

/** @param {any} cr the CreatorHost @param {ReturnType<typeof deliverOptions>} o */
export async function runDeliverMode(cr, o) {
  const t0 = performance.now();
  if (inShell) await cr.openProject(await openProjectFolder(), o.short);
  else if (o.short && cr.short?.id !== o.short) await cr.openShort(o.short);
  const info = inShell ? await call('shell.info').catch(() => null) : null;
  const jobs = [];
  for (let i = 0; i < o.repeat; i++) {
    const name = o.repeat > 1 ? `${cr.short.id}-${o.preset}-${o.backend ?? cr.host.backend}-run${i + 1}` : null;
    jobs.push(cr.queueShort({ preset: o.preset, name, backend: o.backend, check: o.check, extras: o.extras, seconds: o.seconds }));
  }
  await cr.queue.run();
  const done = jobs.map((j) => cr.queue.get(j.id));
  const manifests = [];
  for (const j of done) {
    const ref = j.result?.delivery?.manifest;
    manifests.push(ref ? JSON.parse(await cr.project.text(ref)) : null);
  }
  const result = {
    format: 'vrmxg-delivery-run', version: 1, ua: navigator.userAgent, origin: location.protocol.replace(':', ''), shell: info ? { scheme: info.scheme ?? null } : null,
    preset: o.preset, short: cr.short?.id ?? null, backend: o.backend ?? cr.host.backend, check: o.check, seconds: o.seconds ?? null,
    jobs: done.map((j) => ({ id: j.id, label: j.label, state: j.state, error: j.error, result: j.result })),
    manifests: manifests.filter(Boolean).map(({ stills, thumbnails, ...m }) => ({ ...m, stills: stills.map((s) => ({ shot: s.shot, frame: s.frame, hash: s.hash, bytes: s.bytes })), thumbnails: thumbnails.map((s) => ({ shot: s.shot, hash: s.hash })) })),
    same: compareRuns(done.filter((j) => j.state === 'done').map((j) => j.result), manifests.filter(Boolean)),
    ms: Math.round(performance.now() - t0),
  };
  const ref = `deliveries/run-${o.preset}-${result.backend}${o.check ? `-${o.check}` : ''}.json`;
  if (cr.project?.writable) await cr.project.write(ref, `${JSON.stringify(result, null, 1)}\n`);
  return { ...result, written: cr.project?.writable ? ref : null };
}
