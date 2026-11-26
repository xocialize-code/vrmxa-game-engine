// Where the project's other files name a node of one scene (M6 W1, the review of PR #60): changing a node's id rewrites
// the open file only, so the session refuses an id change that another file depends on, naming the files, rather than
// leave them pointing at a node that no longer exists. Two kinds of file name another scene's nodes:
//   - a sequence that films it (`"set": "<ref>"`): its tracks' targets and cameras, its shots' and clips' cameras, its own
//     nodes' references and its connections' ends;
//   - a scene or prefab that places it as a prefab, directly or through another prefab ("door-1", "entrance/left"): an
//     instance's overrides are keyed by the prefab's node ids ("hinge", "left/hinge"), and connections address them
//     ("door-1/hinge").
// And game state is shared across scenes (M6 W1 review, round 2): another scene's condition may read a counter, timer or
// goal by its key ("counters.mistakes" in the won and lost scenes). `keyNamed(kind, key)` lists those scenes, so an id
// change keeps the key of a game node whose key is its id (EditorSession.keyNamed).
import { prefabUsers } from '@vrmxg/scene';
import { mapNodeRefs } from './refs.js';

/** Does reference `r` name node `id` ("id", "id/inner", "id#bone")? */
const names = (r, id) => typeof r === 'string' && (r === id || r.startsWith(`${id}/`) || r.startsWith(`${id}#`));

/**
 * @param {any} reg the registry (which props and params name nodes)
 * @param {string} ref the scene's path in the project
 * @param {Map<string, any>} docs the project's .vrmxs documents by path, parsed (this scene's own is skipped)
 * @returns {((id: string) => { file: string, what: string }[]) & { keyNamed: (kind: string, key: string) => string[] }}
 *   for a node id of the scene, where other files name it; keyNamed: the other scenes whose conditions (or GameRules'
 *   reads) name game state `<kind>.<key>` ("counters", "timers", "goals")
 */
export function referencesElsewhere(reg, ref, docs) {
  const films = [...docs].filter(([file, d]) => file !== ref && d?.set === ref);
  const places = [...docs].filter(([file]) => file !== ref).map(([file, d]) => {
    let at = [];
    try { at = prefabUsers(d, docs, ref); } catch { at = []; }
    return [file, d, at];
  }).filter(([, , at]) => at.length);
  const find = (id) => {
    const out = [];
    for (const [file, d] of films) {
      const seq = d.sequence ?? {};
      const cams = [...(seq.shots ?? []).map((s) => s.camera), ...(seq.tracks ?? []).flatMap((t) => [t.target, ...(t.clips ?? []).map((c) => c.camera)])];
      let n = cams.filter((r) => names(r, id)).length;
      for (const x of d.nodes ?? []) mapNodeRefs(reg, x, (r) => { if (names(r, id)) n++; return r; });
      n += (d.connections ?? []).filter((c) => names(c.from, id) || names(c.to, id)).length;
      if (n) out.push({ file, what: `a sequence filming this scene names it ${n === 1 ? 'once' : `${n} times`}` });
    }
    for (const [file, d, at] of places) {
      let n = 0;
      const byId = new Map((d.nodes ?? []).map((x) => [x.id, x]));
      for (const addr of at) {
        const [top, ...rest] = addr.split('/');
        const key = [...rest, id].join('/');
        for (const k of Object.keys(byId.get(top)?.overrides ?? {})) if (k === key || k.startsWith(`${key}/`)) n++;
        n += (d.connections ?? []).filter((c) => names(c.from, `${addr}/${id}`) || names(c.to, `${addr}/${id}`)).length;
      }
      if (n) out.push({ file, what: `it places this scene as a prefab and names this node ${n === 1 ? 'once' : `${n} times`} (overrides, connections)` });
    }
    return out;
  };
  const others = [...docs].filter(([file]) => file !== ref);
  find.keyNamed = (kind, key) => others.filter(([, d]) => namesKey(d, kind, key)).map(([file]) => file);
  return find;
}

/**
 * Does a scene name game state `<kind>.<key>` ("counters.served", "timers.clock.done") in any node's props or a
 * connection's arguments, or list `key` in a GameRules' `reads[kind]`?
 * @param {any} doc @param {string} kind @param {string} key
 */
export function namesKey(doc, kind, key) {
  const want = `${kind}.${key}`;
  const hit = (v) => (typeof v === 'string' ? v === want || v.startsWith(`${want}.`) : Array.isArray(v) ? v.some(hit) : v && typeof v === 'object' ? Object.values(v).some(hit) : false);
  return (doc?.nodes ?? []).some((x) => hit(x.props) || (x.type === 'GameRules' && (x.props?.reads?.[kind] ?? []).includes(key))) || (doc?.connections ?? []).some((c) => hit(c.args));
}
