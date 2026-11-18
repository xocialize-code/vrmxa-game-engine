// A headless engine running a scene in Node, for inspection and driving over MCP: the same SceneTree,
// physics, characters, input and cameras the game runs, no renderer. Loaded from the scene as it is
// being edited (unsaved edits included); stepped on request, with input held or replayed; signals
// emitted while stepping are logged.
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree } from '@vrmxg/core';
import { loadRapier, installPhysics } from '@vrmxg/physics';
import { installCharacters } from '@vrmxg/character';
import { installInput } from '@vrmxg/input';
import { installCameras } from '@vrmxg/camera';
import { installModels } from '@vrmxg/model';
import { installItems } from '@vrmxg/item';
import { installInteraction } from '@vrmxg/interact';
import { installCloset } from '@vrmxg/closet';
import { installAudio } from '@vrmxg/audio';
import { installVoice } from '@vrmxg/voice';


import { LiveView } from './live.js';

export class EngineSession extends LiveView {
  /** @param {import('./project.js').Project} project */
  constructor(project) { super(); this.project = project; }

  /** (Re)start from a scene document. */
  async load(doc, prefabs) {
    const p = this.project;
    const tree = new SceneTree({ registry: m0Registry(), prefabs, behaviours: await p.behaviours(), seed: p.seed });
    installInput(tree);
    installPhysics(tree, await loadRapier());
    const lib = installCharacters(tree, { resolve: (ref) => p.bytes(ref), vrmxaCore: await p.vrmxaCore(), stubTextures: true, prefabs, projectAnimations: p.animations() });
    installCameras(tree);
    const models = installModels(tree, { resolve: (ref) => p.bytes(ref), stubTextures: true });
    const vrmxaCore = await p.vrmxaCore();
    const items = installItems(tree, { resolve: (ref) => p.bytes(ref), vrmxaCore, stubTextures: true });
    const audio = installAudio(tree, { resolve: (ref) => p.bytes(ref) }); // silent: the simulation only
    await models.prepare(doc);
    await audio.prepare(doc);
    if (vrmxaCore) await items.prepare(doc); // .vrmxi files are ZIPs: reading them takes vrmxa-core (--vrmxa-core)
    await lib.prepare(doc);
    const voice = installVoice(tree, { resolve: (ref) => p.bytes(ref) });
    await voice.prepare(doc);
    installInteraction(tree);
    const closetModule = vrmxaCore ? await p.vrmxaCloset() : null;
    const closet = closetModule ? installCloset(tree, { vrmxaCore, closet: closetModule, stubTextures: true }) : null;
    await closet?.prepare(doc);
    this.attach(tree);
    tree.instantiate(doc);
    return { nodes: tree.all().length, step: 0, services: [...tree.services.keys()], ...(models.skipped.length ? { skipped: models.skipped } : {}) };
  }

}
