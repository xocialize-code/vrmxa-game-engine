// The creator's take deck (M4 W9, AB-T-0581): record one character's performance over the open short, then keep it or
// throw it away. Three kinds (@vrmxg/takes): a puppet (keyboard or gamepad), a director (talk to her through
// @vrmxg/director) and a face (the camera).
//
//   Record   builds a take world (the short as it is, the performer cast for the take), steps it to the playhead, and
//            plays on from there in real time with the recorder in it. The film is heard, so a line can be acted to.
//   Stop     (or the film's end) gives the take: a log. Nothing has changed in the short yet.
//   Keep     writes the log into the project (performances/<short>/<take>.json) and adds the take's tracks to the
//            sequence as ONE undo step. Discard forgets it.
//   Remove   takes a kept take's tracks out again: one undo step. Its log stays in the project.
//
// No page APIs here: the page gives the deck its devices, its model and its camera (`env`, host.js), and the host its
// world and its frame loop. Node tests drive the deck with a stand-in creator.
import { parse } from '@vrmxg/scene';
import { installDirector } from '@vrmxg/director';
import { startTake, takeWorldDoc, takeTracks, keepTake, removeTake, takesOf, nextTakeId, takeRef, stepOfFrame, isTake, checkTake, syntheticFace, faceFromFeatures, TAKE_KINDS, FACE_CHANNELS } from '@vrmxg/takes';

export { TAKE_KINDS, FACE_CHANNELS };

/** What each kind asks of the person, for the panel. */
export const TAKE_HELP = {
  puppet: 'W A S D walks (Shift runs, Space jumps), the arrow keys turn her eyes (R gives them back), 1 to 6 play gestures. A gamepad works too.',
  director: 'Type what you tell her and press Say. Her answer (a line, a face, a gesture, somewhere to go) is the take.',
  face: 'Hold a neutral face for a second, then perform: blinks, your mouth, a smile, your brows and your head drive hers.',
};

/**
 * A face source that needs no camera: @vrmxg/takes' synthetic session, given out on the step clock (`?face=synthetic`,
 * the hand test and the browser acceptance).
 */
export function syntheticCamera({ fps = 15, seconds = 9 } = {}) {
  let samples = [], i = 0, push = null;
  return {
    name: 'synthetic',
    async start(onSample, { step }) { samples = syntheticFace({ start: step, seconds, fps }); i = 0; push = onSample; },
    tick(step) { while (push && i < samples.length && samples[i].step <= step) { const { step: at, ...s } = samples[i++]; void at; push(s); } },
    async stop() { push = null; },
  };
}

/**
 * The Mac shell's camera as a face source: `camera.frame` feature frames with the face's shape (shell 0.8.0:
 * camera.start { face: true }), each made a face sample. @param {{ call: Function, on: Function }} shell
 * @param {{ fps?: number, device?: string | null }} [o]
 */
export function shellFaceCamera({ call, on }, { fps = 30, device = null } = {}) {
  let off = null, frames = 0, shaped = 0;
  return {
    name: 'vision',
    get seen() { return { frames, shaped }; },
    async start(onSample) {
      off?.(); frames = 0; shaped = 0;
      off = on('camera.frame', (p) => { frames++; const s = faceFromFeatures(p.frame ?? p); if (s) { shaped++; onSample(s); } });
      return call('camera.start', { fps, face: true, ...(device ? { device } : {}) });
    },
    async stop() { off?.(); off = null; await call('camera.stop').catch(() => {}); },
  };
}

export class TakeDeck {
  /**
   * @param {any} cr the CreatorHost, or a stand-in with: session, short, project, playhead, desk?, applyScript?, setScene,
   *   takeWorld(doc) → world, beginLive(world, tick), endLive(), scrubTo(frame), changed(kind)
   * @param {{ devices?: () => Promise<{ devices: any[], release?: () => void }> | { devices: any[], release?: () => void },
   *   model?: () => Promise<any> | any, camera?: (o: { device?: string | null }) => Promise<any> | any }} [env] the page's side
   */
  constructor(cr, env = {}) {
    this.cr = cr; this.env = env;
    /** 'idle' | 'arming' (building the take world) | 'recording' | 'review' (a take waits to be kept or discarded) */ this.state = 'idle';
    this.kind = 'puppet'; this.target = null;
    /** a face take's channels, and the camera it uses */ this.channels = [...FACE_CHANNELS]; this.device = null;
    this.rec = null; this.world = null; this.director = null; this.camera = null; this.held = null;
    /** the take just recorded, not yet kept */ this.pending = null; this.pendingTracks = [];
    /** what the last keep, discard or remove did, in words */ this.last = '';
    /** what was said to her this take, and what she answered (a director take) */ this.said = [];
    this.from = 0; this.endStep = 0; this._ticks = 0;
  }

