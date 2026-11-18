// @vrmxg/model — M0 W8 (AB-T-0509). glTF sets and props for Model nodes, colliders from the asset's
// KHR_physics data, and the GLB writer the sample content is generated with.
import { ModelLibrary, ModelNode } from './library.js';

export { ModelLibrary, ModelNode, parseGLB } from './library.js';
export { writeGLB, readGLBJson } from './glb.js';

/**
 * Give a SceneTree models: registers the Model class and adds the "models" service. Then
 * `await models.prepare(doc)` before `tree.instantiate(doc)` (install physics first for colliders).
 * @param {any} tree @param {ConstructorParameters<typeof ModelLibrary>[0]} opts
 * @returns {ModelLibrary}
 */
export function installModels(tree, opts) {
  tree.classes.set('Model', ModelNode);
  return tree.addService('models', new ModelLibrary({ prefabs: tree.prefabs, ...opts }));
}
