// The W6 harness world, shared by every runtime (node-run.mjs, main.js in Chromium and WKWebView): the
// cafe (cafe.vrmxs: the core fixture's cafe with a floor and walls standing in for its set, Mira as the
// player, Hana wandering, the locked side door and the double entrance door on hinges, a follow camera)
// driven by input.json, 10 s recorded once in Node (record-input.mjs).
//
// `files` is how a runtime reads the assets make-assets.mjs put in public/models: { bytes(path), json(path) }.
// Nothing here reads a clock or Math.random: timing is passed in (`now`) and used only around steps.
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree, Behaviour } from '@vrmxg/core';
import { installPhysics } from '@vrmxg/physics';
import { installCharacters } from '@vrmxg/character';
import { installInput } from '@vrmxg/input';
import { installCameras } from '@vrmxg/camera';
import { captureWorld, restoreWorld, recordRun, compareRuns, worldHashes, hashValue } from '@vrmxg/snapshot';

installPortableMath();

export const STEPS = 600;
export const SNAPSHOT_AT = 300;

// An NPC wander: pick a point within `radius` of home from the behaviour's own random stream, walk to
// it, wait one to three seconds, repeat. (Harness-local; the playground's NPC behaviours are W8.)
export class Wander extends Behaviour {
  ready() { const p = this.node.object3d.position; this.home = [p.x, p.z]; this.target = null; this.wait = 0; }
  physicsProcess() {
    const n = /** @type {any} */ (this.node), p = n.object3d.position;
    if (this.wait > 0) { this.wait--; n.input.move = [0, 0]; return; }
    if (!this.target) {
      const a = this.rng.range(0, 2 * Math.PI), r = this.rng.range(0.5, this.params.radius ?? 3);
      this.target = [this.home[0] + Math.cos(a) * r, this.home[1] + Math.sin(a) * r];
    }
    const dx = this.target[0] - p.x, dz = this.target[1] - p.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.3) { this.target = null; this.wait = 60 + this.rng.int(120); n.input.move = [0, 0]; return; }
    const s = n.props.walkSpeed ?? 1.4;
    n.input.move = [(dx / d) * s, (dz / d) * s];
  }
  getState() { return { home: this.home, target: this.target, wait: this.wait }; }
  setState(s) { this.home = s.home; this.target = s.target; this.wait = s.wait; }
}

/** The assets every world needs, loaded once per runtime. */
export async function loadAssets(files) {
  const anim = await files.json('animations.json');
  const clips = new Map();
  for (const c of anim.clips) clips.set(c.sha256, await files.bytes(`clips/${c.sha256}.vrma`));
  const models = {
    'characters/mira.vrm': await files.bytes('mira.vrm'),
    'characters/hana.vrm': await files.bytes('hana.vrm'),
    'characters/npc.vrm': await files.bytes('npc.vrm'),
  };
  return {
    scene: await files.json('cafe.vrmxs'),
    prefabs: new Map([['prefabs/door.vrmxs', await files.json('prefabs/door.vrmxs')], ['prefabs/double-door.vrmxs', await files.json('prefabs/double-door.vrmxs')]]),
    input: await files.json('input.json'),
    models, animations: { doc: anim, clips },
  };
}

/**
 * A fresh world from the cafe. `npcs` adds that many extra wandering characters (VRoid-class, 106 spring
 * joints) for the budget check; `extraNodes` adds scene nodes (the render demo's Environment);
 * `stubTextures: false` decodes the VRMs' textures, for rendering.
 * @param {any} R Rapier @param {any} assets
 * @param {{ npcs?: number, replay?: boolean, stubTextures?: boolean, extraNodes?: any[] }} [opts]
 */
export async function buildWorld(R, assets, { npcs = 0, replay = true, stubTextures = true, extraNodes = [] } = {}) {
  const tree = new SceneTree({ registry: m0Registry(), prefabs: assets.prefabs, behaviours: new Map([['wander', Wander]]), seed: 6 });
  const input = installInput(tree);
  installPhysics(tree, R);
  const lib = installCharacters(tree, { resolve: (ref) => assets.models[ref], stubTextures });
  installCameras(tree);
  for (const ref of Object.keys(assets.models)) lib.setAnimations(ref, assets.animations);
  const doc = structuredClone(assets.scene);
  doc.nodes.push(...structuredClone(extraNodes));
  if (npcs) {
    doc.assets.push({ id: 'npc', type: 'vrm', ref: 'characters/npc.vrm' });
    for (let i = 0; i < npcs; i++) doc.nodes.push({ id: `npc-${i}`, type: 'Character', parent: 'root', asset: 'npc', transform: { p: [-4.5 + (i % 6) * 1.8, 0, -4.5 + Math.floor(i / 6) * 2] }, behaviours: [{ use: 'wander', radius: 1.5 }] });
  }
  await lib.prepare(doc);
  tree.instantiate(doc);
  if (replay) input.replay(structuredClone(assets.input));
  return { tree, input, lib };
}

