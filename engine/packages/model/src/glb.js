// A small GLB writer for generated content (the sample cafe, its door frame, test fixtures): boxes with
// flat PBR colours, and KHR_physics_rigid_bodies + KHR_implicit_shapes colliders and triggers that
// @vrmxg/physics reads back. Not a general exporter: enough to make sets we own outright.
//
//   writeGLB({ name, parts: [{ name, size: [x, y, z], p: [x, y, z], q?, color: '#rrggbb', roughness?,
//              metalness?, collider?: true, trigger?: true, visible?: false }] }) → Uint8Array

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)); // content tool, not simulation
const colour = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => +srgbToLinear(v / 255).toFixed(6)); };

// A box centred on the origin: 24 vertices (flat normals), 36 indices.
function box([sx, sy, sz]) {
  const x = sx / 2, y = sy / 2, z = sz / 2;
  /** @type {Array<[number[], number[][]]>} normal, then four corners */
  const faces = [
    [[1, 0, 0], [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]]], [[-1, 0, 0], [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]]],
    [[0, 1, 0], [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]]], [[0, -1, 0], [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]]],
    [[0, 0, 1], [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]]], [[0, 0, -1], [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]]],
  ];
  const pos = [], nor = [], idx = [];
  faces.forEach(([n, vs], f) => { for (const v of vs) { pos.push(...v); nor.push(...n); } const b = f * 4; idx.push(b, b + 1, b + 2, b, b + 2, b + 3); });
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint16Array(idx), min: [-x, -y, -z], max: [x, y, z] };
}

/** @param {{ name?: string, generator?: string, parts: any[] }} spec */
export function writeGLB({ name = 'scene', generator = '@vrmxg/model writeGLB', parts }) {
  const chunks = [], bufferViews = [], accessors = [], meshes = [], nodes = [], materials = [], shapes = [];
  let offset = 0;
  const view = (arr, target) => { const pad = (4 - (offset % 4)) % 4; if (pad) { chunks.push(new Uint8Array(pad)); offset += pad; } bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: arr.byteLength, target }); chunks.push(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength)); offset += arr.byteLength; return bufferViews.length - 1; };
  const matIndex = new Map();
  const geoms = new Map();
  for (const part of parts) {
    const node = { name: part.name, translation: part.p ?? [0, 0, 0] };
    // eslint-disable-next-line vrmxg/deterministic -- glTF JSON's node.rotation is a quaternion array, not three's Euler
    if (part.q) node.rotation = part.q;
    if (part.visible !== false) {
      const key = part.size.join(',');
      if (!geoms.has(key)) {
        const g = box(part.size);
        const pv = view(g.pos, 34962), nv = view(g.nor, 34962), iv = view(g.idx, 34963);
        accessors.push({ bufferView: pv, componentType: 5126, count: g.pos.length / 3, type: 'VEC3', min: g.min, max: g.max });
        accessors.push({ bufferView: nv, componentType: 5126, count: g.nor.length / 3, type: 'VEC3' });
        accessors.push({ bufferView: iv, componentType: 5123, count: g.idx.length, type: 'SCALAR' });
        geoms.set(key, accessors.length - 3);
      }
      const mk = `${part.color}|${part.roughness ?? 0.8}|${part.metalness ?? 0}`;
      if (!matIndex.has(mk)) { materials.push({ name: part.material ?? part.color, pbrMetallicRoughness: { baseColorFactor: [...colour(part.color), 1], roughnessFactor: part.roughness ?? 0.8, metallicFactor: part.metalness ?? 0 } }); matIndex.set(mk, materials.length - 1); }
      const a = geoms.get(part.size.join(','));
      meshes.push({ name: part.name, primitives: [{ attributes: { POSITION: a, NORMAL: a + 1 }, indices: a + 2, material: matIndex.get(mk) }] });
      node.mesh = meshes.length - 1;
    }
    if (part.collider || part.trigger) {
      shapes.push({ type: 'box', box: { size: part.size } });
      node.extensions = { KHR_physics_rigid_bodies: { [part.trigger ? 'trigger' : 'collider']: { geometry: { shape: shapes.length - 1 } } } };
    }
    nodes.push(node);
  }
  const bin = new Uint8Array(offset + ((4 - (offset % 4)) % 4));
  let o = 0; for (const c of chunks) { bin.set(c, o); o += c.byteLength; }
  const json = {
    asset: { version: '2.0', generator },
    scene: 0, scenes: [{ name, nodes: nodes.map((_, i) => i) }], nodes, meshes, materials, accessors, bufferViews,
    buffers: [{ byteLength: bin.byteLength }],
  };
  if (shapes.length) { json.extensionsUsed = ['KHR_physics_rigid_bodies', 'KHR_implicit_shapes']; json.extensions = { KHR_implicit_shapes: { shapes } }; }
  let text = new TextEncoder().encode(JSON.stringify(json));
  const jpad = (4 - (text.byteLength % 4)) % 4;
  if (jpad) { const t = new Uint8Array(text.byteLength + jpad).fill(0x20); t.set(text); text = t; }
  const total = 12 + 8 + text.byteLength + 8 + bin.byteLength;
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, text.byteLength, true); dv.setUint32(16, 0x4e4f534a, true); out.set(text, 20);
  const b = 20 + text.byteLength;
  dv.setUint32(b, bin.byteLength, true); dv.setUint32(b + 4, 0x004e4942, true); out.set(bin, b + 8);
  return out;
}

/** The JSON chunk of a GLB. */
export function readGLBJson(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB');
  const len = dv.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + len)));
}

