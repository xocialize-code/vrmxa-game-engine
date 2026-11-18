// A sequence document (M2 W1, decision AB-D-0257): a .vrmxs of its own that includes the set scene, so one set can be
// filmed by many sequences and editing shots never touches the set's file.
//   { "format": "vrmxs", "version": 1, "id": "morning", "set": "cafe.vrmxs",
//     "assets": [...], "nodes": [ cameras, a brain, anything only this sequence has ], "connections": [...],
//     "sequence": { "fps": 24, "duration": 1080, "snapshotEvery": 48, "shots": [...], "tracks": [...], "markers": [...] } }
// The include is unprefixed, as an Unreal level sequence binds the level's actors: the set's nodes keep their ids, so
// tracks and the sequence's own nodes refer to "mira" and "hana-1" as the set does, and every reference inside the set
// (behaviour targets, connections, camera targets) keeps working. The sequence's nodes join the set's tree (a node
// without a parent goes under the set's root); its assets are added (an asset id may not clash with a different one).

/** True for a sequence document. */
export const isSequence = (doc) => typeof doc?.set === 'string' && !!doc.sequence;

/**
 * The world document a sequence plays: the set with the sequence's assets, nodes, connections and sequence block.
 * @param {any} seq the sequence document @param {any} set the set document (doc.set, parsed)
 */
export function composeSequence(seq, set) {
  const ids = new Set(set.nodes.map((n) => n.id));
  for (const n of seq.nodes ?? []) if (ids.has(n.id)) throw new Error(`sequence "${seq.id}": node "${n.id}" is also in the set (${seq.set}); give it another id`);
  const assets = new Map((set.assets ?? []).map((a) => [a.id, a]));
  for (const a of seq.assets ?? []) {
    const had = assets.get(a.id);
    if (had && (had.ref !== a.ref || had.type !== a.type)) throw new Error(`sequence "${seq.id}": asset "${a.id}" is ${a.ref} here but ${had.ref} in the set`);
    assets.set(a.id, a);
  }
  const root = set.nodes.find((n) => n.parent === undefined)?.id;
  const nodes = [...set.nodes, ...(seq.nodes ?? []).map((n) => (n.parent === undefined && root ? { ...n, parent: root } : n))];
  return {
    ...set, id: seq.id, assets: [...assets.values()], nodes,
    connections: [...(set.connections ?? []), ...(seq.connections ?? [])],
    sequence: seq.sequence, set: seq.set,
  };
}