  get busy() { return this.state === 'arming' || this.state === 'recording'; }
  get sequenceId() { return this.cr.session?.doc.id ?? null; }

  /** Who can perform: the film's characters. */
  performers() {
    const s = this.cr.session;
    if (!s?.isSequence) return [];
    return [...(this.cr.setScene?.doc.nodes ?? []), ...s.doc.nodes].filter((n) => n.type === 'Character').map((n) => ({ id: n.id, name: n.name ?? n.id }));
  }
  nameOf(id) { return this.performers().find((p) => p.id === id)?.name ?? id; }

  /** The takes kept in the short, each with its log's place in the project. */
  takes() {
    const s = this.cr.session;
    if (!s?.isSequence) return [];
    return takesOf(s.doc.sequence).map((t) => { const ref = takeRef(this.sequenceId, t.id); return { ...t, name: this.nameOf(t.target), log: this.cr.project?.has?.(ref) ? ref : null }; });
  }

  /** Take ids the project already has logs for (a discarded take's id is free again; a kept one's never is). */
  logged() {
    const dir = `performances/${this.sequenceId}/`;
    return (this.cr.project?.files ?? []).filter((f) => f.startsWith(dir) && f.endsWith('.json')).map((f) => f.slice(dir.length, -5));
  }

  /**
   * Record: a take world at the playhead, playing on with the performer live.
   * @param {{ kind?: string, target?: string | null, from?: number }} [o] from: the frame to start at (the playhead)
   */
  async start({ kind = this.kind, target = this.target, from = this.cr.playhead ?? 0 } = {}) {
    const cr = this.cr, s = cr.session;
    if (!s?.isSequence || !cr.short) throw new Error('open a short to record a take');
    if (this.busy) throw new Error('a take is already recording');
    if (this.pending) throw new Error(`keep or discard take ${this.pending.id.replace(/^take-/, '')} first`);
    if (s.mode !== 'editing') throw new Error('stop playing before recording a take');
    if (!TAKE_KINDS.includes(kind)) throw new Error(`a take is one of ${TAKE_KINDS.join(', ')}`);
    const who = this.performers();
    target ??= who[0]?.id ?? null;
    if (!who.some((p) => p.id === target)) throw new Error(`pick who performs: ${who.map((p) => p.id).join(', ') || 'this short has no characters'}`);
    if (cr.desk?.pending) cr.applyScript?.(); // typing not yet applied is part of the film she performs in
    this.kind = kind; this.target = target; this.said = []; this.last = '';
    this.state = 'arming'; cr.changed('take');
    let world = null;
    try {
      const doc = takeWorldDoc(parse(s.text()), { kind, target }), fps = doc.sequence.fps;
      const end = stepOfFrame(doc.sequence.duration, fps);
      let start = stepOfFrame(Math.max(0, Math.floor(from)), fps);
      if (start >= end - 30) start = 0; // the playhead at the film's end: from the top
      world = await cr.takeWorld(doc);
      const tree = world.tree;
      while (tree.clock.step < start) while (!tree.step()) await tree.settle();
      const id = nextTakeId(s.doc.sequence, this.logged());
      this.held = kind === 'puppet' ? await this.env.devices?.() ?? { devices: [] } : null;
      const setup = kind === 'face' ? { channels: FACE_CHANNELS.filter((c) => this.channels.includes(c)) } : {};
      this.rec = startTake(tree, { kind, target, id, fps, sequence: { id: doc.id, hash: s.hash() }, setup, devices: this.held?.devices ?? [] });
      if (kind === 'director') {
        if (!this.env.model) throw new Error('no model to direct with here');
        const model = await this.env.model();
        this.director = installDirector(tree, { model, user: null, userName: 'the director', persona: (n) => world.personas?.forDirector?.(n) ?? null, memory: (n) => world.personas?.memoryOf?.(n) ?? null });
      }
      if (kind === 'face') {
        if (!this.env.camera) throw new Error('no camera here');
        this.camera = await this.env.camera({ device: this.device });
        this.rec.setup.source = this.camera.name;
        await this.camera.start((sample) => this.rec?.pushFace(sample), { step: tree.clock.step });
      }
      this.world = world; this.from = Math.floor(from); this.endStep = end; this._ticks = 0;
      this.state = 'recording';
      cr.beginLive(world, () => this.tick());
    } catch (e) {
      await this.release();
      if (this.rec) { try { this.rec.stop(); } catch { /* the world goes anyway */ } this.rec = null; }
      this.state = 'idle';
      if (world) cr.disposeTakeWorld?.(world);
      cr.changed('take');
      throw e;
    }
    cr.changed('take');
    return this.status();
  }

