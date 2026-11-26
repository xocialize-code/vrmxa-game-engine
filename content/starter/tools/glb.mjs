// A small GLB writer for the starter items (VRMXI §5): @vrmxg/model's writeGLBTree, plus cylinders and meshes brought
// in from another GLB with their texture (mesh2motion's CC0 props). Deterministic: the same input gives the same bytes.
//
//   writeItemGLB({ name, generator, roots: ['Chest'], nodes: [
//     { name: 'Chest', children: ['Body', 'Lid', 'Reach'] },
//     { name: 'Body', t: [0, 0.2, 0], box: { size: [0.8, 0.4, 0.5], color: '#7a5236' }, collider: box3([0.8, 0.4, 0.5]) },
//     { name: 'Coin', cylinder: { radius: 0.03, height: 0.006, color: '#e2b84a', metalness: 1 } },
//     { name: 'Blade', mesh: readPrimitive(glbBytes) },             // positions, normals, uvs, indices and a PNG
//     { name: 'Reach', t: [0, 0.8, 0.8], trigger: box3([1.2, 1.6, 1.2]) } ] })
//
// Node names are unique (VRMXI §5). `t` translation, `r` rotation quaternion, `s` scale. Colliders and sensors take any
// KHR_implicit_shapes shape; `motion` makes the node a KHR_physics_rigid_bodies body.

/** @param {string} hex '#rrggbb' → linear [r, g, b] */
function colour(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)].map((v) => Math.round(v * 1e5) / 1e5);
}

function box([w, h, d]) {
  const x = w / 2, y = h / 2, z = d / 2;
  const faces = [
    [[1, 0, 0], [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]]], [[-1, 0, 0], [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]]],
    [[0, 1, 0], [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]]], [[0, -1, 0], [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]]],
    [[0, 0, 1], [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]]], [[0, 0, -1], [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]]],
  ];
  const pos = [], nor = [], idx = [];
  for (const [n, quad] of faces) { const b = pos.length / 3; for (const p of quad) { pos.push(...p); nor.push(...n); } idx.push(b, b + 1, b + 2, b, b + 2, b + 3); }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint16Array(idx), min: [-x, -y, -z], max: [x, y, z] };
}

/** A cylinder about Y, centred on the origin, with flat caps. Its points come from a fixed table (no Math.sin). */
function cylinder({ radius, height, segments = 16 }) {
  const ring = RING[segments];
  if (!ring) throw new Error(`cylinder: ${segments} segments (one of ${Object.keys(RING).join(', ')})`);
  const h = height / 2, pos = [], nor = [], idx = [];
  for (let i = 0; i <= segments; i++) { const [c, s] = ring[i % segments]; pos.push(c * radius, -h, s * radius, c * radius, h, s * radius); nor.push(c, 0, s, c, 0, s); }
  for (let i = 0; i < segments; i++) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  for (const [y, ny] of [[h, 1], [-h, -1]]) {
    const centre = pos.length / 3; pos.push(0, y, 0); nor.push(0, ny, 0);
    for (let i = 0; i < segments; i++) { const [c, s] = ring[i]; pos.push(c * radius, y, s * radius); nor.push(0, ny, 0); }
    for (let i = 0; i < segments; i++) { const a = centre + 1 + i, b = centre + 1 + ((i + 1) % segments); if (ny > 0) idx.push(centre, b, a); else idx.push(centre, a, b); }
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint16Array(idx), min: [-radius, -h, -radius], max: [radius, h, radius] };
}
// cos and sin of 2πk/n, to 7 places (precomputed: generated geometry stays byte-identical on every machine)
const RING = { 8: [], 12: [], 16: [] };
{
  const r7 = (v) => Math.round(v * 1e7) / 1e7;
  const C = { 8: [1, 0.7071068, 0, -0.7071068, -1, -0.7071068, 0, 0.7071068], 12: [1, 0.8660254, 0.5, 0, -0.5, -0.8660254, -1, -0.8660254, -0.5, 0, 0.5, 0.8660254], 16: [1, 0.9238795, 0.7071068, 0.3826834, 0, -0.3826834, -0.7071068, -0.9238795, -1, -0.9238795, -0.7071068, -0.3826834, 0, 0.3826834, 0.7071068, 0.9238795] };
  for (const n of [8, 12, 16]) for (let k = 0; k < n; k++) RING[n].push([C[n][k], r7(C[n][(k + 3 * n / 4) % n])]);
}

/**
 * The first mesh primitive of a GLB, with its base colour texture: { pos, nor, uv, idx, image, mime, roughness,
 * metalness, min, max }. For plain GLBs (no Draco or meshopt compression, no sparse accessors).
 * @param {Uint8Array} bytes
 */
