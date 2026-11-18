// M0's exit checks (W9, AB-T-0510) that run the same in every runtime: no DOM, no renderer. The sample cafe is
// built from scratch for each part with world.js.
//
//   runSimulation  the 10 s recorded walk (content/sample/input/walk-in.json): a 64-bit hash of every component
//                  after every step (Rapier's whole state every 60), a snapshot at step 300 restored into a fresh
//                  world and re-simulated to 600, and what the run shows about play: the door, Mira's locomotion
//                  states, speed blend and root motion, the jump, Hana wandering, the locked staff door.
//   runDevices     the player through real devices: keyboard keys, a gamepad stick and button, mouse look, all
//                  through the action map.
import { VirtualDevice } from '@vrmxg/input';
import { captureWorld, restoreWorld, worldHashes, compareRuns, hashValue, packRun } from '@vrmxg/snapshot';
import { buildWorld } from './world.js';

export const STEPS = 600, SNAPSHOT_AT = 300;
const text = (b) => new TextDecoder().decode(b);
const r3 = (v) => +v.toFixed(3);

function watchSignals(tree) {
  const log = [];
  const emit = tree.emit.bind(tree);
  tree.emit = (node, signal, payload) => { log.push({ step: tree.clock.step, node: node.id, signal, ...(signal === 'stateChanged' ? { to: payload?.to } : {}) }); return emit(node, signal, payload); };
  return log;
}

/** @param {any} R @param {any} sample @param {any} opts world options @param {{ now?: () => number }} [t] */
export async function runSimulation(R, sample, opts, { now = () => 0 } = {}) {
  const rec = JSON.parse(text(await sample.bytes('input/walk-in.json')));
  const A = await buildWorld(R, sample, opts);
  A.input.replay(structuredClone(rec));
  const signals = watchSignals(A.tree);
  const mira = /** @type {any} */ (A.tree.find('mira')), hana = A.tree.find('hana-1').object3d;
  const hana0 = hana.position.clone();
  const nameOf = new Map(sample.animations.doc.clips.map((c) => [c.sha256, c.name]));
  const play = { states: new Set(), maxSpeed: 0, maxRunWeight: 0, travelSteps: 0, airborneSteps: 0, maxHeight: 0, groundedAtEnd: false };
  const run = [{ step: 0, h: worldHashes(A.tree, { physicsBytes: true }) }];
  const stepMs = [];
  let snap = null;
  for (let k = 1; k <= STEPS; k++) {
    const t0 = now(); A.tree.step(); stepMs.push(now() - t0);
    const g = mira.graph;
    play.states.add(g.state);
    play.maxSpeed = Math.max(play.maxSpeed, g.speed);
    play.maxRunWeight = Math.max(play.maxRunWeight, g.runWeight(g.speed));
    if (g.state === 'move' && g.moveRootMotion() === 'travel') play.travelSteps++;
    if (!mira.ctrl.grounded) { play.airborneSteps++; play.maxHeight = Math.max(play.maxHeight, mira.object3d.position.y); }
    run.push({ step: k, h: worldHashes(A.tree, { physicsBytes: k % 60 === 0 }) });
    if (k === SNAPSHOT_AT) snap = captureWorld(A.tree, { meta: { scene: sample.scene, steps: STEPS } });
  }
  play.groundedAtEnd = mira.ctrl.grounded;
  const p = mira.object3d.position;

  const B = await buildWorld(R, sample, opts);
  B.input.replay(structuredClone(rec));
  restoreWorld(B.tree, snap);
  const atRestore = compareRuns([run[SNAPSHOT_AT]], [{ step: SNAPSHOT_AT, h: worldHashes(B.tree, { physicsBytes: true }) }]);
  const again = [];
  for (let k = SNAPSHOT_AT + 1; k <= STEPS; k++) { B.tree.step(); again.push({ step: k, h: worldHashes(B.tree, { physicsBytes: k % 60 === 0 }) }); }
  const restored = compareRuns(run.slice(SNAPSHOT_AT + 1), again);

  const picks = mira.graph.getState().picks;
  const stats = [...stepMs].sort((a, b) => a - b);
  return {
    run: packRun(run), final: hashValue(run.at(-1).h), components: Object.keys(run[0].h).length,
    snapshot: { at: SNAPSHOT_AT, matchesAtRestore: atRestore === null, rerunMatches: restored === null, divergence: atRestore ?? restored, physicsBytes: snap.services.physics.data.bytes.length },
    play: {
      ...play, states: [...play.states].sort(), maxSpeed: r3(play.maxSpeed), maxRunWeight: r3(play.maxRunWeight), maxHeight: r3(play.maxHeight),
      miraEnd: [p.x, p.y, p.z].map(r3), hanaMovedM: r3(hana.position.distanceTo(hana0)),
      slots: Object.keys(mira.graph.slots).filter((s) => mira.graph.has(s)), idleClip: nameOf.get(picks.idle), equipped: [...mira.equipped].sort(),
      doorSignals: signals.filter((s) => (s.node.startsWith('entrance-') || s.node === 'door-1') && s.signal === 'stateChanged'),
      staffDoor: A.tree.find('door-1').inspect(),
    },
    stepMs: { mean: r3(stats.reduce((a, b) => a + b, 0) / stats.length), p50: r3(stats[stats.length >> 1]), p95: r3(stats[Math.floor(stats.length * 0.95)]) },
  };
}

