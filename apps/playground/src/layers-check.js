// M5 W7 (AB-T-0609): character layers replay exactly. Mira walks through the sample cafe on scripted input while her
// layers play: a wave (the sample's greet clip) on the upper body, then the carried-tray pose (carry.vrma, the sample
// game's case) on the upper body, a wave on the arms layer over the carry, breathing added on the additive layer, and the
// carry let go. The world is hashed on every step. Node runs this directly (acceptance/m5/layers.mjs), browsers through
// the playground's ?mode=layers; the runner compares the runs. What it checks besides the hashes:
//   - the lower body is walking's, bit for bit, on every step the fullBody additive layer isn't playing (the same walk
//     with no layer, beside it); while it plays, breathing lifts the hips;
//   - each layer did something (the arm's largest turn from walking's while it played) and left no state behind;
//   - the same run twice is the same;
//   - a snapshot taken mid-fade (the arms' wave fading in over the carry) restores into a fresh world that gives the
//     unbroken run's hashes on every following step.
import { captureWorld, restoreWorld, worldHashes, hashValue, packRun, compareRuns } from '@vrmxg/snapshot';
import { MASKS } from '@vrmxg/character';
import { buildWorld, loadSample } from './world.js';

export const CARRY_CLIP = 'animations/clips/carry.vrma';
export const LAYERS_STEPS = 420;
export const LAYERS_SNAP_AT = 215;
/** What happens on which step (before that step runs). */
export const LAYERS_SCRIPT = [
  [40, 'playLayer', { layer: 'upperBody', clip: 'greet', loop: false, fade: 0.2 }],   // a wave over the walk
  [130, 'playLayer', { layer: 'upperBody', slot: 'carry', fade: 0.3 }],                // picks up the tray
  [205, 'playLayer', { layer: 'arms', clip: 'greet', loop: false, fade: 0.3 }],        // waves over the carry
  [260, 'playLayer', { layer: 'additive', clip: 'idle-breathe', weight: 0.5, fade: 0.5 }],
  [330, 'stopLayer', { layer: 'upperBody', fade: 0.4 }],                               // puts the tray down
  [360, 'stopLayer', { layer: 'additive', fade: 0.3 }],
];
const move = (step) => (step >= 20 ? [0.8, -1.0] : [0, 0]);

/**
 * A loaded sample with the carry clip in its animation document (a `carry` slot in the default set), unless the
 * document already has one (the sample game, W10, may add it). The playground's ?layers does this too.
 * @param {Awaited<ReturnType<typeof loadSample>>} S @param {(ref: string) => Promise<Uint8Array>} bytes @param {any} vrmxaCore
 */
export async function withCarry(S, bytes, vrmxaCore) {
  const doc = S.animations?.doc;
  if (doc && !doc.clips.some((c) => c.name === 'carry')) {
    const b = await bytes(CARRY_CLIP), sha = await vrmxaCore.sha256(b);
    S.animations = {
      doc: { ...doc, clips: [...doc.clips, { sha256: sha, file: CARRY_CLIP, name: 'carry', duration: 2, loops: true, rootMotion: 'inPlace', tracks: ['humanoid'], licence: 'CC0-1.0' }], sets: doc.sets.map((s) => (s.default ? { ...s, slots: { ...s.slots, carry: [{ clip: sha, weight: 1, blendIn: 0.3 }] } } : s)) },
      clips: new Map([...S.animations.clips, [sha, b]]),
    };
  }
  return S;
}

async function sampleWithCarry(bytes, vrmxaCore) {
  const S = await withCarry(await loadSample(bytes), bytes, vrmxaCore);
  // Mira on scripted input alone: no player behaviour reading devices
  S.doc = { ...S.doc, nodes: S.doc.nodes.map((n) => (n.id === 'mira' ? { ...n, behaviours: [] } : n)) };
  return S;
}

