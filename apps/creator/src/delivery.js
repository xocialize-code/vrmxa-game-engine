// The creator's render queue runner (M4 W10, AB-T-0582): a short as it was queued, rendered for delivery.
//   - Every job renders the film through the editor's export (@vrmxg/export exportTake, the readback of the backend
//     the job names: the view's, or WebGL as a per-export choice), into the shell's AVAssetWriter with its sound (lag 0)
//     and an .srt of every line, or as frame hashes in a browser.
//   - A delivery preset (`extras`) adds, in one folder of the open project (deliveries/<name>/): a still per shot (the
//     shot's middle frame, taken from the film's own read-back bytes as they pass, so a still is the delivered frame), a
//     480×270 thumbnail of each (boxed down in integers), a turntable per character (the world held one second in, the
//     character alone, the camera once round it), and delivery.json with every file's hash and the timings.
//   - Cancel stops it between frames (the shell removes the partial movie) and between files.
// Before a job renders, the storyboard's thumbnail host is let go: the creator keeps no voice models (it voices through
// the shell's tts.speak or the loopback stand-in), so the offline hosts are what a 4K render competes with.
import { PerspectiveCamera, Box3, Vector3 } from 'three';
import { parse } from '@vrmxg/scene';
import { hashValue } from '@vrmxg/snapshot';
import { atan2 } from '@vrmxg/dmath';
import { exportTurntable, shellSink, hashSink, toImageRGBA, encodePNG, toBase64, stillFrames, boxDown, orbitPose, fitDistance, deliveryFiles, slug, framesFor, THUMB, SIZES, RATES, CODECS } from '@vrmxg/export';
import { resolveCheck } from '@vrmxg/editor-core';
import { inShell, call } from '../../shell/js/shell.js';
import { disposeWorld } from './dispose.js';

/** A turntable's length: five seconds at the delivery's rate, once round. */
export const TURNTABLE_SECONDS = 5;
/** How far into the short a turntable's world is held: one second (60 steps), the cast settled into their first poses. */
export const TURNTABLE_STEP = 60;
/** The turntable lens (vertical degrees). */
export const TURNTABLE_FOV = 30;

const CODEC_SLUG = { h264: 'h264', hevc: 'hevc', prores4444: 'prores', 'hevc-alpha': 'hevc-alpha' };

/** A job's base file name: the name the person gave, else `<short>-<size><fps>-<codec>` (a draft keeps M4 W5's `<short>-<size><fps>`). */
export function baseName(spec, fps) {
  if (spec.name) return slug(spec.name.replace(/\.(mp4|mov)$/, ''));
  const f = String(fps).replace('.', '');
  return spec.extras ? `${slug(spec.short)}-${spec.size}${f}-${CODEC_SLUG[spec.codec] ?? spec.codec}` : `${spec.short}-${spec.size}${f}`;
}

/** FNV-1a over bytes, 8 hex digits (a file's identity in delivery.json). */
export function hashBytes(b) { let h = 0x811c9dc5; for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 0x01000193); return (h >>> 0).toString(16).padStart(8, '0'); }

/** A digest of a list of frame hashes: the editor's (apps/editor/src/host.js), the one jobStatus shows for the film. */
function digestOf(hashes) { return hashes?.length ? hashValue(hashes.join(',')) : null; }

/**
 * Hide everything in a world but one character, its ancestors (so it stays drawn), the lights and the environment.
 * → a function that puts every visibility back.
 */
export function isolate(tree, id) {
  const target = tree.find(id);
  if (!target?.object3d) throw new Error(`no character ${id} to turn round`);
  const keep = new Set();
  for (let o = target.object3d; o; o = o.parent) keep.add(o);
  target.object3d.traverse((o) => keep.add(o));
  const was = [];
  for (const node of tree.all()) {
    const o = node.object3d;
    if (!o || keep.has(o) || node.type === 'Environment' || /Light$/.test(node.type)) continue;
    let lit = false; o.traverse((c) => { if (c.isLight) lit = true; });
    if (lit) continue;
    was.push([o, o.visible]); o.visible = false;
  }
  return () => { for (const [o, v] of was) o.visible = v; };
}

/** Where a turntable looks, how far it stands and where it starts: the character's box, framed in the lens with room round it, from in front. */
export function turntableFraming(object3d, aspect, fov = TURNTABLE_FOV) {
  object3d.updateMatrixWorld(true);
  const box = new Box3().setFromObject(object3d), size = box.getSize(new Vector3()), c = box.getCenter(new Vector3());
  if (box.isEmpty() || !(size.y > 0)) throw new Error('the character has nothing to frame');
  // start in front of the character: the way its root faces (a character faces its root's +Z, as the engine's do)
  const f = object3d.getWorldDirection(new Vector3());
  const start = Math.abs(f.x) + Math.abs(f.z) > 1e-6 ? atan2(f.x, f.z) : 0;
  return { center: [c.x, c.y, c.z], radius: fitDistance(size.y, Math.max(size.x, size.z), fov, aspect), height: size.y * 0.08, start };
}