export function readPrimitive(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jl = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jl)));
  if (json.extensionsRequired?.length) throw new Error(`readPrimitive: needs ${json.extensionsRequired.join(', ')}`);
  const binAt = 20 + jl + 8;
  const view = (i) => { const v = json.bufferViews[i]; return bytes.subarray(binAt + (v.byteOffset ?? 0), binAt + (v.byteOffset ?? 0) + v.byteLength); };
  const acc = (i) => {
    const a = json.accessors[i], v = json.bufferViews[a.bufferView], n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const T = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array }[a.componentType];
    const raw = view(a.bufferView).subarray(a.byteOffset ?? 0), stride = v.byteStride ?? n * T.BYTES_PER_ELEMENT;
    const out = new T(a.count * n), r = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    const get = { 5126: (o) => r.getFloat32(o, true), 5123: (o) => r.getUint16(o, true), 5125: (o) => r.getUint32(o, true), 5121: (o) => r.getUint8(o) }[a.componentType];
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = get(k * stride + c * T.BYTES_PER_ELEMENT);
    return { data: out, min: a.min, max: a.max };
  };
  const prim = json.meshes[0].primitives[0];
  const P = acc(prim.attributes.POSITION);
  const mat = json.materials?.[prim.material ?? -1]?.pbrMetallicRoughness ?? {};
  const tex = mat.baseColorTexture ? json.textures[mat.baseColorTexture.index] : null;
  const img = tex ? json.images[tex.source] : null;
  const idx = acc(prim.indices).data;
  return {
    pos: P.data, nor: acc(prim.attributes.NORMAL).data, uv: prim.attributes.TEXCOORD_0 != null ? acc(prim.attributes.TEXCOORD_0).data : null,
    idx: idx instanceof Uint32Array && P.data.length / 3 < 65536 ? Uint16Array.from(idx) : idx,
    image: img ? new Uint8Array(view(img.bufferView)) : null, mime: img?.mimeType ?? null,
    roughness: mat.roughnessFactor ?? 1, metalness: mat.metallicFactor ?? 1, min: P.min, max: P.max,
  };
}

/**
 * The GLB. `animations` move nodes for an item's states (VRMXI §7.1): [{ name, channels: [{ node, path: 'rotation' |
 * 'translation', times: [s, …], values: [[x, y, z, w] | [x, y, z], …] }] }], LINEAR.
 * @param {{ name?: string, generator?: string, roots: string[], nodes: any[], animations?: any[] }} o
 */
