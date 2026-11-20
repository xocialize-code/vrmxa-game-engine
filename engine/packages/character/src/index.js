// @vrmxg/character — M0 W3 (AB-T-0504). VRMXA / VRM characters for the scene tree: loading (with
// @xocialize/vrmxa-core injected for .vrmxa bundles, AB-D-0249), the Character node with its locomotion
// graph on VRMXA slots, kinematic controller, look-at, expressions and actions, bone attachments, and a
// snapshot-able state through the vendored three-vrm (@vrmxg/three-vrm). Inside the determinism boundary.
import { CharacterLibrary } from './library.js';
import { CharacterNode, BoneAttachmentNode } from './character.js';

export { parseVRM, parseVRMA } from './load.js';
export { CharacterLibrary } from './library.js';
export { LocomotionGraph } from './graph.js';
export { CharacterNode, BoneAttachmentNode } from './character.js';

/**
 * Give a SceneTree characters: registers the Character and BoneAttachment classes and adds the
 * "characters" service. Then `await library.prepare(doc)` before `tree.instantiate(doc)` (install physics
 * first for controllers).
 * @param {import('@vrmxg/core').SceneTree} tree
 * @param {ConstructorParameters<typeof CharacterLibrary>[0]} opts
 * @returns {CharacterLibrary}
 */
export function installCharacters(tree, opts) {
  tree.classes.set('Character', CharacterNode);
  tree.classes.set('BoneAttachment', BoneAttachmentNode);
  return tree.addService('characters', new CharacterLibrary({ prefabs: tree.prefabs, ...opts }));
}
export { MASKS, maskClip, maskNodes, maskedEntries } from './masks.js';
export { humanoidRagdoll, poseFromRagdoll, RAGDOLL_BONES } from './ragdoll.js';