/** The player through devices and the action map: keyboard, gamepad, mouse. */
export async function runDevices(R, sample, opts) {
  const W = await buildWorld(R, sample, opts);
  const dev = W.input.addDevice(new VirtualDevice());
  const mira = /** @type {any} */ (W.tree.find('mira')), cam = /** @type {any} */ (W.tree.find('cam'));
  const out = {};
  const steps = (n) => { for (let i = 0; i < n; i++) W.tree.step(); };
  const speed = () => r3(mira.graph.speed);
  steps(30);
  dev.press('KeyW'); steps(60); out.keyboardWalk = { state: mira.graph.state, speed: speed(), z: r3(mira.object3d.position.z) };
  dev.press('ShiftLeft'); steps(40); out.keyboardRun = { state: mira.graph.state, speed: speed(), runWeight: r3(mira.graph.runWeight(mira.graph.speed)) };
  dev.release('ShiftLeft'); dev.release('KeyW');
  dev.press('Space'); steps(1); dev.release('Space');
  let air = 0, top = 0; for (let i = 0; i < 60; i++) { W.tree.step(); if (!mira.ctrl.grounded) { air++; top = Math.max(top, mira.object3d.position.y); } }
  out.keyboardJump = { airborneSteps: air, height: r3(top), landed: mira.ctrl.grounded };
  steps(30);
  const z0 = mira.object3d.position.z;
  dev.setGamepad([0, -1, 0, 0]); steps(60); out.gamepadStick = { state: mira.graph.state, speed: speed(), movedM: r3(Math.abs(mira.object3d.position.z - z0)) };
  dev.setGamepad([0, 0, 0, 0]);
  const b = new Array(17).fill(0); b[0] = 1; dev.setGamepad([0, 0, 0, 0], b); steps(1); dev.setGamepad([0, 0, 0, 0]);
  let gAir = 0; for (let i = 0; i < 60; i++) { W.tree.step(); if (!mira.ctrl.grounded) gAir++; }
  out.gamepadJump = { airborneSteps: gAir };
  const yaw0 = cam.rig.yaw; dev.moveMouse(200, 0); steps(1); out.mouseLook = { yawChange: r3(cam.rig.yaw - yaw0) };
  const preset0 = cam.preset; dev.press('KeyC'); steps(1); dev.release('KeyC'); steps(1); out.cameraNext = { from: preset0, to: cam.preset };
  // M1 W3 + W4: walk up to the sword on the table and take it: into Mira's closet, into her hand, her idle changes
  if (W.closet && W.tree.find('sword')) {
    mira.placeAt(-3, 0, -1.4, Math.PI); steps(3);
    const prompts = W.interact.prompts().map((p) => `${p.verb}:${p.item}`);
    const idleBefore = mira.graph.slots.idle?.set?.id ?? null;
    dev.press('KeyE'); steps(1); dev.release('KeyE'); steps(1);
    out.takeSword = {
      prompts, idleBefore, idleAfter: mira.graph.slots.idle?.set?.id ?? null, taken: !W.tree.find('sword'),
      worn: W.closet.wornBy('mira').map((w) => `${w.id.slice(0, 8)}:${w.state}`), equipped: [...mira.equipped].sort(),
    };
    await W.closet.settle();
    out.takeSword.closetWorn = W.closet.closetOf('mira').worn.items.map((id) => id.slice(0, 8));
  }
  return out;
}
