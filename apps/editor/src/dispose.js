// Letting go of a world (AB-T-0592; first the creator's, M4 W5 review, for its thumbnail worlds). Every world the
// editor builds (the edit view, the timeline's preview, Play, an export's take) is a full world: physics, models, VRMs,
// sound. Dropping one isn't enough: its Rapier world lives in WASM memory, which never shrinks, and its geometries,
// materials and textures hold GPU memory until disposed. Measured in the Mac app on WebGPU: about half a gigabyte a
// world, and the timeline scenario's forty-odd rebuilds took the web process to 25 GB. Nothing in a world is shared
// with another world: models and VRMs are made per world; the shared character cache holds read bundles and parsed
// clips, not three objects. A disposed world must not be drawn again (three would upload it all again).
//
// Two things are given back by hand as well, because waiting for the collector isn't enough in WebKit. A dead world is
// light in JavaScript objects and heavy outside them: each character's vertex data (its morph targets above all) in
// typed arrays, and its textures' decoded images (`ImageBitmap`s). WebKit collects by how much JavaScript allocates,
// and on WebGL the editor allocates little: measured in the Mac app, 72 disposed worlds were all still uncollected
// after the timeline scenario, 14.6 GB of them, and stayed so while the app sat idle. (On WebGPU three allocates
// enough for collections to keep up, which is luck, not a rule.) So a disposed world's skinned meshes have their
// buffers detached and its image bitmaps closed, and what is left for the collector is small.

/** How many worlds have been disposed (the editor's status counts the ones still alive: built less disposed). */
export const disposed = { worlds: 0 };

/**
 * Give a typed array's memory back now: its buffer is detached (`ArrayBuffer.transfer`), so every view on it reads as
 * empty from here on. → the bytes released
 */
function detach(array) {
  const b = array?.buffer;
  if (!(b instanceof ArrayBuffer) || typeof b.transfer !== 'function' || b.detached || !b.byteLength) return 0;
  const n = b.byteLength;
  try { b.transfer(0); } catch { return 0; }
  return n;
}

/**
 * A disposed geometry's vertex data, given back: its index, attributes and morph targets. Only for a skinned mesh's
 * geometry (a character's, made for this world by the VRM loader): a static mesh's is small, and may be built from
 * arrays a library shares between its meshes.
 */
function detachGeometry(g) {
  let n = 0;
  const of = (a) => detach(a?.isInterleavedBufferAttribute ? a.data?.array : a?.array);
  n += of(g.index);
  for (const a of Object.values(g.attributes ?? {})) n += of(a);
  for (const list of Object.values(g.morphAttributes ?? {})) for (const a of list) n += of(a);
  return n;
}

/** Every texture a material holds (maps, and textures in uniforms). */
function texturesOf(m) {
  const out = [];
  for (const v of Object.values(m)) if (v && v.isTexture) out.push(v);
  for (const u of Object.values(m.uniforms ?? {})) if (u?.value?.isTexture) out.push(u.value);
  return out;
}

/**
 * Dispose a world: sound, physics, and every geometry, material and texture under its root; its characters' vertex
 * data and its textures' image bitmaps are given back at once (see the top). Safe to call twice.
 * → what it released, for tests: { geometries, materials, textures, physics, bytes, bitmaps }
 */
export function disposeWorld(world) {
  const out = { geometries: 0, materials: 0, textures: 0, physics: false, bytes: 0, bitmaps: 0 };
  if (!world || world.disposed) return out;
  world.disposed = true;
  disposed.worlds++;
  try { world.audio?.dispose?.(); } catch { /* already silent */ }
  const physics = world.tree?.services?.get?.('physics')?.world;
  if (physics?.free) { try { physics.free(); out.physics = true; } catch { /* freed already */ } }
  const root = world.tree?.root?.object3d;
  const seen = new Set();
  // Under the root, and what left it while the world ran (AB-T-0626): a body the closet replaced, a removed node's
  // object, an item's model, a wearable taken off. Nothing under the root reaches those any more (`tree.detached`).
  const visit = (o) => {
    if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); out.geometries++; }
    if (o.isSkinnedMesh && o.geometry) out.bytes += detachGeometry(o.geometry); // nothing again for one already detached
    for (const m of [o.material].flat().filter(Boolean)) {
      if (seen.has(m)) continue;
      seen.add(m);
      for (const t of texturesOf(m)) {
        if (seen.has(t)) continue;
        seen.add(t); t.dispose(); out.textures++;
        const image = t.source?.data ?? t.image;
        if (typeof ImageBitmap === 'function' && image instanceof ImageBitmap && !seen.has(image)) { seen.add(image); image.close(); out.bitmaps++; }
      }
      m.dispose(); out.materials++;
    }
    o.skeleton?.boneTexture?.dispose?.();
  };
  root?.traverse?.(visit);
  for (const o of world.tree?.detached ?? []) o?.traverse?.(visit);
  world.tree?.detached?.clear?.();
  return out;
}
