// M0's exit checks (W9, AB-T-0510) that run the same in every runtime: no DOM, no renderer. The sample cafe is
// built from scratch for each part with world.js.
//
//   runSimulation  the 10 s recorded walk (content/sample/input/walk-in.json): a 64-bit hash of every component
//                  after every step (Rapier's whole state every 60), a snapshot at step 300 restored into a fresh
//                  world and re-simulated to 600, and what the run shows about play: the door, Mira's locomotion
//                  states, speed blend and root motion, the jump, Hana wandering, the locked staff door.
//   runDevices     the player through real devices: keyboard keys, a gamepad stick and button, mouse look, all
//                  through the action map.
//   runAudio       (browsers, M1 W5) a take heard through a Web Audio output: the hashes are the silent run's, and its
//                  recording mixed offline twice gives the same samples.
//   runCinematic   (M2 W0 + W2) the walk with an AnimationPlayer (a door by an event, a light fade, Hana's talk clip)
//                  and a CameraBrain blending three VirtualCameras (orbit with handheld noise, a dolly on a Path3D, an
//                  over-the-shoulder composer) onto a second camera: a hash of every component after every step and
//                  the brain's output camera, and a snapshot taken mid-blend restored and re-simulated.
//   runItems       (M1 W10) the recorded take with items (content/sample/input/play-items.json): Mira walks in, takes the
//                  sword into her closet, opens the cupboard, sits on a stool, gets up and switches the counter lights
//                  off; Hana greets her on the way. A hash of every component after every step, a snapshot after the
//                  equip restored and re-simulated to the end, and what the take shows: prompts, verbs, animation states,
//                  the closet, item states, and Hana's line (voice, mouth, look-at, blinks, caption).
import { VirtualDevice } from '@vrmxg/input';
import { captureWorld, restoreWorld, worldHashes, compareRuns, hashValue, packRun } from '@vrmxg/snapshot';
import { buildWorld } from './world.js';
import { AudioOutput, mixOffline, hashSamples } from '@vrmxg/audio';

export const STEPS = 600, SNAPSHOT_AT = 300, ITEMS_SNAPSHOT_AT = 720; // a step whose hash includes Rapier's bytes (every 60th), after the equip
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

/**
 * The walk heard through a Web Audio output (a browser): sound is presentation, so the final hash is the silent run's;
 * the run's recording mixed offline twice is the same samples (the offline mix W8's export uses).
 * @param {any} R @param {any} sample @param {any} opts @param {{ silentFinal: string, AudioContext?: any, take?: string, steps?: number }} o
 */
