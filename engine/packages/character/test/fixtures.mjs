// Test assets. The VRMs and vrmxa-core live beside this repository on the development Mac (and in CI only
// when the specification and the avatar studio are checked out next to it), so the character tests skip,
// and say so, when they're missing. Every clip here is generated (CC0): walk, run, jump, fall, land and an
// "idle with a sword" for an item's set, as .vrma written by vrmxa-core's own writer.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEV = new URL('../../../../../', import.meta.url);
export const PATHS = {
  spec: fileURLToPath(new URL('VRMXA_Specification/assets/spec/spec.vrm', DEV)),
  core: fileURLToPath(new URL('vrmxa-avatar-studio/packages/vrmxa-core/src/index.js', DEV)),
  coreAnim: fileURLToPath(new URL('vrmxa-avatar-studio/packages/vrmxa-core/src/anim/index.js', DEV)),
  full: fileURLToPath(new URL('vrmxa-avatar-studio/packages/vrmxa-core/fixtures/characters/full.vrmxa', DEV)),
  vroid10: fileURLToPath(new URL('vrmxa-game-engine/spike-determinism/web/public/models/vroid10.vrm', DEV)),
};
export const available = (...keys) => keys.every((k) => fs.existsSync(PATHS[k]));
export const read = (k) => new Uint8Array(fs.readFileSync(PATHS[k]));

export async function vrmxaCore() {
  return { ...(await import(PATHS.core)), ...(await import(PATHS.coreAnim)) };
}

const REST = {
  hips: [0, 0.95, 0], spine: [0, 0.1, 0], chest: [0, 0.12, 0], neck: [0, 0.25, 0], head: [0, 0.1, 0],
  leftUpperLeg: [0.08, -0.06, 0], leftLowerLeg: [0, -0.42, 0], leftFoot: [0, -0.42, 0],
  rightUpperLeg: [-0.08, -0.06, 0], rightLowerLeg: [0, -0.42, 0], rightFoot: [0, -0.42, 0],
  leftUpperArm: [0.15, 0.2, 0], rightUpperArm: [-0.15, 0.2, 0],
};
const qx = (a) => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];
const qz = (a) => [0, 0, Math.sin(a / 2), Math.cos(a / 2)];

// One generated clip: legs and arms swing by `swing` radians per cycle; `bob` lifts the hips; `travel`
// moves the hips forward by that many metres over the clip (root motion).
// `sit` (0 standing … 1 seated, hips 0.5 m up, thighs level, shins down) may change over the clip (sitTo); `reach`
// raises the right arm forward (use, take); `gesture` waves both forearms a little (talk).
function makeClip(core, name, { seconds, fps = 30, swing = 0, bob = 0, travel = 0, crouch = 0, armsUp = 0, sit = 0, sitTo = sit, reach = 0, gesture = 0 }) {
  const frames = Math.round(seconds * fps) + 1;
  const bones = {};
  const names = ['leftUpperLeg', 'rightUpperLeg', 'leftUpperArm', 'rightUpperArm', 'spine'];
  if (sit || sitTo) names.push('leftLowerLeg', 'rightLowerLeg');
  for (const b of names) bones[b] = new Float32Array(frames * 4);
  const hips = new Float32Array(frames * 3);
  for (let f = 0; f < frames; f++) {
    const t = f / (frames - 1), ph = 2 * Math.PI * t;
    const s = Math.sin(ph) * swing, g = Math.sin(2 * ph) * gesture, k = sit + (sitTo - sit) * t, r = reach * Math.sin(Math.PI * t);
    bones.leftUpperLeg.set(qx(s - crouch - k * Math.PI / 2), f * 4);
    bones.rightUpperLeg.set(qx(-s - crouch - k * Math.PI / 2), f * 4);
    if (bones.leftLowerLeg) { bones.leftLowerLeg.set(qx(k * Math.PI / 2), f * 4); bones.rightLowerLeg.set(qx(k * Math.PI / 2), f * 4); }
    bones.leftUpperArm.set(qz(-1.2 + armsUp - s * 0.5 + g), f * 4);
    bones.rightUpperArm.set(r ? qx(-r) : qz(1.2 - armsUp + s * 0.5 - g), f * 4);
    bones.spine.set(qx(crouch * 0.3), f * 4);
    hips.set([0, 0.95 + bob * Math.abs(Math.sin(ph)) - crouch * 0.2 - k * 0.45, travel * t], f * 3);
  }
  return core.writeVrma({ name, fps, frames, rest: REST, restHips: REST.hips, bones, hips, expressions: {}, custom: new Set(), lookAt: null, lookAtOffset: null, extras: { source: 'engine/packages/character/test/fixtures.mjs' } });
}