/**
 * The runner. Its result is plain data: the film (frames, file, frame digest, sound hash), the subtitles and, for a
 * delivery, the folder, its stills, thumbnails and turntables, and the timings.
 * @param {any} host the CreatorHost @returns {import('@vrmxg/editor-core/src/queue.js').Runner}
 */
export function deliveryRunner(host) {
  return {
    name: inShell ? 'delivery through the shell (AVAssetWriter; H.264, HEVC, ProRes 4444)' : 'frame hashes (a browser: video needs the Mac app)',
    run: (job, ctx) => deliver(host, job, ctx),
  };
}

async function deliver(host, job, { progress, signal }) {
  const spec = job.spec, now = () => performance.now(), t0 = now();
  const snap = host.snapshots.get(job.id);
  if (!snap) throw new Error(`${job.id}: its sequence wasn't kept (queue it again)`);
  if (host.short?.id !== spec.short || host.setScene?.ref !== snap.set) throw new Error(`open ${spec.title ?? spec.short} to render it (the queue renders the open short)`);
  const doc = parse(snap.text), seq = doc.sequence, fps = String(spec.fps ?? seq.fps);
  if (!RATES[fps]) throw new Error(`no export rate ${fps}`);
  const extras = spec.extras ?? null; // a delivery preset: its folder and manifest, whichever extras are ticked
  // the redraw check: a delivery drawn on WebGPU checks by default (the presets' 'auto', AB-D-0280); a job can say otherwise
  const check = resolveCheck(spec, spec.backend ?? host.host.backend);
  const toDisk = inShell && !!host.project?.writable;
  if (extras && inShell && !toDisk) throw new Error('open a project folder to deliver into (its files go into deliveries/)');
  const base = baseName(spec, fps), ext = CODECS[spec.codec].ext;
  const [width, height] = SIZES[spec.size], rate = RATES[fps];
  const frames = framesFor(spec.seconds ?? seq.duration / seq.fps, rate);
  const stop = () => { if (signal.aborted) throw Object.assign(new Error('cancelled'), { code: 'cancelled' }); };
  await host.releaseOffline?.();

  // the stills and thumbnails, from the film's own bytes as they pass (each encoded as soon as it is taken)
  const picks = extras && (extras.stills || extras.thumbnails) ? stillFrames(seq, frames, rate) : [];
  const files = extras ? deliveryFiles({ base, ext, stills: picks, turntables: extras.turntable ? characters(host, doc) : [], subtitles: spec.subtitles !== false }) : null;
  const byFrame = new Map(picks.map((p, i) => [p.n, i]));
  const kept = /** @type {Array<Promise<{ still: Uint8Array | null, thumb: Uint8Array | null }>>} */ ([]);
  const onBytes = picks.length ? (n, bytes, topDown) => {
    const i = byFrame.get(n);
    if (i === undefined) return;
    const rgba = toImageRGBA(bytes, width, height, { topDown });
    const thumb = extras.thumbnails ? boxDown(rgba, width, height, THUMB[0], THUMB[1]) : null;
    kept[i] = Promise.all([extras.stills ? encodePNG({ width, height, rgba }) : null, thumb ? encodePNG({ width: THUMB[0], height: THUMB[1], rgba: thumb }) : null]).then(([still, th]) => ({ still, thumb: th }));
  } : undefined;

  host._queueProgress = progress;
  let film;
  try {
    film = await host.exportVideo({
      take: 'sequence', doc, subtitles: spec.subtitles !== false, signal, seconds: frames / (rate.num / rate.den), size: spec.size, fps, codec: spec.codec, audio: spec.audio,
      name: base, backend: spec.backend ?? null, check, onBytes, projectPath: files && toDisk ? files.film : null,
    });
  } finally { host._queueProgress = null; }
  const tFilm = now() - t0;
  const result = {
    frames: film.frames, seconds: film.seconds, name: film.name ?? film.began?.name ?? null, path: film.path ?? film.began?.path ?? null,
    hashesDigest: film.hashesDigest, hashOnly: film.hashOnly, ms: film.ms?.total ?? null, backend: film.backend, audioHash: film.audioHash ?? null, check: film.check ?? null,
    subtitles: film.subs ? { lines: film.subs.lines, path: film.subs.path, error: film.subs.error } : null,
  };
  if (!extras) return result;

  // the delivery's other files, into its folder
  const write = (ref, bytes) => host.project.writeBase64(ref, toBase64(bytes));
  const manifest = {
    format: 'vrmxg-delivery', version: 1, short: spec.short, title: spec.title ?? null, preset: spec.preset ?? null,
    size: [width, height], fps: [rate.num, rate.den], codec: spec.codec, backend: film.backend, check,
    film: { path: files.film, frames: film.frames, frameDigest: film.hashesDigest, audioHash: film.audioHash ?? null, ms: film.ms ?? null, perFrameMs: film.perFrameMs ?? null, check: film.check ?? null, written: toDisk },
    subtitles: film.subs ? { path: files.subtitles, lines: film.subs.lines, hash: film.subs.text ? hashBytes(new TextEncoder().encode(film.subs.text)) : null } : null,
    stills: [], thumbnails: [], turntables: [], ms: { film: Math.round(tFilm) },
  };
  const t1 = now();
  for (let i = 0; i < picks.length; i++) {
    stop();
    progress(i, picks.length, 'stills');
    const k = await kept[i];
    if (!k) throw new Error(`frame ${picks[i].n} (shot ${picks[i].shot}) never passed the readback`);
    if (k.still) { await write(files.stills[i], k.still); manifest.stills.push({ shot: picks[i].shot, frame: picks[i].n, path: files.stills[i], bytes: k.still.length, hash: hashBytes(k.still) }); }
    if (k.thumb) { await write(files.thumbnails[i], k.thumb); manifest.thumbnails.push({ shot: picks[i].shot, frame: picks[i].n, path: files.thumbnails[i], bytes: k.thumb.length, hash: hashBytes(k.thumb) }); }
  }
  manifest.ms.stills = Math.round(now() - t1);

  const ids = extras.turntable ? characters(host, doc) : [];
  const t2 = now();
  for (let i = 0; i < ids.length; i++) {
    stop();
    manifest.turntables.push(await turntable(host, doc, ids[i], { path: files.turntables[i], toDisk, width, height, rate, codec: spec.codec, base, backend: spec.backend ?? null, check, signal, progress: (n, total) => progress(n, total, `turntable ${ids[i]}`) }));
  }
  manifest.ms.turntables = Math.round(now() - t2);
  manifest.ms.total = Math.round(now() - t0);
  stop();
  await host.project.write(files.manifest, `${JSON.stringify(manifest, null, 1)}\n`);
  // what the folder holds now, read back from the disk (the shell's project listing): every file the manifest names
  const wanted = [manifest.film.path, manifest.subtitles?.path, ...manifest.stills.map((s) => s.path), ...manifest.thumbnails.map((s) => s.path), ...manifest.turntables.map((s) => s.path), files.manifest].filter(Boolean);
  const listed = toDisk ? new Set(await call('project.list')) : null;
  const missing = listed ? wanted.filter((f) => !listed.has(f)) : null;
  return { ...result, delivery: { dir: files.dir, manifest: files.manifest, stills: manifest.stills.length, thumbnails: manifest.thumbnails.length, turntables: manifest.turntables.length, files: wanted.length, missing, ms: manifest.ms } };
}

