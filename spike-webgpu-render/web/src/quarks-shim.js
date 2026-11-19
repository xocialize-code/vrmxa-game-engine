// 'three.quarks' for this spike (see vite.config.js): the core, with BatchedRenderer chosen at run time. Under
// ?renderer=webgpu it is three.quarks/webgpu's WebGPUBatchedRenderer (TSL node materials); otherwise the WebGL one.
import * as Core from '../../../node_modules/three.quarks/dist/three.quarks.esm.js';
import * as GPU from '../../../node_modules/three.quarks/dist/three.quarks.webgpu.esm.js';
export * from '../../../node_modules/three.quarks/dist/three.quarks.esm.js';
const gpu = typeof location !== 'undefined' && new URLSearchParams(location.search).get('renderer') === 'webgpu';
export const BatchedRenderer = gpu ? GPU.BatchedRenderer : Core.BatchedRenderer;
export const BatchedParticleRenderer = BatchedRenderer;
export const QUARKS_BACKEND = gpu ? 'three.quarks/webgpu WebGPUBatchedRenderer' : 'three.quarks BatchedRenderer (WebGL)';
