// The creator's engine side, outside Vue (M4 W5). It is the editor's host (apps/editor/src/host.js: the session, the
// sequence preview and scrub through SequencePlayer, the render host on WebGPU or WebGL, export through the shell) with
// what a short adds: a project of shorts, the script pane's model (ScriptDesk: re-scripting as one undo step, hand edits
// kept), the storyboard from @vrmxg/coverage with thumbnails drawn on an offline host, casting a .vrmxa into a role
// (@vrmxg/cast, one undo step), files opened from outside the project, and the render queue.
import { parse, serialize } from '@vrmxg/scene';
import { loadRapier } from '@vrmxg/physics';
import { composeSequence } from '@vrmxg/sequence';
import { EditorSession, RenderQueue, stubRunner } from '@vrmxg/editor-core';
import { storyboard } from '@vrmxg/coverage';
import { renderThumbnails } from '@vrmxg/coverage/thumbnails';
import { readCharacter, rolesOf, applyCast } from '@vrmxg/cast';
import * as vrmxaMain from '@vrmxa-core/index.js';
import * as vrmxaVoice from '@vrmxa-core/voice/index.js';
import * as vrmxaPersona from '@vrmxa-core/persona/index.js';
import * as vrmxaCloset from '@vrmxa-core/closet/index.js';
import { EditorHost, SIZES, RATES, CODECS } from '../../editor/src/host.js';
import { inShell } from '../../shell/js/shell.js';
import { ScriptDesk, buildShort } from './desk.js';
import { SHORTS_FILE, readShorts, shortFor, shortsManifest, upsertShort, titlePage, slugOf, kindOf, setForModel, scriptTemplate } from './shorts.js';

export { SIZES, RATES, CODECS };
const vrmxa = { ...vrmxaMain, ...vrmxaVoice, ...vrmxaPersona, ...vrmxaCloset };
const APPLY_MS = 700; // the script pane applies this long after typing stops

/**
 * The creator's runner for the render queue: the open short's sequence through the editor's export (M2 W12), into the
 * shell's AVAssetWriter with its .srt beside it, or as frame hashes in a browser. W10 replaces it with delivery export.
 * @param {CreatorHost} host @returns {import('@vrmxg/editor-core/src/queue.js').Runner}
 */
export function exportRunner(host) {
  return {
    name: inShell ? 'export through the shell (M2 path; W10 adds delivery formats)' : 'frame hashes (a browser: video needs the Mac app)',
    async run(job, { progress }) {
      if (host.short?.id !== job.spec.short) throw new Error(`open ${job.spec.title ?? job.spec.short} to render it (the queue renders the open short)`);
      const seq = host.session.doc.sequence, fps = String(job.spec.fps ?? seq.fps);
      if (!RATES[fps]) throw new Error(`no export rate ${fps}`);
      host._queueProgress = progress;
      try {
        const x = await host.exportVideo({ take: 'sequence', seconds: seq.duration / seq.fps, size: job.spec.size, fps, codec: job.spec.codec, audio: job.spec.audio, name: job.spec.name ?? `${job.spec.short}-${job.spec.size}${fps.replace('.', '')}` });
        return { frames: x.frames, seconds: x.seconds, name: x.name ?? x.began?.name ?? null, path: x.path ?? x.began?.path ?? null, hashesDigest: x.hashesDigest, hashOnly: x.hashOnly, ms: x.ms?.total ?? null, subtitles: x.subs ? { lines: x.subs.lines, path: x.subs.path, error: x.subs.error } : null };
      } finally { host._queueProgress = null; }
    },
  };
}

export class CreatorHost extends EditorHost {
  constructor(canvas, o = {}) {
    super(canvas, o);
    this.shorts = []; this.short = null; this.desk = null;
    this.board = null; this.thumbs = {}; this.thumbState = ''; this._thumbFor = null; this._thumbTimer = null; this._thumbHost = null;
    this.selectedShot = null; this.lastCast = null; this.lastOpen = null; this.lastSaveAll = null; this.nextSet = null;
    this._applyTimer = null;
    const q = new URLSearchParams(location.search).get('queue');
    this.queue = new RenderQueue({ runner: q === 'stub' ? stubRunner : exportRunner(this), onChange: () => this.changed('queue') });
  }

  /** Export progress reaches the running queue job too. */
  changed(kind = 'all') {
    if (kind === 'export' && this.exporting && this._queueProgress) this._queueProgress(this.exporting.n, this.exporting.frames, this.exporting.phase);
    super.changed(kind);
  }

  // ---------------------------------------------------------------- the project of shorts

