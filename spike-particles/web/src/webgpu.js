// WebGPU smoke test: the same quarks and nebula effects under three's WebGPURenderer, through
// three.quarks/webgpu and three-nebula/webgpu. No VRM here (MToon needs its node material under
// WebGPU, out of scope); a grey capsule stands in. The hand-rolled GLSL option has no WebGPU path
// yet (ShaderMaterial is WebGL-only; it would need a TSL port).
import * as THREE from 'three/webgpu';
import * as QW from 'three.quarks/webgpu';
import { GPURenderer as NebulaGPU } from 'three-nebula/webgpu';
import * as quarks from './libs/quarks.js';
import * as nebula from './libs/nebula.js';

export async function webgpuShots(canvas, post) {
  const out = { navigatorGpu: !!navigator.gpu, shots: [] };
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
  await renderer.init();
  out.backend = renderer.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL2 fallback';
  renderer.setPixelRatio(1);
  renderer.setSize(960, 720, false);
  const cam = new THREE.PerspectiveCamera(30, 960 / 720, 0.05, 50);
  cam.position.set(0.25, 1.3, 3.1); cam.lookAt(0.15, 1.15, 0);
  for (const [lib, effect, frame] of [['quarks', 'impact', 5], ['quarks', 'sparkles', 150], ['quarks', 'speedlines', 90], ['nebula', 'sparkles', 150]]) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x6f86b8);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 1.1, 6, 16), new THREE.MeshBasicMaterial({ color: 0x2a3150 }));
    body.position.set(0, 0.85, 0); scene.add(body);
    const anchor = new THREE.Group();
    anchor.position.set(...({ impact: [0.32, 1.22, 0.42], sparkles: [0, 1.35, 0.05], speedlines: [1.4, 1.0, 0.1] })[effect]);
    scene.add(anchor);
    let w;
    try {
      if (lib === 'quarks') {
        w = quarks.createWorld({ seed: 1, scene, Batched: QW.BatchedRenderer });
        w.add(quarks.effects[effect](w), anchor);
      } else {
        w = nebula.createWorld({ seed: 1, scene, renderer: new NebulaGPU(scene, THREE) });
        const ems = nebula.effects[effect](w);
        for (const e of ems) { e.position.x += anchor.position.x; e.position.y += anchor.position.y; e.position.z += anchor.position.z; }
        w.add(ems);
      }
      while (w.frame < frame) w.step(1 / 60);
      await renderer.renderAsync(scene, cam);
      const name = `webgpu-${lib}-${effect}`;
      post('png', { name, dataUrl: canvas.toDataURL('image/png') });
      out.shots.push({ name, ok: true, drawCalls: renderer.info.render.drawCalls, particles: w.count() });
    } catch (e) {
      out.shots.push({ name: `${lib}-${effect}`, ok: false, error: String(e?.stack || e).slice(0, 400) });
    }
    w?.dispose?.();
  }
  return out;
}
