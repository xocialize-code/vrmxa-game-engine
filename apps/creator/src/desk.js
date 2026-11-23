// The script pane's model (M4 W5): the open short's script beside its sequence session. Applying an edited script
// re-scripts the sequence through @vrmxg/script's applyScript, which keeps hand edits and makes the change one undo step;
// a script with errors changes nothing and lists them by line. The pane's text follows undo and redo (ScriptHistory).
// Plain data and an EditorSession: the creator's host wires it to the page, and Node tests drive it on the sample.
import { applyScript, buildSequence, parseScript } from '@vrmxg/script';
import { coverByRule } from '@vrmxg/coverage';
import { ScriptHistory, beatIndex, errorLines } from './shorts.js';

/** The coverage hook a short's setting asks for (undefined: the script's default cameras). */
export const coverageFor = (short) => (short?.coverage === 'rule' ? coverByRule() : undefined);

/**
 * Build a new short's sequence from its script (no session yet). → buildSequence's result
 * @param {string} text @param {{ short: any, set: any, marks?: any }} o
 */
export function buildShort(text, { short, set, marks = null }) {
  return buildSequence(text, { set, marks, id: short.id, source: short.script, coverage: coverageFor(short) });
}

export class ScriptDesk {
  /**
   * @param {{ session: any, short: any, marks?: any, text: string }} o session: an EditorSession on the short's sequence
   *   (with setDoc, as the editor host adopts it); text: the script as saved (or as opened)
   */
  constructor({ session, short, marks = null, text }) {
    this.session = session; this.short = short; this.marks = marks;
    this.history = new ScriptHistory();
    this.text = text;           // what the pane holds
    this.applied = text;        // the text the sequence was last built from
    this.saved = text;          // the text on disk
    this.errors = []; this.warnings = []; this.lastLabel = null;
    this.parsed = parseScript(text, { previous: session.doc.sequence?.script ?? null });
    this.history.record(session.hash(), text);
  }

  /** The script's beats by id (line and text), for the storyboard. */
  beats() { return beatIndex(this.parsed); }

  /** Errors as the pane lists them. */
  errorList() { return errorLines(this.errors); }

  get dirty() { return this.text !== this.saved; }
  /** Typed but not yet applied. */
  get pending() { return this.text !== this.applied; }

  /**
   * Apply the pane's text (or `text`): one undo step when the sequence changes, nothing when the script has errors or
   * builds the same document. `session`: the session the step is made through (the agent's, which marks it: M4 W11).
   * → { ok, changed, label?, errors, warnings }
   * @param {string} [text] @param {{ session?: any }} [o]
   */
  apply(text = this.text, { session = this.session } = {}) {
    this.text = text;
    const r = applyScript(session, text, { marks: this.marks, coverage: coverageFor(this.short) });
    this.errors = r.ok ? [] : r.errors; this.warnings = r.warnings ?? [];
    if (!r.ok) return { ok: false, changed: false, errors: r.errors, warnings: this.warnings };
    this.parsed = r.parsed; this.applied = text;
    this.history.record(this.session.hash(), text);
    if (r.changed) this.lastLabel = r.label;
    return { ok: true, changed: r.changed, label: r.label ?? null, errors: [], warnings: this.warnings, report: r.report };
  }

  /**
   * After the session changed (an undo, a redo, a timeline edit, a cast): a state seen before (undo, redo) brings back
   * the script it was built from; a new state (a hand edit) was built from the applied script, and anything typed but
   * not yet applied stays in the pane. → the pane's text
   */
  follow() {
    const hash = this.session.hash(), t = this.history.textFor(hash);
    if (t === null) { this.history.record(hash, this.applied); return this.text; }
    if (t !== this.applied) {
      this.text = t; this.applied = t; this.errors = [];
      this.parsed = parseScript(t, { previous: this.session.doc.sequence?.script ?? null });
    }
    return this.text;
  }

  /** The script was written to disk. */
  markSaved() { this.saved = this.text; }
}