  /** Open a project: its shorts (shorts.json, or one per scripts/*.fountain), and the first one. */
  async openProject(project, shortId = null) {
    await this.ready;
    this.project = project;
    this.R ??= await loadRapier();
    const texts = {};
    for (const f of project.files.filter((x) => /^scripts\/[^/]+\.fountain$/.test(x))) texts[f] = await project.text(f);
    this.shorts = readShorts(project.files, project.has(SHORTS_FILE) ? await project.text(SHORTS_FILE) : null, texts);
    this.short = null; this.desk = null;
    const first = this.shorts.find((s) => s.id === shortId) ?? this.shorts[0];
    if (first) await this.openShort(first.id); else await this.newScene();
    this.changed();
  }

  /** The sets a short can film: the project's scenes that aren't sequences or prefabs. */
  sets() { return (this.project?.scenes() ?? []).filter((s) => !s.startsWith('sequences/') && !s.startsWith('prefabs/')); }

  /**
   * Open a short: its sequence (or, the first time, the sequence its script builds), the script beside it, and the
   * preview at frame 0 through the shot camera.
   * @param {string} id @param {{ text?: string }} [o] text: the script to use instead of the project's file (opened from elsewhere)
   */
  async openShort(id, { text = null } = {}) {
    const short = this.shorts.find((s) => s.id === id);
    if (!short) throw new Error(`no short ${id}`);
    if (this.session?.mode === 'playing') this.stop();
    clearTimeout(this._applyTimer);
    this.busy++; this.changed();
    try {
      const script = text ?? await this.project.text(short.script);
      const marks = short.marks && this.project.has(short.marks) ? JSON.parse(await this.project.text(short.marks)).marks ?? null : null;
      if (this.project.has(short.sequence)) await this.openScene(short.sequence);
      else await this.buildNewShort(short, script, marks);
      this.short = short;
      this.desk = new ScriptDesk({ session: this.session, short, marks, text: script });
      if (text !== null) this.desk.saved = null; // opened from elsewhere: the project's copy is written on Save
      // the script as it is now builds the sequence (one undo step if it changed since the sequence was saved)
      if (this.session.isSequence) this.desk.apply();
      this.board = this.session.isSequence ? storyboard(this.session.doc, { set: this.setScene?.doc ?? null }) : null;
      this.thumbs = {}; this._thumbFor = null; this.selectedShot = null;
    } finally { this.busy--; this.changed(); }
    // the first view: the first shot at its thumbnail frame, as the storyboard shows it
    if (this.session.isSequence) { this.scrubTo(this.board?.shots[0]?.frame ?? 0); this.scheduleThumbs(); }
  }

  /** A short with no sequence yet: build it from the script and open it unsaved (an empty sequence when the script has errors). */
  async buildNewShort(short, script, marks) {
    const setRef = short.set ?? titlePage(script).set ?? this.sets()[0];
    if (!setRef || !this.project.has(setRef)) throw new Error(`${short.script}: its set ${setRef ?? '(none named)'} isn't in the project (Set: on the title page)`);
    const set = parse(await this.project.text(setRef));
    const r = buildShort(script, { short, set, marks });
    if (!r.ok) { await this.newSequence(short.sequence, setRef); return; } // the pane lists the errors; fixing them builds it
    await this.openDoc(short.sequence, r.doc);
  }

  /** Open a document as a new, unsaved session (a sequence built from a script). */
  async openDoc(ref, doc) {
    if (this.session?.mode === 'playing') this.stop();
    this.busy++; this.changed();
    try {
      await this.loadSet(doc);
      const prefabs = await this.project.prefabs(this.setScene ? composeSequence(doc, this.setScene.doc) : doc);
      this.session = new EditorSession({ registry: this.registry, doc, prefabs, path: ref });
      this.session.savedText = '';
      this.sceneRef = ref;
      this.adoptSession();
      this.session.on((e) => this.onSession(e));
      this.edit = null;
      await this.rebuild();
      this.frameAll();
    } finally { this.busy--; this.changed(); }
  }

  /** A new short filming a set: a script from the template, its sequence built and opened (saved on Save). */
  async newShort(title, setRef = this.nextSet ?? this.sets()[0]) {
    const id = this.uniqueShortId(slugOf(title || 'untitled'));
    const text = scriptTemplate({ title: title || id, set: setRef });
    const short = { ...shortFor(`scripts/${id}.fountain`, { files: this.project.files, text, coverage: 'rule' }), title: title || id, set: setRef };
    this.shorts = upsertShort(this.shorts, short);
    await this.openShort(id, { text });
    return id;
  }

