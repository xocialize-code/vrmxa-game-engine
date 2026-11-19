// ?mode=check-export (M2 W12): the editor exports "Morning at the cafe" as frame hashes and checks the export against
// scrubbing, with no person at it, for runtimes driven by a harness (acceptance/m2/editor-wkwebview.sh). It also
// renders the checked frames a third way, played forward on a fresh world, so a difference can be placed: the export's
// world, the jump from snapshots, or the drawing. Sets window.__result and window.READY.
import { RenderHost } from '@vrmxg/render';
import { SequencePlayer } from '@vrmxg/sequence';
import { hashFrame, SIZES } from '@vrmxg/export';
import { worldHashes, hashValue } from '@vrmxg/snapshot';

/** @param {import('./host.js').EditorHost} ed */
export async function runCheckMode(ed, { size = '1080p', scene = 'sequences/cafe-morning.vrmxs' } = {}) {
  await ed.openScene(scene);
  const t0 = performance.now();
  const x = await ed.exportVideo({ take: 'sequence', size, fps: '24', codec: 'h264', audio: true, hashOnly: true });
  const exportMs = performance.now() - t0;
  const c = await ed.checkExportAgainstScrub();
  // forward: a fresh world and host, frame by frame from 0 as the export goes, hashing the checked frames
  const want = new Set(c.rows.map((r) => r.frame));
  const [w, h] = SIZES[size];
  const { world } = await ed.takeWorld('sequence');
  const host = new RenderHost({ canvas: document.createElement('canvas'), dprCap: 1, post: (r) => ed.postStack(r) });
  host.attach(world.tree); host.resize(w, h);
  const gl = host.renderer.getContext(), buf = new Uint8Array(w * h * 4), last = Math.max(...want);
  const forward = {};
  for (let f = 0; f <= last; f++) {
    const { step, alpha } = world.sequence.stepOf(f);
    await host.frameAt(step, alpha);
    if (!want.has(f)) continue;
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    forward[f] = { pixels: hashFrame(buf), world: hashValue(worldHashes(world.tree, { physicsBytes: true })) };
  }
  host.dispose(); world.audio?.dispose();
  // and a scrub on that same host's world, backwards from the end, to tell a fresh host from a history of jumps
  const rows = c.rows.map((r) => ({ ...r, forward: forward[r.frame].pixels, forwardSame: forward[r.frame].pixels === r.exported, forwardWorld: forward[r.frame].world === r.world }));
  return {
    size, frames: x.frames, steps: x.steps, digest: x.hashesDigest, audioHash: x.audioHash, exportMs: Math.round(exportMs),
    subtitles: { lines: x.subs?.lines, bytes: x.subs?.bytes }, scrub: { frames: c.frames, same: c.same }, rows,
    ua: navigator.userAgent, isSecureContext, frameHashes: x.frameHashes,
  };
}

/** For a harness: run, then publish the result. */
export async function checkModeMain(ed) {
  try { window.__result = await runCheckMode(ed); } catch (e) { window.__errors.push(`check-export: ${e?.stack ?? e}`); }
  window.READY = true;
}
