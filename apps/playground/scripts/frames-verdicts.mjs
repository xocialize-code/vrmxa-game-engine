// M4 W2 (AB-T-0574): what one ?mode=frames run must show on its own, the key two runs must share (frames exact per
// engine), and the frames kept to look at. Shared by frames-chromium.mjs and frames-wkwebview.sh.
import fs from 'node:fs';
import path from 'node:path';

/** The verdicts one run must pass on its own. */
export function verdicts(r) {
  const p = r.particles, f = r.film, s = r.still;
  return {
    backend: r.backend,
    particlesSameAsHeadless: !!p?.sameAsHeadless && p.final === p.headlessFinal,
    particlesDrawnByHost: !!p && p.batch.batches > 0 && p.batch.renderer === (r.backend === 'webgpu' ? 'three.quarks/webgpu' : 'three.quarks'),
    particlesDistinctFrames: !!p && p.distinctFrames === p.steps + 1,
    restoredSame: !!p?.snapshot.worldMatches && p.snapshot.framesDiffer.length === 0,
    filmTwiceIdentical: !!f?.identical && f.worldSame && f.first.steamDrawn,
    stillMatchesCanvas: !!s && s.repeats && s.differ === 0 && s.opaque > s.pixels * 0.9 && s.upsideDownWouldDiffer > 0 && s.viewFollows,
    // PR #7 review: a second size on one WebGPU renderer read back empty; every size after a still must have content
    readbackHasContent: !!r.readback && Object.values(r.readback).every((x) => x.content > 0.5),
    exportAfterStillSame: !!r.reuse?.same && r.reuse.firstFrameContent > 0.5 && r.reuse.stillContent > 0.5,
    // a red quad at opacity 0.5 over nothing reads back premultiplied, [127 or 128, 0, 0, 128], on both backends
    alphaPremultiplied: !!r.alpha && Math.abs(r.alpha.raw[0] - 127.5) <= 1 && r.alpha.raw[1] === 0 && r.alpha.raw[3] === 128 && r.alpha.toImageRGBA[0] >= 252,
    noErrors: !(r.errors?.length),
  };
}
export const sameKey = (r) => JSON.stringify({ p: [r.particles?.final, r.particles?.framesDigest, r.particles?.lastFrame], f: [r.film?.first.digest, r.film?.first.audioHash], s: r.still?.hash, rb: Object.fromEntries(Object.entries(r.readback ?? {}).filter(([, v]) => v.hash).map(([k, v]) => [k, v.hash])), a: r.alpha?.raw });

/** The frames to look at (written for load 1; dir null writes none): check 13's step 300, film frame 600 (half size), the still; dropped from the JSON. */
export function keepShots(r, prefix, dir) {
  const files = { particles: r.particles?.shot, film: r.film?.shot, still: r.still?.shots?.still };
  if (dir) for (const [k, v] of Object.entries(files)) if (v) fs.writeFileSync(path.join(dir, `${prefix}-${r.backend}-${k}.png`), Buffer.from(v.split(',')[1], 'base64'));
  if (r.particles) delete r.particles.shot;
  if (r.film) delete r.film.shot;
  if (r.still) delete r.still.shots;
}
