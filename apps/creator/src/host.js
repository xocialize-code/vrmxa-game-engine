// The creator's engine side, outside Vue (M4 W5). It is the editor's host (apps/editor/src/host.js: the session, the
// sequence preview and scrub through SequencePlayer, the render host on WebGPU or WebGL, export through the shell) with
// what a short adds: a project of shorts, the script pane's model (ScriptDesk: re-scripting as one undo step, hand edits
// kept), the storyboard from @vrmxg/coverage with thumbnails drawn on an offline host, casting a .vrmxa into a role
// (@vrmxg/cast, one undo step), files opened from outside the project, and the render queue.
import { parse, serialize } from '@vrmxg/scene';
import { loadRapier } from '@vrmxg/physics';
import { composeSequence } from '@vrmxg/sequence';
import { EditorSession, RenderQueue, stubRunner } from '@vrmxg/editor-core';
import { deliveryRunner } from './delivery.js';
import { storyboard } from '@vrmxg/coverage';
import { renderThumbnails } from '@vrmxg/coverage/thumbnails';
import { readCharacter, rolesOf } from '@vrmxg/cast';
import * as vrmxaMain from '@vrmxa-core/index.js';
import * as vrmxaVoice from '@vrmxa-core/voice/index.js';
import * as vrmxaPersona from '@vrmxa-core/persona/index.js';
import * as vrmxaCloset from '@vrmxa-core/closet/index.js';
import { EditorHost, SIZES, RATES, CODECS } from '../../editor/src/host.js';
import { inShell, call } from '../../shell/js/shell.js';
import { ScriptDesk, buildShort } from './desk.js';
import { SHORTS_FILE, ShortList, readShorts, shortFor, titlePage, slugOf, kindOf, sceneKind, missingRefs, setForModel, scriptTemplate, placeFile } from './shorts.js';
import { disposeWorld } from './dispose.js';
import { castAndVoice, lazyTTS, projectIO } from './voicing.js';

export { SIZES, RATES, CODECS };
const vrmxa = { ...vrmxaMain, ...vrmxaVoice, ...vrmxaPersona, ...vrmxaCloset };
const APPLY_MS = 700; // the script pane applies this long after typing stops

export class CreatorHost extends EditorHost {
  constructor(canvas, o = {}) {
    super(canvas, o);
    this.shorts = new ShortList(); this.short = null; this.desk = null;
    this.board = null; this.thumbs = {}; this.thumbState = '';
    this._thumbTimer = null; this._thumbHost = null; this._thumbGen = 0; this._thumbChain = Promise.resolve(); this._thumbFor = null;
    this.selectedShot = null; this.lastCast = null; this.lastOpen = null; this.lastSaveAll = null; this.nextSet = null;
    this._applyTimer = null;
    /** job id → { text, set }: the sequence as it was queued */
    this.snapshots = new Map();
    const q = new URLSearchParams(location.search).get('queue');
    this.queue = new RenderQueue({ runner: q === 'stub' ? stubRunner : deliveryRunner(this), onChange: () => this.changed('queue') });
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
    this.shorts = new ShortList(readShorts(project.files, project.has(SHORTS_FILE) ? await project.text(SHORTS_FILE) : null, texts));
    this.short = null; this.desk = null;
    const first = this.shorts.byId(shortId) ?? this.shorts.all[0];
    if (first) await this.openShort(first.id); else await this.newScene();
    this.changed();
  }

  /** The sets a short can film: the project's scenes that aren't sequences or prefabs. */
  sets() { return (this.project?.scenes() ?? []).filter((s) => !s.startsWith('sequences/') && !s.startsWith('prefabs/')); }

  /** Unsaved work the window must ask about before it goes: the sequence, the script, or a short never saved. */
  isDirty() { return !!this.session && (this.session.dirty || !!this.desk?.dirty || (this.short ? !this.short.saved : false)); }