export async function runAudio(R, sample, opts, { silentFinal, AudioContext: Ctor = globalThis.AudioContext, take = 'input/walk-in.json', steps = STEPS }) {
  const output = new AudioOutput({ AudioContext: Ctor });
  const rec = JSON.parse(new TextDecoder().decode(await sample.bytes(take)));
  const W = await buildWorld(R, sample, { ...opts, audioOutput: output });
  W.input.replay(structuredClone(rec));
  W.audio.record();
  let last = null;
  for (let k = 1; k <= steps; k++) { while (!W.tree.step()) await W.tree.settle(); W.tree.present(k / 60, 1); last = worldHashes(W.tree, { physicsBytes: k % 60 === 0 }); }
  const final = hashValue(last);
  const recording = W.audio.recording();
  const heard = new Set(recording.steps.flatMap((s) => s.sounds.map((x) => x.key)));
  W.audio.dispose();
  await output.ctx.close?.();
  const a = await mixOffline(recording, W.audio.library), b = await mixOffline(recording, W.audio.library);
  let peak = 0; for (let c = 0; c < a.numberOfChannels; c++) for (const v of a.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
  return {
    take, final, sameAsSilent: final === silentFinal, sounds: [...heard].sort(),
    mix: { seconds: +(a.length / a.sampleRate).toFixed(3), sampleRate: a.sampleRate, channels: a.numberOfChannels, hashA: hashSamples(a), hashB: hashSamples(b), same: hashSamples(a) === hashSamples(b), peak: +peak.toFixed(4) },
  };
}

/** The recorded take with items, M1 W10 (see the top). @param {any} R @param {any} sample @param {any} opts */
export async function runItems(R, sample, opts) {
  const rec = JSON.parse(text(await sample.bytes('input/play-items.json')));
  const steps = rec.frames.length;
  const A = await buildWorld(R, sample, opts);
  A.input.replay(structuredClone(rec));
  const signals = watchSignals(A.tree);
  const tree = A.tree, mira = /** @type {any} */ (tree.find('mira')), hana = /** @type {any} */ (tree.find('hana-1'));
  const voice = tree.services.get('voice'), em = hana.vrm?.expressionManager;
  const seen = { prompts: new Map(), states: new Set(), seatedAt: null, swordGoneAt: null };
  const talk = { speakingSteps: 0, firstLineAt: null, mouthMax: 0, lookingAtMira: 0, blinks: 0, caption: null, glances: 0 };
  let blinkWas = 0, offsetWas = '';
  const run = [{ step: 0, h: worldHashes(tree, { physicsBytes: true }) }];
  let snap = null;
  for (let k = 1; k <= steps; k++) {
    while (!tree.step()) await tree.settle();
    for (const p of A.interact.prompts()) if (p.actor === 'mira') { const key = `${p.verb}:${p.item}`; if (!seen.prompts.has(key)) seen.prompts.set(key, { step: k, prompt: p.prompt }); }
    seen.states.add(mira.graph.state);
    if (mira.ctrl.seat && seen.seatedAt === null) seen.seatedAt = k;
    if (!tree.find('sword') && seen.swordGoneAt === null) seen.swordGoneAt = k;
    if (voice.speaking('hana-1')) {
      talk.speakingSteps++; talk.firstLineAt ??= k;
      if (em) for (const v of ['aa', 'ih', 'ou', 'ee', 'oh']) talk.mouthMax = Math.max(talk.mouthMax, em.getValue(v) ?? 0);
      if (!talk.caption) { const c = voice.captions(1).find((x) => x.actor === 'hana-1'); if (c) talk.caption = { name: c.name, text: c.text }; }
    }
    if (hana.ctrl.look === 'mira') talk.lookingAtMira++;
    const b = em?.getValue('blink') ?? 0; if (b > 0.5 && blinkWas <= 0.5) talk.blinks++; blinkWas = b;
    const o = JSON.stringify(hana.ctrl.lookOffset ?? null); if (o !== offsetWas && hana.ctrl.lookOffset) talk.glances++; offsetWas = o;
    run.push({ step: k, h: worldHashes(tree, { physicsBytes: k % 60 === 0 }) });
    if (k === ITEMS_SNAPSHOT_AT) snap = captureWorld(tree, { meta: { scene: sample.scene, take: 'input/play-items.json' } });
  }
  const B = await buildWorld(R, sample, opts);
  B.input.replay(structuredClone(rec));
  restoreWorld(B.tree, snap);
  const atRestore = compareRuns([run[ITEMS_SNAPSHOT_AT]], [{ step: ITEMS_SNAPSHOT_AT, h: worldHashes(B.tree, { physicsBytes: true }) }]);
  const again = [];
  for (let k = ITEMS_SNAPSHOT_AT + 1; k <= steps; k++) { while (!B.tree.step()) await B.tree.settle(); again.push({ step: k, h: worldHashes(B.tree, { physicsBytes: k % 60 === 0 }) }); }
  const restored = compareRuns(run.slice(ITEMS_SNAPSHOT_AT + 1), again);
  await A.closet?.settle();
  const itemState = (id) => tree.find(id)?.current ?? null;
  return {
    steps, run: packRun(run), final: hashValue(run.at(-1).h), components: Object.keys(run[0].h).length,
    snapshot: { at: ITEMS_SNAPSHOT_AT, afterEquip: seen.swordGoneAt !== null && seen.swordGoneAt < ITEMS_SNAPSHOT_AT, matchesAtRestore: atRestore === null, rerunMatches: restored === null, divergence: atRestore ?? restored },
    prompts: Object.fromEntries([...seen.prompts].map(([k, v]) => [k, v])),
    states: [...seen.states].sort(), seatedAt: seen.seatedAt, swordTakenAt: seen.swordGoneAt,
    closet: A.closet ? { worn: A.closet.wornBy('mira').map((w) => w.state).filter(Boolean).sort(), held: [...mira.equipped].filter((t) => t.startsWith('held:')).sort(), idleSet: mira.graph.slots.idle?.set?.id ?? null } : null,
    items: { cupboard: itemState('cupboard'), 'light-switch': itemState('light-switch'), sword: tree.find('sword') ? 'in the world' : 'taken' },
    itemSignals: signals.filter((s) => s.signal === 'stateChanged' && ['cupboard', 'light-switch'].includes(s.node)),
    hana: { ...talk, mouthMax: r3(talk.mouthMax) },
  };
}

/** Tracks and cinematic cameras in the cafe, M2 W0 + W2 (see the top). @param {any} R @param {any} sample @param {any} opts */
export async function runCinematic(R, sample, opts) {
  const STEPS_C = 300, SNAP_C = 180;
  const extra = [
    { id: 'show', type: 'AnimationPlayer', parent: 'root', props: { fps: 30, autoplay: true, tracks: [
      { id: 'door', type: 'event', keys: [[15, { target: 'door-1', call: 'enterState', args: { state: 'open' } }], [80, { target: 'dolly', call: 'activate' }]] },
      { id: 'light', type: 'property', target: 'counter-light', path: 'props.intensity', keys: [[0, 18], [45, 4, 'easeInOut'], [120, 18]] },
      { id: 'talk', type: 'animation', target: 'hana-1', clips: [{ start: 20, end: 110, slot: 'talk', blendIn: 8, blendOut: 8 }] },
    ] } },
    { id: 'cine', type: 'Camera', parent: 'root', props: { focalLength: 35 } },
    { id: 'rail', type: 'Path3D', parent: 'root', props: { points: [[-3, 1.6, 4], [-1, 1.7, 2], [1, 1.8, 0], [2.5, 1.6, -1.5]] } },
    { id: 'orbit', type: 'VirtualCamera', parent: 'root', props: { priority: 10, rig: 'orbit', body: { target: 'hana-1', radius: 3.5, yawSpeed: 12 }, noise: { profile: 'handheldLight' } } },
    { id: 'dolly', type: 'VirtualCamera', parent: 'root', props: { priority: 10, rig: 'dolly', body: { path: 'rail', target: 'mira', lead: 0.05 }, aim: { target: 'mira' } } },
    { id: 'ots', type: 'VirtualCamera', parent: 'root', props: { priority: 5, rig: 'overShoulder', body: { target: 'mira' }, aim: { target: 'hana-1' } } },
    { id: 'brain', type: 'CameraBrain', parent: 'root', props: { camera: 'cine', makeCurrent: false, defaultBlend: { style: 'easeInOut', seconds: 1.5 } } },
  ];
  const doc = { ...sample.doc, nodes: [...sample.doc.nodes, ...extra] };
  const S = { ...sample, doc };
  const rec = JSON.parse(text(await sample.bytes('input/walk-in.json')));
  const A = await buildWorld(R, S, opts);
  A.input.replay(structuredClone(rec));
  const cine = () => /** @type {any} */ (A.tree.find('cine'));
  const camHash = (t) => { const c = /** @type {any} */ (t.find('cine')); return hashValue([c.object3d.position.toArray(), c.object3d.quaternion.toArray(), c.props.focalLength]); };
  const run = [{ step: 0, h: { ...worldHashes(A.tree, { physicsBytes: true }), cine: camHash(A.tree) } }];
  const seen = { doorAt: null, changes: [], talkMax: 0 };
  const emit = A.tree.emit.bind(A.tree);
  A.tree.emit = (n, sig, p) => { if (sig === 'cameraChanged') seen.changes.push(`${A.tree.clock.step}:${p.from}>${p.to}`); return emit(n, sig, p); };
  let snap = null;
  for (let k = 1; k <= STEPS_C; k++) {
    while (!A.tree.step()) await A.tree.settle();
    if (seen.doorAt === null && A.tree.find('door-1').current === 'open') seen.doorAt = k;
    const hana = /** @type {any} */ (A.tree.find('hana-1')), talk = hana.graph.slots.talk?.clips?.[0]?.clip;
    if (talk) seen.talkMax = Math.max(seen.talkMax, hana.actions.get(talk)?.weight ?? 0);
    run.push({ step: k, h: { ...worldHashes(A.tree, { physicsBytes: k % 60 === 0 }), cine: camHash(A.tree) } });
    if (k === SNAP_C) snap = captureWorld(A.tree, { meta: { scene: sample.scene, cinematic: true } });
  }
  const B = await buildWorld(R, S, opts);
  B.input.replay(structuredClone(rec));
  restoreWorld(B.tree, snap);
  const again = [];
  for (let k = SNAP_C + 1; k <= STEPS_C; k++) { while (!B.tree.step()) await B.tree.settle(); again.push({ step: k, h: { ...worldHashes(B.tree, { physicsBytes: k % 60 === 0 }), cine: camHash(B.tree) } }); }
  const restored = compareRuns(run.slice(SNAP_C + 1), again);
  return {
    steps: STEPS_C, run: packRun(run), final: hashValue(run.at(-1).h), components: Object.keys(run[0].h).length,
    snapshot: { at: SNAP_C, rerunMatches: restored === null, divergence: restored },
    doorAt: seen.doorAt, cameraChanges: seen.changes, talkMax: r3(seen.talkMax), light: A.tree.find('counter-light').props.intensity,
    cine: { p: cine().object3d.position.toArray().map(r3), focalLength: r3(cine().props.focalLength), live: A.tree.find('brain').bstate.live },
  };
}
