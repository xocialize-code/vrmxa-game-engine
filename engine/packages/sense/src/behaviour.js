// The `noticeViewer` behaviour (M3 W5): a character that sees the person in front of the camera.
//   { "use": "noticeViewer", "answers": { "wave": "greet", "nod": "nod" }, "say": { "wave": "Hi there!" } }
// When someone appears it looks at them (the viewer node) and smiles; when they leave it looks away; it answers a wave
// and a nod with the animation slots in `answers` (when its set fills them), and says the lines in `say`.
//
// It reacts to the events the sense service applied this step, so a replayed log brings the same reactions back with
// nothing more logged. With a brain (@vrmxg/ai), a reaction runs as the brain's override (its actions started together,
// the tree waiting behind them, as a director's line does), and waits while another override runs; without one, the
// character's actions are called directly. Its queue is state.

import { Behaviour } from '@vrmxg/core';

const DEFAULT_ANSWERS = { wave: 'greet', nod: 'nod' };

export class NoticeViewerBehaviour extends Behaviour {
  ready() { /** reactions waiting for the brain to be free: [[{ do, args }]] */ this.queue = []; /** looking at the viewer */ this.looking = false; }

  reactionsTo(e, viewer) {
    const answers = { ...DEFAULT_ANSWERS, ...(this.params.answers ?? {}) }, say = this.params.say ?? {}, out = [];
    const has = (slot) => !!slot && !!/** @type {any} */ (this.node).graph?.has?.(slot);
    if (e.type === 'presence' && e.present) {
      out.push({ do: 'lookAt', args: { target: viewer } }, { do: 'emote', args: { name: this.params.smile ?? 'happy' } });
      if (say.appeared) out.push({ do: 'say', args: { text: say.appeared, topic: 'greet', to: viewer } });
      this.looking = true;
    } else if (e.type === 'presence') {
      if (this.looking) out.push({ do: 'lookAt', args: {} });
      this.looking = false;
    } else if (e.type in answers || e.type in say) {
      out.push({ do: 'lookAt', args: { target: viewer } });
      this.looking = true;
      if (has(answers[e.type])) out.push({ do: 'gesture', args: { slot: answers[e.type] } });
      if (say[e.type]) out.push({ do: 'say', args: { text: say[e.type], topic: e.type, to: viewer } });
    }
    return out;
  }

  physicsProcess() {
    const sense = this.tree.services.get('sense');
    if (!sense) return;
    for (const e of sense.events) { const r = this.reactionsTo(e, sense.viewerId); if (r.length) this.queue.push(r); }
    if (!this.queue.length) return;
    const brain = /** @type {any} */ (this.node.behaviours.find((b) => b.name === 'brain' && /** @type {any} */ (b).bb));
    if (brain) {
      if (brain.bb.override) return; // the brain is busy with another override (a director's line): wait
      const r = this.queue.shift();
      brain.bb.override = { all: r.map((a) => ({ do: a.do, args: structuredClone(a.args), data: null, status: 'running' })), literal: true };
      return;
    }
    for (const r of this.queue.splice(0)) for (const a of r) this.run(a);
  }

  /** No brain: the character's own actions. */
  run({ do: what, args }) {
    const n = /** @type {any} */ (this.node);
    if (what === 'lookAt') n.lookAt?.(args);
    else if (what === 'emote') n.emote?.(args);
    else if (what === 'gesture') { if (n.graph?.has?.(args.slot)) n.startAction?.(args.slot); }
    else if (what === 'say') n.say?.(args);
  }

  getState() { return { queue: structuredClone(this.queue), looking: this.looking }; }
  setState(s) { this.queue = structuredClone(s.queue); this.looking = s.looking; }
}