  uniqueShortId(base) { let id = base, n = 2; while (this.shorts.some((s) => s.id === id)) id = `${base}-${n++}`; return id; }

  // ---------------------------------------------------------------- the script pane

  /** The pane's text changed: apply it once typing stops. */
  editScript(text) {
    if (!this.desk) return;
    this.desk.text = text;
    clearTimeout(this._applyTimer);
    this._applyTimer = setTimeout(() => this.applyScript(), APPLY_MS);
    this.changed('script');
  }

  /** Apply the pane's text now: one undo step when the sequence changes. */
  applyScript() {
    clearTimeout(this._applyTimer);
    if (!this.desk || !this.session?.isSequence || this.session.mode !== 'editing') return null;
    const r = this.desk.apply();
    this.changed();
    return r;
  }

  /** After any edit, undo or redo: the script pane, the storyboard and its thumbnails follow the document. */
  onSession(e) {
    super.onSession(e);
    if (e.kind === 'select' || e.kind === 'play' || e.kind === 'stop' || e.kind === 'save') return;
    if (this.desk && this.session.isSequence) {
      this.desk.follow();
      this.board = storyboard(this.session.doc, { set: this.setScene?.doc ?? null });
      this.scheduleThumbs();
    }
  }

  // ---------------------------------------------------------------- the storyboard

  /** Pick a shot on the strip: scrub to its thumbnail frame. */
  pickShot(id, frame) { this.selectedShot = id; this.scrubTo(frame); this.changed('timeline'); }

  /** Thumbnails for the storyboard, drawn a moment after the document settles (a world of its own on an offline host). */
  scheduleThumbs() {
    clearTimeout(this._thumbTimer);
    this._thumbTimer = setTimeout(() => this.drawThumbs().catch((err) => { this.thumbState = `thumbnails failed: ${err?.message ?? err}`; this.changed('thumbs'); }), 400);
  }

  async drawThumbs() {
    const s = this.session;
    if (!s?.isSequence || !this.board?.shots.length || s.mode !== 'editing') return;
    const hash = s.hash();
    if (this._thumbFor === hash) return;
    this._thumbFor = hash;
    const board = this.board;
    this.thumbState = `drawing ${board.shots.length} thumbnails`; this.changed('thumbs');
    const world = await this.buildFrom(parse(s.text()), { play: true, heard: false });
    if (this._thumbFor !== hash) return; // the document changed meanwhile: a newer draw is coming
    this._thumbHost ??= await this.offlineHost();
    const { thumbs } = await renderThumbnails({ tree: world.tree, host: this._thumbHost, board, width: 320, height: 180, order: 'reverse' });
    this._thumbHost.detach?.();
    world.audio?.dispose?.();
    if (this._thumbFor !== hash) return;
    const out = {};
    for (const t of thumbs) out[t.shot] = { url: toDataURL(t.rgba, t.width, t.height), frame: t.frame, hash: t.hash };
    this.thumbs = out;
    this.thumbState = `${thumbs.length} thumbnails`;
    this.changed('thumbs');
  }

  // ---------------------------------------------------------------- casting

  /** The roles the short's script casts, with who plays each. */
  roles() {
    if (!this.session?.isSequence) return [];
    const cast = this.session.doc.sequence.roles ?? {};
    return rolesOf(this.session.doc, { set: this.setScene?.doc ?? null }).map((r) => {
      const c = cast[r.id];
      return { id: r.id, cue: r.cue, lines: r.lines.length, asset: c?.character?.ref ?? null, name: c?.character?.name ?? null, voice: c?.voice ? `${c.voice.preset ?? c.voice.id ?? '?'}` : null };
    });
  }

  /**
   * Cast a character file into a role: the .vrmxa goes into the project (characters/), its card is read through
   * vrmxa-core, and the cast is one undo step. W7 (voicing) adds the re-bake of the role's lines to the same step.
   */
  async castFile(name, bytes, roleId) {
    if (!this.session?.isSequence) throw new Error('open a short to cast it');
    const role = roleId ?? this.roles()[0]?.id;
    if (!role) throw new Error('this short has no roles to cast (no one speaks in its script)');
    const ref = `characters/${name}`;
    if (!this.project.has(ref)) await this.project.put(ref, bytes);
    const card = await readCharacter(bytes, { ref, vrmxa });
    const r = await applyCast(this.session, role, card);
    this.lastCast = { role, ref, changed: r.changed, label: r.label ?? null, warnings: r.warnings ?? [], title: card.title ?? card.name };
    this.changed();
    return this.lastCast;
  }