/**
 * A GLB from a node tree, for generated game items (VRMXI §5): named nodes with children, box meshes, and
 * KHR_physics_rigid_bodies bodies (`motion`), colliders and sensors (`trigger`) with any KHR_implicit_shapes shape.
 *
 *   writeGLBTree({ name, roots: ['Door'], nodes: [
 *     { name: 'Door', children: ['Frame', 'Leaf', 'Reach'] },
 *     { name: 'Leaf', t: [0, 1, 0], motion: { mass: 20 }, children: ['Panel'] },
 *     { name: 'Panel', box: { size: [0.9, 2, 0.04], color: '#9a6b47' }, collider: { type: 'box', box: { size: [0.9, 2, 0.04] } } },
 *     { name: 'Reach', t: [0, 1, 0.6], trigger: { type: 'box', box: { size: [1.2, 2, 1] } } } ] })
 *
 * Node names must be unique (VRMXI §5). `t` translation, `r` rotation quaternion, `s` scale.
 */
export function writeGLBTree({ name = 'scene', generator = '@vrmxg/model writeGLBTree', roots, nodes: spec }) {
  const index = new Map(spec.map((n, i) => [n.name, i]));
  if (index.size !== spec.length) throw new Error('node names must be unique');
  const chunks = [], bufferViews = [], accessors = [], meshes = [], materials = [], shapes = [];
  let offset = 0;
  const view = (arr, target) => { const pad = (4 - (offset % 4)) % 4; if (pad) { chunks.push(new Uint8Array(pad)); offset += pad; } bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: arr.byteLength, target }); chunks.push(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength)); offset += arr.byteLength; return bufferViews.length - 1; };
  const geoms = new Map(), mats = new Map();
  const shapeIndex = (sh) => { shapes.push(sh); return shapes.length - 1; };
  const nodes = spec.map((n) => {
    const out = { name: n.name };
    if (n.t) out.translation = n.t;
    // eslint-disable-next-line vrmxg/deterministic -- glTF JSON's node.rotation is a quaternion array, not three's Euler
    if (n.r) out.rotation = n.r;
    if (n.s) out.scale = n.s;
    if (n.children?.length) out.children = n.children.map((c) => { if (!index.has(c)) throw new Error(`${n.name}: no child node ${c}`); return index.get(c); });
    if (n.box) {
      const key = n.box.size.join(',');
      if (!geoms.has(key)) {
        const g = box(n.box.size);
        const pv = view(g.pos, 34962), nv = view(g.nor, 34962), iv = view(g.idx, 34963);
        accessors.push({ bufferView: pv, componentType: 5126, count: g.pos.length / 3, type: 'VEC3', min: g.min, max: g.max }, { bufferView: nv, componentType: 5126, count: g.nor.length / 3, type: 'VEC3' }, { bufferView: iv, componentType: 5123, count: g.idx.length, type: 'SCALAR' });
        geoms.set(key, accessors.length - 3);
      }
      const color = n.box.color ?? '#cccccc', mk = `${color}|${n.box.roughness ?? 0.8}|${n.box.metalness ?? 0}`;
      if (!mats.has(mk)) { materials.push({ name: color, pbrMetallicRoughness: { baseColorFactor: [...colour(color), 1], roughnessFactor: n.box.roughness ?? 0.8, metallicFactor: n.box.metalness ?? 0 } }); mats.set(mk, materials.length - 1); }
      const a = geoms.get(key);
      meshes.push({ name: n.name, primitives: [{ attributes: { POSITION: a, NORMAL: a + 1 }, indices: a + 2, material: mats.get(mk) }] });
      out.mesh = meshes.length - 1;
    }
    const khr = {};
    if (n.motion) khr.motion = n.motion;
    if (n.collider) khr.collider = { geometry: { shape: shapeIndex(n.collider) } };
    if (n.trigger) khr.trigger = { geometry: { shape: shapeIndex(n.trigger) } };
    if (Object.keys(khr).length) out.extensions = { KHR_physics_rigid_bodies: khr };
    return out;
  });
  const bin = new Uint8Array(offset + ((4 - (offset % 4)) % 4));
  let o = 0; for (const c of chunks) { bin.set(c, o); o += c.byteLength; }
  const json = { asset: { version: '2.0', generator }, scene: 0, scenes: [{ name, nodes: roots.map((r) => index.get(r)) }], nodes };
  if (meshes.length) Object.assign(json, { meshes, materials, accessors, bufferViews, buffers: [{ byteLength: bin.byteLength }] });
  if (shapes.length || spec.some((n) => n.motion)) { json.extensionsUsed = ['KHR_physics_rigid_bodies', 'KHR_implicit_shapes']; json.extensions = { KHR_implicit_shapes: { shapes } }; }
  return packGLB(json, meshes.length ? bin : new Uint8Array(0));
}

function packGLB(json, bin) {
  let text = new TextEncoder().encode(JSON.stringify(json));
  const jpad = (4 - (text.byteLength % 4)) % 4;
  if (jpad) { const t = new Uint8Array(text.byteLength + jpad).fill(0x20); t.set(text); text = t; }
  const total = 12 + 8 + text.byteLength + (bin.byteLength ? 8 + bin.byteLength : 0);
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, text.byteLength, true); dv.setUint32(16, 0x4e4f534a, true); out.set(text, 20);
  if (bin.byteLength) { const b = 20 + text.byteLength; dv.setUint32(b, bin.byteLength, true); dv.setUint32(b + 4, 0x004e4942, true); out.set(bin, b + 8); }
  return out;
}
