// The sample world, built the same way in every runtime: the playground (browser), its acceptance mode (Chromium,
// WKWebView) and the Node runner. No DOM, no bundler aliases: whatever differs by runtime comes in as arguments
// (how to read a file, vrmxa-core, the project's behaviours).
import { m0Registry } from '@vrmxg/registry/m0';
import { declareProjectBehaviours } from '@vrmxg/registry';
import { parse, flatten } from '@vrmxg/scene';
import { SceneTree } from '@vrmxg/core';
import { installPhysics } from '@vrmxg/physics';
import { installCharacters } from '@vrmxg/character';
import { installInput, twoPlayerActions } from '@vrmxg/input';
import { installCameras } from '@vrmxg/camera';
import { installModels } from '@vrmxg/model';
import { installItems } from '@vrmxg/item';
import { installInteraction } from '@vrmxg/interact';
import { installCloset } from '@vrmxg/closet';
import { installAudio } from '@vrmxg/audio';
import { installVoice, installDialogue } from '@vrmxg/voice';
import { installTracks } from '@vrmxg/tracks';
import { installSequence, composeSequence, isSequence } from '@vrmxg/sequence';
import { installParticles } from '@vrmxg/particles';
import { installNav } from '@vrmxg/nav';
import { installAi } from '@vrmxg/ai';
import { installPersonas } from '@vrmxg/persona';
import { installSave } from '@vrmxg/save';
import { installSense } from '@vrmxg/sense';
import { installGame } from '@vrmxg/game';

const text = (b) => new TextDecoder().decode(b);

/**
 * Does the scene, prefab instances flattened in, have a node of this type? (A Dialogue inside a prefab counts.) A scene
 * whose instances can't be flattened is judged by its own nodes: instantiating it says what is wrong.
 * @param {any} doc @param {Map<string, any>} prefabs @param {string} type
 */
export function hasNodeType(doc, prefabs, type) {
  let nodes = doc.nodes ?? [];
  try { nodes = flatten(doc, prefabs).nodes; } catch { /* reported by instantiate */ }
  return nodes.some((n) => n.type === type);
}

/**
 * Everything a scene of the sample project needs, read once: the scene, its prefabs, the project animations.
 * @param {(ref: string) => Promise<Uint8Array>} bytes a project file by ref
 * @param {string} [scene]
 * @param {{ animations?: string | null, personas?: string | null }} [files] where a project keeps its animation sets and
 *   its app personas (a game build names them in its game document, M5 W1; null: it has none). The sample's own names
 *   by default; its personas are optional, as before
 */
export async function loadSample(bytes, scene = 'cafe.vrmxs', { animations = 'animations.json', personas: personasRef = undefined } = {}) {
  let doc = parse(text(await bytes(scene)));
  // a sequence (M2 W1) plays in its set: the set's nodes under their own ids, plus the sequence's cameras and tracks
  if (isSequence(doc)) doc = composeSequence(doc, parse(text(await bytes(doc.set))));
  const prefabs = new Map();
  const walk = async (d) => { for (const a of d.assets ?? []) if (a.type === 'vrmxs' && !prefabs.has(a.ref)) { const p = parse(text(await bytes(a.ref))); prefabs.set(a.ref, p); await walk(p); } };
  await walk(doc);
  const animDoc = animations ? JSON.parse(text(await bytes(animations))) : null;
  const clips = new Map();
  for (const c of animDoc?.clips ?? []) clips.set(c.sha256, await bytes(c.file));
  // the project's app personas (M3 W1), keyed by VRMXA id: optional where nothing names the file; a file a game
  // document names must be there
  let personas = null;
  if (personasRef === undefined) { try { personas = JSON.parse(text(await bytes('personas.json'))); } catch { personas = null; } }
  else if (personasRef) personas = JSON.parse(text(await bytes(personasRef)));
  return { scene, doc, prefabs, animations: animDoc ? { doc: animDoc, clips } : null, bytes, personas };
}

/**
 * A fresh SceneTree of the sample scene, instantiated and ready to step.
 * @param {any} R Rapier @param {Awaited<ReturnType<typeof loadSample>>} sample
 * @param {{ vrmxaCore: any, closet?: any, spec?: Uint8Array | null, behaviours: Map<string, any>, stubTextures?: boolean, seed?: number, timings?: Record<string, number> | null, now?: () => number, characterCache?: any, audioOutput?: any, sense?: boolean, players?: number, mtoonMaterial?: any, actions?: Record<string, any> | null, step?: number, game?: boolean }} opts
 *   closet: vrmxa-core's ./closet module (the closet at run time: taking the sword); spec: spec.vrm, for redraws;
 *   timings: filled with each phase's ms (by `now`, a wall clock the caller passes: nothing here reads one);
 *   characterCache: read bundles and clips kept between builds (the editor's view);
 *   audioOutput: an @vrmxg/audio AudioOutput to hear the world through (none: silent); sense: install the camera's sense
 *   service (@vrmxg/sense; the scene needs its viewer node: withCamera); players: 2 installs the two-player action map
 *   (split screen, M3 W9; the scene gives player 2 a character and a camera: withTwoPlayers); mtoonMaterial: the render
 *   host's MToon class (MToonNodeMaterial on WebGPU, M4 W0; none: three-vrm's MToonMaterial); actions: the game's own
 *   action map (a build's, M5 W0: @vrmxg/bundle's `build.actions()`; none: the engine's default map);
 *   step: the step the world's clock starts on (a game session's, M5 W1: @vrmxg/game's GameFlow asks for a world at
 *   the session's step, set before anything is instantiated); game: install the game service (@vrmxg/game: rules,
 *   scene changes, checkpoints), after every service whose step can call a rule's action, so the step's rules see them
 */