/** @param {{ R: any, bytes: (ref: string) => Promise<Uint8Array>, opts: any }} o */
export async function layersCheck({ R, bytes, opts }) {
  const sample = await sampleWithCarry(bytes, opts.vrmxaCore);
  const world = () => buildWorld(R, sample, opts);
  const lowerOf = (m) => MASKS.lowerBody.flatMap((b) => { const n = m.vrm.humanoid.getNormalizedBoneNode(b); return n ? [...n.quaternion.toArray(), ...(b === 'hips' ? n.position.toArray() : [])] : []; });
  const armOf = (m, b) => m.vrm.humanoid.getNormalizedBoneNode(b).quaternion.toArray();
  const angle = (a, b) => { const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]); return 2 * Math.acos(Math.min(1, d)); };

  const play = async (W, { from = 0, snap = false, layers = true, ref = null } = {}) => {
    const tree = W.tree, mira = /** @type {any} */ (tree.find('mira'));
    const run = from === 0 ? [{ step: 0, h: worldHashes(tree) }] : [];
    let snapshot = null, legsDiffer = 0, legsChecked = 0, stateSteps = 0;
    const turn = { wave: 0, carry: 0, armsWave: 0, breath: 0 }, lowers = [], arms = [];
    for (let k = from + 1; k <= LAYERS_STEPS; k++) {
      if (layers) for (const [at, call, args] of LAYERS_SCRIPT) if (k - 1 === at) mira[call](args);
      mira.input.move = move(k - 1);
      while (!tree.step()) await tree.settle();
      run.push({ step: k, h: worldHashes(tree, { physicsBytes: k % 60 === 0 }) });
      if (snap && k === LAYERS_SNAP_AT) snapshot = captureWorld(tree);
      if (!ref) { lowers.push(lowerOf(mira)); arms.push([armOf(mira, 'rightUpperArm'), armOf(mira, 'leftLowerArm')]); continue; }
      const i = k - 1, lw = lowerOf(mira);
      // the additive layer is fullBody: breathing moves the hips too, so the legs are walking's whenever it isn't playing
      if (mira.layers.state.has('additive')) turn.breath = Math.max(turn.breath, Math.abs(lw[5] - ref.lowers[i][5]));
      else { legsChecked++; if (lw.some((x, j) => x !== ref.lowers[i][j])) legsDiffer++; }
      if (mira.getState().layers) stateSteps++;
      const d = angle(armOf(mira, 'rightUpperArm'), ref.arms[i][0]);
      if (k > 40 && k < 120) turn.wave = Math.max(turn.wave, d);
      if (k > 170 && k < 200) turn.carry = Math.max(turn.carry, angle(armOf(mira, 'leftLowerArm'), ref.arms[i][1]));
      if (k > 215 && k < 270) turn.armsWave = Math.max(turn.armsWave, d);
    }
    return { run, final: hashValue(run.at(-1).h), snapshot, lowers, arms, legsDiffer, legsChecked, stateSteps, turn, endState: mira.getState().layers ?? null, at: mira.object3d.position.toArray() };
  };

  const walk = await play(await world(), { layers: false });           // the walk alone: the lower body's reference
  const a = await play(await world(), { snap: true, ref: walk });
  const B = await world();
  restoreWorld(B.tree, a.snapshot);
  const b = await play(B, { from: LAYERS_SNAP_AT });
  const restored = { at: LAYERS_SNAP_AT, final: b.final, same: b.final === a.final && compareRuns(a.run.slice(LAYERS_SNAP_AT + 1), b.run) === null };
  const again = await play(await world());
  const r4 = (v) => Math.round(v * 1e4) / 1e4;
  return {
    steps: LAYERS_STEPS, final: a.final, walkFinal: walk.final, components: Object.keys(a.run[0].h).length, run: packRun(a.run),
    twice: again.final === a.final && JSON.stringify(packRun(again.run)) === JSON.stringify(packRun(a.run)),
    layersChangeTheRun: walk.final !== a.final, restored,
    legs: { stepsChecked: a.legsChecked, stepsDiffering: a.legsDiffer, sameAsWalkEveryStep: a.legsDiffer === 0 && a.legsChecked > 250 },
    turned: { wave: r4(a.turn.wave), carryForearm: r4(a.turn.carry), armsWaveOverCarry: r4(a.turn.armsWave), breathLiftsHips: r4(a.turn.breath) },
    stateSteps: a.stateSteps, endState: a.endState, walked: r4(Math.hypot(a.at[0] - walk.at[0], a.at[2] - walk.at[2])),
  };
}

/** What a run must show beyond its hashes. */
export function layersPerformed(r) {
  return r.twice && r.layersChangeTheRun && r.restored.same && r.legs.sameAsWalkEveryStep && r.turned.wave > 0.5 && r.turned.carryForearm > 1 && r.turned.armsWaveOverCarry > 0.5 && r.turned.breathLiftsHips > 1e-3 && r.endState === null && r.walked === 0;
}