  /** Each drawn frame of a live take: the director's queue, a step-clocked camera, the playhead, and the film's end. */
  tick() {
    if (this.state !== 'recording') return;
    const tree = this.world.tree, cr = this.cr;
    this.director?.pump();
    this.camera?.tick?.(tree.clock.step);
    cr.playhead = Math.min(this.world.sequence.duration, Math.max(0, this.world.sequence.frameAt(tree.clock.step)));
    if (tree.clock.step >= this.endStep) { this.stop(); return; }
    if (++this._ticks % 6 === 0) cr.changed('take');
  }

  /** Tell her something (a director take). */
  say(text) {
    const t = String(text ?? '').trim();
    if (this.state !== 'recording' || this.kind !== 'director') throw new Error('Say is for a director take while it records');
    if (!t) throw new Error('say something to her');
    this.director.talk(this.target, t);
    this.cr.changed('take');
  }

  /** What was said this take: the director's own record of it (what she was told, and the lines she answered with). */
  conversation() {
    if (!this.director) return this.said;
    return (this.director.history.get(this.target) ?? []).map((m) => ({ who: m.role === 'user' ? 'You' : this.nameOf(this.target), text: m.content }));
  }

  async release() {
    this.held?.release?.(); this.held = null;
    if (this.camera) { try { await this.camera.stop(); } catch { /* it is going anyway */ } }
    this.director = null;
  }

  /** Stop recording. The take waits (review) until it is kept or discarded; one that recorded nothing is dropped. */
  async stop() {
    if (this.state !== 'recording') return null;
    const cr = this.cr, seen = this.camera?.seen ?? null;
    const take = this.rec.stop();
    this.rec = null;
    this.said = this.conversation();
    await this.release();
    this.camera = null;
    cr.endLive();
    this.world = null;
    let tracks = [];
    try { tracks = take ? takeTracks(take).tracks : []; } catch { tracks = []; }
    if (!take || !tracks.length) {
      this.pending = null; this.pendingTracks = []; this.state = 'idle';
      this.last = this.kind === 'face' && seen && !seen.shaped ? `Nothing recorded: the camera sent ${seen.frames} frames and none had a face's shape` : 'Nothing was performed, so there is no take';
    } else {
      this.pending = take; this.pendingTracks = tracks.map((t) => t.id); this.state = 'review';
      this.last = '';
    }
    cr.changed('take');
    await cr.scrubTo?.(this.from);
    return this.pending;
  }

  /** Keep the take: its log into the project, its tracks into the short as one undo step. */
  async keep() {
    const take = this.pending, cr = this.cr;
    if (this.state !== 'review' || !take) throw new Error('no take is waiting to be kept');
    const ref = takeRef(this.sequenceId, take.id);
    await cr.project.write(ref, `${JSON.stringify(take)}\n`); // first: a take whose log couldn't be written isn't kept
    const r = keepTake(cr.session, take, { name: this.nameOf(take.target) });
    this.pending = null; this.pendingTracks = []; this.state = 'idle';
    this.last = `Kept ${r.label}: ${r.tracks.length} tracks, log ${ref}`;
    cr.changed();
    await cr.scrubTo?.(Math.max(0, Math.floor(r.from)));
    return { ...r, log: ref };
  }

