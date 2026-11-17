// The hand-rolled option: "stateless" GPU particles. Nothing is integrated frame by frame. Every
// particle is a pure function of (emitter seed, particle index, time): its birth time comes from
// its slot, its random properties from an integer hash, and its position from closed-form
// ballistics. The vertex shader evaluates it, so a step is one uniform write, a scrub is setting
// the time, and frame N always renders the same pixels on the same GPU, whatever was shown before.
//
// An emitter is a plain JSON spec (data first). The JS twin `cpuRows` evaluates the same maths on
// the CPU for tests and picking. Random numbers are bit-identical CPU/GPU (integer PCG hash);
// positions are float32 on the GPU and float64 on the CPU, so they agree to ~1e-6, not bitwise.
import * as THREE from 'three';
import { hashRows } from '../core/state.js';
import { withPortableMath } from '../core/detmath.js';
import { TILES, ATLAS_COLS, ATLAS_ROWS, atlasTexture } from '../core/atlas.js';

export const id = 'stateless';
export const label = 'hand-rolled stateless (GLSL)';

// ---- spec ---------------------------------------------------------------------------------
export const defaults = {
  mode: 'rate',            // 'rate' (looping) | 'burst'
  rate: 30,                // particles per second (rate mode)
  count: 30,               // particles (burst mode)
  start: 0,                // burst time / rate start time, seconds
  life: [1, 1],
  speed: [1, 2],
  size: [0.1, 0.1],
  shape: { type: 'sphere', radius: 0.1 }, // sphere | box {size:[x,y,z]} | rect {size:[w,h]} facing +dir
  dir: [0, 1, 0],          // main direction (cone / rect normal)
  spread: 180,             // cone half-angle in degrees; 180 = all directions
  gravity: [0, 0, 0],
  drag: 0,                 // linear drag k: v(t) = v0 e^{-kt}
  spin: [0, 0],            // radians per second
  angle: [0, 0],           // start rotation
  sizeCurve: [1, 1, 1, 1], // cubic Bezier over normalised age (4 control values)
  alphaCurve: [1, 1, 1, 0],// cubic Bezier over normalised age
  colorA: [1, 1, 1],       // start colour random between A and B
  colorB: [1, 1, 1],
  colorEnd: null,          // optional end colour (linear blend over life)
  tile: TILES.dot,
  render: 'billboard',     // 'billboard' | 'stretched'
  stretch: 0.05,           // stretched: seconds of velocity per length
  blending: 'additive',
  seed: 1,
};
export const spec = (s) => ({ ...defaults, ...s, shape: { ...defaults.shape, ...(s.shape || {}) } });
const maxParticles = (s) => (s.mode === 'burst' ? s.count : Math.ceil(s.rate * s.life[1]) + 1);

// ---- the maths (JS twin) -------------------------------------------------------------------
function pcg(v) {
  v = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0;
  const w = Math.imul(((v >>> ((v >>> 28) + 4)) ^ v) >>> 0, 277803737) >>> 0;
  return ((w >>> 22) ^ w) >>> 0;
}
const rnd = (seed, id, k) => Math.fround(pcg((seed ^ pcg(id ^ pcg(k))) >>> 0)) / 4294967296;
const bez = (c, x) => { const u = 1 - x; return u * u * u * c[0] + 3 * u * u * x * c[1] + 3 * u * x * x * c[2] + x * x * x * c[3]; };
const lerp = (a, b, t) => a + (b - a) * t;

/** Particle `id` of slot `i` at time t, and its birth time (rate mode recycles slots). */
function slot(s, i, t) {
  if (s.mode === 'burst') return { pid: i, birth: s.start };
  const M = maxParticles(s);
  const g = Math.floor(((t - s.start) * s.rate - i) / M);
  const pid = i + g * M;
  return { pid, birth: s.start + pid / s.rate };
}

