// The assets panel's decisions (M5 W6, AB-T-0606), as plain functions the editor and the creator share: what each
// project file is (its category, its folder, the node type a drop of it makes), the type filters, search, folders, and
// the drop rules: what an asset may be dropped on (the viewport, a node's asset slot, a prop that names a project file)
// and what is refused, with the reason the slot shows. No Vue or DOM here; AssetsPanel.vue draws it.
import { assetType, nodeTypeFor } from '@vrmxg/editor-core';

/** The filters, in the panel's order: id, label, and the categories each shows. */
export const ASSET_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'characters', label: 'Characters' },
  { id: 'items', label: 'Items' },
  { id: 'sets', label: 'Sets' },
  { id: 'props', label: 'Props' },
  { id: 'clips', label: 'Clips' },
  { id: 'scenes', label: 'Scenes' },
  { id: 'sounds', label: 'Sounds' },
];

/** File extension → the file's kind as a slot names it (a document asset type, or a file the registry's props name). */
const EXT = { glb: 'glb', gltf: 'glb', vrmxa: 'vrmxa', vrm: 'vrmxa', vrmxi: 'vrmxi', vrmxs: 'vrmxs', vrmxw: 'vrmxw', wav: 'audio', vrma: 'vrma', json: 'json', cube: 'cube', png: 'png', jpg: 'jpg', fountain: 'fountain', ttf: 'font' };
const LABEL = { glb: 'Model', vrmxa: 'Character', vrmxi: 'Item', vrmxs: 'Scene', vrmxw: 'Wearable', audio: 'Sound', vrma: 'Clip', json: 'Data', cube: 'Look', png: 'Image', jpg: 'Image', fountain: 'Script', font: 'Font' };

/** A file's kind (glb, vrmxa, vrmxi, vrmxs, vrmxw, audio, vrma, …), or null for a file the panel doesn't list. */
export function fileKind(ref) {
  const ext = String(ref).split('.').pop()?.toLowerCase() ?? '';
  return EXT[ext] ?? null;
}

/**
 * A file's category for the type filters: characters (.vrmxa, .vrm), items (.vrmxi), sets (a model in a folder named
 * `sets`), props (any other model), clips (.vrma), scenes (.vrmxs, prefabs too), sounds (.wav), wearables (.vrmxw), or
 * null (data, scripts, images: not listed).
 */
export function assetCategory(ref) {
  const k = fileKind(ref);
  if (k === 'glb') return String(ref).split('/').slice(0, -1).includes('sets') ? 'sets' : 'props';
  return { vrmxa: 'characters', vrmxi: 'items', vrma: 'clips', vrmxs: 'scenes', audio: 'sounds', vrmxw: 'wearables' }[k] ?? null;
}

/** The folder a file is in ('' at the project's top). */
export const folderOf = (ref) => String(ref).split('/').slice(0, -1).join('/');

/**
 * The panel's entries: every file of a category, with its name, kind, label, folder, and the node type a drop of it
 * makes (null: not placed in a scene, as a clip or a wearable). Sorted by folder, then name.
 * @param {any} reg the registry @param {string[]} files paths in the project
 * @param {{ exclude?: (ref: string) => boolean }} [o]
 */
export function assetEntries(reg, files, { exclude } = {}) {
  const out = [];
  for (const ref of files) {
    const category = assetCategory(ref);
    if (!category || exclude?.(ref)) continue;
    const kind = fileKind(ref), type = assetType(ref);
    const prefab = kind === 'vrmxs' && ref.startsWith('prefabs/');
    out.push({ ref, name: ref.split('/').pop().replace(/\.[^.]+$/, ''), kind, label: prefab ? 'Prefab' : LABEL[kind], category, folder: folderOf(ref), nodeType: type ? nodeTypeFor(reg, type) : null });
  }
  return out.sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name) || a.ref.localeCompare(b.ref));
}

/**
 * The entries a filter, a search and a folder leave. The search matches the file's path and label, every word
 * (case-insensitive); a folder shows its own files and its subfolders'.
 * @param {ReturnType<typeof assetEntries>} entries @param {{ filter?: string, query?: string, folder?: string }} o
 */
