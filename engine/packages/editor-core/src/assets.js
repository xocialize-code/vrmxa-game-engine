// A project's files as the asset list shows them: what each one is, and which node type a drop of it makes. The node
// type comes from the registry (each type names the asset types it takes), so a new type is picked up without edits.

/** File extension → document asset type. `vrm` files are characters too (a plain body, no closet). */
const KINDS = { glb: 'glb', gltf: 'glb', vrmxa: 'vrmxa', vrm: 'vrmxa', vrmxi: 'vrmxi', vrmxs: 'vrmxs', vrmxw: 'vrmxw', wav: 'audio' };
const LABELS = { glb: 'Model', vrmxa: 'Character', vrmxi: 'Item', vrmxs: 'Prefab', audio: 'Sound', vrmxw: 'Wearable' };

/** The asset type of a project file, or null for files the editor doesn't place (clips, scripts, images…). */
export function assetType(ref) {
  const ext = ref.split('.').pop()?.toLowerCase() ?? '';
  return KINDS[ext] ?? null;
}

/**
 * The node type a drop of this asset type makes: the concrete registry type whose `asset.types` includes it (Model for
 * glb, Character for vrmxa, Item for vrmxi, Instance for vrmxs); null when none does (a wearable is put on through a
 * character's closet, not placed).
 * @param {any} reg @param {string} type
 */
export function nodeTypeFor(reg, type) {
  for (const t of reg.types.values()) if (!t.abstract && t.asset?.types?.includes(type)) return t.name;
  return null;
}

/**
 * The asset list: every placeable file of the project, grouped by kind, with the node type it makes.
 * @param {any} reg @param {string[]} files paths relative to the project
 * @param {{ exclude?: (ref: string) => boolean }} [opts]
 * @returns {Array<{ ref: string, name: string, type: string, kind: string, nodeType: string | null }>}
 */
export function assetList(reg, files, { exclude } = {}) {
  const out = [];
  for (const ref of files) {
    const type = assetType(ref);
    if (!type || exclude?.(ref)) continue;
    const name = ref.split('/').pop().replace(/\.[^.]+$/, '');
    out.push({ ref, name, type, kind: LABELS[type], nodeType: nodeTypeFor(reg, type) });
  }
  const order = Object.keys(LABELS);
  return out.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.ref.localeCompare(b.ref));
}

/** A stable id from a name: lower case, letters, digits, '-' and '_' only. */
export function slug(name) {
  const s = String(name).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'node';
}

/** `base`, or `base-2`, `base-3`… whichever isn't taken. */
export function uniqueId(base, taken) {
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}