/** The characters a short casts, by node id: the set's and the sequence's Character nodes, in document order. */
function characters(host, doc) {
  const ids = [...(host.setScene?.doc.nodes ?? []), ...(doc.nodes ?? [])].filter((n) => n.type === 'Character').map((n) => n.id);
  return [...new Set(ids)];
}

/** One character's turntable: a fresh world held at TURNTABLE_STEP, the character alone, once round. */
async function turntable(host, doc, id, { path, toDisk, width, height, rate, codec, base, backend, check, signal, progress }) {
  if (host.exporting) throw new Error('an export is already running');
  host.exporting = { n: 0, frames: 0, phase: `turntable ${id}` }; host.changed('export');
  let world = null, th = null, restore = null;
  try {
    th = await host.offlineHost(backend); // first: the world is built with its MToon (WebGL's for a WebGL job)
    ({ world } = await host.takeWorld('sequence', doc, { mtoonMaterial: th.mtoonMaterial }));
    const tree = world.tree;
    while (tree.clock.step < TURNTABLE_STEP) while (!tree.step()) await tree.settle();
    restore = isolate(tree, id);
    const frames = framesFor(TURNTABLE_SECONDS, rate), aspect = width / height;
    const framing = turntableFraming(tree.find(id).object3d, aspect);
    const camera = new PerspectiveCamera(TURNTABLE_FOV, aspect, 0.05, 200);
    const sink = toDisk ? shellSink({ call }) : hashSink();
    const r = await exportTurntable({
      tree, host: th, camera, fps: rate, frames, width, height, sink, check, signal, now: () => performance.now(), warm: true,
      pose: (n) => orbitPose(n, frames, framing),
      job: { codec, hash: true, suggestedName: `${base}-${slug(id)}.${CODECS[codec].ext}`, title: 'Export Turntable', ...(toDisk ? { projectPath: path } : {}) },
      onProgress: (p) => { host.exporting = { ...p, phase: `turntable ${id}` }; progress(p.n, p.frames); host.changed('export'); },
    });
    const hashes = r.frameHashes ?? null;
    return { character: id, path, frames: r.frames, seconds: r.seconds, frameDigest: digestOf(hashes), framing: { center: framing.center.map((v) => +v.toFixed(4)), radius: +framing.radius.toFixed(4), start: +framing.start.toFixed(4) }, ms: r.ms, check: r.check, written: toDisk };
  } finally {
    restore?.();
    if (th) { th.dispose(); th.renderer.forceContextLoss?.(); }
    disposeWorld(world);
    host.exporting = null; host.changed('export');
  }
}
