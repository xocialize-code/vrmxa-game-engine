// Drawing one asset's thumbnail in the page (M5 W6, AB-T-0606), for the thumbnail queue (thumbs.js). A character
// bundle carries its own (`thumbnail.png`, VRMXA §4); a scene (not a prefab) has the one the editor's Thumbnail button
// saved as thumbnails/<scene>.png, or none; a sound is drawn as its waveform; a model, item or prefab is built
// alone in a small world (the file, a key light and a studio environment) and drawn on the host's offline render host,
// framed to its bounds. The world is retired as soon as it's drawn; nothing here touches the edit view, the play world or
// an export, so a thumbnail never reaches an exported frame or a world hash.
import { Box3, PerspectiveCamera, Sphere, Vector3 } from 'three';
import { assetType } from '@vrmxg/editor-core';
import { captureStill, encodePNG } from '@vrmxg/export';

/** A small world showing one file: its node, a key light, a neutral studio environment on a plain background. */
export function thumbnailDoc(entry) {
  return {
    format: 'vrmxs', version: 1, id: 'thumbnail', assets: [{ id: 'a', type: assetType(entry.ref), ref: entry.ref }],
    nodes: [
      { id: 'root', type: 'Node3D' },
      { id: 'it', type: entry.nodeType, parent: 'root', asset: 'a' },
      { id: 'key', type: 'DirectionalLight', parent: 'root', transform: { q: [-0.3535534, 0.3535534, 0.1464466, 0.8535534] }, props: { intensity: 2.2 } },
      { id: 'env', type: 'Environment', parent: 'root', props: { background: 'color', backgroundColor: '#3a3f48', environment: 'room', ambientIntensity: 0.8 } },
    ],
    connections: [],
  };
}

/** A camera framing a box from the front-right and a little above, filling a square frame. */
export function framingCamera(box) {
  const sphere = box.getBoundingSphere(new Sphere());
  const r = Math.max(sphere.radius, 0.05), fov = 30;
  const cam = new PerspectiveCamera(fov, 1, r / 100, r * 100);
  const dist = (r / Math.sin(((fov / 2) * Math.PI) / 180)) * 1.02;
  cam.position.copy(sphere.center).addScaledVector(new Vector3(0.55, 0.45, 1).normalize(), dist);
  cam.lookAt(sphere.center);
  cam.updateMatrixWorld(true);
  return cam;
}

/** A character bundle's own thumbnail.png (a zip entry), or null. @param {Uint8Array} bytes @param {any} vrmxaCore */
export function bundleThumbnail(bytes, vrmxaCore) {
  try {
    const { entries } = vrmxaCore.scanZip(bytes, { inflate: false });
    const e = entries.find((x) => x.name === 'thumbnail.png');
    if (!e) return null;
    const { data } = vrmxaCore.inflateEntry(bytes, e);
    return data && data.length > 8 ? new Uint8Array(data) : null;
  } catch { return null; }
}

/** A WAV file's samples, mixed to mono, as min/max per column: [[min, max], …] in −1…1 (16-bit PCM and 32-bit float). */
export function waveformColumns(bytes, columns) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let fmt = null, data = null;
  for (let o = 12; o + 8 <= bytes.length;) {
    const id = tag(o), size = v.getUint32(o + 4, true);
    if (id === 'fmt ') fmt = { format: v.getUint16(o + 8, true), channels: v.getUint16(o + 10, true), bits: v.getUint16(o + 22, true) };
    else if (id === 'data') data = { at: o + 8, size: Math.min(size, bytes.length - o - 8) };
    o += 8 + size + (size & 1);
  }
  if (!fmt || !data || !fmt.channels) return null;
  const bps = fmt.bits / 8, frame = bps * fmt.channels, frames = Math.floor(data.size / frame);
  const read = fmt.format === 3 && fmt.bits === 32 ? (o) => v.getFloat32(o, true) : fmt.bits === 16 ? (o) => v.getInt16(o, true) / 32768 : null;
  if (!read || !frames) return null;
  const out = [];
  for (let c = 0; c < columns; c++) {
    const a = Math.floor((c * frames) / columns), b = Math.max(a + 1, Math.floor(((c + 1) * frames) / columns));
    let lo = 0, hi = 0;
    for (let f = a; f < b; f += Math.max(1, Math.floor((b - a) / 64))) {
      let s = 0;
      for (let ch = 0; ch < fmt.channels; ch++) s += read(data.at + f * frame + ch * bps);
      s /= fmt.channels;
      if (s < lo) lo = s; if (s > hi) hi = s;
    }
    out.push([lo, hi]);
  }
  return out;
}

/** A sound's waveform as a PNG (a 2D canvas: no GPU). */
export async function waveformPNG(bytes, size) {
  const cols = waveformColumns(bytes, size);
  if (!cols) return null;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#3a3f48'; g.fillRect(0, 0, size, size);
  g.fillStyle = '#8fb4ff';
  const mid = size / 2, amp = size * 0.4;
  cols.forEach(([lo, hi], x) => g.fillRect(x, mid - hi * amp, 1, Math.max(1, (hi - lo) * amp)));
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

/**
 * One asset's thumbnail as PNG bytes, or null (a file with nothing to show).
 * @param {any} ed the EditorHost (its project, buildFrom, offline host, retire) @param {any} entry @param {number} size
 */
export async function drawThumbnail(ed, entry, size) {
  const p = ed.project;
  if (entry.kind === 'vrmxa') {
    const own = bundleThumbnail(await p.bytes(entry.ref), ed.vrmxaCore);
    if (own) return own;
  }
  if (entry.kind === 'audio') return waveformPNG(await p.bytes(entry.ref), size);
  if (entry.kind === 'vrmxs' && entry.label !== 'Prefab') { // a whole scene: the picture the editor's Thumbnail button saved, if any
    const own = `thumbnails/${entry.ref.replace(/\.vrmxs$/, '').replace(/^.*\//, '')}.png`;
    return p.has(own) ? p.bytes(own) : null;
  }
  if (!entry.nodeType) return null;
  const doc = thumbnailDoc(entry);
  const prefabs = entry.kind === 'vrmxs' ? await p.prefabs(doc) : new Map();
  const host = await ed.assetThumbHost();
  let world = null;
  try {
    world = await ed.buildFrom(doc, { play: false, heard: false, cache: true, prefabs, mtoonMaterial: host.mtoonMaterial });
    const o = world.tree.find('it')?.object3d;
    if (!o) return null;
    o.updateMatrixWorld(true);
    const box = new Box3().setFromObject(o);
    if (box.isEmpty()) return null;
    host.attach(world.tree);
    host.camera = framingCamera(box);
    const still = await captureStill(host, { width: size, height: size });
    return await encodePNG(still);
  } finally {
    if (world && host.tree === world.tree) host.detach();
    ed.retire(world);
  }
}
