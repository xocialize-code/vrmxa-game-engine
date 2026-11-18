// Writing a .vrmxi (VRMXI §3, §14.5): the manifest first, then the model, the embedded wearable (stored, never
// deflated) and the thumbnail, with zeroed timestamps; `files` filled in with each entry's size and SHA-256.
// vrmxa-core's writeZip and sha256 are injected (AB-D-0249).

/**
 * @param {{ manifest: any, model: Uint8Array, wearable?: Uint8Array | null, thumbnail?: Uint8Array | null, vrmxaCore: any }} item
 * @returns {Promise<Uint8Array>}
 */
export async function packItem({ manifest, model, wearable = null, thumbnail = null, vrmxaCore }) {
  const m = structuredClone(manifest);
  const entries = [{ name: m.model.file, data: model }];
  if (wearable) entries.push({ name: m.wearable.file, data: wearable, store: true });
  if (thumbnail) entries.push({ name: m.thumbnail, data: thumbnail });
  m.files = [];
  for (const e of entries) m.files.push({ path: e.name, size: e.data.length, sha256: await vrmxaCore.sha256(e.data) });
  if (wearable) m.wearable.sha256 = m.files.find((f) => f.path === m.wearable.file).sha256;
  const json = new TextEncoder().encode(JSON.stringify(m, null, 1) + '\n');
  return vrmxaCore.writeZip([{ name: 'vrmxi.json', data: json }, ...entries]);
}