  // ---------------------------------------------------------------- File › Open

  /**
   * A file opened from outside the project: a script opens as a short (its own, if the project has one by that name,
   * re-scripted from the opened text as one undo step); a character is cast into `role`; a set (or a .glb, wrapped in a
   * set scene) joins the project as the set New Short films.
   * @param {{ name: string, bytes: Uint8Array }} file @param {{ role?: string }} [o]
   */
  async openFile({ name, bytes }, { role = null } = {}) {
    const kind = kindOf(name);
    if (!kind) throw new Error(`${name}: the creator opens scripts (.fountain), characters (.vrmxa) and sets (.vrmxs, .glb)`);
    let result;
    if (kind === 'script') result = await this.openScriptFile(name, new TextDecoder().decode(bytes));
    else if (kind === 'character') result = { cast: await this.castFile(name, bytes, role) };
    else result = { set: await this.addSet(name, bytes, kind) };
    this.lastOpen = { name, kind, ...result };
    this.changed();
    return this.lastOpen;
  }

  async openScriptFile(name, text) {
    const ref = `scripts/${slugOf(name)}.fountain`;
    let short = this.shorts.find((s) => s.script === ref);
    if (!short) {
      short = shortFor(ref, { files: this.project.files, text });
      this.shorts = upsertShort(this.shorts, short);
    }
    if (this.short?.id === short.id && this.desk) {
      // the open short's script, from elsewhere: re-script the open sequence (one undo step), hand edits kept
      this.desk.saved = null;
      this.desk.text = text;
      return { short: short.id, apply: this.applyScript() };
    }
    await this.openShort(short.id, { text });
    return { short: short.id };
  }

  async addSet(name, bytes, kind) {
    const id = slugOf(name);
    if (kind === 'model') {
      const model = `sets/${id}.glb`;
      if (!this.project.has(model)) await this.project.put(model, bytes);
      const ref = `${id}-set.vrmxs`;
      if (!this.project.has(ref)) await this.project.write(ref, serialize(setForModel(model, `${id}-set`)));
      this.nextSet = ref;
      return ref;
    }
    const ref = `${id}.vrmxs`;
    if (!this.project.has(ref)) await this.project.put(ref, bytes);
    this.nextSet = ref;
    return ref;
  }

  // ---------------------------------------------------------------- saving

  /**
   * Save the short: its sequence, its script and the project's shorts.json. Save As gives it a new name (a new short
   * beside the old one). → { sequence, script, shorts }
   */
  async saveShort(asTitle = null) {
    if (!this.short) return this.save();
    this.applyScript();
    if (asTitle) {
      const id = this.uniqueShortId(slugOf(asTitle));
      const short = { ...this.short, id, title: asTitle, script: `scripts/${id}.fountain`, sequence: `sequences/${id}.vrmxs` };
      this.shorts = upsertShort(this.shorts, short);
      this.short = short; this.desk.short = short; this.desk.saved = null;
      this.session.path = short.sequence;
    }
    const seq = await this.save(this.short.sequence);
    let script = null;
    if (this.desk.dirty || !this.project.has(this.short.script)) { script = await this.project.write(this.short.script, this.desk.text); this.desk.markSaved(); }
    const shorts = await this.project.write(SHORTS_FILE, shortsManifest(this.shorts));
    this.lastSaveAll = { short: this.short.id, sequence: { ref: this.short.sequence, bytes: seq.bytes, hash: seq.hash }, script: script ? this.short.script : null, shorts: !!shorts, memory: !this.project.writable || !inShell };
    this.changed();
    return this.lastSaveAll;
  }

  /** Change how the open short's cameras are made, and re-script with it (one undo step). */
  setCoverage(mode) {
    if (!this.short || this.short.coverage === mode) return null;
    this.short = { ...this.short, coverage: mode };
    this.shorts = upsertShort(this.shorts, this.short);
    this.desk.short = this.short;
    return this.applyScript();
  }

  // ---------------------------------------------------------------- the render queue

  /** Queue the open short. */
  queueShort({ preset = 'draft', name = null } = {}) {
    if (!this.short || !this.session?.isSequence) throw new Error('open a short to queue it');
    const seq = this.session.doc.sequence;
    return this.queue.add({ short: this.short.id, title: this.short.title, ref: this.short.sequence, preset, name, seconds: seq.duration / seq.fps });
  }
}

/** RGBA rows (top-down) as a JPEG data URL for an <img>. */
function toDataURL(rgba, width, height) {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength), width, height), 0, 0);
  return c.toDataURL('image/jpeg', 0.85);
}
