// @vrmxg/item — M1 W2 (AB-T-0514). VRMXI game items (VRMXA_Specification/VRMXI-base-draft.md): read and check
// .vrmxi files, Item nodes with bodies, colliders, sensors, joints, states and verbs, item state in snapshots, and
// a writer for generated items.
import { ItemLibrary } from './library.js';
import { ItemNode } from './node.js';

export { readItem, ItemError } from './read.js';
export { itemPhysics } from './physics.js';
export { ItemLibrary } from './library.js';
export { ItemNode } from './node.js';
export { packItem } from './pack.js';

/**
 * Give a SceneTree items: registers the Item class and adds the "items" service. Then `await items.prepare(doc)`
 * before `tree.instantiate(doc)` (install physics first).
 * @param {any} tree @param {ConstructorParameters<typeof ItemLibrary>[0]} opts
 * @returns {ItemLibrary}
 */
export function installItems(tree, opts) {
  tree.classes.set('Item', ItemNode);
  return tree.addService('items', new ItemLibrary({ prefabs: tree.prefabs, ...opts }));
}
