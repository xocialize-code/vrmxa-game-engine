// M4 W3 (AB-T-0575, AB-T-0511): the 20-character budget, drawn. M0's check 4 timed the step alone, headless
// (engine/packages/snapshot/harness: 20 characters plus physics under 5 ms a step in WKWebView over loopback). Here the
// sample cafe gets 18 more characters (Mira's and Hana's models in turn, each wandering), and every step is drawn on the
// page's backend at 1080p: the step, the draw (CPU) and the frame with the GPU's work (host.finish) are timed apart.
// `?crowd=18` shows the same crowd in the playground. Timings only: nothing here feeds the simulation.

/** Where the extra characters start: a grid in the cafe's room, clear of the counter (x −4.5…4.5, z −4.5…1.5). */
const spot = (i) => [-4.5 + (i % 6) * 1.8, 0, -4.5 + Math.floor(i / 6) * 2];

/**
 * The sample scene with `n` more characters, Mira's and Hana's models in turn, each wandering near where it starts.
 * @param {any} doc the cafe's document @param {number} n
 */
export function withCrowd(doc, n = 18) {
  const assets = new Set(doc.assets.map((a) => a.id));
  if (!assets.has('mira') || !assets.has('hana')) throw new Error('withCrowd: the scene has no mira and hana assets');
  const crowd = Array.from({ length: n }, (_, i) => ({
    id: `crowd-${i}`, type: 'Character', parent: 'root', name: `Crowd ${i}`, asset: i % 2 ? 'hana' : 'mira',
    transform: { p: spot(i) }, props: { controller: 'npc' }, behaviours: [{ use: 'wander', radius: 1.5 }],
  }));
  return { ...doc, nodes: [...doc.nodes, ...crowd] };
}

const stats = (s) => {
  const a = [...s].sort((x, y) => x - y), mean = a.reduce((x, y) => x + y, 0) / a.length;
  return { mean: +mean.toFixed(3), p50: +a[a.length >> 1].toFixed(3), p95: +a[Math.floor(a.length * 0.95)].toFixed(3), max: +a.at(-1).toFixed(3) };
};

/**
 * The budget on this page's backend: the crowd loaded, `warm` steps drawn untimed, then `steps` steps each drawn and
 * timed. The check owns the canvas at `width`×`height`, pixel ratio 1 (as backendCheck does).
 * @param {any} pg the Playground
 * @param {{ npcs?: number, warm?: number, steps?: number, width?: number, height?: number, now?: () => number }} [o]
 */
export async function budgetCheck(pg, { npcs = 18, warm = 120, steps = 480, width = 1920, height = 1080, now = () => performance.now() } = {}) {
  await pg.ready;
  const ratio = pg.host.renderer.getPixelRatio(), buf = pg.host.drawingBufferSize(), cssW = buf.width / ratio, cssH = buf.height / ratio;
  pg.offline = true;
  try {
    await pg.load(pg.scene ?? 'cafe.vrmxs', { crowd: npcs });
    pg.pause(); pg.setBubbles(false);
    const host = pg.host, tree = pg.tree;
    host.debug.set(false);
    host.renderer.setPixelRatio(1); host.resize(width, height);
    const characters = tree.all().filter((n) => n.type === 'Character').length;
    const one = async (timed) => {
      const t0 = now();
      tree.step();
      const t1 = now();
      tree.present(1 / 60, 1);
      host.advanceNodeFrame(); host.render(1, true);
      const t2 = now();
      await host.finish();
      const t3 = now();
      if (timed) { step.push(t1 - t0); draw.push(t2 - t1); frame.push(t3 - t0); }
    };
    const step = [], draw = [], frame = [];
    for (let i = 0; i < warm; i++) await one(false);
    for (let i = 0; i < steps; i++) await one(true);
    const info = host.renderer.info.render;
    return {
      backend: host.backend, isWebGPUBackend: !!host.renderer.backend?.isWebGPUBackend, size: [width, height], characters, warm, steps,
      stepMs: stats(step), drawMs: stats(draw), frameMs: stats(frame),
      // WebGPU's info resets with every render call (the post stack's last pass is a quad): no per-frame count there
      drawCalls: host.renderer.isWebGPURenderer ? null : info.calls, triangles: host.renderer.isWebGPURenderer ? null : info.triangles,
      budget: { stepMs: 5, frameMs: 1000 / 60 },
    };
  } finally {
    const h = pg.host;
    h.renderer.setPixelRatio(ratio);
    if (cssW && cssH) h.resize(cssW, cssH);
    pg.offline = false;
  }
}