export async function buildWorld(R, sample, { vrmxaCore, closet = null, spec = null, behaviours, stubTextures = false, seed = 1, timings = null, now = () => 0, characterCache = null, audioOutput = null, sense = false, players = 1, mtoonMaterial = null, actions = null, step = 0, game = false }) {
  let t = now();
  const lap = (k) => { if (timings) { const n = now(); timings[k] = n - t; t = n; } };
  const registry = m0Registry();
  declareProjectBehaviours(registry, behaviours); // the project's declared behaviours (M6 W0): their actions answer connections
  const tree = new SceneTree({ registry, prefabs: sample.prefabs, behaviours, seed });
  if (step) tree.clock.step = step; // a session's clock (M5 W1), before any service notes the step it starts on
  const input = installInput(tree, actions ? { actions } : players > 1 ? { actions: twoPlayerActions() } : {}); // a game's own map (M5 W0); split screen (M3 W9): p2.* actions
  installPhysics(tree, R);
  const lib = installCharacters(tree, { resolve: sample.bytes, vrmxaCore, prefabs: sample.prefabs, stubTextures, projectAnimations: sample.animations, cache: characterCache, mtoonMaterial });
  installCameras(tree);
  const models = installModels(tree, { resolve: sample.bytes, stubTextures });
  const items = installItems(tree, { resolve: sample.bytes, vrmxaCore, stubTextures });
  const audio = installAudio(tree, { resolve: sample.bytes, output: audioOutput }); // silent without an output, the same simulation
  lap('setup');
  await models.prepare(sample.doc); lap('models');
  await items.prepare(sample.doc); lap('items');
  await audio.prepare(sample.doc); lap('audio');
  await lib.prepare(sample.doc); lap('characters');
  const voice = installVoice(tree, { resolve: sample.bytes }); // lines heard through the audio service, faces
  await voice.prepare(sample.doc); lap('voice');
  const tracks = installTracks(tree); // AnimationPlayers (M2 W0): advanced before the nodes step
  await tracks.prepare(sample.doc);
  const particles = installParticles(tree, { resolve: sample.bytes }); // ParticleEmitters (M2 W4)
  await particles.prepare(sample.doc);
  const sequence = sample.doc.sequence ? installSequence(tree) : null; // a sequence world (M2 W1): its tracks play in the step
  await sequence?.prepare(sample.doc);
  const nav = installNav(tree); // a navmesh baked from the colliders on the first step; characters' goTo follows it (M2 W6)
  const { interact, inventory } = installInteraction(tree);
  const personas = installPersonas(tree, { resolve: sample.bytes, library: lib, doc: sample.personas ?? null, overrides: sample.doc.settings?.personas ?? null }); // who each character is (M3 W1); the scene's overrides (W10)
  await personas.prepare();
  const camera = sense ? installSense(tree) : null; // the person at the camera (M3 W5): only when a camera is used or a take carries its events
  const ai = installAi(tree, { resolve: sample.bytes }); // NPC brains (M2 W7): the brain behaviour and the shared stimuli
  await ai.prepare(sample.doc); // brain documents named by path (M2 W11), and any voice clips they say
  for (const p of ai.presets.values()) await voice.prepare({ nodes: [{ id: 'brain', behaviours: [p] }] });
  const rules = game ? installGame(tree, { scene: sample.scene }) : null; // game flow (M5 W2), for a world a GameFlow plays
  // conversations with choices (M5 W3, @vrmxg/voice), after input, voice and game, and only for a scene that has a
  // Dialogue node: the service has state, which is in the world hashes, so no other scene's hashes move (AB-T-0630)
  const dialogue = hasNodeType(sample.doc, sample.prefabs, 'Dialogue') ? installDialogue(tree) : null; // prefabs' too
  const save = installSave(tree, { scene: { ref: sample.scene, doc: sample.doc } }); // save games (M2 W9): flags, save files
  const wardrobe = closet && vrmxaCore ? installCloset(tree, { vrmxaCore, closet, spec, stubTextures }) : null;
  await wardrobe?.prepare(sample.doc); lap('closet');
  tree.instantiate(structuredClone(sample.doc)); lap('instantiate');
  await wardrobe?.showWorn(); lap('showWorn');
  return { tree, input, models, items, lib, interact, inventory, closet: wardrobe, audio, voice, tracks, sequence, particles, nav, ai, save, personas, sense: camera, game: rules, dialogue };
}
