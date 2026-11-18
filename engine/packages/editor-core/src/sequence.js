// Sequence commands (M2 W5): every timeline edit is one undo step on the open document, through the session's command
// log, so the editor's Undo, MCP's undo and the history read the same. Each command copies the sequence block, changes
// the copy, checks it (@vrmxg/sequence's checkSequence) and replaces the block in one setDoc op; keys stay sorted.
import { checkSequence } from '@vrmxg/sequence';
import { CLIP_TRACKS, CHANNEL_TRACKS } from './timeline.js';
import { uniqueId, slug } from './assets.js';

const clone = (v) => structuredClone(v);
const sortKeys = (ks) => ks.sort((a, b) => a[0] - b[0]);

/** A new sequence document filming a set. */
export function newSequenceDoc({ id = 'sequence', set, fps = 24, duration = 240 }) {
  return { format: 'vrmxs', version: 1, id, set, assets: [], nodes: [], connections: [], sequence: { fps, duration, shots: [], markers: [], tracks: [] } };
}

export class SequenceCommands {
  /** @param {import('./session.js').EditorSession} session @param {() => Set<string> | null} [nodeIds] the ids tracks may target (the set's too) */
  constructor(session, nodeIds = () => null) { this.session = session; this.nodeIds = nodeIds; }

  get seq() { return this.session.doc.sequence ?? null; }
  track(id) { const t = this.seq?.tracks?.find((x) => x.id === id); if (!t) throw new Error(`no track "${id}"`); return t; }

  /** Change a copy of the sequence and put it in as one undo step. → whatever `change` returns */
  edit(label, change) {
    if (!this.seq) throw new Error('this document has no sequence');
    const next = clone(this.seq);
    const out = change(next);
    const problems = checkSequence(next, { nodeIds: this.nodeIds() });
    if (problems.length) throw new Error(`${label}: ${problems.join('; ')}`);
    this.session.run(label, [{ op: 'setDoc', path: 'sequence', value: next }]);
    return out;
  }

  // ---------------------------------------------------------------- the sequence

  set(fields) { return this.edit(`Set sequence ${Object.keys(fields).join(', ')}`, (s) => { Object.assign(s, clone(fields)); }); }

  // ---------------------------------------------------------------- tracks

  /** Add a track ({ type, target?, path?, ... }); an id is made from the type and target if none is given. → its id */
  addTrack(track) {
    return this.edit(`Add ${track.type} track`, (s) => {
      const id = track.id ?? uniqueId(slug(`${track.target ?? track.type}-${track.type}`), new Set(s.tracks.map((t) => t.id)));
      const t = { id, ...clone(track) };
      if (CLIP_TRACKS.has(t.type)) t.clips ??= []; else t.keys ??= CHANNEL_TRACKS.has(t.type) ? {} : [];
      s.tracks.push(t);
      return id;
    });
  }
  removeTrack(id) { return this.edit(`Delete track ${id}`, (s) => { s.tracks = s.tracks.filter((t) => t.id !== id); }); }
  setTrack(id, fields) { return this.edit(`Set ${id} ${Object.keys(fields).join(', ')}`, (s) => { Object.assign(s.tracks.find((t) => t.id === id), clone(fields)); }); }

  // ---------------------------------------------------------------- keys

  keysIn(t, channel) {
    if (CHANNEL_TRACKS.has(t.type)) { if (!channel) throw new Error(`${t.id}: a ${t.type} key names its channel`); t.keys[channel] ??= []; return t.keys[channel]; }
    return t.keys;
  }
  /** Add (or replace, at the same frame) a key. → its index */
  /** @param {string} trackId @param {number} frame @param {any} value @param {{ channel?: string | null, ease?: any }} [o] */
  addKey(trackId, frame, value, { channel = null, ease = undefined } = {}) {
    return this.edit(`Key ${trackId}${channel ? `.${channel}` : ''} @${frame}`, (s) => {
      const ks = this.keysIn(s.tracks.find((t) => t.id === trackId) ?? this.track(trackId), channel);
      const k = ease === undefined ? [frame, clone(value)] : [frame, clone(value), ease];
      const at = ks.findIndex((x) => x[0] === frame);
      if (at >= 0) ks[at] = k; else ks.push(k);
      sortKeys(ks);
      return ks.indexOf(k);
    });
  }
  /** Move a key to a frame (onto another key's frame replaces it). → its new index */
  moveKey(trackId, index, frame, { channel = null } = {}) {
    return this.edit(`Move key ${trackId}${channel ? `.${channel}` : ''} to ${frame}`, (s) => {
      const ks = this.keysIn(s.tracks.find((t) => t.id === trackId) ?? this.track(trackId), channel);
      const k = ks[index]; if (!k) throw new Error(`${trackId}: no key ${index}`);
      k[0] = frame;
      const clash = ks.findIndex((x, i) => i !== index && x[0] === frame);
      if (clash >= 0) ks.splice(clash, 1);
      sortKeys(ks);
      return ks.indexOf(k);
    });
  }
  setKey(trackId, index, { value, ease }, { channel = null } = {}) {
    return this.edit(`Set key ${trackId}${channel ? `.${channel}` : ''} ${index}`, (s) => {
      const k = this.keysIn(s.tracks.find((t) => t.id === trackId) ?? this.track(trackId), channel)[index];
      if (!k) throw new Error(`${trackId}: no key ${index}`);
      if (value !== undefined) k[1] = clone(value);
      if (ease !== undefined) { if (ease === null) k.length = 2; else k[2] = ease; }
    });
  }
  removeKey(trackId, index, { channel = null } = {}) {
    return this.edit(`Delete key ${trackId}${channel ? `.${channel}` : ''} ${index}`, (s) => {
      const t = s.tracks.find((x) => x.id === trackId) ?? this.track(trackId), ks = this.keysIn(t, channel);
      ks.splice(index, 1);
      if (channel && !ks.length) delete t.keys[channel];
    });
  }

