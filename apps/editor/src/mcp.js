// MCP attached to the open editor (M1 W9, AB-T-0521). `vrmxg-mcp --editor` (engine/packages/mcp) listens on
// 127.0.0.1:5183 for this page: the link polls it, runs each tool call here with @vrmxg/mcp's own handlers over the
// editor, and posts the answer back. Edits go through the editing session's command log, so each one is a step of the
// editor's own Undo ("Undo Add cam-overview (MCP)"); play, stepping, input, interactions and cues act on the play
// world; screenshot is the view as drawn.
import { m0Registry } from '@vrmxg/registry/m0';
import { createHandlers, caller, imageStats } from '@vrmxg/mcp/tools';
import { LiveView } from '@vrmxg/mcp/live';
import { toBase64 } from '@vrmxg/export';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The tools' target over an EditorHost. @param {import('./host.js').EditorHost} ed */
export function editorTarget(ed) {
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
  /** @param {import('./host.js').EditorHost} ed @param {{ url?: string, onChange?: () => void, call?: (name: string, args: any) => Promise<any>, app?: string, hello?: () => object }} [o] */
  constructor(ed, { url = 'http://127.0.0.1:5183', onChange, call = null, app = 'VRMXG Editor', hello = null } = {}) {
    this.ed = ed; this.url = `${url.replace(/\/$/, '')}/vrmxg-mcp/exchange`; this.onChange = onChange;
    this.app = app; this.helloInfo = hello;
    this.call = call ?? caller(createHandlers(m0Registry(), editorTarget(ed)));
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