const meta = { scene: 'w6-cafe', steps: STEPS };
const stats = (s) => {
  const a = [...s].sort((x, y) => x - y), mean = a.reduce((x, y) => x + y, 0) / a.length;
  return { mean: +mean.toFixed(3), p50: +a[Math.floor(a.length / 2)].toFixed(3), p95: +a[Math.floor(a.length * 0.95)].toFixed(3), max: +a[a.length - 1].toFixed(3) };
};

/**
 * The determinism case: 600 recorded steps hashed after every step (Rapier's full bytes every 60), then
 * a snapshot taken at step 300 restored into a fresh world and re-simulated to 600, compared in place.
 * `inject` adds a Math.random bug from that step on (to prove the comparison catches one).
 */
export async function runDeterminism(R, assets, { now, inject = -1 } = {}) {
  const A = await buildWorld(R, assets);
  if (inject >= 0) {
    const mira = A.tree.find('mira');
    const step0 = mira.physicsProcess.bind(mira);
    mira.physicsProcess = (dt) => { step0(dt); if (A.tree.clock.step >= inject) mira.object3d.position.x += (Math.random() - 0.5) * 1e-4; };
  }
  const h0 = worldHashes(A.tree, { physicsBytes: true });
  const first = recordRun(A.tree, SNAPSHOT_AT, { physicsBytesEvery: 60 });
  let t = now();
  const snap = captureWorld(A.tree, { meta });
  const captureMs = now() - t;
  const rest = recordRun(A.tree, STEPS - SNAPSHOT_AT, { physicsBytesEvery: 60 });
  const run = [{ step: 0, h: h0 }, ...first, ...rest];

  const B = await buildWorld(R, assets);
  t = now();
  restoreWorld(B.tree, snap);
  const restoreMs = now() - t;
  const atRestore = compareRuns([first.at(-1)], [{ step: SNAPSHOT_AT, h: worldHashes(B.tree, { physicsBytes: true }) }]);
  const again = recordRun(B.tree, STEPS - SNAPSHOT_AT, { physicsBytesEvery: 60 });
  const restored = compareRuns(rest, again);

  const mira = A.tree.find('mira').object3d.position, hana = A.tree.find('hana-1').object3d.position;
  return {
    run: pack(run),
    final: hashValue(run.at(-1).h),
    snapshot: { at: SNAPSHOT_AT, captureMs: +captureMs.toFixed(3), restoreMs: +restoreMs.toFixed(3), physicsBytes: snap.services.physics.data.bytes.length, restoredMatchesAtRestore: atRestore === null, restoredRunMatches: restored === null, divergence: atRestore ?? restored },
    world: { mira: [mira.x, mira.y, mira.z].map((v) => +v.toFixed(4)), hana: [hana.x, hana.y, hana.z].map((v) => +v.toFixed(4)), entranceLeft: A.tree.find('entrance/left/hinge').behaviours[0].getState(), entranceRight: A.tree.find('entrance/right/hinge').behaviours[0].getState(), camera: A.tree.find('cam').preset },
  };
}

/** The budget case: the cafe plus 18 NPCs (20 characters), physics and doors; ms per step. */
export async function runBudget(R, assets, { now, npcs = 18 } = {}) {
  const { tree } = await buildWorld(R, assets, { npcs });
  for (let i = 0; i < 120; i++) tree.step();
  const s = [];
  for (let i = 120; i < STEPS; i++) { const t = now(); tree.step(); s.push(now() - t); }
  const caps = [], restores = [];
  const B = await buildWorld(R, assets, { npcs });
  for (let i = 0; i < 10; i++) {
    let t = now(); const snap = captureWorld(tree); caps.push(now() - t);
    t = now(); restoreWorld(B.tree, snap); restores.push(now() - t);
  }
  const characters = tree.all().filter((n) => n.type === 'Character').length;
  return { characters, steps: s.length, stepMs: stats(s), captureMs: stats(caps), restoreMs: stats(restores) };
}

// Per-step hashes, compact: the component names once, then per step its clock and only the components
// whose hash changed since the previous step ({ index: hash }); most of a scene stands still.
export function pack(run) {
  const components = [...new Set(run.flatMap((r) => Object.keys(r.h)))];
  let prev = {};
  const steps = run.map((r) => {
    const changed = {};
    components.forEach((c, i) => { if (r.h[c] !== prev[c]) changed[i] = r.h[c] ?? null; });
    prev = r.h;
    return [r.step, changed];
  });
  return { components, steps };
}
export function unpack({ components, steps }) {
  let cur = {};
  return steps.map(([step, changed]) => {
    cur = { ...cur };
    for (const [i, h] of Object.entries(changed)) { if (h === null) delete cur[components[i]]; else cur[components[i]] = h; }
    return { step, h: cur };
  });
}
