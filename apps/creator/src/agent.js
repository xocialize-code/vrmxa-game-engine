// What an agent can do in the creator (M4 W11, AB-T-0583; M4 check 9): the creator's commands, each with a JSON Schema,
// in @vrmxg/mcp's CommandRegistry, and the target the short tools (@vrmxg/mcp/shorts) read and act on. Every command
// that edits makes one step of the creator's own Undo through the agent's session (asAgent), so the step is named for
// the agent: "Recast HANA: Hana → Mira (MCP)". No page APIs here: the page wires rendering (src/mcp.js), and Node tests
// drive the same commands on the sample short with a stand-in creator.
import { CommandRegistry, asAgent, asContent, CONTENT_NOTE } from '@vrmxg/mcp/shorts';
import { rolesOf, lineId, KOKORO_PRESETS } from '@vrmxg/cast';
import { replaceShotCamera, cameraOnRig, findShot, storyboard, allNodes } from '@vrmxg/coverage';
import { RIGS } from '@vrmxg/camera/rigs';
import { PRESETS } from '@vrmxg/editor-core';
import { applyScript } from '@vrmxg/script';
import { castAndVoice, revoice } from './voicing.js';
import { coverageFor } from './desk.js';

const TEXT_FILES = /\.(fountain|json|vrmxs|md|txt|srt|js)$/i;
const VOICES = { type: 'string', enum: [...KOKORO_PRESETS], description: 'A Kokoro voice preset.' };

/**
 * The creator's commands. `ctx` is { cr, session } (the creator, and its session marked as the agent's).
 * @returns {CommandRegistry}
 */
