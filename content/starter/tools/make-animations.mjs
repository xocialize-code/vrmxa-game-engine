// The starter content's default animation set (M6 W4, AB-T-0647): mesh2motion's CC0 human clips retargeted onto the
// VRM humanoid as .vrma, and the animations document (VRMXA §8.4) that maps them to VRMXA's slots (§8.2).
//
//   node content/starter/tools/make-animations.mjs [--check] [--source <mesh2motion-app-main>]
//
// Writes content/starter/animations/clips/*.vrma, content/starter/animations.json and the clips' provenance
// (content/starter/animations/provenance.json, which tools/make-licences.mjs turns into LICENCES.md rows). --check
// builds everything in memory and fails when a committed file differs.
//
// Needs, beside the repository (as every character tool does): reference/mesh2motion-app-main (git-ignored; in a
// worktree, the main checkout's), vrmxa-avatar-studio (vrmxa-core writes and checks the .vrma) and
// VRMXA_Specification (Spec's rig: ground speed is metres per second on Spec, VRMXA §8.4).
//
// LICENCE. mesh2motion's art (models, rigs, animations) is CC0 1.0 (its LICENSE-CC0.MD and README, "Licenses"); its
// code is MIT and none of it is copied here. Its manifest has no per-clip licence, so the repository-wide dedication
// covers every clip; the clips tagged "quaternius" come from Quaternius' Universal Animation Library, itself CC0
// (mesh2motion credits Quaternius for its base human model, rig and animations). Not CC0 in mesh2motion, and not used
// here: some rig *variations* (Sophia CC-SA 4.0; Jay, Sintel, Bunny and Carrot CC-BY: src/lib/RigConfig.ts). Only the
// human animation GLBs are read, never a model.
//
// RETARGETING. mesh2motion's human rig is a T-pose facing +Z with its left at +X, as VRM 1.0's rest is, so a bone's
// motion carries over as its world rotation away from rest: D = A · R⁻¹ (A its world rotation at a frame, R at rest).
// On a normalized VRM humanoid every bone rests at the identity, so D is the bone's normalized world rotation and its
// local one is D(parent)⁻¹ · D. The hips' place is the pelvis's, centred over the feet at rest. Clips are sampled on
// their own 24 fps keys. The rig's bones map one to one (pelvis → hips, spine_01..03 → spine, chest, upperChest,
// clavicle → shoulder, thigh / calf / foot / ball → upper leg, lower leg, foot, toes, fingers 01..03).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { installPortableMath } from '@vrmxg/dmath';
import { vrmxaCore, PATHS } from '../../../engine/packages/character/test/fixtures.mjs';
import { CLIPS, SETS } from './starter-clips.mjs';

