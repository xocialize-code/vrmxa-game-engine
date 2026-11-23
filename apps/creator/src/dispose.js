// Letting go of a world the creator built only to draw from (M4 W5 review): the storyboard's thumbnail worlds. Each
// one is a full play world (physics, models, VRMs, sound), so dropping it isn't enough: its Rapier world lives in WASM
// memory and its geometries, materials and textures hold GPU memory until disposed (AB-T-0592 is that leak in the
// editor's preview). Nothing in a world built here is shared with another world: models and VRMs are made per world;
// the shared character cache holds read bundles and parsed clips, not three objects.

/** Every texture a material holds (maps, and textures in uniforms). */
function texturesOf(m) {
  const out = [];
  for (const v of Object.values(m)) if (v && v.isTexture) out.push(v);
  for (const u of Object.values(m.uniforms ?? {})) if (u?.value?.isTexture) out.push(u.value);
  return out;
}

/**
 * Dispose a world: sound, physics, and every geometry, material and texture under its root. Safe to call twice.
 * → what it released, for tests: { geometries, materials, textures, physics }
 */
export function disposeWorld(world) {
  const out = { geometries: 0, materials: 0, textures: 0, physics: false };
  if (!world || world.disposed) return out;
  world.disposed = true;
  try { world.audio?.dispose?.(); } catch { /* already silent */ }
  const physics = world.tree?.services?.get?.('physics')?.world;
  if (physics?.free) { try { physics.free(); out.physics = true; } catch { /* freed already */ } }
  const root = world.tree?.root?.object3d;
  const seen = new Set();
  root?.traverse?.((o) => {
    if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); out.geometries++; }
    for (const m of [o.material].flat().filter(Boolean)) {
      if (seen.has(m)) continue;
      seen.add(m);
      for (const t of texturesOf(m)) if (!seen.has(t)) { seen.add(t); t.dispose(); out.textures++; }
      m.dispose(); out.materials++;
    }
    o.skeleton?.boneTexture?.dispose?.();
  });
  return out;
}
