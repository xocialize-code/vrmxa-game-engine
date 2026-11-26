// AB-A-0335: the first frame's pipeline compile, with and without the render host's warm-up (?mode=warmup&renderer=
// webgpu|webgl&warm=0|1&post=0|1). The sample cafe with Mira and Hana (MToon characters), its steam and lights, built on
// an offline host of its own (nothing on this page has drawn a character before it), stepped once, then:
//   warm=1   host.warmUp() (renderer.compileAsync through a camera with every layer on, then on WebGPU one draw nobody
//            sees), timed
//   then     three frames, each render() and finish() timed: the first meets every pipeline the warm-up didn't compile
// probe=1 times the output pass alone first (an empty scene drawn to the canvas), probe=2 a second draw nobody sees.
// post=1 draws through the backend's post stack with the 'anime' look on the cafe's Environment, post=0 without a stack. The numbers are only
// cold in a web view whose engine hasn't compiled these pipelines before (acceptance/warmup-wkwebview.sh clears WebKit's
// caches between runs, over loopback in a fresh WKWebView: AB-L-0346).
import { RenderHost } from '@vrmxg/render';
import { particleRenderers } from '@vrmxg/particles';
import { buildWorld } from './world.js';

const now = () => performance.now();

/**
 * @param {{ R: any, sample: any, opts: any, backend: string, post: any, warm: boolean, probe?: number, width?: number, height?: number }} o
 */
export async function warmupCheck({ R, sample, opts, backend, post, warm, probe = 0, width = 1280, height = 720 }) {
  const t0 = now();
  const host = await RenderHost.create({ canvas: document.createElement('canvas'), backend: /** @type {any} */ (backend), dprCap: 1, post });
  await host.loadParticleRenderer(particleRenderers);
  const w = await buildWorld(R, sample, { ...opts, mtoonMaterial: host.mtoonMaterial });
  host.attach(w.tree); host.resize(width, height);
  if (post) { const env = w.tree.find('env'); if (env) env.props = { ...env.props, post: 'anime' }; } // the cafe has no look of its own
  while (!w.tree.step()) await w.tree.settle();
  const built = now() - t0;
  let materials = 0, characters = 0;
  host.scene.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) materials += Array.isArray(o.material) ? o.material.length : 1; if (o.userData?.vrm || o.name === 'VRMHumanoidRig') characters++; });
  // what the renderer has compiled: WebGPU's render pipelines and shader programs by name, WebGL's programs
  const compiled = () => {
    const p = host.renderer._pipelines;
    if (p?.caches) return { pipelines: p.caches.size, fragment: [...p.programs.fragment.values()].map((x) => x.name) };
    return { pipelines: host.renderer.info?.programs?.length ?? null, fragment: (host.renderer.info?.programs ?? []).map((x) => x.name) };
  };
  const before = compiled();
  const warmUp = warm ? await host.warmUp() : null;
  const afterWarmUp = compiled();
  // probe=1: the output pass alone first (an empty scene drawn to the canvas), to tell its cost from the world's
  let outputPassMs = null;
  if (probe === 1) {
    const { Scene } = await import('three');
    const t = now(); host.renderer.render(new Scene(), host.fallbackCamera); await host.finish(); outputPassMs = +(now() - t).toFixed(1);
  }
  let againMs = null;
  if (probe === 2) { const t = now(); host._warmDraw(null, host.cameraNode()?.camera ?? host.fallbackCamera); await host.finish(); againMs = +(now() - t).toFixed(1); }
  const frames = [];
  const cpu = [];
  for (let i = 0; i < 3; i++) {
    const t = now();
    host.render(1, i === 0);
    cpu.push(+(now() - t).toFixed(1)); // the render call itself (JavaScript: render lists, node builds, encoding)
    await host.finish();
    frames.push(+(now() - t).toFixed(1));
  }
  const afterFrames = compiled();
  const counted = (names) => names.reduce((m, n) => ({ ...m, [n]: (m[n] ?? 0) + 1 }), {});
  const seen = new Set(afterWarmUp.fragment);
  const pipelines = { before: before.pipelines, afterWarmUp: afterWarmUp.pipelines, afterFrames: afterFrames.pipelines, newInFirstFrame: counted(afterFrames.fragment.filter((n) => !seen.has(n))) };
  const res = {
    backend: host.backend, warm, post: !!host.post?.active, width, height, buildMs: +built.toFixed(1), meshMaterials: materials,
    warmUpMs: warmUp ? +warmUp.ms.toFixed(1) : null, warmUpCompileMs: warmUp?.compileMs != null ? +warmUp.compileMs.toFixed(1) : null, warmUpDrawMs: warmUp?.drawMs != null ? +warmUp.drawMs.toFixed(1) : null, firstFrameMs: frames[0], secondFrameMs: frames[1], thirdFrameMs: frames[2],
    totalToFirstFrameMs: +((warmUp?.ms ?? 0) + frames[0]).toFixed(1), outputPassMs, againMs, renderCallMs: cpu, pipelines,
  };
  host.dispose(); host.renderer.forceContextLoss?.();
  w.audio?.dispose?.();
  return res;
}