installPortableMath(); // the same bytes on every machine
const root = path.resolve(import.meta.dirname, '..');
const repo = path.resolve(root, '../..');
const argv = process.argv.slice(2);
const check = argv.includes('--check');
const sourceArg = argv.includes('--source') ? argv[argv.indexOf('--source') + 1] : null;
const SOURCE = sourceArg ?? [path.join(repo, 'reference/mesh2motion-app-main'), path.join(repo, '../../../reference/mesh2motion-app-main')].find((d) => fs.existsSync(path.join(d, 'static/assets/manifest.json')));
if (!SOURCE) { console.error('mesh2motion not found: pass --source <mesh2motion-app-main> (reference/ is git-ignored)'); process.exit(2); }
if (!fs.existsSync(PATHS.core) || !fs.existsSync(PATHS.spec)) { console.error('needs vrmxa-avatar-studio and VRMXA_Specification beside the repository'); process.exit(2); }
const HUMAN = path.join(SOURCE, 'static/assets/human');
const manifest = JSON.parse(fs.readFileSync(path.join(SOURCE, 'static/assets/manifest.json'), 'utf8'));
const byFile = new Map(manifest.rigs.human.animations.map((a) => [a.file.replace(/^human\/animations\//, '').replace(/\.glb$/, ''), a]));
const licenceText = fs.readFileSync(path.join(SOURCE, 'LICENSE-CC0.MD'), 'utf8');
if (!/All 3d models, blend files, rigs, animations/.test(licenceText) || !/CC0 1\.0 Universal/.test(licenceText)) throw new Error('mesh2motion\'s LICENSE-CC0.MD no longer says its animations are CC0: check the licence before using them');

const core = await vrmxaCore();
const spec = rigFromSpec();
function rigFromSpec() { return core.rigFromVrm(new Uint8Array(fs.readFileSync(PATHS.spec)), { label: 'Spec' }); }

// ---------------------------------------------------------------- the rig: VRM humanoid bone → mesh2motion bone
const MAP = { hips: 'pelvis', spine: 'spine_01', chest: 'spine_02', upperChest: 'spine_03', neck: 'neck_01', head: 'head' };
for (const [s, x] of [['left', 'l'], ['right', 'r']]) {
  Object.assign(MAP, {
    [`${s}Shoulder`]: `clavicle_${x}`, [`${s}UpperArm`]: `upperarm_${x}`, [`${s}LowerArm`]: `lowerarm_${x}`, [`${s}Hand`]: `hand_${x}`,
    [`${s}UpperLeg`]: `thigh_${x}`, [`${s}LowerLeg`]: `calf_${x}`, [`${s}Foot`]: `foot_${x}`, [`${s}Toes`]: `ball_${x}`,
    [`${s}ThumbMetacarpal`]: `thumb_01_${x}`, [`${s}ThumbProximal`]: `thumb_02_${x}`, [`${s}ThumbDistal`]: `thumb_03_${x}`,
  });
  for (const [f, m] of [['Index', 'index'], ['Middle', 'middle'], ['Ring', 'ring'], ['Little', 'pinky']]) {
    Object.assign(MAP, { [`${s}${f}Proximal`]: `${m}_01_${x}`, [`${s}${f}Intermediate`]: `${m}_02_${x}`, [`${s}${f}Distal`]: `${m}_03_${x}` });
  }
}
const BONES = core.BONES.filter((b) => MAP[b]);
const has = new Set(BONES);
const parentOf = (b) => { let p = core.PARENT[b]; while (p && !has.has(p)) p = core.PARENT[p]; return p ?? null; };

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
await MeshoptDecoder.ready;
const load = (file) => { const b = fs.readFileSync(file); return new Promise((res, rej) => loader.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej)); };
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

// the rest pose, from the rig's own skeleton file
const skeleton = await load(path.join(HUMAN, 'skeleton.glb'));
skeleton.scene.updateMatrixWorld(true);
const restQ = {}, restP = {};
for (const b of BONES) {
  const o = skeleton.scene.getObjectByName(MAP[b]);
  if (!o) throw new Error(`mesh2motion's skeleton has no ${MAP[b]}`);
  restQ[b] = o.getWorldQuaternion(new THREE.Quaternion());
  restP[b] = o.getWorldPosition(new THREE.Vector3());
}
const centre = new THREE.Vector3(restP.hips.x, 0, restP.hips.z);
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const REST = Object.fromEntries(BONES.map((b) => { const p = parentOf(b); const v = p ? restP[b].clone().sub(restP[p]) : restP[b].clone().sub(centre); return [b, v.toArray().map(r6)]; }));

/**
 * Ground speed when the checker's treadmill finds no steps (a run's feet touch for fewer than its three frames): the
 * mean backward speed of the lowest sole point over the frames it is within 2 cm of the floor, on Spec.
 */
function stanceSpeed(clip) {
  const T = core.track(clip, spec);
  let sum = 0, n = 0;
  for (let f = 1; f < T.frames; f++) {
    const lo = (g) => T.soles[g].reduce((a, p) => (p.at[1] < a.at[1] ? p : a));
    const a = lo(f), b = T.soles[f - 1].find((p) => p.side === a.side && p.bone === a.bone) ?? null;
    if (!b || a.at[1] > 0.02) continue;
    sum += (b.at[2] - a.at[2]) * T.fps; n++;
  }
  return n ? sum / n : 0;
}

/** One mesh2motion clip → a .vrma clip record (vrmxa-core's clip shape). */
async function retarget(src, name) {
  const gltf = await load(path.join(HUMAN, 'animations', `${src}.glb`));
  const anim = gltf.animations[0];
  const info = byFile.get(src);
  const fps = manifest.rigs.human.fps;
  const frames = info.frame_count;
  if (Math.abs((frames - 1) / fps - anim.duration) > 1e-3) throw new Error(`${src}: ${frames} frames at ${fps} fps isn't its ${anim.duration} s`);
  const scene = gltf.scene;
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(anim).play();
  const nodes = Object.fromEntries(BONES.map((b) => [b, scene.getObjectByName(MAP[b])]));
  const bones = Object.fromEntries(BONES.map((b) => [b, new Float32Array(frames * 4)]));
  const hips = new Float32Array(frames * 3);
  const dirs = []; // per frame, each limb's direction in the source (the check below)
  const D = {}, q = new THREE.Quaternion(), inv = Object.fromEntries(BONES.map((b) => [b, restQ[b].clone().invert()]));
  for (let f = 0; f < frames; f++) {
    mixer.setTime(f / fps);
    scene.updateMatrixWorld(true);
    for (const b of BONES) D[b] = nodes[b].getWorldQuaternion(new THREE.Quaternion()).multiply(inv[b]);
    for (const b of BONES) {
      const p = parentOf(b);
      q.copy(p ? D[p].clone().invert().multiply(D[b]) : D[b]).normalize();
      if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w); // one hemisphere: linear keys interpolate the short way
      bones[b].set([q.x, q.y, q.z, q.w], f * 4);
    }
    const at = (b) => nodes[b].getWorldPosition(new THREE.Vector3());
    dirs.push(Object.fromEntries(LIMBS.map(([a, b]) => [a, at(b).sub(at(a)).normalize()])));
    const hp = nodes.hips.getWorldPosition(new THREE.Vector3()).sub(centre);
    hips.set([hp.x, hp.y, hp.z], f * 3);
  }
  // keep neighbouring keys in the same hemisphere (sign flips would spin a bone through 360°)
  for (const b of BONES) { const a = bones[b]; for (let f = 1; f < frames; f++) { const i = f * 4, j = i - 4; if (a[i] * a[j] + a[i + 1] * a[j + 1] + a[i + 2] * a[j + 2] + a[i + 3] * a[j + 3] < 0) for (let k = 0; k < 4; k++) a[i + k] = -a[i + k]; } }
  return {
    clip: { name, fps, frames, duration: (frames - 1) / fps, rest: REST, restHips: REST.hips, bones, hips, expressions: {}, custom: new Set(), lookAt: null, lookAtOffset: null },
    info, dirs,
  };
}

// Each limb (bone → its child) and the angle between its direction on Spec and in mesh2motion. A world rotation keeps
// angles, so if the retarget is right that angle stays what it is at rest on every frame: Spec posed by the .vrma
// (vrmxa-core's own forward kinematics) points every limb the way mesh2motion's does, up to their rest difference.
const LIMBS = [['hips', 'spine'], ['spine', 'chest'], ['chest', 'upperChest'], ['upperChest', 'neck'], ['neck', 'head'], ...['left', 'right'].flatMap((s) => [
  [`${s}Shoulder`, `${s}UpperArm`], [`${s}UpperArm`, `${s}LowerArm`], [`${s}LowerArm`, `${s}Hand`], [`${s}Hand`, `${s}MiddleProximal`], [`${s}IndexProximal`, `${s}IndexIntermediate`], [`${s}IndexIntermediate`, `${s}IndexDistal`], [`${s}ThumbMetacarpal`, `${s}ThumbProximal`], [`${s}ThumbProximal`, `${s}ThumbDistal`],
  [`${s}UpperLeg`, `${s}LowerLeg`], [`${s}LowerLeg`, `${s}Foot`], [`${s}Foot`, `${s}Toes`]])];
const angle = (u, v) => Math.acos(Math.min(1, Math.max(-1, u.dot(v)))) * 180 / Math.PI;
function limbError(clip, dirs) {
  const sub = (p, a, b) => new THREE.Vector3(...p[b]).sub(new THREE.Vector3(...p[a])).normalize();
  const rest = Object.fromEntries(LIMBS.filter(([a, b]) => spec.restWorld[a] && spec.restWorld[b]).map(([a, b]) => [a, angle(sub(spec.restWorld, a, b), restP[b].clone().sub(restP[a]).normalize())]));
  let worst = 0;
  for (let f = 0; f < clip.frames; f++) {
    const pose = core.poseAt(clip, spec, f);
    for (const [a, b] of LIMBS) if (a in rest && pose.pos[a] && pose.pos[b]) worst = Math.max(worst, Math.abs(angle(sub(pose.pos, a, b), dirs[f][a]) - rest[a]));
  }
  return worst;
}

// ---------------------------------------------------------------- build
const out = new Map(); // rel → bytes
const records = [], provenance = [];
const shaOf = new Map();
for (const c of CLIPS) {
  const { clip, info, dirs } = await retarget(c.src, c.name);
  const srcRel = `static/assets/human/animations/${c.src}.glb`;
  const srcSha = sha256(fs.readFileSync(path.join(SOURCE, srcRel)));
  const quaternius = info.tags.includes('quaternius');
  const extras = { source: `mesh2motion ${srcRel} ("${info.name}", CC0 1.0), retargeted by content/starter/tools/make-animations.mjs`, licence: 'CC0-1.0' };
  const loops = c.loops ?? info.loop;
  const details = { loops, rootMotion: 'inPlace', speed: null };
  const write = () => core.writeVrma(clip, { generator: 'VRMXG starter content (content/starter/tools/make-animations.mjs)', extras });
  // Spec's legs are longer for her hips than mesh2motion's, so with the hips scaled by height her soles sink a little
  // (1 to 4 cm): move the clip up or down until its lowest sole on the frames she stands (hips at 65 % of their
  // height or more, the checker's rule) touches the floor on Spec. Frames she crouches, sits or lies don't count.
  const T = core.track(core.readVrma(write()), spec);
  const standing = T.lowest.filter((_, f) => T.standing[f]);
  const lift = +(-Math.min(...(standing.length ? standing : T.lowest))).toFixed(4); // crouched or seated throughout: every frame
  for (let f = 0; f < clip.frames; f++) clip.hips[f * 3 + 1] += lift;
  // ground speed on Spec, measured by vrmxa-core's checker (the treadmill of the planted feet), for the move clips
  const first = core.checkClip(core.readVrma(write()), { details, rig: spec });
  if (process.env.DEBUG) console.log(c.name, lift, first.numbers.lowestSole, first.numbers.treadmill?.speed, first.problems.map((p) => p.id).join(' '));
  const speed = c.move ? +(first.numbers.treadmill?.speed ?? stanceSpeed(core.readVrma(write()))).toFixed(2) : null;
  if (c.move && !speed) throw new Error(`${c.name}: no ground speed measured`);
  const bytes = write();
  const limbs = limbError(core.readVrma(bytes), dirs);
  if (limbs > 1) throw new Error(`${c.name}: a limb on Spec points ${limbs.toFixed(2)}° off mesh2motion's`);
  const sha = await core.sha256(bytes);
  shaOf.set(c.name, sha);
  const checked = core.checkClip(core.readVrma(bytes), { details: { ...details, speed }, rig: spec });
  const file = `animations/clips/${c.name}.vrma`;
  out.set(file, bytes);
  records.push({ sha256: sha, file, name: c.name, duration: +clip.duration.toFixed(4), loops, ...(speed ? { speed } : {}), rootMotion: 'inPlace', tracks: ['humanoid'], licence: 'CC0-1.0', source: `mesh2motion "${info.name}" (${srcRel}${quaternius ? ', from Quaternius\' Universal Animation Library' : ''}), CC0 1.0, retargeted onto the VRM humanoid by content/starter/tools/make-animations.mjs` });
  provenance.push({ file, name: c.name, licence: 'CC0-1.0', from: { project: 'mesh2motion (github.com/Mesh2Motion/mesh2motion-app)', file: srcRel, sha256: srcSha, clip: info.name, blend: info.source, tags: info.tags, licence: 'CC0-1.0 (LICENSE-CC0.MD: "All 3d models, blend files, rigs, animations")', ...(quaternius ? { origin: 'Quaternius, Universal Animation Library (CC0 1.0)' } : {}) }, lift, limbErrorDegrees: +limbs.toFixed(3), check: { problems: checked.problems.map((p) => ({ id: p.id, severity: p.severity, title: p.title })), ...(checked.numbers.treadmill ? { treadmill: checked.numbers.treadmill } : {}) } });
}
const slotEntry = (e) => ({ clip: shaOf.get(e.clip) ?? (() => { throw new Error(`no clip ${e.clip}`); })(), weight: e.weight ?? 1, blendIn: e.blendIn ?? 0.2, ...(e.mask ? { mask: e.mask } : {}) });
const sets = SETS.map((s) => ({ id: s.id, name: s.name, default: !!s.default, priority: s.priority ?? 0, requires: s.requires ?? [], slots: Object.fromEntries(Object.entries(s.slots).map(([slot, list]) => [slot, list.map(slotEntry)])) }));
const doc = { format: 'vrmxa-animations', version: 1, clips: records, sets };
const json = (v) => `${JSON.stringify(v, null, 1)}\n`;
out.set('animations.json', json(doc));
out.set('animations/provenance.json', json({ about: 'Where each starter clip comes from (content/starter/tools/make-animations.mjs). Every clip is CC0 1.0.', source: { project: 'mesh2motion', url: 'https://github.com/Mesh2Motion/mesh2motion-app', licence: 'Art (models, rigs, animations) CC0 1.0; code MIT (not used)', snapshot: `static/assets/manifest.json generated ${manifest.generated}`, fps: manifest.rigs.human.fps, skeleton: { file: 'static/assets/human/skeleton.glb', sha256: sha256(fs.readFileSync(path.join(HUMAN, 'skeleton.glb'))) } }, clips: provenance }));

// ---------------------------------------------------------------- write or compare
const differ = [];
for (const [rel, data] of out) {
  const file = path.join(root, rel), buf = Buffer.from(data);
  if (fs.existsSync(file) && Buffer.compare(fs.readFileSync(file), buf) === 0) continue;
  differ.push(rel);
  if (check) continue;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}
const stale = fs.existsSync(path.join(root, 'animations/clips')) ? fs.readdirSync(path.join(root, 'animations/clips')).filter((f) => f.endsWith('.vrma') && !out.has(`animations/clips/${f}`)) : [];
for (const f of stale) { if (!check) fs.rmSync(path.join(root, 'animations/clips', f)); differ.push(`animations/clips/${f} (stale)`); }
const flagged = provenance.filter((p) => p.check.problems.some((x) => x.severity === 'fix'));
console.log(`${CLIPS.length} clips, ${sets.length} sets, ${Object.values(sets[0].slots).length} default slots; ${differ.length ? `${check ? 'differ' : 'wrote'}: ${differ.join(', ')}` : 'up to date'}`);
if (flagged.length) console.log(`checker notes (fix): ${flagged.map((p) => `${p.name}: ${p.check.problems.filter((x) => x.severity === 'fix').map((x) => x.id).join('+')}`).join('; ')}`);
process.exit(check && differ.length ? 1 : 0);
