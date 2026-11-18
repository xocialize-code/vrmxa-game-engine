// @vrmxg/save — M2 W9 (AB-T-0532). Save games: the save service, versioned save files, and stores.
import { SaveService } from './service.js';
export { SaveService, SAVE_FORMAT, SAVE_VERSION, mathsFingerprint } from './service.js';
export { MemoryStore, IndexedDBStore, ShellStore } from './stores.js';
export { encode, decode, toBase64, fromBase64 } from './encode.js';

/** Give a tree the "save" service. @param {any} tree @param {ConstructorParameters<typeof SaveService>[1]} [o] */
export function installSave(tree, o = {}) { return tree.addService('save', new SaveService(tree, o)); }
