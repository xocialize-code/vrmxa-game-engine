// The batch renderer classes a render host draws particles with (AB-A-0335), one per backend, from here rather than from
// the host: the service hands them to a host that hasn't loaded its own (`host.loadParticleRenderer(particleRenderers)`),
// so an app with no particles neither loads three.quarks' renderer nor ships it. WebGL's is three.quarks' own (this package
// imports three.quarks already); WebGPU's, @vrmxg/particles/webgpu's subclass of three.quarks/webgpu's (AB-T-0590), loads
// on demand, never on a WebGL page. Only the classes: nothing here draws or steps.
import { BatchedRenderer } from 'three.quarks';

/** @type {{ webgl: () => Promise<any>, webgpu: () => Promise<any> }} */
export const particleRenderers = {
  webgl: async () => BatchedRenderer,
  webgpu: async () => (await import('./webgpu.js')).BatchedRenderer,
};
