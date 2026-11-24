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
import { installTracks } from '@vrmxg/tracks';
import { installSequence, composeSequence, isSequence } from '@vrmxg/sequence';
import { installParticles } from '@vrmxg/particles';
import { installNav } from '@vrmxg/nav';
import { installAi } from '@vrmxg/ai';
import { installPersonas } from '@vrmxg/persona';
import { installDirector, demoModel, httpModel } from '@vrmxg/director';
import { installSave } from '@vrmxg/save';
import { installGame } from '@vrmxg/game';
import { parse, flatten } from '@vrmxg/scene';
import { LiveView } from './live.js';

export class EngineSession extends LiveView {
  /** @param {import('./project.js').Project} project */
  /**
   * @param {import('./project.js').Project} project
   * @param {{ director?: string | null }} [opts] director (M3 W10): "demo" (a scripted model) or a chat-completions URL
   *   (the loopback stand-in): the characters with brains get a director, pumped as the engine steps
   */
  constructor(project, { director = null } = {}) { super(); this.project = project; this.directorSpec = director; }

  /** (Re)start from a scene document. @param {any} doc @param {Map<string, any>} prefabs @param {{ scene?: string | null }} [o] scene: its ref, as game.json and changeScene name it */
  async load(doc, prefabs, { scene = null } = {}) {
    const p = this.project;
    // a sequence (M2 W1) runs in its set: compose them, and read the set's prefabs too
    if (isSequence(doc)) { doc = composeSequence(doc, parse(new TextDecoder().decode(p.bytes(doc.set)))); prefabs = p.prefabs(doc, new Map(prefabs)); }
    const tree = new SceneTree({ registry: m0Registry(), prefabs, behaviours: await p.behaviours(), seed: p.seed });
    installInput(tree);
    installPhysics(tree, await loadRapier());
    // game rules (M5 W9), after physics as @vrmxg/game asks: only for a scene that has them, so a scene without rules
    // keeps the hashes it had. No GameFlow here: a scene change asked for stays `pending` in the state, to be read.
    const GAME = new Set(['GameRules', 'GameCounter', 'GameTimer', 'GameGoal', 'Checkpoint']);
    let nodes = doc.nodes ?? [];
    if (nodes.some((n) => n.type === 'Instance')) { try { nodes = flatten(doc, prefabs).nodes; } catch { /* instantiate names the prefab that isn't there */ } }
    if (nodes.some((n) => GAME.has(n.type))) installGame(tree, { scene });
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
    await installTracks(tree).prepare(doc);
    await installParticles(tree, { resolve: (ref) => Promise.resolve(p.bytes(ref)) }).prepare(doc);
    if (doc.sequence) await installSequence(tree).prepare(doc);
    installNav(tree);
    installInteraction(tree);
    // who each character is (M3 W1): the project's personas.json, with the scene's own overrides (settings.personas)
    const personas = installPersonas(tree, { resolve: (ref) => p.bytes(ref), library: lib, doc: p.exists('personas.json') ? p.json('personas.json') : null, overrides: doc.settings?.personas ?? null });
    await personas.prepare();
    const ai = installAi(tree, { resolve: (ref) => p.bytes(ref) });
    await ai.prepare(doc);
    for (const pr of ai.presets.values()) await voice.prepare({ nodes: [{ id: 'brain', behaviours: [pr] }] });
    installSave(tree, { scene: { ref: doc.id ?? 'scene', doc } });
    const closetModule = vrmxaCore ? await p.vrmxaCloset() : null;
    const closet = closetModule ? installCloset(tree, { vrmxaCore, closet: closetModule, stubTextures: true }) : null;
    await closet?.prepare(doc);
    this.attach(tree);
    tree.instantiate(doc);
    // a director (M3 W10) for the characters with brains: the player (if any) is the person who talks
    this.director = null; this.pumpDirector = false;
    if (this.directorSpec) {
      const player = tree.all().find((n) => n.type === 'Character' && n.behaviourEntries?.some((b) => b.use === 'player'));
      const model = this.directorSpec === 'demo' ? demoModel({ latency: 20 }) : httpModel(this.directorSpec, { model: 'omni4', temperature: 0 });
      this.director = installDirector(tree, { model, user: player?.id ?? null, userName: player?.name ?? null, persona: (id) => personas.forDirector(id), memory: (id) => personas.memoryOf(id) });
      this.pumpDirector = true;
    }
    return { nodes: tree.all().length, step: 0, services: [...tree.services.keys()], ...(models.skipped.length ? { skipped: models.skipped } : {}) };
  }

}
