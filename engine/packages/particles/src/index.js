// @vrmxg/particles — M2 W4 (AB-T-0527). three.quarks 0.18 (MIT) behind a deterministic adapter: the ParticleEmitter
// node, effect documents with built-in steam, dust and sparks, and the "particles" service that steps them in the
// simulation (or as presentation) and draws them in one batch.
import { ParticleEmitterNode } from './emitter.js';
import { ParticlesService } from './service.js';
export { ParticleEmitterNode } from './emitter.js';
export { ParticlesService, withRandom, stepStream } from './service.js';
export { BUILTIN, EFFECT_FORMAT, buildSystems, checkEffect } from './effect.js';
export { TILES, atlasPixels } from './atlas.js';
export { particleRenderers } from './renderers.js';

/** Give a tree ParticleEmitters and the "particles" service. @param {any} tree @param {{ resolve?: (ref: string) => Promise<Uint8Array> }} [o] */
export function installParticles(tree, o = {}) {
  tree.classes.set('ParticleEmitter', ParticleEmitterNode);
  return tree.addService('particles', new ParticlesService(tree, o));
}
