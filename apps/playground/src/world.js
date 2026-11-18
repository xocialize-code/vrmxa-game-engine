// The sample world, built the same way in every runtime: the playground (browser), its acceptance mode (Chromium,
// WKWebView) and the Node runner. No DOM, no bundler aliases: whatever differs by runtime comes in as arguments
// (how to read a file, vrmxa-core, the project's behaviours).
import { m0Registry } from '@vrmxg/registry/m0';
import { parse } from '@vrmxg/scene';
import { SceneTree } from '@vrmxg/core';
import { installPhysics } from '@vrmxg/physics';
import { installCharacters } from '@vrmxg/character';
import { installInput } from '@vrmxg/input';
import { installCameras } from '@vrmxg/camera';
import { installModels } from '@vrmxg/model';
import { installItems } from '@vrmxg/item';
import { installInteraction } from '@vrmxg/interact';
import { installCloset } from '@vrmxg/closet';

const text = (b) => new TextDecoder().decode(b);

/**
 * Everything a scene of the sample project needs, read once: the scene, its prefabs, the project animations.
 * @param {(ref: string) => Promise<Uint8Array>} bytes a project file by ref
 */
export async function loadSample(bytes, scene = 'cafe.vrmxs') {
  const doc = parse(text(await bytes(scene)));
  const prefabs = new Map();
  const walk = async (d) => { for (const a of d.assets ?? []) if (a.type === 'vrmxs' && !prefabs.has(a.ref)) { const p = parse(text(await bytes(a.ref))); prefabs.set(a.ref, p); await walk(p); } };
  await walk(doc);
  const animDoc = JSON.parse(text(await bytes('animations.json')));
  const clips = new Map();
  for (const c of animDoc.clips) clips.set(c.sha256, await bytes(c.file));
  return { scene, doc, prefabs, animations: { doc: animDoc, clips }, bytes };
}

/**
 * A fresh SceneTree of the sample scene, instantiated and ready to step.
 * @param {any} R Rapier @param {Awaited<ReturnType<typeof loadSample>>} sample
 * @param {{ vrmxaCore: any, closet?: any, spec?: Uint8Array | null, behaviours: Map<string, any>, stubTextures?: boolean, seed?: number }} opts
 *   closet: vrmxa-core's ./closet module (the closet at run time: taking the sword); spec: spec.vrm, for redraws
 */
export async function buildWorld(R, sample, { vrmxaCore, closet = null, spec = null, behaviours, stubTextures = false, seed = 1 }) {
  const tree = new SceneTree({ registry: m0Registry(), prefabs: sample.prefabs, behaviours, seed });
  const input = installInput(tree);
  installPhysics(tree, R);
  const lib = installCharacters(tree, { resolve: sample.bytes, vrmxaCore, prefabs: sample.prefabs, stubTextures, projectAnimations: sample.animations });
  installCameras(tree);
  const models = installModels(tree, { resolve: sample.bytes, stubTextures });
  const items = installItems(tree, { resolve: sample.bytes, vrmxaCore, stubTextures });
  await models.prepare(sample.doc);
  await items.prepare(sample.doc);
  await lib.prepare(sample.doc);
  const { interact, inventory } = installInteraction(tree);
  const wardrobe = closet && vrmxaCore ? installCloset(tree, { vrmxaCore, closet, spec, stubTextures }) : null;
  await wardrobe?.prepare(sample.doc);
  tree.instantiate(structuredClone(sample.doc));
  await wardrobe?.showWorn();
  return { tree, input, models, items, lib, interact, inventory, closet: wardrobe };
}
