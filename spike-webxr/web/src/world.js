// The world the stereo, 90 Hz and input pages draw: the snapshot harness's cafe (Mira on the recorded input, Hana
// wandering, the doors) with the render demo's Environment, spot lamp and overview camera. buildWorld is the harness's,
// copied with one change: VRMs load with the render host's MToon class (MToonNodeMaterial on WebGPU, with the
// engine/patches three-vrm patch the install applied), as the playground does.
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree } from '@vrmxg/core';
import { installPhysics, loadRapier } from '@vrmxg/physics';
import { installCharacters } from '@vrmxg/character';
import { installInput } from '@vrmxg/input';
import { installCameras } from '@vrmxg/camera';
import { worldHashes, hashValue } from '@vrmxg/snapshot';
import { loadAssets, Wander } from '../../../engine/packages/snapshot/harness/world.js'; // installs dmath's portable maths

export { worldHashes, hashValue };

export const files = {
  bytes: async (p) => new Uint8Array(await (await fetch(`models/${p}`)).arrayBuffer()),
  json: async (p) => (await fetch(`models/${p}`)).json(),
};

/** The render demo's presentation nodes, plus (post) an Environment post list. */
export const envNodes = ({ post = null } = {}) => [
  { id: 'env', type: 'Environment', parent: 'root', props: { background: 'gradient', ground: true, groundColor: '#b9ab98', fog: 'linear', fogNear: 14, fogFar: 60, ...(post ? { post } : {}) } },
  { id: 'overview', type: 'Camera', parent: 'root', transform: { p: [5.5, 4.2, 11] }, props: { preset: 'fixed', target: 'mira', focalLength: 22 } },
  { id: 'lamp', type: 'SpotLight', parent: 'root', transform: { p: [0, 3, 5], q: [-0.5, 0, 0, 0.866] }, props: { intensity: 25, angle: 35, range: 9, castShadow: true, shadowPreset: 'low' } },
];

let R = null, assets = null;
export async function loadAll() { R ??= await loadRapier(); assets ??= await loadAssets(files); return { R, assets }; }

/**
 * A fresh cafe. `replay` plays the recorded input (input.json); `extraNodes` adds scene nodes; `mtoonMaterial` is the
 * render host's MToon class (null: three-vrm's WebGL MToonMaterial); `devices` are added to the input service.
 * @param {{ replay?: boolean, stubTextures?: boolean, extraNodes?: any[], mtoonMaterial?: any, actions?: any }} [o]
 */
export async function buildWorld({ replay = true, stubTextures = false, extraNodes = [], mtoonMaterial = null, actions } = {}) {
  const { R, assets } = await loadAll();
  const tree = new SceneTree({ registry: m0Registry(), prefabs: assets.prefabs, behaviours: new Map([['wander', Wander]]), seed: 6 });
  const input = installInput(tree, actions ? { actions } : undefined);
  installPhysics(tree, R);
  const lib = installCharacters(tree, { resolve: (ref) => assets.models[ref], stubTextures, mtoonMaterial });
  installCameras(tree);
  for (const ref of Object.keys(assets.models)) lib.setAnimations(ref, assets.animations);
  const doc = structuredClone(assets.scene);
  doc.nodes.push(...structuredClone(extraNodes));
  await lib.prepare(doc);
  tree.instantiate(doc);
  if (replay) input.replay(structuredClone(assets.input));
  return { tree, input, lib, assets };
}