  // ---------------------------------------------------------------- clips

  /** Add a clip ({ start, end, ... }). → its index */
  addClip(trackId, clip) {
    return this.edit(`Add clip to ${trackId} @${clip.start}`, (s) => {
      const t = s.tracks.find((x) => x.id === trackId) ?? this.track(trackId);
      t.clips.push(clone(clip)); t.clips.sort((a, b) => a.start - b.start);
      return t.clips.findIndex((c) => c.start === clip.start && c.end === clip.end);
    });
  }
  /** Move a clip (start, keeping its length) or trim it (start or end). → its new index */
  moveClip(trackId, index, { start, end }, labelText) {
    return this.edit(labelText ?? `${start !== undefined && end !== undefined ? 'Move' : 'Trim'} clip ${trackId} ${index}`, (s) => {
      const t = s.tracks.find((x) => x.id === trackId) ?? this.track(trackId), c = t.clips[index];
      if (!c) throw new Error(`${trackId}: no clip ${index}`);
      if (start !== undefined) c.start = start;
      if (end !== undefined) c.end = end;
      if (!(c.end > c.start)) throw new Error('a clip must end after it starts');
      t.clips.sort((a, b) => a.start - b.start);
      return t.clips.indexOf(c);
    });
  }
  setClip(trackId, index, fields) {
    return this.edit(`Set clip ${trackId} ${index}`, (s) => {
      const c = (s.tracks.find((x) => x.id === trackId) ?? this.track(trackId)).clips[index];
      if (!c) throw new Error(`${trackId}: no clip ${index}`);
      for (const [k, v] of Object.entries(fields)) { if (v === undefined || v === null || v === '') delete c[k]; else c[k] = clone(v); }
    });
  }
  removeClip(trackId, index) { return this.edit(`Delete clip ${trackId} ${index}`, (s) => { (s.tracks.find((x) => x.id === trackId) ?? this.track(trackId)).clips.splice(index, 1); }); }

  // ---------------------------------------------------------------- shots and markers

  /**
   * Add a shot ({ start, end, name?, camera? }). With a camera, a clip for it goes on the camera track (made if there is
   * none) in the same undo step: one action lays out a shot. → its id
   */
  addShot({ start, end, name, camera, id }) {
    return this.edit(`Add shot ${name ?? ''}`.trim(), (s) => {
      const sid = id ?? uniqueId(`s${s.shots.length + 1}`, new Set(s.shots.map((x) => x.id)));
      s.shots.push({ id: sid, ...(name ? { name } : {}), start, end, ...(camera ? { camera } : {}) });
      s.shots.sort((a, b) => a.start - b.start);
      if (camera) {
        let t = s.tracks.find((x) => x.type === 'camera');
        if (!t) { t = { id: 'cameras', type: 'camera', clips: [] }; s.tracks.unshift(t); }
        t.clips.push({ start, end, camera }); t.clips.sort((a, b) => a.start - b.start);
      }
      if (end > s.duration) s.duration = end;
      return sid;
    });
  }
  /** Move or trim a shot; its camera clip (same span) follows. */
  moveShot(id, { start, end }) {
    return this.edit(`${start !== undefined && end !== undefined ? 'Move' : 'Trim'} shot ${id}`, (s) => {
      const sh = s.shots.find((x) => x.id === id); if (!sh) throw new Error(`no shot "${id}"`);
      const cam = s.tracks.find((x) => x.type === 'camera')?.clips.find((c) => c.start === sh.start && c.end === sh.end && (!sh.camera || c.camera === sh.camera));
      if (start !== undefined) sh.start = start;
      if (end !== undefined) sh.end = end;
      if (!(sh.end > sh.start)) throw new Error('a shot must end after it starts');
      if (cam) { cam.start = sh.start; cam.end = sh.end; }
      s.shots.sort((a, b) => a.start - b.start);
    });
  }
  setShot(id, fields) {
    return this.edit(`Set shot ${id}`, (s) => {
      const sh = s.shots.find((x) => x.id === id); if (!sh) throw new Error(`no shot "${id}"`);
      for (const [k, v] of Object.entries(fields)) { if (v === undefined || v === null || v === '') delete sh[k]; else sh[k] = clone(v); }
    });
  }
  removeShot(id) { return this.edit(`Delete shot ${id}`, (s) => { s.shots = s.shots.filter((x) => x.id !== id); }); }
  addMarker(frame, name) { return this.edit(`Marker ${name} @${frame}`, (s) => { s.markers ??= []; s.markers.push({ frame, name }); s.markers.sort((a, b) => a.frame - b.frame); }); }
  removeMarker(index) { return this.edit('Delete marker', (s) => { s.markers.splice(index, 1); }); }
}
