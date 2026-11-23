// Which renderer draws (M4 W0, AB-T-0572; AB-D-0271: WebGPU is the default, WebGL a tested fallback): the backend
// choice, the query switch, the page's warm-up WebGPURenderer and the room environment's PMREM. three/webgpu is imported
// only when WebGPU is used, so a WebGL page never loads it.
//
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Until M4 W3 flips it, apps keep WebGL as their default and ask for WebGPU with `?renderer=webgpu` (or `auto`).

/** @typedef {'webgpu' | 'webgl'} Backend */
/** @typedef {Backend | 'auto'} BackendChoice */

/**
 * The query switch: `?renderer=webgpu|webgl|auto`. Anything else (or nothing) gives `fallback`.
 * @param {string | URLSearchParams | null | undefined} search location.search, or its params
 * @param {BackendChoice} [fallback] the app's default: 'auto' since M4 W3 (WebGPU where the page has it, else WebGL;
 *   AB-T-0575, M4 check 8)
 * @returns {BackendChoice}
 */
export function backendFromQuery(search, fallback = 'auto') {
  const q = typeof search === 'string' || search == null ? new URLSearchParams(search ?? '') : search;
  const v = q.get('renderer');
  return v === 'webgpu' || v === 'webgl' || v === 'auto' ? v : fallback;
}

/**
 * Can this page draw with WebGPU? `navigator.gpu` and an adapter: a page can have the first without the second
 * (blocklisted GPU, headless without a GPU).
 * @param {{ gpu?: any } | undefined} [nav] navigator (a stand-in in tests)
 */
export async function webgpuAvailable(nav = globalThis.navigator) {
  if (!nav?.gpu) return false;
  try { return !!(await nav.gpu.requestAdapter()); } catch { return false; }
}

/**
 * Resolve a choice to a backend. `auto` takes WebGPU where the page has it and WebGL otherwise; `webgpu` insists,
 * and throws where WebGPU isn't there (a forced backend that quietly became the other one would test the wrong thing).
 * @param {BackendChoice} choice @param {{ navigator?: any }} [o]
 * @returns {Promise<Backend>}
 */
export async function resolveBackend(choice, { navigator: nav = globalThis.navigator } = {}) {
  if (choice === 'webgl') return 'webgl';
  const ok = await webgpuAvailable(nav);
  if (choice === 'webgpu' && !ok) throw new Error('renderer=webgpu: this page has no WebGPU (navigator.gpu or an adapter is missing); use renderer=auto to fall back to WebGL');
  return ok ? 'webgpu' : 'webgl';
}

/** three/webgpu, loaded once. A failed load (a chunk that didn't arrive) isn't kept: the next call tries again. */
let webgpuModule = null;
export const loadWebGPU = () => (webgpuModule ??= import('three/webgpu').catch((e) => { webgpuModule = null; throw e; }));

/**
 * three.quarks/webgpu's BatchedRenderer (WebGPUBatchedRenderer: TSL node materials), the particle renderer a WebGPU host
 * hands to the particles service (M4 W2; spike-webgpu-render: the same particle hashes, AB-R-1006). Loaded with
 * three/webgpu, never by a WebGL page; WebGL's comes from three.quarks itself.
 */
export const loadParticleRenderer = async () => (await import('three.quarks/webgpu')).BatchedRenderer;

/** One warm-up per three/webgpu module (one per page; a test's stand-in module gets its own). */
const warmUps = new WeakMap();

/**
 * The page's warm-up WebGPURenderer (AB-T-0554 gotcha 6). The first WebGPURenderer in a page compiles some materials
 * differently from every later one (an environment's IBL code before the shadowed light instead of after), so a few
 * pixels differ by 1 and frames from the first renderer don't match the others'. A throwaway renderer, initialised and
 * given a PMREM of the room environment, takes that first place: afterwards every renderer in the page draws identical
 * frames. Call it at app start, before the view's or any export's renderer; RenderHost.create calls it too.
 * It's kept, never disposed: the spike measured it kept (disposing it may or may not undo what it fixes).
 * @param {{ webgpu?: any }} [o] webgpu: the three/webgpu module (a stand-in in tests)
 * `webgpu` in the result: whether it got the WebGPU backend (three falls back to its WebGL2 backend inside init() when
 * WebGPU fails there, e.g. requestDevice after requestAdapter succeeded).
 * @returns {Promise<{ renderer: any, pmrem: any, environment: any, webgpu: boolean }>}
 */
export async function warmUpWebGPU({ webgpu } = {}) {
  const W = webgpu ?? await loadWebGPU();
  if (!warmUps.has(W)) {
    const warm = (async () => {
      const renderer = new W.WebGPURenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      await renderer.init();
      const { pmrem, texture } = roomPMREM(renderer, W.PMREMGenerator);
      return { renderer, pmrem, environment: texture, webgpu: isWebGPUBackend(renderer) };
    })();
    warmUps.set(W, warm);
    warm.catch(() => { if (warmUps.get(W) === warm) warmUps.delete(W); }); // only a warm-up that worked is kept
  }
  return warmUps.get(W);
}

/**
 * Did this WebGPURenderer get the WebGPU backend? three's WebGPURenderer falls back to its WebGL2 backend inside
 * `init()` when WebGPU fails there, and says so only in `renderer.backend.isWebGPUBackend`.
 * @param {any} renderer an initialised renderer
 */
export const isWebGPUBackend = (renderer) => !!(renderer?.isWebGPURenderer && renderer.backend?.isWebGPUBackend);

/**
 * The neutral studio environment as a PMREM texture, made with the renderer's own generator: three's `PMREMGenerator`
 * for WebGLRenderer, three/webgpu's for WebGPURenderer (`roomEnvironment()` used to return null without WebGL). The
 * generator is returned too; the WebGPU path keeps it alive with the texture, as the spike did.
 * @param {any} renderer @param {any} PMREMGenerator the class that matches the renderer
 */
export function roomPMREM(renderer, PMREMGenerator) {
  const pmrem = new PMREMGenerator(renderer), target = pmrem.fromScene(new RoomEnvironment(), 0.04);
  return { pmrem, texture: target.texture, target };
}