  /** Throw away the open short's unsaved work (the window asked): a short never saved leaves the list. */
  discardChanges() {
    clearTimeout(this._applyTimer);
    if (this.short && !this.short.saved) this.shorts.discard(this.short.id);
  }

  /**
   * Open a short: its sequence (or, the first time, the sequence its script builds), the script beside it, and the
   * preview on its first shot. The window asks about unsaved work before calling this.
   * @param {string} id @param {{ text?: string }} [o] text: the script to use instead of the project's file (opened from elsewhere, or new)
   */
  async openShort(id, { text = null } = {}) {
    const short = this.shorts.byId(id);
    if (!short) throw new Error(`no short ${id}`);
    if (text === null && !short.saved) throw new Error(`${short.title} was never saved: its script is only in memory`);
    if (this.session?.mode === 'playing') this.stop();
    clearTimeout(this._applyTimer);
    if (this.short && this.short.id !== id && !this.short.saved) this.shorts.discard(this.short.id);
    this.busy++; this.changed();
    try {
      const script = text ?? await this.project.text(short.script);
      const marks = short.marks && this.project.has(short.marks) ? JSON.parse(await this.project.text(short.marks)).marks ?? null : null;
      // a saved short's sequence is its own; a draft's id is free of every project file (ShortList.freeId)
      if (short.saved && this.project.has(short.sequence)) await this.openScene(short.sequence);
      else await this.buildNewShort(short, script, marks);
      this.short = short;
      this.desk = new ScriptDesk({ session: this.session, short, marks, text: script });
      if (text !== null) this.desk.saved = null; // opened from elsewhere or new: the project's copy is written on Save
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

  /** Add a draft short and open it; if it can't be opened, it goes again. */
  async openDraft(short, text) {
    this.shorts.addDraft(short);
    try { await this.openShort(short.id, { text }); }
    catch (e) { this.shorts.discard(short.id); throw e; }
    return short.id;
  }

  /** A new short filming a set: a script from the template, its sequence built and opened, unsaved until Save. */
  async newShort(title, setRef = this.nextSet ?? this.sets()[0]) {
    const id = this.shorts.freeId(slugOf(title || 'untitled'), this.project.files);
    const text = scriptTemplate({ title: title || id, set: setRef });
    const short = { ...shortFor(`scripts/${id}.fountain`, { files: this.project.files, text, coverage: 'rule' }), title: title || id, set: setRef };
    return this.openDraft(short, text);
  }

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

  /**
   * Undo, with typing not yet applied: it is applied first (its own step), so Undo takes it back and Redo can bring it
   * again; the apply timer never fires after the undo.
   */
  undo() {
    if (this.desk?.pending) this.applyScript(); else clearTimeout(this._applyTimer);
    return this.session.undo();
  }

  /** Redo. Typing not yet applied is a newer edit: it is applied instead, as typing ends a redo chain anywhere. */
  redo() {
    if (this.desk?.pending) { this.applyScript(); return false; }
    clearTimeout(this._applyTimer);
    return this.session.redo();
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

  /** Thumbnails for the storyboard, drawn a moment after the document settles. */
  scheduleThumbs() {
    clearTimeout(this._thumbTimer);
    this._thumbTimer = setTimeout(() => { this.drawThumbs(); }, 400);
  }

  /**
   * Draw the thumbnails for the document as it is now. Draws run one at a time on the one offline host; a draw that a
   * newer one has overtaken stops at its next step and its pictures are dropped. Each draw's world shares the edit view's
   * read bundles and clips, and is disposed whole when the draw ends (physics, geometries, materials, textures).
   */
  drawThumbs() {
    const s = this.session;
    if (!s?.isSequence || !this.board?.shots.length || s.mode !== 'editing') return this._thumbChain;
    const hash = s.hash();
    if (this._thumbFor === hash) return this._thumbChain;
    this._thumbFor = hash;
    const gen = ++this._thumbGen, text = s.text(), board = this.board;
    this._thumbChain = this._thumbChain.then(() => this._drawThumbs(gen, text, board)).catch((err) => {
      if (gen === this._thumbGen) { this.thumbState = `thumbnails failed: ${err?.message ?? err}`; this.changed('thumbs'); }
    });
    return this._thumbChain;
  }

  async _drawThumbs(gen, text, board) {
    const stale = () => gen !== this._thumbGen;
    if (stale()) return;
    this.thumbState = `drawing ${board.shots.length} thumbnails`; this.changed('thumbs');
    let world = null;
    try {
      world = await this.buildFrom(parse(text), { play: true, heard: false, cache: true });
      if (stale()) return;
      this._thumbHost ??= await this.offlineHost();
      const { thumbs } = await renderThumbnails({ tree: world.tree, host: this._thumbHost, board, width: 320, height: 180, order: 'reverse' });
      if (stale()) return;
      const out = {};
      for (const t of thumbs) out[t.shot] = { url: toDataURL(t.rgba, t.width, t.height), frame: t.frame, hash: t.hash };
      this.thumbs = out;
      this.thumbState = `${thumbs.length} thumbnails`;
      this.changed('thumbs');
    } finally {
      if (world && this._thumbHost?.tree === world.tree) this._thumbHost.detach();
      disposeWorld(world);
    }
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

  /** Put an opened file into the project at `ref` (placeFile: new, the same bytes, or a clash the window asks about). → the ref, or null (cancelled) */
  async placeOpened(ref, bytes, onClash) {
    const p = await placeFile(ref, bytes, { files: this.project.files, read: (r) => this.project.bytes(r), onClash });
    if (!p) return null;
    if (p.write) await this.project.put(p.ref, bytes);
    if (p.replaced) this.characterCache?.sources.delete(p.ref); // the read bundle of the file replaced
    return p;
  }

  /** A character file in the project, read as a cast card through vrmxa-core. */
  async cardFor(ref) { return readCharacter(await this.project.bytes(ref), { ref, vrmxa }); }

  /**
   * The project as @vrmxg/voicing's files (exclusive creates; takes found and reused) and the TTS, asked only when a
   * line has no take: the Mac shell's tts.speak, or a loopback server (?tts=…/speak).
   */
  voicingIO() { return projectIO(this.project, (this._lazyTTS ??= lazyTTS(() => this.voiceProvider()))); }

  /** The TTS: ?tts=…/speak (VRMXG_QUERY in the Mac app), else the shell's tts.speak when this shell has it. */
  async voiceProvider() {
    if (!new URLSearchParams(globalThis.location?.search ?? '').get('tts') && inShell) {
      const info = await call('shell.info');
      if (!info?.methods?.includes('tts.speak')) throw new Error('no TTS voice here: this shell has no tts.speak (launch with VRMXG_QUERY=tts=http://127.0.0.1:5190/speak and tools/tts-server.py)');
    }
    return this.ttsProvider();
  }

  /**
   * Cast a character file into a role: the .vrmxa goes into the project (characters/, asking first if a different file
   * has its name), its card is read from those same bytes through vrmxa-core, and the cast and the re-voicing of the
   * role's lines in the new voice are one undo step (@vrmxg/voicing's rebakeWith through applyCast's rebake). With no
   * TTS here, the takes already in the project serve; lines that would need speaking are cast unvoiced and listed.
   * `session`: the session the step goes through (the agent's marks it, M4 W11).
   */
  async castFile(name, bytes, roleId, { onClash = null, session = this.session } = {}) {
    if (!this.session?.isSequence) throw new Error('open a short to cast it');
    const role = roleId ?? this.roles()[0]?.id;
    if (!role) throw new Error('this short has no roles to cast (no one speaks in its script)');
    const p = await this.placeOpened(`characters/${name}`, bytes, onClash);
    if (!p) return null;
    const card = await readCharacter(bytes, { ref: p.ref, vrmxa });
    const r = await castAndVoice(session, role, card, { io: this.voicingIO() });
    this.lastCast = { role, ref: p.ref, changed: r.changed, label: r.label ?? null, warnings: r.warnings ?? [], title: card.title ?? card.name, file: p.same ? 'same' : p.replaced ? 'replaced' : p.renamed ? 'renamed' : 'new', revoiced: r.voiced ? r.baked ?? 0 : 0 };
    this.changed();
    return this.lastCast;
  }

  // ---------------------------------------------------------------- File › Open

  /** Would opening this script switch to another short (so the window asks about unsaved work first)? */
  scriptOpensOtherShort(name) {
    const s = this.shorts.forScript(`scripts/${slugOf(name)}.fountain`);
    return !(s && s.id === this.short?.id);
  }

  /**
   * A file opened from outside the project: a script opens as a short (the open short's own script re-scripts it as
   * one undo step; another short's opens that short with it; otherwise a new short, unsaved, with a free id); a
   * character is cast into `role`; a set (or a .glb, wrapped in a set scene) joins the project under sets/ as the set
   * New Short films. `onClash(ref)` answers a name the project already holds with different bytes.
   * @param {{ name: string, bytes: Uint8Array }} file @param {{ role?: string, onClash?: Function }} [o]
   */
  async openFile({ name, bytes }, { role = null, onClash = null } = {}) {
    const kind = kindOf(name);
    if (!kind) throw new Error(`${name}: the creator opens scripts (.fountain), characters (.vrmxa) and sets (.vrmxs, .glb)`);
    let result;
    if (kind === 'script') result = await this.openScriptFile(name, new TextDecoder().decode(bytes));
    else if (kind === 'character') { const cast = await this.castFile(name, bytes, role, { onClash }); result = cast ? { cast } : { cancelled: true }; }
    else { const set = await this.addSet(name, bytes, kind, { onClash }); result = set ?? { cancelled: true }; }
    this.lastOpen = { name, kind, ...result };
    this.changed();
    return this.lastOpen;
  }

  async openScriptFile(name, text) {
    const ref = `scripts/${slugOf(name)}.fountain`;
    const own = this.shorts.forScript(ref);
    if (own && this.short?.id === own.id && this.desk) {
      // the open short's script, from elsewhere: re-script the open sequence (one undo step), hand edits kept
      this.desk.saved = null;
      this.desk.text = text;
      return { short: own.id, apply: this.applyScript() };
    }
    if (own) { await this.openShort(own.id, { text }); return { short: own.id }; } // that short, with this text (unsaved)
    const id = this.shorts.freeId(slugOf(name), this.project.files);
    const short = shortFor(`scripts/${id}.fountain`, { files: this.project.files, text });
    await this.openDraft(short, text);
    return { short: id };
  }

  /** A set from elsewhere: under sets/; a .glb gets a set scene beside it. → { set, warnings } or null (cancelled) */
  async addSet(name, bytes, kind, { onClash = null } = {}) {
    const id = slugOf(name);
    if (kind === 'model') {
      const model = await this.placeOpened(`sets/${id}.glb`, bytes, onClash);
      if (!model) return null;
      const scene = new TextEncoder().encode(serialize(setForModel(model.ref, `${id}-set`)));
      const p = await this.placeOpened(`sets/${id}-set.vrmxs`, scene, onClash);
      if (!p) return null;
      this.nextSet = p.ref;
      return { set: p.ref, warnings: [] };
    }
    const doc = parse(new TextDecoder().decode(bytes));
    const k = sceneKind(doc);
    if (k !== 'set') throw new Error(`${name} is a ${k}, not a set: ${k === 'sequence' ? 'a short builds its own sequence from its script' : 'open it in the editor'}`);
    const p = await this.placeOpened(`sets/${id}.vrmxs`, bytes, onClash);
    if (!p) return null;
    this.nextSet = p.ref;
    const missing = missingRefs(doc, this.project.files);
    return { set: p.ref, warnings: missing.length ? [`not in the project, so it won't draw: ${missing.join(', ')}`] : [] };
  }

  // ---------------------------------------------------------------- saving

  /**
   * Save the short: its sequence, its script and the project's shorts.json (saved shorts only). Save As gives it a new
   * name with a free id (a new short beside the old one; a short never saved just takes the new name).
   * → { sequence, script, shorts }
   */
  async saveShort(asTitle = null) {
    if (!this.short) return this.save();
    if (this.desk?.pending) this.applyScript(); // typing not yet applied; an applied script isn't built again (M4 W11)
    if (asTitle) {
      const old = this.short;
      const id = this.shorts.freeId(slugOf(asTitle), this.project.files);
      const short = { ...old, id, title: asTitle, script: `scripts/${id}.fountain`, sequence: `sequences/${id}.vrmxs` };
      this.shorts.addDraft(short);
      if (!old.saved) this.shorts.discard(old.id);
      this.short = this.shorts.byId(id); this.desk.short = this.short; this.desk.saved = null;
      this.session.path = short.sequence;
    }
    const seq = await this.save(this.short.sequence);
    let script = null;
    if (this.desk.dirty || !this.project.has(this.short.script)) { script = await this.project.write(this.short.script, this.desk.text); this.desk.markSaved(); }
    this.short = this.shorts.markSaved(this.short.id); this.desk.short = this.short;
    const shorts = await this.project.write(SHORTS_FILE, this.shorts.manifest());
    this.lastSaveAll = { short: this.short.id, sequence: { ref: this.short.sequence, bytes: seq.bytes, hash: seq.hash }, script: script ? this.short.script : null, shorts: !!shorts, memory: !this.project.writable || !inShell };
    this.changed();
    return this.lastSaveAll;
  }

  /** Change how the open short's cameras are made, and re-script with it (one undo step). */
  setCoverage(mode) {
    if (!this.short || this.short.coverage === mode) return null;
    this.short = this.shorts.update(this.short.id, { coverage: mode });
    this.desk.short = this.short;
    return this.applyScript();
  }

  // ---------------------------------------------------------------- the render queue

  /**
   * Queue the open short as it is now (a snapshot: edits after this don't change the job). M4 W10: a delivery preset
   * renders its extras too; backend draws on that backend instead of the view's; check: 'redraw' draws each frame twice;
   * extras overrides the preset's ({ stills, thumbnails, turntable }); seconds overrides the short's length (a timing run).
   */
  queueShort({ preset = 'draft', name = null, backend = null, check = null, extras = undefined, seconds = undefined } = {}) {
    if (!this.short || !this.session?.isSequence) throw new Error('open a short to queue it');
    // typing not yet applied goes in first; an applied script isn't built again, which would add a step and put a
    // line's re-voiced words back to the script's (M4 W11: found by the agent's session)
    if (this.desk?.pending) this.applyScript();
    const seq = this.session.doc.sequence;
    const job = this.queue.add({ short: this.short.id, title: this.short.title, ref: this.short.sequence, preset, name, seconds: seconds ?? seq.duration / seq.fps, backend, check, ...(extras !== undefined ? { extras } : {}) });
    this.snapshots.set(job.id, { text: this.session.text(), set: this.setScene?.ref ?? null });
    return job;
  }

  /**
   * Let go of the offline hosts the creator keeps between uses (the storyboard's thumbnail host), once its drawing is
   * done, before a render queue job: a 4K render shouldn't share the GPU with idle renderers. The next thumbnails make
   * a new one.
   */
  async releaseOffline() {
    await this._thumbChain;
    const h = this._thumbHost;
    if (!h) return;
    this._thumbHost = null;
    h.dispose(); h.renderer.forceContextLoss?.();
  }

  /** File › Export…: queue the open short at the draft preset and render that job alone. */
  async exportShort() {
    const job = this.queueShort({ preset: 'draft' });
    await this.queue.run({ only: job.id });
    return this.queue.get(job.id);
  }
}

/** RGBA rows (top-down) as a JPEG data URL for an <img>. */
function toDataURL(rgba, width, height) {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength), width, height), 0, 0);
  return c.toDataURL('image/jpeg', 0.85);
}
