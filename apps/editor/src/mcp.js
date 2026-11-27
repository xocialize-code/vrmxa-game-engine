// MCP attached to the open editor (M1 W9, AB-T-0521). `vrmxg-mcp --editor` (engine/packages/mcp) listens on
// 127.0.0.1:5183 for this page: the link polls it, runs each tool call here with @vrmxg/mcp's own handlers over the
// editor, and posts the answer back. Edits go through the editing session's command log, so each one is a step of the
// editor's own Undo ("Undo Add cam-overview (MCP)"); play, stepping, input, interactions and cues act on the play
// world; screenshot is the view as drawn.
import { m0Registry } from '@vrmxg/registry/m0';
import { createHandlers, caller, imageStats } from '@vrmxg/mcp/tools';
import { LiveView } from '@vrmxg/mcp/live';
import { toBase64 } from '@vrmxg/export';
import { loadTemplates } from './projects.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The tools' target over an EditorHost. `app` (M6 W8) is what the app holds beyond the host: the open project's
 * settings (App.vue keeps one ProjectSettings per project, with its undo history and the panel's view), and New
 * Project, which closes the settings panel and opens the new project as File › New Project does.
 * @param {import('./host.js').EditorHost} ed
 * @param {{ settings?: () => Promise<any>, newProject?: (o: { template: any, title: string, id?: string }) => Promise<any>, templates?: () => Promise<any[]> }} [app]
 *   templates: New Project's list (by default the editor's web content's, as the sheet reads it)
 */
export function editorTarget(ed, app = {}) {
  const view = new LiveView();
  view.notRunning = 'not playing: call play with action "play" first';
  const session = () => { if (!ed.session) throw new Error('no scene is open in the editor'); return ed.session; };
  const live = () => {
    const w = ed.playWorld;
    if (!w) throw new Error(view.notRunning);
    if (view.tree !== w.tree) view.attach(w.tree);
    view.director = ed.playDirector ?? null; // M3 W10 (the editor's frame loop pumps it)
    return view;
  };
  return {
    session,
    doc: () => session().doc,
    prefabs: () => session().prefabs,
    apply: (op, label) => session().run(`${label} (MCP)`, [op]), // refused while playing, as the editor's own edits are
    undo: () => session().undo(),
    redo: () => session().redo(),
    async save(r) { return { ...(await ed.save()), warnings: r.warnings }; },
    live,
    async play(action) {
      if (action === 'play') {
        await ed.play();
        if (session().mode !== 'playing') throw new Error(`didn't start playing${ed.error ? `: ${ed.error}` : ''}`);
        return { mode: 'playing', step: ed.playWorld.tree.clock.step };
      }
      if (action === 'stop') return ed.stop() ?? { mode: session().mode };
      const tree = live().live;
      ed.paused = action === 'pause'; // the editor stops stepping; the clock's own pause would freeze the characters
      ed.changed();
      return { paused: ed.paused, step: tree.clock.step };
    },
    // the game as a whole (M5 W9): the project's files as Export Game reads them, and Export Game itself (in the Mac
    // app the shell asks the person for the folder; in a browser the build is checked and hashed only)
    project: () => { if (!ed.project) throw new Error('no project is open in the editor'); return { files: ed.project.files, read: (ref) => ed.project.bytes(ref), truncated: ed.project.truncated === true }; },
    sceneRef: () => ed.sceneRef ?? null,
    unsaved: () => !!session().dirty,
    async exportGame({ name }) {
      const r = await ed.exportGame({ name: name ?? '' });
      if (!r) throw new Error('the export was cancelled (the folder panel was closed, or the window is closing): nothing was written');
      if (r.refused) throw Object.assign(new Error(r.message), { name: 'BuildError', code: r.refused, files: r.files ?? [] });
      const about = { ...r };
      delete about.unsaved; // the tool refuses an export with unsaved changes before it gets here
      return about;
    },
    // M6 W8: building games. The behaviours module the editor loaded (its exports, and why it didn't load or declare)
    behaviours: () => ({ ref: ed.project?.behavioursModule?.ref ?? null, names: ed.project?.behavioursModule ? [...ed.project.behavioursModule.classes.keys()] : null, problems: ed.behaviourProblems ?? [] }),
    ...(app.settings ? { settings: () => app.settings() } : {}),
    /** Open a scene of the project, or a new one (the editor's New Scene, or a copy of `from` saved as the new name). */
    async openScene({ scene, from }) {
      if (!ed.project) throw new Error('no project is open in the editor');
      if (session().mode === 'playing') throw new Error('stop playing first');
      const exists = ed.project.has(scene);
      if (from !== undefined && exists) throw new Error(`${scene} exists already: open it without from, or name a new scene`);
      if (from !== undefined && !ed.project.has(from)) throw new Error(`no scene ${from} to copy`);
      if (exists) await ed.openScene(scene);
      else if (from !== undefined) await ed.copyScene(from, scene);
      else await ed.newScene(scene);
      if (ed.error) throw new Error(ed.error);
      return { open: ed.sceneRef, new: !exists, ...(from !== undefined ? { from } : {}), nodes: session().doc.nodes.length, ...(exists ? {} : { note: 'not saved yet: save writes it; name it in game op=settings scenes for a scene change to reach it' }) };
    },
    templates: () => (app.templates ?? loadTemplates)(),
    ...(app.newProject ? { newProject: (o) => app.newProject(o) } : {}),
    recording: async (ref) => JSON.parse(await ed.project.text(ref)),
    takes: async () => ed.project.takes().filter((f) => f.startsWith('takes/')),
    // the persona service of the play world, or of the editor's own view when not playing (profiles are edited there)
    personas: () => (ed.playWorld ?? ed.edit)?.personas ?? null,
    // Paused: the steps run at once. Playing: the frame loop runs them in real time, and the call returns when it has.
    step: (v, opts) => v.step(opts, async (tree, steps) => {
      if (ed.paused) {
        for (let i = 0; i < steps; i++) while (!tree.step()) await tree.settle();
        ed.host.interpolator.version = -1; // nothing to blend from: show the new step as it is
        return;
      }
      const until = tree.clock.step + steps;
      while (tree.clock.step < until) {
        if (ed.playWorld?.tree !== tree) throw new Error('play stopped');
        if (ed.paused) { while (tree.clock.step < until) while (!tree.step()) await tree.settle(); break; }
        await sleep(8);
      }
    }),
    async screenshot({ width, height, frame }) {
      if (frame === undefined) return { data: toBase64(await ed.stillPNG(width, height)), width, height };
      // a frame of the open sequence (M2 W11): the preview world put on it as an export renders it, then drawn
      const s = await this.sequenceAt(frame);
      const { png, still } = await ed.still(width, height);
      return { data: toBase64(png), width, height, frame: s.frame, hash: s.hash, stats: imageStats(still.rgba) };
    },
    /** The open sequence on a frame (the timeline's scrub: snapshots, exact). */
    async sequenceAt(frame) {
      const s = session();
      if (!s.isSequence) throw new Error('the open scene is not a sequence');
      if (s.mode !== 'editing') throw new Error('stop playing first: frames are shown from the preview world');
      if (!(frame >= 0 && frame <= s.doc.sequence.duration)) throw new Error(`frame: 0 to ${s.doc.sequence.duration}`);
      await ed.scrubTo(frame);
      if (ed.error) throw new Error(ed.error);
      const st = ed.scrubState, tree = ed.preview.world.tree;
      const voice = tree.services.get('voice'), shot = (s.doc.sequence.shots ?? []).find((x) => frame >= x.start && frame < x.end);
      return { frame: st.frame, step: st.step, alpha: st.alpha, restored: st.restored, stepped: st.stepped, ms: st.ms, shot: shot ? `${shot.id}${shot.name ? ` "${shot.name}"` : ''}` : null,
        camera: tree.services.get('cameras')?.current?.id ?? null, virtualCamera: /** @type {any} */ (tree.all().find((n) => n.type === 'CameraBrain'))?.bstate?.live ?? null, speaking: voice ? voice.captions(1).map((c) => `${c.actor}: ${c.text}`) : [], hash: st.hash.slice(0, 16) };
    },
  };
}

/** The page's end of the bridge: poll, run, answer. The creator (M4 W11) brings its own tools (`call`) and name. */
export class McpLink {
  /** @param {import('./host.js').EditorHost} ed @param {{ url?: string, onChange?: () => void, call?: (name: string, args: any) => Promise<any>, app?: string, hello?: () => object, hooks?: Parameters<typeof editorTarget>[1] }} [o] */
  constructor(ed, { url = 'http://127.0.0.1:5183', onChange, call = null, app = 'VRMXG Editor', hello = null, hooks = {} } = {}) {
    this.ed = ed; this.url = `${url.replace(/\/$/, '')}/vrmxg-mcp/exchange`; this.onChange = onChange;
    this.app = app; this.helloInfo = hello;
    this.call = call ?? caller(createHandlers(ed.registry ?? m0Registry(), editorTarget(ed, hooks))); // the editor's: the project's behaviours too (M6 W0)
    this.state = 'off'; this.last = null; this.calls = 0; this.running = false;
    this.id = Math.random().toString(36).slice(2, 10); // which editor this is, so the bridge serves one at a time
  }

  set(state, last = this.last) { if (state !== this.state || last !== this.last) { this.state = state; this.last = last; this.onChange?.(); } }

  async start() {
    if (this.running) return;
    this.running = true;
    let reply = null, hello = true, wait = 1000;
    while (this.running) {
      let msg;
      try {
        const body = JSON.stringify({ editor: this.id, reply, hello: hello ? { app: this.app, project: this.ed.project?.name ?? null, scene: this.ed.sceneRef ?? null, ...(this.helloInfo?.() ?? {}) } : null });
        const res = await fetch(this.url, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' } });
        msg = await res.json();
        reply = null; hello = false; wait = 1000;
        if (msg.taken) { hello = true; this.set('taken', `another ${this.app} has the link`); await sleep(3000); continue; }
        if (this.state === 'off' || this.state === 'taken') this.set('connected', null);
      } catch {
        // no server (yet): try again, slowly; a reply that didn't get through is lost with the server that asked
        reply = null; hello = true;
        this.set('off');
        await sleep(wait); wait = Math.min(5000, wait * 2);
        continue;
      }
      if (!msg.call) continue;
      const { id, name, args } = msg.call;
      this.set('busy', `${name}…`);
      const r = await this.call(name, args);
      this.calls++;
      reply = { id, ...r };
      this.set('connected', `${name}${r.isError ? ' (error)' : ''}`);
      this.ed.changed();
    }
  }

  stop() { this.running = false; }
}