export function filterAssets(entries, { filter = 'all', query = '', folder = '' } = {}) {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((e) => (filter === 'all' || e.category === filter)
    && (!folder || e.folder === folder || e.folder.startsWith(`${folder}/`))
    && words.every((w) => e.ref.toLowerCase().includes(w) || e.label.toLowerCase().includes(w)));
}

/** How many entries each filter shows (the filter buttons' counts). */
export function filterCounts(entries) {
  const out = Object.fromEntries(ASSET_FILTERS.map((f) => [f.id, 0]));
  for (const e of entries) { out.all++; if (e.category in out) out[e.category]++; }
  return out;
}

/**
 * The project's folders as the panel lists them, parents before children: { path, name, depth, count } (count: files
 * listed under it, its subfolders' included). The top is '' (the whole project).
 * @param {ReturnType<typeof assetEntries>} entries
 */
export function assetFolders(entries) {
  const counts = new Map([['', entries.length]]);
  for (const e of entries) {
    const parts = e.folder ? e.folder.split('/') : [];
    for (let i = 1; i <= parts.length; i++) { const p = parts.slice(0, i).join('/'); counts.set(p, (counts.get(p) ?? 0) + 1); }
  }
  return [...counts.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))
    .map((path) => ({ path, name: path ? path.split('/').pop() : 'All folders', depth: path ? path.split('/').length : 0, count: counts.get(path) }));
}

// ---------------------------------------------------------------- dragging and dropping

/** The drag data an asset carries: its path, and its kind in a type a drop target can read while dragging over it. */
export const ASSET_MIME = 'text/x-vrmxg-asset';
export const NODE_MIME = 'text/x-vrmxg-node';
const KIND_PREFIX = 'application/x-vrmxg-kind-';
/** The drag's types for an entry (set them all on dragstart; only types, not data, are readable during dragover). */
export const dragTypes = (entry) => ({ [ASSET_MIME]: entry.ref, [`${KIND_PREFIX}${entry.kind}`]: entry.ref });
/** The asset kind a drag carries, from its types (dragover), or null; 'node' for a scene tree row. */
export function draggedKind(types) {
  const list = [...(types ?? [])];
  const k = list.find((t) => t.startsWith(KIND_PREFIX));
  if (k) return k.slice(KIND_PREFIX.length);
  return list.includes(NODE_MIME) ? 'node' : null;
}

/**
 * A slot an asset may be dropped on, as the inspector describes it:
 *   { slot: 'asset', types: ['glb'] }: a node's asset (the registry's `asset.types` for its type),
 *   { slot: 'prop', types: ['vrma'] }: a prop naming a project file (`meta.assetTypes`),
 *   { slot: 'node' }: a node reference (`meta.nodeRef`), which takes a scene tree row, not an asset,
 *   { slot: 'viewport' }: anything a node type places.
 */

/**
 * May a drag of this kind drop on this slot? → { ok: true } or { ok: false, reason } (what the slot says while refusing).
 * @param {string | null} kind the dragged asset's kind (draggedKind), 'node' for a tree row
 * @param {{ slot: string, types?: string[], placeable?: (kind: string) => boolean }} slot
 */
export function dropVerdict(kind, slot) {
  if (!kind) return { ok: false, reason: 'not an asset' };
  if (slot.slot === 'node') return kind === 'node' ? { ok: true } : { ok: false, reason: 'a node slot takes a node from the scene tree' };
  if (kind === 'node') return { ok: false, reason: 'drop an asset here, not a node' };
  if (slot.slot === 'viewport') return slot.placeable?.(kind) === false ? { ok: false, reason: `a ${LABEL[kind] ?? kind} isn't placed in a scene` } : { ok: true };
  const types = slot.types ?? [];
  if (types.includes(kind)) return { ok: true };
  return { ok: false, reason: `takes ${types.map((t) => LABEL[t] ?? t).join(' or ') || 'nothing'}, not a ${LABEL[kind] ?? kind}` };
}

/** The same verdict for a file by its path (a drop's data, checked again on drop, where the drag's types may be gone). */
export const dropVerdictFor = (ref, slot) => dropVerdict(fileKind(ref), slot);