/**
 * The test animation document and its clips: a default set (idle, walk at 1.4 m/s, run at 4 m/s, jump,
 * fall, land) and a "sword" set (priority 1, requires the tag "sword") that changes idle.
 * `travel: true` makes walk and run root-motion "travel" clips.
 */
export async function testAnimations(core, { travel = false, actions = false, layers = false } = {}) {
  const defs = [
    ['idle', { seconds: 2, swing: 0.03 }, { loops: true, rootMotion: 'inPlace' }],
    ['walk', { seconds: 1, swing: 0.5, bob: 0.03, travel: travel ? 1.4 : 0 }, { loops: true, speed: 1.4, rootMotion: travel ? 'travel' : 'inPlace' }],
    ['run', { seconds: 0.7, swing: 0.9, bob: 0.06, travel: travel ? 2.8 : 0 }, { loops: true, speed: 4, rootMotion: travel ? 'travel' : 'inPlace' }],
    ['jump', { seconds: 0.4, crouch: 0.4, armsUp: 0.6 }, { loops: false, rootMotion: 'inPlace' }],
    ['fall', { seconds: 0.6, armsUp: 0.9 }, { loops: true, rootMotion: 'inPlace' }],
    ['land', { seconds: 0.3, crouch: 0.5 }, { loops: false, rootMotion: 'inPlace' }],
    ['idle-sword', { seconds: 2, swing: 0.02, armsUp: 0.3 }, { loops: true, rootMotion: 'inPlace' }],
  ];
  // the slots a character plays with items (VRMXI §8): use, equip (for take, until VRMXA has `take`), talk, sit, sitIdle, stand
  const ACTION_DEFS = [
    ['use', { seconds: 0.8, reach: 1.2 }, { loops: false, rootMotion: 'inPlace' }],
    ['equip', { seconds: 1.0, crouch: 0.4, reach: 1.0 }, { loops: false, rootMotion: 'inPlace' }],
    ['talk', { seconds: 2, swing: 0.02, gesture: 0.15 }, { loops: true, rootMotion: 'inPlace' }],
    ['sit', { seconds: 0.8, sit: 0, sitTo: 1 }, { loops: false, rootMotion: 'inPlace' }],
    ['sitIdle', { seconds: 2, sit: 1, swing: 0.01 }, { loops: true, rootMotion: 'inPlace' }],
    ['stand', { seconds: 0.6, sit: 1, sitTo: 0 }, { loops: false, rootMotion: 'inPlace' }],
  ];
  if (actions) defs.push(...ACTION_DEFS);
  // G10 layers (M2 W8): a wave for the masked `greet` gesture (the right arm raised high, waving)
  if (layers) defs.push(['greet', { seconds: 1.2, reach: 2.6, gesture: 0.35 }, { loops: false, rootMotion: 'inPlace' }]);
  const clips = new Map(), entries = [], sha = {};
  for (const [name, gen, meta] of defs) {
    const bytes = makeClip(core, name, gen);
    const h = await core.sha256(bytes);
    sha[name] = h;
    clips.set(h, bytes);
    entries.push({ sha256: h, file: `animations/clips/${name}.vrma`, name, duration: gen.seconds, ...meta, tracks: ['humanoid'], licence: 'CC0' });
  }
  const slot = (n) => [{ clip: sha[n], weight: 1, blendIn: 0.2 }];
  const doc = {
    format: 'vrmxa-animations', version: 1, clips: entries,
    sets: [
      { id: 'default', name: 'Default', default: true, priority: 0, requires: [], slots: { idle: slot('idle'), walk: slot('walk'), run: slot('run'), jump: slot('jump'), fall: slot('fall'), land: slot('land'), ...(actions ? Object.fromEntries(ACTION_DEFS.map(([n]) => [n, slot(n)])) : {}), ...(layers ? { greet: [{ ...slot('greet')[0], mask: 'arms' }] } : {}) } },
      { id: 'sword', name: 'With a sword', priority: 1, requires: ['sword'], slots: { idle: slot('idle-sword'), ...(layers ? { hold: [{ ...slot('idle-sword')[0], mask: 'upperBody' }] } : {}) } },
    ],
  };
  return { doc, clips, sha };
}
