// Reading a .vrmxi (VRMXI-base-draft.md §3, §4). The container is read with vrmxa-core's ZIP reader (injected, as the
// character library takes it: AB-D-0249); the file is checked first by the specification's checker when one is
// given (VRMXI §13: every row, codes `schema.vrmxi` and `vrmxi.*`). Without a checker the reader still refuses
// what it can't load: no manifest, another format or version, a missing model, a takeable item without its wearable.

export class ItemError extends Error {
  /** @param {string} where @param {Array<{ code: string, where?: string, message: string }>} problems */
  constructor(where, problems) {
    super(`${where}: refused (${problems.map((p) => `${p.code}${p.where ? ` at ${p.where}` : ''}: ${p.message}`).join('; ')})`);
    this.name = 'ItemError'; this.problems = problems;
  }
}

const decode = (b) => JSON.parse(new TextDecoder().decode(b));

/**
 * @param {Uint8Array} bytes the .vrmxi
 * @param {{ vrmxaCore: { readZip: Function }, check?: (bytes: Uint8Array) => Array<{ severity: string, code: string, where?: string, message: string }>, where?: string }} opts
 * @returns {{ manifest: any, model: Uint8Array, wearable: Uint8Array | null, thumbnail: Uint8Array | null, warnings: any[] }}
 */
export function readItem(bytes, { vrmxaCore, check, where = 'item' }) {
  let warnings = [];
  if (check) {
    const found = check(bytes);
    const errors = found.filter((p) => p.severity === 'error');
    if (errors.length) throw new ItemError(where, errors);
    warnings = found.filter((p) => p.severity !== 'error');
  }
  if (!vrmxaCore?.readZip) throw new Error('reading a .vrmxi needs vrmxaCore (its readZip)');
  let entries;
  try { entries = vrmxaCore.readZip(bytes); } catch (e) { throw new ItemError(where, (e.problems ?? [{ code: 'zip', message: e.message }])); }
  const byName = new Map(entries.map((e) => [e.name, e.data]));
  const fail = (code, message) => { throw new ItemError(where, [{ code, message }]); };
  if (!byName.has('vrmxi.json')) fail('manifest.missing', 'there is no vrmxi.json');
  const m = decode(byName.get('vrmxi.json'));
  if (m.format !== 'vrmxi') fail('manifest.format', `format is ${JSON.stringify(m.format)}, not "vrmxi"`);
  if (m.version !== 1) fail('manifest.version', `version ${m.version}; this reader knows 1`);
  const model = byName.get(m.model?.file);
  if (!model) fail('vrmxi.model', `no model entry ${JSON.stringify(m.model?.file)}`);
  if (typeof m.takeable !== 'boolean') fail('vrmxi.takeable', 'takeable is missing');
  const wearable = m.takeable ? byName.get(m.wearable?.file) : null;
  if (m.takeable && !wearable) fail('vrmxi.takeable', 'a takeable item embeds its wearable');
  if (!m.takeable && (m.wearable || entries.some((e) => e.name.endsWith('.vrmxw')))) fail('vrmxi.takeable', 'an item that can\'t be taken carries no wearable');
  return { manifest: m, model, wearable: wearable ?? null, thumbnail: m.thumbnail ? byName.get(m.thumbnail) ?? null : null, warnings };
}
