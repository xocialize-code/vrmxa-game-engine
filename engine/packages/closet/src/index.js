// @vrmxg/closet — M1 W4 (AB-T-0516). The closet at run time over vrmxa-core's closet protocol.
import { ClosetService } from './service.js';
export { ClosetService } from './service.js';

/**
 * Give a SceneTree the closet at run time: adds the "closet" service. Install after characters; then
 * `await closet.prepare(doc)` after the character library's prepare, and before instantiate.
 * @param {any} tree @param {ConstructorParameters<typeof ClosetService>[1]} opts
 */
export function installCloset(tree, opts) { return tree.addService('closet', new ClosetService(tree, opts)); }