export function evalParticle(s, i, t) {
  const { pid, birth } = slot(s, i, t);
  const age = t - birth;
  if (pid < 0 || age < 0) return null;
  const R = (k) => rnd(s.seed, pid, k);
  const life = lerp(s.life[0], s.life[1], R(0));
  if (age >= life) return null;
  // start position in the emitter shape
  let px = 0, py = 0, pz = 0;
  if (s.shape.type === 'sphere') {
    const z = 2 * R(1) - 1, ph = 6.283185307 * R(2), rr = Math.sqrt(1 - z * z), rad = s.shape.radius * Math.cbrt(R(3));
    px = rr * Math.cos(ph) * rad; py = rr * Math.sin(ph) * rad; pz = z * rad;
  } else if (s.shape.type === 'box') {
    px = (R(1) - 0.5) * s.shape.size[0]; py = (R(2) - 0.5) * s.shape.size[1]; pz = (R(3) - 0.5) * s.shape.size[2];
  } else if (s.shape.type === 'rect') { // plane through the origin, normal = dir (assumed +-X here)
    py = (R(2) - 0.5) * s.shape.size[1]; pz = (R(3) - 0.5) * s.shape.size[0];
  }
  // direction inside the cone around dir
  const cosMax = Math.cos((s.spread * Math.PI) / 180);
  const cz = lerp(1, cosMax, R(4)), cph = 6.283185307 * R(5), cr = Math.sqrt(Math.max(0, 1 - cz * cz));
  const [dx, dy, dz] = basisDir(s.dir, cr * Math.cos(cph), cr * Math.sin(cph), cz);
  const sp = lerp(s.speed[0], s.speed[1], R(6));
  const k = s.drag, f = k > 0 ? (1 - Math.exp(-k * age)) / k : age, fv = k > 0 ? Math.exp(-k * age) : 1;
  const x = px + dx * sp * f + 0.5 * s.gravity[0] * age * age;
  const y = py + dy * sp * f + 0.5 * s.gravity[1] * age * age;
  const z = pz + dz * sp * f + 0.5 * s.gravity[2] * age * age;
  const vx = dx * sp * fv + s.gravity[0] * age, vy = dy * sp * fv + s.gravity[1] * age, vz = dz * sp * fv + s.gravity[2] * age;
  const n = age / life;
  const size = lerp(s.size[0], s.size[1], R(7)) * bez(s.sizeCurve, n);
  const alpha = bez(s.alphaCurve, n);
  const rot = lerp(s.angle[0], s.angle[1], R(8)) + lerp(s.spin[0], s.spin[1], R(9)) * age;
  const ct = R(10);
  let col = [0, 1, 2].map((j) => lerp(s.colorA[j], s.colorB[j], ct));
  if (s.colorEnd) col = col.map((c, j) => lerp(c, s.colorEnd[j], n));
  return [x, y, z, vx, vy, vz, age, life, size, size, col[0], col[1], col[2], alpha, rot, s.tile];
}
function basisDir(d, lx, ly, lz) { // rotate local (lx,ly,lz) with +Z mapped onto d
  const [ax, ay, az] = normalize(d);
  const up = Math.abs(az) < 0.999 ? [0, 0, 1] : [1, 0, 0];
  const t = normalize(cross(up, [ax, ay, az])), b = cross([ax, ay, az], t);
  return [t[0] * lx + b[0] * ly + ax * lz, t[1] * lx + b[1] * ly + ay * lz, t[2] * lx + b[2] * ly + az * lz];
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };

export function cpuRows(s, t, offset = [0, 0, 0]) {
  const rows = [];
  for (let i = 0, M = maxParticles(s); i < M; i++) {
    const r = evalParticle(s, i, t);
    if (r) { r[0] += offset[0]; r[1] += offset[1]; r[2] += offset[2]; rows.push(r); }
  }
  return rows;
}

