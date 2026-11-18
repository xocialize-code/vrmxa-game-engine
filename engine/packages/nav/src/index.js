// @vrmxg/nav — M2 W6 (AB-T-0529). Navigation: navcat 0.4.1 (MIT) behind the engine's adapter; a tiled navmesh baked
// from the scene's fixed colliders, locked doors as obstacles, run-time off-mesh links, a crowd (vendored, portable
// trig) whose agents drive the characters' controllers, and the crowd in the snapshot.
import { NavService } from './service.js';
export { NavService, AGENT, BAKE, cloneDeep } from './service.js';
export { collidersToSoup } from './soup.js';

/** Give a tree the "nav" service. Install after physics and characters. @param {any} tree @param {{ maxTop?: number }} [o] */
export function installNav(tree, o = {}) { return tree.addService('nav', new NavService(tree, o)); }
