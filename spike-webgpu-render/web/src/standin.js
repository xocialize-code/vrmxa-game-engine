// A stand-in for MToon under WebGPURenderer (MToon on WebGPU is AB-T-0553, another session). Every MToonMaterial the
// character loader made (a WebGL ShaderMaterial, which WebGPURenderer can't draw) becomes a node material:
//   the surface → MeshToonNodeMaterial (base colour, map, emissive, alpha mode, side, depth write);
//   the outline (three-vrm's second material, isOutline) → an inverted hull in TSL: back faces pushed out along the
//   skinned normal by the authored width, in the outline colour. That keeps "characters keep their own outline, the
//   screen-space edges skip them" (research/cinematics.md §3.4) testable before the real MToonNodeMaterial lands.
// Materials are converted once per source material (shared materials stay shared).
import { MeshToonNodeMaterial, MeshBasicNodeMaterial, BackSide, Color } from 'three/webgpu';
import { positionLocal, normalLocal, float, uniform } from 'three/tsl';

/** Converted materials, tagged so the post stack can find characters' materials for its mask. */
export const CHARACTER_MATERIALS = new Set();

const cache = new WeakMap();

function convert(m, outlineScale) {
  if (!m?.isMToonMaterial) return m;
  if (cache.has(m)) return cache.get(m);
  let n;
  if (m.isOutline) {
    const mode = m.outlineWidthMode;
    // world mode: the width is metres; screen mode is approximated by a fixed world width (good enough for a stand-in)
    const width = uniform(mode === 'none' ? 0 : (m.outlineWidthFactor ?? 0) * outlineScale);
    n = new MeshBasicNodeMaterial({ color: new Color().copy(m.outlineColorFactor ?? new Color(0, 0, 0)), side: BackSide, transparent: m.transparent, depthWrite: m.depthWrite, alphaTest: m.alphaTest, map: m.map ?? null });
    n.positionNode = positionLocal.add(normalLocal.mul(width));
    n.userData.outlineWidth = width;
  } else {
    n = new MeshToonNodeMaterial({
      color: new Color().copy(m.color), map: m.map ?? null, normalMap: m.normalMap ?? null,
      emissive: new Color().copy(m.emissive ?? new Color(0, 0, 0)), emissiveMap: m.emissiveMap ?? null, emissiveIntensity: m.emissiveIntensity ?? 1,
      transparent: m.transparent, opacity: m.opacity ?? 1, alphaTest: m.alphaTest, side: m.side, depthWrite: m.depthWrite, depthTest: m.depthTest,
    });
    if (m.normalScale) n.normalScale.copy(m.normalScale);
  }
  n.name = `${m.name || 'mtoon'}:standin`;
  n.userData.standInFor = m.isOutline ? 'MToon outline' : 'MToon';
  CHARACTER_MATERIALS.add(n);
  cache.set(m, n);
  return n;
}

/**
 * Swap MToon for node materials under `root` (a character's subtree). Returns how many were swapped.
 * @param {any} root @param {{ outlineScale?: number }} [o] outlineScale multiplies authored outline widths
 */
export function toonStandIns(root, { outlineScale = 1 } = {}) {
  let swapped = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (Array.isArray(o.material)) o.material = o.material.map((m) => { const c = convert(m, outlineScale); if (c !== m) swapped++; return c; });
    else { const c = convert(o.material, outlineScale); if (c !== o.material) swapped++; o.material = c; }
  });
  return swapped;
}

/** Characters' materials marked for the edge mask (CHARACTER_MATERIALS also gets any non-MToon material found here). */
export function markCharacterMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m?.isNodeMaterial) CHARACTER_MATERIALS.add(m);
  });
}

export { float };
