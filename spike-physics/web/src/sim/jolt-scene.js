// A Jolt version of the spike's "boxes only" scene (same ground trimesh, same fixed boxes, same
// 300 seeded dynamic boxes), for a like-for-like step-time comparison with Rapier. Single-threaded
// build: the multithreaded one needs SharedArrayBuffer (cross-origin isolation).
import { groundMesh, fixedBoxes, dynamicBoxes } from './level.js';
import { DT } from './rapier-scene.js';

const joltPromises = {};

async function loadJolt(threads = 0) {
  const key = threads ? 'mt' : 'st';
  if (!joltPromises[key]) {
    joltPromises[key] = (async () => {
      const mod = threads ? await import('jolt-physics/wasm-compat-multithread') : await import('jolt-physics');
      const t0 = performance.now();
      const Jolt = await mod.default();
      return { Jolt, initMs: performance.now() - t0 };
    })();
  }
  return joltPromises[key];
}

/** threads = 0: the single-threaded build. threads > 0: the multithreaded build with that many workers (needs SharedArrayBuffer). */
export async function runJoltTiming(steps = 600, threads = 0) {
  const { Jolt, initMs } = await loadJolt(threads);
  // Same protocol as Rapier's timing: a throwaway warm-up world, then a fresh one timed from step 0.
  const warm = buildWorld(Jolt, threads);
  for (let i = 0; i < 120; i++) warm.jolt.Step(DT, 1);
  Jolt.destroy(warm.jolt);
  const { jolt, system, boxes } = buildWorld(Jolt, threads);
  const samples = [];
  const awake = {};
  for (let i = 0; i < steps; i++) {
    const t0 = performance.now();
    jolt.Step(DT, 1);
    samples.push(performance.now() - t0);
    if (i % 60 === 0) awake[i] = system.GetNumActiveBodies(Jolt.EBodyType_RigidBody);
  }
  let minY = Infinity, maxY = -Infinity;
  for (const b of boxes) { const y = b.GetPosition().GetY(); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  Jolt.destroy(jolt);

  const allAwake60 = +(samples.slice(0, 60).reduce((a, b) => a + b, 0) / 60).toFixed(3);
  const s = samples.sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return {
    build: threads ? `jolt-physics 1.1.1 wasm-compat-multithread (${threads} workers)` : 'jolt-physics 1.1.1 wasm-compat (single-threaded)',
    initMs: +initMs.toFixed(1),
    awake,
    allAwake60,
    finalBoxY: { min: +minY.toFixed(2), max: +maxY.toFixed(2) },
    boxesOnly: { mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(3), p50: +q(0.5).toFixed(3), p95: +q(0.95).toFixed(3), max: +s[s.length - 1].toFixed(3) },
  };
}

function buildWorld(Jolt, threads = 0) {
  const L_STATIC = 0, L_MOVING = 1;

  const objectFilter = new Jolt.ObjectLayerPairFilterTable(2);
  objectFilter.EnableCollision(L_STATIC, L_MOVING);
  objectFilter.EnableCollision(L_MOVING, L_MOVING);
  const bpStatic = new Jolt.BroadPhaseLayer(0), bpMoving = new Jolt.BroadPhaseLayer(1);
  const bpInterface = new Jolt.BroadPhaseLayerInterfaceTable(2, 2);
  bpInterface.MapObjectToBroadPhaseLayer(L_STATIC, bpStatic);
  bpInterface.MapObjectToBroadPhaseLayer(L_MOVING, bpMoving);
  const settings = new Jolt.JoltSettings();
  settings.mObjectLayerPairFilter = objectFilter;
  settings.mBroadPhaseLayerInterface = bpInterface;
  if (threads) settings.mMaxWorkerThreads = threads;
  settings.mObjectVsBroadPhaseLayerFilter = new Jolt.ObjectVsBroadPhaseLayerFilterTable(bpInterface, 2, objectFilter, 2);
  const jolt = new Jolt.JoltInterface(settings);
  Jolt.destroy(settings);
  const system = jolt.GetPhysicsSystem();
  system.SetGravity(new Jolt.Vec3(0, -9.81, 0));
  const bi = system.GetBodyInterface();

  const add = (shape, pos, rot, motion, layer) => {
    const cs = new Jolt.BodyCreationSettings(shape, new Jolt.RVec3(pos.x, pos.y, pos.z), new Jolt.Quat(rot.x, rot.y, rot.z, rot.w), motion, layer);
    const body = bi.CreateBody(cs);
    Jolt.destroy(cs);
    bi.AddBody(body.GetID(), motion === Jolt.EMotionType_Static ? Jolt.EActivation_DontActivate : Jolt.EActivation_Activate);
    return body;
  };

  // Ground trimesh.
  const g = groundMesh();
  const tris = new Jolt.TriangleList();
  tris.reserve(g.indices.length / 3);
  const v = (i) => new Jolt.Vec3(g.vertices[i * 3], g.vertices[i * 3 + 1], g.vertices[i * 3 + 2]);
  for (let t = 0; t < g.indices.length; t += 3) {
    tris.push_back(new Jolt.Triangle(v(g.indices[t]), v(g.indices[t + 1]), v(g.indices[t + 2])));
  }
  const meshSettings = new Jolt.MeshShapeSettings(tris, new Jolt.PhysicsMaterialList());
  const meshShape = meshSettings.Create().Get();
  add(meshShape, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, Jolt.EMotionType_Static, L_STATIC);

  for (const b of fixedBoxes()) {
    add(new Jolt.BoxShape(new Jolt.Vec3(b.half.x, b.half.y, b.half.z), 0.02, null), b.pos, b.rot, Jolt.EMotionType_Static, L_STATIC);
  }
  const boxes = [];
  for (const b of dynamicBoxes(300)) {
    boxes.push(add(new Jolt.BoxShape(new Jolt.Vec3(b.half.x, b.half.y, b.half.z), 0.02, null), b.pos, { x: 0, y: 0, z: 0, w: 1 }, Jolt.EMotionType_Dynamic, L_MOVING));
  }
  system.OptimizeBroadPhase();
  return { jolt, system, boxes };
}