export function writeItemGLB({ name = 'scene', generator = 'content/starter/tools/glb.mjs', roots, nodes: spec, animations: anims = [] }) {
  const index = new Map(spec.map((n, i) => [n.name, i]));
  if (index.size !== spec.length) throw new Error('node names must be unique');
  const chunks = [], bufferViews = [], accessors = [], meshes = [], materials = [], shapes = [], images = [], textures = [];
  let offset = 0;
  const view = (arr, target) => {
    const pad = (4 - (offset % 4)) % 4;
    if (pad) { chunks.push(new Uint8Array(pad)); offset += pad; }
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: arr.byteLength, ...(target ? { target } : {}) });
    chunks.push(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength)); offset += arr.byteLength;
    return bufferViews.length - 1;
  };
  const geoms = new Map(), mats = new Map(), imgs = new Map();
  const geometry = (key, g) => {
    if (!geoms.has(key)) {
      const a = { POSITION: accessors.push({ bufferView: view(g.pos, 34962), componentType: 5126, count: g.pos.length / 3, type: 'VEC3', min: g.min, max: g.max }) - 1, NORMAL: accessors.push({ bufferView: view(g.nor, 34962), componentType: 5126, count: g.nor.length / 3, type: 'VEC3' }) - 1 };
      if (g.uv) a.TEXCOORD_0 = accessors.push({ bufferView: view(g.uv, 34962), componentType: 5126, count: g.uv.length / 2, type: 'VEC2' }) - 1;
      const indices = accessors.push({ bufferView: view(g.idx, 34963), componentType: g.idx instanceof Uint32Array ? 5125 : 5123, count: g.idx.length, type: 'SCALAR' }) - 1;
      geoms.set(key, { attributes: a, indices });
    }
    return geoms.get(key);
  };
  const material = (m) => {
    let texture = null;
    if (m.image) {
      const key = m.imageKey;
      if (!imgs.has(key)) { images.push({ name: key, mimeType: m.mime, bufferView: view(m.image) }); textures.push({ source: images.length - 1, sampler: 0 }); imgs.set(key, textures.length - 1); }
      texture = imgs.get(key);
    }
    const color = m.color ?? '#ffffff', mk = `${color}|${m.roughness ?? 0.8}|${m.metalness ?? 0}|${texture}`;
    if (!mats.has(mk)) {
      materials.push({ name: texture != null ? m.imageKey : color, pbrMetallicRoughness: { baseColorFactor: [...colour(color), 1], roughnessFactor: m.roughness ?? 0.8, metallicFactor: m.metalness ?? 0, ...(texture != null ? { baseColorTexture: { index: texture } } : {}) } });
      mats.set(mk, materials.length - 1);
    }
    return mats.get(mk);
  };
  const nodes = spec.map((n) => {
    const out = { name: n.name };
    if (n.t) out.translation = n.t;
    if (n.r) out.rotation = n.r;
    if (n.s) out.scale = n.s;
    if (n.children?.length) out.children = n.children.map((c) => { if (!index.has(c)) throw new Error(`${n.name}: no child node ${c}`); return index.get(c); });
    let g = null, m = null;
    if (n.box) { g = geometry(`box:${n.box.size.join(',')}`, box(n.box.size)); m = n.box; }
    else if (n.cylinder) { g = geometry(`cyl:${n.cylinder.radius},${n.cylinder.height},${n.cylinder.segments ?? 16}`, cylinder(n.cylinder)); m = n.cylinder; }
    else if (n.mesh) { g = geometry(`mesh:${n.mesh.key}`, n.mesh); m = { image: n.mesh.image, mime: n.mesh.mime, imageKey: n.mesh.imageKey ?? n.mesh.key, roughness: n.mesh.roughness, metalness: n.mesh.metalness }; }
    if (g) { meshes.push({ name: n.name, primitives: [{ attributes: g.attributes, indices: g.indices, material: material(m) }] }); out.mesh = meshes.length - 1; }
    const khr = {};
    if (n.motion) khr.motion = n.motion;
    if (n.collider) khr.collider = { geometry: { shape: shapes.push(n.collider) - 1 } };
    if (n.trigger) khr.trigger = { geometry: { shape: shapes.push(n.trigger) - 1 } };
    if (Object.keys(khr).length) out.extensions = { KHR_physics_rigid_bodies: khr };
    return out;
  });
  const animations = anims.map((a) => {
    const samplers = [], channels = [];
    for (const c of a.channels) {
      if (!index.has(c.node)) throw new Error(`animation ${a.name}: no node ${c.node}`);
      const width = c.path === 'rotation' ? 4 : 3, type = width === 4 ? 'VEC4' : 'VEC3';
      const input = accessors.push({ bufferView: view(Float32Array.from(c.times)), componentType: 5126, count: c.times.length, type: 'SCALAR', min: [Math.min(...c.times)], max: [Math.max(...c.times)] }) - 1;
      const output = accessors.push({ bufferView: view(Float32Array.from(c.values.flat())), componentType: 5126, count: c.values.length, type }) - 1;
      channels.push({ sampler: samplers.push({ input, output, interpolation: 'LINEAR' }) - 1, target: { node: index.get(c.node), path: c.path } });
    }
    return { name: a.name, samplers, channels };
  });
  const bin = new Uint8Array(offset + ((4 - (offset % 4)) % 4));
  let o = 0; for (const c of chunks) { bin.set(c, o); o += c.byteLength; }
  const json = { asset: { version: '2.0', generator }, scene: 0, scenes: [{ name, nodes: roots.map((r) => index.get(r)) }], nodes };
  if (meshes.length || animations.length) Object.assign(json, { ...(meshes.length ? { meshes, materials } : {}), accessors, bufferViews, buffers: [{ byteLength: bin.byteLength }] });
  if (animations.length) json.animations = animations;
  if (textures.length) Object.assign(json, { images, textures, samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }] });
  if (shapes.length || spec.some((n) => n.motion)) { json.extensionsUsed = ['KHR_physics_rigid_bodies', 'KHR_implicit_shapes']; json.extensions = { KHR_implicit_shapes: { shapes } }; }
  let text = new TextEncoder().encode(JSON.stringify(json));
  const jpad = (4 - (text.byteLength % 4)) % 4;
  if (jpad) { const t = new Uint8Array(text.byteLength + jpad).fill(0x20); t.set(text); text = t; }
  const total = 12 + 8 + text.byteLength + (bin.byteLength ? 8 + bin.byteLength : 0);
  const glb = new Uint8Array(total), dv = new DataView(glb.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, text.byteLength, true); dv.setUint32(16, 0x4e4f534a, true); glb.set(text, 20);
  if (bin.byteLength) { const b = 20 + text.byteLength; dv.setUint32(b, bin.byteLength, true); dv.setUint32(b + 4, 0x004e4942, true); glb.set(bin, b + 8); }
  return glb;
}

export const box3 = (size) => ({ type: 'box', box: { size } });
export const cyl3 = (radius, height) => ({ type: 'cylinder', cylinder: { radiusTop: radius, radiusBottom: radius, height } });
export const sphere3 = (radius) => ({ type: 'sphere', sphere: { radius } });