export function creatorCommands() {
  const reg = new CommandRegistry();
  reg.register('write_script', {
    summary: 'Replace the short\'s whole script (Fountain) and re-script the sequence: one undo step, hand edits kept.',
    schema: { type: 'object', required: ['text'], properties: { text: { type: 'string', minLength: 1, description: 'The whole script, title page included.' } } },
    run: ({ text }, ctx) => rescript(ctx, () => text),
  });
  reg.register('patch_script', {
    summary: 'Change parts of the script by exact find and replace (each find must occur once), then re-script: one undo step.',
    schema: { type: 'object', required: ['edits'], properties: { edits: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'object', required: ['find', 'replace'], additionalProperties: false, properties: {
      find: { type: 'string', minLength: 1, description: 'Text in the script now, exactly, found once.' }, replace: { type: 'string' } } } } } },
    run: ({ edits }, ctx) => rescript(ctx, (text) => edits.reduce((t, e, i) => {
      const at = t.indexOf(e.find);
      if (at < 0) throw new Error(`edits[${i}]: "${short(e.find)}" isn't in the script (short part=script gives its text)`);
      if (t.indexOf(e.find, at + 1) >= 0) throw new Error(`edits[${i}]: "${short(e.find)}" is in the script more than once: include more of its line`);
      return t.slice(0, at) + e.replace + t.slice(at + e.find.length);
    }, text)),
  });
  reg.register('recast', {
    summary: 'Cast a character file (.vrmxa in the project) into a role, keeping the performance; the role\'s lines are re-voiced in the new voice in the same undo step.',
    schema: { type: 'object', required: ['role', 'character'], properties: {
      role: { type: 'string', description: 'The role: its cue (HANA) or node id (short part=roles).' },
      character: { type: 'string', description: 'A project ref, e.g. characters/mira.vrmxa (read dir=characters).' },
      voice: VOICES, outfit: { type: 'string', description: 'An outfit id from the character\'s wardrobe.' } } },
    async run({ role, character, voice, outfit }, { cr, session }) {
      if (!/\.vrmxa$/i.test(character) || !cr.project.has(character)) throw new Error(`${character}: not a .vrmxa in the project (${cr.project.files.filter((f) => f.endsWith('.vrmxa')).join(', ') || 'none'})`);
      const card = await cr.cardFor(character);
      const r = await castAndVoice(session, role, card, { io: cr.voicingIO(), ...(voice ? { voice } : {}), ...(outfit ? { outfit } : {}) });
      cr.lastCast = { role, ref: character, changed: r.changed, label: r.label ?? null, warnings: r.warnings ?? [], title: card.title ?? card.name, file: 'same' };
      return { changed: r.changed, label: r.label ?? null, voice: r.role?.voice?.preset ?? null, revoiced: r.voiced ? r.baked ?? 0 : 0, warnings: r.warnings ?? [] };
    },
  });
  reg.register('revoice', {
    summary: 'Voice lines again: one line (with new words if given), one role\'s lines, or all; another voice or a new take. One undo step, none if nothing changes.',
    description: 'Select with one of line (an id from short part=lines), role (cue or node id) or all; with none, the lines not yet voiced in their role\'s voice. text: new words for the one line. voice: speak in this voice instead. new_take: speak again even when a take exists (a take is reused otherwise).',
    schema: { type: 'object', properties: {
      line: { type: 'string', description: 'A line id, e.g. cafe-order-mira-says-2.' }, role: { type: 'string' }, all: { type: 'boolean' },
      text: { type: 'string', minLength: 1, description: 'New words (with line only).' }, voice: VOICES, new_take: { type: 'boolean' } } },
    async run({ line, role, all, text, voice, new_take: newTake }, { cr, session }) {
      if ([line, role, all].filter((x) => x !== undefined && x !== false).length > 1) throw new Error('select with one of line, role or all');
      const select = line !== undefined ? { line, ...(text !== undefined ? { text } : {}) } : role !== undefined ? { role } : all ? { all: true } : {};
      if (text !== undefined && line === undefined) throw new Error('text gives new words to one line: select it with line');
      if (text !== undefined && cr.desk) return rewordLine({ cr, session }, { line, text, voice, newTake: !!newTake });
      const r = await revoice(session, select, { io: cr.voicingIO(), voice, newTake: !!newTake, set: cr.setScene?.doc ?? null });
      return { changed: r.changed, label: r.label, lines: r.lines.map((l) => `${l.id} (${l.voice})`), spoken: r.baked, warnings: r.warnings };
    },
  });
  reg.register('shot_camera', {
    summary: 'Put a camera on a shot: an existing virtual camera, or a new one on a rig preset. One undo step; the camera stays through re-scripts.',
    description: 'shot: id or number ("030"). camera: an existing VirtualCamera id (short part=cameras). Or rig (a preset) with target or targets, and optionally p (position [x,y,z]), lens ({ focalLength mm, fStop, dutch }), id and name: a new camera for this shot.',
    schema: { type: 'object', required: ['shot'], properties: {
      shot: { type: 'string' }, camera: { type: 'string' }, rig: { type: 'string', enum: Object.keys(RIGS) },
      target: { type: 'string', description: 'Who it frames (a role\'s node id).' }, targets: { type: 'array', minItems: 1, items: { type: 'string' } },
      p: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number' } }, lens: { type: 'object' }, id: { type: 'string' }, name: { type: 'string' } } },
    run({ shot, camera, rig, target, targets, p, lens, id, name }, { session }) {
      if (!camera === !rig) throw new Error('give camera (an existing one) or rig (a new one), not both');
      let cam = camera;
      if (rig) {
        const sh = findShot(session.doc.sequence, shot), taken = new Set([...allNodes(session.setDoc ?? null), ...allNodes(session.doc)].map((n) => n.id));
        const base = id ?? `vc-${sh.name ?? sh.id}-${rig}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
        let nid = base;
        if (!id) for (let n = 2; taken.has(nid); n++) nid = `${base}-${n}`;
        cam = cameraOnRig({ id: nid, rig, name: name ?? `${sh.name ?? sh.id}, ${rig}`, p, target, targets, props: lens ? { lens } : {} });
      }
      const r = replaceShotCamera(session, shot, cam);
      return { changed: true, label: r.label, shot: r.shot, camera: r.camera, previous: r.previous };
    },
  });
  reg.register('take', {
    summary: 'Performance takes (a puppet, a director or a face, recorded by a person): list them, keep one from its log in the project, or remove one. Keeping or removing is one undo step.',
    description: 'op: list (the takes kept in the short, and the take logs under performances/); apply (log: a take log\'s project ref, e.g. performances/the-regular/take-1.json: its tracks are added after the short\'s own, marked with the take); remove (id: a kept take, e.g. take-1: its tracks go, its log stays). A take\'s tracks are ordinary tracks: read them with short part=outline, edit them in the creator.',
    schema: { type: 'object', required: ['op'], properties: { op: { type: 'string', enum: ['list', 'apply', 'remove'] }, log: { type: 'string', description: 'A take log in the project (op apply).' }, id: { type: 'string', description: 'A kept take\'s id (op remove).' } } },
    async run({ op, log, id }, { cr, session }) {
      const deck = cr.takes;
      if (!deck) throw new Error('this creator has no take deck');
      if (op === 'list') return { takes: deck.takes().map((t) => ({ id: t.id, kind: t.kind, who: t.target, from: Math.round(t.from), to: Math.round(t.to), tracks: t.tracks, log: t.log })), logs: cr.project.files.filter((f) => /^performances\/.+\.json$/.test(f)), changed: false };
      if (op === 'apply') {
        if (!log) throw new Error('apply needs log: a take log in the project (take op=list gives them)');
        const r = await deck.applyLog(log, { session });
        return { changed: true, label: r.label, take: r.take, tracks: r.tracks, from: Math.round(r.from), to: Math.round(r.to) };
      }
      if (!id) throw new Error('remove needs id: a kept take (take op=list gives them)');
      const r = deck.remove(id, session);
      return { changed: true, label: r.label, take: r.take };
    },
  });
  reg.register('queue_export', {
    edit: false,
    summary: 'Queue the short, as it is now, in the render queue at a delivery preset; run: true renders that job now.',
    schema: { type: 'object', properties: { preset: { type: 'string', enum: Object.keys(PRESETS) }, name: { type: 'string', description: 'The file name (no extension).' }, run: { type: 'boolean' } } },
    async run({ preset = 'draft', name = null, run = false }, { cr }) {
      const job = cr.queueShort({ preset, name });
      if (run) await cr.queue.run({ only: job.id });
      return { job: jobOf(cr.queue.get(job.id) ?? job), queued: cr.queue.jobs.length };
    },
  });
  reg.register('save', {
    edit: false,
    summary: 'Save the short: its sequence, its script and shorts.json (in memory when the project is read-only).',
    schema: { type: 'object', properties: {} },
    async run(_, { cr }) { return cr.saveShort(); },
  });
  return reg;
}

/** Re-script with new text from the pane's (the person's typing is applied first, as their own step). */
function rescript({ cr, session }, change) {
  if (cr.desk?.pending) cr.applyScript();
  const desk = cr.desk;
  if (!desk) throw new Error('no short is open');
  const before = desk.text, text = change(before);
  const r = desk.apply(text, { session });
  if (!r.ok) {
    desk.text = before; desk.errors = [];
    throw new Error(`the script has errors, so nothing changed:\n${r.errors.map((e) => `line ${e.line ?? '?'}: ${e.message ?? e}`).join('\n')}`);
  }
  return { changed: r.changed, label: r.label, warnings: r.warnings, report: r.report };
}

/**
 * New words for one line of a script's short. The words are the script's (@vrmxg/script rule 7: a re-script would put
 * the old ones back), so the line is reworded in the script, the sequence re-scripted, and the line voiced in its new
 * words, all as one undo step. The line's gesture tags go with its old words (a warning lists them).
 */
async function rewordLine({ cr, session }, { line, text, voice, newTake }) {
  if (cr.desk.pending) cr.applyScript(); // the person's typing first, as their own step
  const desk = cr.desk, doc = session.doc, setDoc = session.setDoc ?? null, opened = session.hash();
  const l = rolesOf(doc, { set: setDoc }).flatMap((r) => r.lines).find((x) => lineId(doc, x.track, x.index) === line);
  if (!l) throw new Error(`no line "${line}" (short part=lines gives their ids)`);
  const beat = (desk.parsed?.beats ?? []).find((b) => b.kind === 'line' && b.id === String(l.src ?? '').split('#')[0]);
  if (!beat) throw new Error(`${line} isn't a line of the script, so its words can't change here`);
  const rows = desk.text.split('\n'), warnings = [];
  const said = []; // the dialogue rows: after the cue, not parentheticals
  for (let i = beat.line; i < (beat.endLine ?? beat.line); i++) if (!/^\s*\(.*\)\s*$/.test(rows[i]) && rows[i].trim()) said.push(i);
  if (!said.length) throw new Error(`${line}: its words weren't found in the script at line ${beat.line}`);
  const tags = said.flatMap((i) => rows[i].match(/\[\[[^\]]*\]\]/g) ?? []);
  if (tags.length) warnings.push(`the old words' tags went with them: ${tags.join(' ')}`);
  const script = [...rows.slice(0, said[0]), text.replace(/\s*\n\s*/g, ' ').trim(), ...rows.slice(said.at(-1) + 1)].join('\n');
  // the re-script and the voicing, each made on a copy, then run as one step
  let ops = [], next = doc;
  const shadow = { get doc() { return next; }, setDoc, isSequence: true, run: (_, o) => { ops = [...ops, ...o]; } };
  const rs = applyScript(shadow, script, { marks: desk.marks, coverage: coverageFor(cr.short) });
  if (!rs.ok) throw new Error(`the reworded script has errors, so nothing changed:\n${rs.errors.map((e) => `line ${e.line}: ${e.message}`).join('\n')}`);
  if (rs.changed) next = rs.doc;
  const vr = await revoice(shadow, { line }, { io: cr.voicingIO(), voice, newTake, set: setDoc });
  if (session.hash() !== opened) throw new Error('the short changed while the line was voicing; re-voice it again');
  const label = `Voice line "${short(text)}" (new words)`;
  desk.text = script; desk.applied = script; desk.parsed = rs.parsed; desk.errors = []; // the pane follows the step
  session.run(label, ops);
  return { changed: true, label, lines: vr.lines.map((x) => `${x.id} (${x.voice})`), spoken: vr.baked, script: `line ${said[0] + 1} reworded`, warnings: [...warnings, ...(rs.warnings ?? []), ...vr.warnings] };
}

const short = (s) => (s.length > 60 ? `${s.slice(0, 57)}…` : s);
const jobOf = (j) => ({ id: j.id, label: j.label, state: j.state, progress: j.progress, error: j.error, result: j.result ?? null });

/**
 * The short tools' target over the creator. `render({ frame, width, height })` is the page's (it draws).
 * @param {any} cr a CreatorHost (or a stand-in with its session, desk, short, project, queue and methods)
 * @param {{ render?: (o: { frame: number, width: number, height: number }) => Promise<any>, commands?: CommandRegistry }} [o]
 */
export function creatorTarget(cr, { render = null, commands = creatorCommands() } = {}) {
  const session = () => { if (!cr.session?.isSequence || !cr.short) throw new Error('no short is open in the creator'); return cr.session; };
  const setDoc = () => cr.setScene?.doc ?? null;
  return {
    commands,
    context: () => { if (cr.takes?.busy) throw new Error('a take is being recorded in the creator: the short can\'t be edited until it is stopped'); return { cr, session: asAgent(session()) }; },
    history: () => (cr.session ? cr.session.history() : { undo: null, redo: null, undoDepth: 0, redoDepth: 0 }),
    async undo() { session(); const ok = cr.undo(); cr.changed?.(); return ok; },
    async redo() { session(); const ok = cr.redo(); cr.changed?.(); return ok; },
    files: (dir) => cr.project.files.filter((f) => !dir || f.startsWith(dir.replace(/\/?$/, '/'))),
    async text(ref) {
      if (!cr.project.has(ref)) throw new Error(`${ref} isn't in the project (read without ref lists the files)`);
      if (!TEXT_FILES.test(ref)) throw new Error(`${ref} isn't a text file`);
      return cr.project.text(ref);
    },
    async render(o) {
      if (!render) throw new Error('nothing here can draw a frame');
      const doc = session().doc, s = (doc.sequence.shots ?? []).find((x) => o.frame >= x.start && o.frame < x.end);
      return { ...(await render(o)), shot: s ? `${s.name ?? s.id} (${s.id})` : null };
    },
    short(part) {
      const s = session(), doc = s.doc, seq = doc.sequence, sh = cr.short;
      if (part === 'script') return asContent(sh.script, cr.desk.text, { errors: cr.desk.errorList(), unapplied: cr.desk.pending });
      if (part === 'lines') {
        const lines = rolesOf(doc, { set: setDoc() }).flatMap((r) => r.lines.map((l) => ({ id: lineId(doc, l.track, l.index), role: r.cue, start: l.start, end: l.end, voice: l.voice ?? null, voiced: !!l.baked, text: l.text })));
        return { content: { ref: sh.sequence, lines: lines.sort((a, b) => a.start - b.start) }, note: CONTENT_NOTE };
      }
      if (part === 'roles') return { roles: cr.roles(), characters: cr.project.files.filter((f) => f.endsWith('.vrmxa')), voices: [...KOKORO_PRESETS] };
      if (part === 'shots') return storyboard(doc, { set: setDoc() }).shots.map((x) => ({ id: x.id, number: x.name, start: x.start, end: x.end, camera: x.camera, cameras: x.cameras, rig: x.rig, lens: x.lens, subjects: x.subjects, hand: x.hand }));
      if (part === 'cameras') return [...allNodes(setDoc()).map((n) => ({ n, from: 'set' })), ...allNodes(doc).map((n) => ({ n, from: 'short' }))].filter(({ n }) => n.type === 'VirtualCamera').map(({ n, from }) => ({ id: n.id, name: n.name ?? null, rig: n.props?.rig ?? 'fixed', aim: n.props?.aim ?? null, lens: n.props?.lens ?? null, from }));
      if (part === 'queue') return { jobs: cr.queue.jobs.map(jobOf), presets: Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, v.label])), runner: cr.queue.runner?.name ?? null };
      if (part === 'history') return s.history();
      const h = s.history(), roles = cr.roles(), lines = rolesOf(doc, { set: setDoc() }).flatMap((r) => r.lines);
      return {
        short: { id: sh.id, title: sh.title, saved: !!sh.saved, script: sh.script, sequence: sh.sequence, set: cr.setScene?.ref ?? doc.set ?? null },
        fps: seq.fps ?? 24, frames: seq.duration, seconds: Math.round((seq.duration / (seq.fps ?? 24)) * 100) / 100,
        shots: (seq.shots ?? []).length, roles: roles.map((r) => `${r.cue} (${r.id}): ${r.name ?? 'as in the set'}${r.voice ? `, voice ${r.voice}` : ''}, ${r.lines} lines`),
        lines: lines.length, voiced: lines.filter((l) => l.baked).length, scriptErrors: cr.desk.errorList().length,
        undo: h.undo, redo: h.redo, queue: cr.queue.jobs.length, dirty: cr.isDirty?.() ?? null,
      };
    },
  };
}