// ---- GPU ------------------------------------------------------------------------------------
const vertexShader = /* glsl */ `
uniform float uTime, uSeed, uStart, uRate, uM, uBurst, uSpread, uDrag, uStretch, uStretched;
uniform vec2 uLife, uSpeed, uSize, uSpin, uAngle;
uniform vec3 uGravity, uDir, uColorA, uColorB, uColorEnd, uShapeSize;
uniform float uHasEnd, uShapeType, uShapeRadius, uTile;
uniform vec4 uSizeCurve, uAlphaCurve;
uniform vec2 uTiles;
attribute float aSlot;
varying vec2 vUv; varying vec4 vColor;

uint pcg(uint v) { v = v * 747796405u + 2891336453u; uint w = ((v >> ((v >> 28u) + 4u)) ^ v) * 277803737u; return (w >> 22u) ^ w; }
float rnd(uint seed, uint id, uint k) { return float(pcg(seed ^ pcg(id ^ pcg(k)))) / 4294967296.0; }
float bez(vec4 c, float x) { float u = 1.0 - x; return u*u*u*c.x + 3.0*u*u*x*c.y + 3.0*u*x*x*c.z + x*x*x*c.w; }
vec3 basisDir(vec3 d, vec3 l) {
  vec3 a = normalize(d); vec3 up = abs(a.z) < 0.999 ? vec3(0,0,1) : vec3(1,0,0);
  vec3 t = normalize(cross(up, a)); vec3 b = cross(a, t); return t*l.x + b*l.y + a*l.z;
}
void main() {
  float i = aSlot; float pidf; float birth;
  if (uBurst > 0.5) { pidf = i; birth = uStart; }
  else { float g = floor(((uTime - uStart) * uRate - i) / uM); pidf = i + g * uM; birth = uStart + pidf / uRate; }
  float age = uTime - birth;
  uint pid = uint(int(pidf)); uint seed = uint(uSeed);
  float life = mix(uLife.x, uLife.y, rnd(seed, pid, 0u));
  if (pidf < 0.0 || age < 0.0 || age >= life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vColor = vec4(0.0); return; }
  vec3 p = vec3(0.0);
  if (uShapeType < 0.5) {
    float z = 2.0*rnd(seed,pid,1u)-1.0, ph = 6.283185307*rnd(seed,pid,2u), rr = sqrt(1.0-z*z), rad = uShapeRadius*pow(rnd(seed,pid,3u), 1.0/3.0);
    p = vec3(rr*cos(ph), rr*sin(ph), z) * rad;
  } else if (uShapeType < 1.5) {
    p = (vec3(rnd(seed,pid,1u), rnd(seed,pid,2u), rnd(seed,pid,3u)) - 0.5) * uShapeSize;
  } else {
    p = vec3(0.0, (rnd(seed,pid,2u)-0.5)*uShapeSize.y, (rnd(seed,pid,3u)-0.5)*uShapeSize.x);
  }
  float cosMax = cos(radians(uSpread));
  float cz = mix(1.0, cosMax, rnd(seed,pid,4u)), cph = 6.283185307*rnd(seed,pid,5u), cr = sqrt(max(0.0, 1.0-cz*cz));
  vec3 d = basisDir(uDir, vec3(cr*cos(cph), cr*sin(cph), cz));
  float sp = mix(uSpeed.x, uSpeed.y, rnd(seed,pid,6u));
  float f = uDrag > 0.0 ? (1.0 - exp(-uDrag*age))/uDrag : age; float fv = uDrag > 0.0 ? exp(-uDrag*age) : 1.0;
  vec3 pos = p + d*sp*f + 0.5*uGravity*age*age;
  vec3 vel = d*sp*fv + uGravity*age;
  float n = age / life;
  float size = mix(uSize.x, uSize.y, rnd(seed,pid,7u)) * bez(uSizeCurve, n);
  float rot = mix(uAngle.x, uAngle.y, rnd(seed,pid,8u)) + mix(uSpin.x, uSpin.y, rnd(seed,pid,9u)) * age;
  vec3 col = mix(uColorA, uColorB, rnd(seed,pid,10u)); if (uHasEnd > 0.5) col = mix(col, uColorEnd, n);
  vColor = vec4(col, bez(uAlphaCurve, n));
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vec2 q = position.xy;
  if (uStretched > 0.5) {
    // stretched billboard: x along the screen-projected velocity, head at q.x = -0.5
    vec3 vv = (modelViewMatrix * vec4(vel, 0.0)).xyz; vec2 dir2 = normalize(vv.xy + 1e-6);
    float len = size + length(vv.xy) * uStretch;
    vec2 side = vec2(dir2.y, -dir2.x); // keeps the quad's winding (the -dir2 axis mirrors it otherwise, and it gets culled)
    mv.xy += -dir2 * (q.x + 0.5) * len + side * q.y * size;
  } else {
    float c = cos(rot), s = sin(rot); mv.xy += mat2(c, s, -s, c) * q * size;
  }
  gl_Position = projectionMatrix * mv;
  float col_ = mod(uTile, uTiles.x), row = uTiles.y - floor(uTile / uTiles.x) - 1.0;
  vUv = (uv + vec2(col_, row)) / uTiles;
}`;
const fragmentShader = /* glsl */ `
uniform sampler2D uMap; varying vec2 vUv; varying vec4 vColor;
void main() {
  vec4 t = texture2D(uMap, vUv);
  gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a);
  if (gl_FragColor.a < 0.004) discard;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

let sharedAtlas = null;
const shapeIndex = { sphere: 0, box: 1, rect: 2 };
export function createMesh(s) {
  sharedAtlas ??= atlasTexture(THREE);
  const M = maxParticles(s);
  const quad = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index; g.setAttribute('position', quad.getAttribute('position')); g.setAttribute('uv', quad.getAttribute('uv'));
  g.setAttribute('aSlot', new THREE.InstancedBufferAttribute(Float32Array.from({ length: M }, (_, i) => i), 1));
  g.instanceCount = M;
  const v2 = (a) => new THREE.Vector2(a[0], a[1]), v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]), v4 = (a) => new THREE.Vector4(...a);
  const u = {
    uTime: { value: 0 }, uSeed: { value: s.seed >>> 0 }, uStart: { value: s.start }, uRate: { value: s.rate }, uM: { value: M },
    uBurst: { value: s.mode === 'burst' ? 1 : 0 }, uSpread: { value: s.spread }, uDrag: { value: s.drag },
    uStretch: { value: s.stretch }, uStretched: { value: s.render === 'stretched' ? 1 : 0 },
    uLife: { value: v2(s.life) }, uSpeed: { value: v2(s.speed) }, uSize: { value: v2(s.size) }, uSpin: { value: v2(s.spin) }, uAngle: { value: v2(s.angle) },
    uGravity: { value: v3(s.gravity) }, uDir: { value: v3(s.dir) },
    uColorA: { value: new THREE.Color(...s.colorA) }, uColorB: { value: new THREE.Color(...s.colorB) },
    uColorEnd: { value: new THREE.Color(...(s.colorEnd || [1, 1, 1])) }, uHasEnd: { value: s.colorEnd ? 1 : 0 },
    uShapeType: { value: shapeIndex[s.shape.type] }, uShapeRadius: { value: s.shape.radius ?? 0 }, uShapeSize: { value: v3([...(s.shape.size || [0, 0]), 0, 0].slice(0, 3)) },
    uTile: { value: s.tile }, uTiles: { value: new THREE.Vector2(ATLAS_COLS, ATLAS_ROWS) },
    uSizeCurve: { value: v4(s.sizeCurve) }, uAlphaCurve: { value: v4(s.alphaCurve) }, uMap: { value: sharedAtlas },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, vertexShader, fragmentShader, transparent: true, depthWrite: false,
    blending: s.blending === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; // positions are made in the shader
  mesh.userData.spec = s;
  return mesh;
}

// ---- world (same shape as the other adapters) ------------------------------------------------
export function createWorld({ seed = 1, scene = null, math = 'native' } = {}) {
  scene ??= new THREE.Scene();
  const world = {
    lib: id, scene, seed, frame: 0, emitters: [], // { spec, mesh, group }
    time: 0,
    add(specs, parent = scene, offset = [0, 0, 0]) {
      for (const raw of [specs].flat()) {
        const s = spec({ ...raw, seed: (raw.seed ?? 1) ^ Math.imul(seed, 0x9e3779b1) ^ world.emitters.length });
        const mesh = createMesh(s); mesh.position.set(...offset); parent.add(mesh);
        world.emitters.push({ spec: s, mesh, offset });
      }
    },
    setTime(t) { world.time = t; for (const e of world.emitters) e.mesh.material.uniforms.uTime.value = t; },
    step(dt = 1 / 60) { world.frame++; world.setTime(world.frame * dt); },
    seek(frame, dt = 1 / 60) { world.frame = frame; world.setTime(frame * dt); },
    rows() {
      const f = () => { const r = []; for (const e of world.emitters) r.push(...cpuRows(e.spec, world.time, e.offset)); return r; };
      return math === 'portable' ? withPortableMath(f) : f();
    },
    count() { return world.rows().length; },
    hash() { return hashRows(world.rows()); },
    toJSON() { return world.emitters.map((e) => e.spec); },
    dispose() { for (const e of world.emitters) { e.mesh.removeFromParent(); e.mesh.geometry.dispose(); e.mesh.material.dispose(); } world.emitters.length = 0; },
  };
  return world;
}

export function benchSpec(i, n, perEmitter) {
  const k = Math.max(1, Math.round(perEmitter / 60)) * 60;
  return {
    mode: 'rate', rate: k, life: [0.8, 1.2], speed: [1, 3], size: [0.05, 0.15], shape: { type: 'sphere', radius: 0.3 },
    gravity: [0, -2, 0], spin: [-2, 2], angle: [0, 6.28], sizeCurve: [0.2, 1, 1, 0], alphaCurve: [1, 0.67, 0.33, 0],
    colorA: [1, 0.6, 0.8], colorB: [0.6, 0.9, 1], colorEnd: [1, 0.7, 0.9], tile: TILES.star4, seed: 1000 + i,
  };
}
export function benchOffset(i, n) { const cols = Math.ceil(Math.sqrt(n)); return [(i % cols) * 1.5 - cols * 0.75, 1 + Math.floor(i / cols) * 1.5, 0]; }

export const effects = {
  impact: () => [
    { mode: 'burst', count: 1, life: [0.24, 0.24], speed: [0, 0], size: [1.0, 1.0], sizeCurve: [0.15, 0.6, 0.9, 1.0], alphaCurve: [0.5, 1.2, 0.6, 0], colorA: [1, 1, 1], colorEnd: [1, 0.8, 0.4], tile: TILES.ring, seed: 11 },
    { mode: 'burst', count: 1, life: [0.16, 0.16], speed: [0, 0], size: [0.6, 0.6], angle: [0, 0.8], sizeCurve: [0.6, 1.3, 1.1, 0], alphaCurve: [1, 1, 1, 1], colorA: [1, 1, 0.85], tile: TILES.flash, seed: 12 },
    { mode: 'burst', count: 40, life: [0.22, 0.42], speed: [5, 11], size: [0.035, 0.06], shape: { type: 'sphere', radius: 0.05 }, drag: 4, gravity: [0, -9, 0],
      alphaCurve: [1, 1, 0.9, 0], colorA: [1, 1, 1], colorEnd: [1, 0.45, 0.1], tile: TILES.spark, render: 'stretched', stretch: 0.025, seed: 13 },
  ],
  sparkles: () => [
    { mode: 'rate', rate: 26, life: [0.5, 0.9], speed: [0.05, 0.2], size: [0.12, 0.26], shape: { type: 'sphere', radius: 0.55 }, spin: [-1.2, 1.2],
      sizeCurve: [0, 1.6, 1.0, 0], alphaCurve: [1, 1, 1, 1], colorA: [1, 0.75, 0.95], colorB: [0.75, 0.95, 1], tile: TILES.star4, seed: 21, start: -2 },
    { mode: 'rate', rate: 60, life: [0.8, 1.4], speed: [0.1, 0.35], size: [0.025, 0.05], shape: { type: 'sphere', radius: 0.7 }, gravity: [0, 0.25, 0],
      alphaCurve: [0, 1.4, 1.2, 0], colorA: [1, 0.95, 0.6], colorB: [1, 1, 1], tile: TILES.diamond, seed: 22, start: -2 },
  ],
  speedlines: () => [
    { mode: 'rate', rate: 90, life: [0.18, 0.3], speed: [14, 22], size: [0.008, 0.02], shape: { type: 'rect', size: [2.2, 2.0] }, dir: [-1, 0, 0], spread: 0,
      alphaCurve: [0, 1.3, 1.3, 0], colorA: [1, 1, 1], tile: TILES.line, render: 'stretched', stretch: 0.07, blending: 'normal', seed: 31, start: -2 },
  ],
  sweatdrop: () => [
    { mode: 'rate', rate: 0.5, life: [1.5, 1.5], speed: [0.06, 0.06], dir: [0, -1, 0], spread: 0, size: [0.22, 0.22], shape: { type: 'sphere', radius: 0 },
      sizeCurve: [0, 1.6, 1.0, 1.0], alphaCurve: [1, 1, 1.2, 0], colorA: [1, 1, 1], tile: TILES.drop, blending: 'normal', seed: 41, start: 0 },
  ],
};