  /**
   * The short is going (another short, another project): a take being recorded is stopped and dropped, and one waiting
   * to be kept is forgotten. Nothing was written for either.
   */
  async abandon() {
    if (this.state === 'recording') { try { this.rec?.stop(); } catch { /* its world goes anyway */ } this.rec = null; await this.release(); this.camera = null; this.cr.endLive(); this.world = null; }
    this.pending = null; this.pendingTracks = []; this.said = []; this.last = ''; this.state = 'idle';
  }

  /** Throw the take away: the short is as it was, and nothing was written. */
  discard() {
    if (this.state !== 'review' || !this.pending) throw new Error('no take is waiting');
    this.last = `Discarded take ${this.pending.id.replace(/^take-/, '')}`;
    this.pending = null; this.pendingTracks = []; this.state = 'idle';
    this.cr.changed('take');
  }

  /** Remove a kept take from the short: one undo step (its log stays in the project). */
  remove(id, session = this.cr.session) {
    if (this.busy) throw new Error('stop recording first');
    const r = removeTake(session, id);
    this.last = r.label;
    this.cr.changed();
    return r;
  }

  /**
   * Keep a take from a log in the project (an agent, a take made elsewhere, the hand test): one undo step.
   * @param {string} ref @param {{ session?: any }} [o] session: the session the step goes through (the agent's marks it)
   */
  async applyLog(ref, { session = this.cr.session } = {}) {
    const cr = this.cr;
    if (this.busy) throw new Error('stop recording first');
    if (!cr.project.has(ref)) throw new Error(`${ref} isn't in the project`);
    let take;
    try { take = JSON.parse(await cr.project.text(ref)); } catch { throw new Error(`${ref} isn't JSON`); }
    if (!isTake(take)) throw new Error(`${ref} isn't a take log (format "${take?.format ?? '?'}")`);
    const problems = checkTake(take);
    if (problems.length) throw new Error(`${ref}: ${problems.join('; ')}`);
    const r = keepTake(session, take, { name: this.nameOf(take.target) });
    this.last = `Kept ${r.label} from ${ref}`;
    cr.changed();
    return { ...r, log: ref };
  }

  /** How the deck stands, as plain data for the panel. */
  status() {
    const r = this.rec?.status() ?? null, p = this.pending;
    return {
      state: this.state, kind: this.kind, target: this.target, busy: this.busy, help: TAKE_HELP[this.kind],
      performers: this.performers(), takes: this.takes(), channels: [...this.channels], device: this.device,
      recording: r ? { id: r.id, seconds: r.seconds, steps: r.steps, ...(r.samples !== undefined ? { samples: r.samples, ready: r.ready } : {}), ...(r.events !== undefined ? { events: r.events } : {}) } : null,
      pending: p ? { id: p.id, kind: p.kind, target: p.target, name: this.nameOf(p.target), seconds: Math.round(((p.end - p.start) / 60) * 10) / 10, tracks: [...this.pendingTracks] } : null,
      said: this.conversation().slice(-6), last: this.last,
    };
  }
}

/** The deck's state as one line (the panel's readout, which the hand test reads). */
export function takeLine(st) {
  const n = (id) => id.replace(/^take-/, '');
  if (st.state === 'arming') return `Take: getting ${st.target} ready`;
  if (st.state === 'recording') { const r = st.recording; return `Take ${n(r.id)} recording: ${st.kind}, ${st.target}, ${r.seconds.toFixed(1)} s${r.samples !== undefined ? `, ${r.samples} face samples${r.ready ? '' : ' (hold still)'}` : ''}${r.events !== undefined ? `, ${r.events} events` : ''}`; }
  if (st.state === 'review') { const p = st.pending; return `Take ${n(p.id)} recorded: ${p.kind}, ${p.target}, ${p.seconds.toFixed(1)} s, ${p.tracks.length} tracks; keep or discard`; }
  return st.last ? `Take: ${st.last}` : `Take: ready (${st.takes.length} kept)`;
}
