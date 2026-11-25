<script setup>
// The creator's window (M4 W5): the project's shorts, the script pane, the viewport, the storyboard strip, the timeline
// (shared with the editor), casting and the render queue. Engine objects stay in the CreatorHost (never reactive); this
// keeps plain copies of what the panels show, refreshed when the host says something changed.
import { onMounted, reactive, ref } from 'vue';
import Timeline from '@vrmxg/editor-ui/Timeline.vue';
import StoryboardStrip from '@vrmxg/editor-ui/StoryboardStrip.vue';
import RenderQueue from '@vrmxg/editor-ui/RenderQueue.vue';
import { CreatorHost } from './host.js';
import { bundledProject, openProjectFolder, pickFile, fetchOpened, readPicked } from './project.js';
import { kindOf } from './shorts.js';
import { inShell, call, on, onClosing, setEdited } from '../../shell/js/shell.js';
import { questions } from '@vrmxg/editor-ui';
import { guardShort, creatorClosing, unsavedWork } from './closing.js';
import ScriptPane from './ScriptPane.vue';
import TakePanel from './TakePanel.vue';
import { takeLine } from './takes.js';
import { creatorLink, CREATOR_MCP_PORT } from './mcp.js';

const canvas = ref(null), pane = ref(null), picker = ref(null), timeline = ref(null);
const ui = reactive({
  shell: '', project: '', writable: false, loading: true, error: '', mode: 'editing',
  shorts: [], short: null, sets: [], newTitle: 'Second take', newSet: '', newSetPicked: false, saveAsTitle: '',
  undo: null, redo: null, dirty: false, valid: true, problems: '', nodes: 0, hash: '', renderer: '—', build: '—',
  script: { text: '', file: '', errors: [], warnings: [], pending: false, dirty: false, last: '' },
  board: null, thumbs: {}, beats: {}, thumbState: '', selectedShot: null,
  tl: null, roles: [], role: '', cast: '', opened: '', saved: '', jobs: [], runner: '', coverage: 'default', unsaved: [],
  ask: null, // { title, text, options: [{ id, label }] }: the window's question (unsaved changes, a name clash)
  mcp: '', // the agent's link (M4 W11)
  take: null, takeLine: '', cameras: [], // performance takes (M4 W9): the deck's state, and the shell's cameras
});
/** @type {CreatorHost} */ let cr = null; // never reactive
let started; const ready = new Promise((r) => { started = r; }); // the first project is open (files opened at launch wait)

function refresh(kind = 'all') {
  ui.renderer = cr.stats.backend === 'webgpu' ? 'WebGPU' : cr.stats.backend === 'webgl' ? 'WebGL' : '—';
  ui.build = cr.stats.buildMs ? `${cr.stats.buildMs.toFixed(0)} ms` : '—';
  if (kind === 'stats') return;
  if (kind === 'queue' || kind === 'export' || kind === 'all') { ui.jobs = cr.queue.list(); ui.runner = cr.queue.runner.name; }
  if (kind === 'thumbs' || kind === 'all') { ui.thumbs = { ...cr.thumbs }; ui.thumbState = cr.thumbState; }
  if (kind === 'timeline' || kind === 'all') { ui.tl = cr.timeline(); ui.selectedShot = cr.selectedShot; }
  if (kind === 'take' || kind === 'all') {
    ui.take = cr.takeDeck.status(); ui.takeLine = takeLine(ui.take);
    if (cr.session) ui.mode = cr.takeDeck.busy ? 'take' : cr.session.mode; // a take is being recorded: the short isn't edited meanwhile
    if (ui.tl && cr.takeDeck.busy) ui.tl.playhead = cr.playhead; // the playhead follows the take
  }
  const d = cr.desk;
  if (d && (kind === 'script' || kind === 'all')) Object.assign(ui.script, { text: d.text, file: cr.short?.script ?? '', errors: d.errorList(), warnings: [...d.warnings], pending: d.pending, dirty: d.dirty, last: d.lastLabel ?? '' });
  // The shell is told of unsaved work whenever it may have changed, typing in the script pane included (a refresh of
  // kind 'script' returns below, and the typing is only applied 700 ms later): the window's dot, and what the shell
  // goes by when the page can't answer a close in time.
  if (kind === 'script' || kind === 'all') { setEdited(unsavedWork(cr)); if (cr.session) ui.dirty = cr.isDirty(); }
  if (kind !== 'all') return;
  const s = cr.session;
  ui.loading = cr.busy > 0;
  if (cr.error) ui.error = cr.error;
  ui.project = cr.project?.name ?? ''; ui.writable = !!cr.project?.writable;
  ui.shorts = cr.shorts.all.map((x) => ({ id: x.id, title: x.title, saved: x.saved }));
  ui.short = cr.short ? { ...cr.short } : null; ui.coverage = cr.short?.coverage ?? 'default';
  ui.sets = cr.sets(); if (!ui.newSetPicked || !ui.sets.includes(ui.newSet)) ui.newSet = [cr.nextSet, cr.setScene?.ref].find((x) => ui.sets.includes(x)) ?? ui.sets[0] ?? '';
  ui.board = cr.board ? structuredClone(cr.board) : null; ui.beats = d ? d.beats() : {};
  ui.roles = cr.roles(); if (!ui.roles.some((r) => r.id === ui.role)) ui.role = ui.roles[0]?.id ?? '';
  const c = cr.lastCast;
  ui.cast = c ? `${c.title} as ${c.role}: ${c.changed ? c.label : 'no change'}${c.file === 'replaced' ? ` (replaced ${c.ref})` : c.file === 'renamed' ? ` (saved as ${c.ref})` : ''}${c.warnings.length ? ` (${c.warnings.join('; ')})` : ''}` : '';
  const o = cr.lastOpen;
  ui.opened = o ? `${o.name} (${o.kind})${o.cancelled ? ' · cancelled' : ''}${o.short ? ` → short ${o.short}` : ''}${o.set ? ` → set ${o.set}` : ''}${o.warnings?.length ? ` · ${o.warnings.join('; ')}` : ''}${o.apply?.label ? ` · ${o.apply.label}` : o.apply ? ' · no change' : ''}` : '';
  const sv = cr.lastSaveAll;
  ui.saved = sv ? `${sv.sequence.ref} · ${sv.sequence.bytes} bytes · ${sv.sequence.hash}${sv.script ? ` · ${sv.script}` : ''}${sv.memory ? ' · in memory (open a project folder to save to disk)' : ''}` : '';
  ui.unsaved = cr.project?.unsaved?.() ?? [];
  if (!s) return;
  ui.mode = cr.takeDeck.busy ? 'take' : s.mode;
  const h = s.history(); ui.undo = h.undo; ui.redo = h.redo;
  ui.dirty = cr.isDirty(); ui.nodes = s.doc.nodes.length; ui.hash = s.hash();
  const v = s.validate(); ui.valid = v.ok; ui.problems = v.ok ? '' : v.errors.slice(0, 3).join('; ');
}

const act = async (fn) => { try { ui.error = ''; await fn(); } catch (e) { ui.error = String(e?.message ?? e); console.error(e); } refresh(); };

onMounted(async () => {
  cr = new CreatorHost(canvas.value);
  cr.onChange = refresh; window.__creator = cr;
  // MCP (M4 W11): on in the Mac app, or with ?mcp (=port, or =off) in a browser; vrmxg-mcp --creator listens on 127.0.0.1:5184
  const q = new URLSearchParams(location.search).get('mcp');
  if ((inShell && q !== 'off') || (q && q !== 'off')) {
    const link = creatorLink(cr, { url: `http://127.0.0.1:${/^\d+$/.test(q ?? '') ? q : CREATOR_MCP_PORT}`, onChange: () => { ui.mcp = link.state === 'off' ? 'MCP: waiting for vrmxg-mcp --creator' : link.state === 'taken' ? 'MCP: another creator has the link' : `MCP ${link.state}${link.last ? ` · ${link.last}` : ''} · ${link.calls} calls`; } });
    window.__mcp = link; link.onChange(); link.start();
  }
  await act(async () => cr.openProject(await bundledProject()));
  ui.loading = false;
  started();
  cr.cameras().then((list) => { ui.cameras = list.map((c) => ({ id: c.id, name: c.name })); }).catch(() => {});
  // ?deliver=<preset> (M4 W10): render deliveries by itself for the acceptance and the timing receipt (delivermode.js)
  if (new URLSearchParams(location.search).has('deliver')) {
    const dm = await import('./delivermode.js');
    await act(async () => { try { window.__result = await dm.runDeliverMode(cr, dm.deliverOptions(location.search)); } catch (e) { window.__errors.push(String(e?.stack ?? e)); throw e; } });
  }
});

// ---------------------------------------------------------------- the window's questions
/**
 * Ask in the window (a sheet over the page, which AppProbe can answer): → the chosen option's id. One question at a
 * time: a second one while a sheet is up is answered "cancel" and not shown (@vrmxg/editor-ui `questions`), so a
 * close that is waiting for its answer always gets one.
 */
const sheet = questions((q) => { ui.ask = q; });
const ask = sheet.ask, reply = (id) => sheet.reply(id);
const onError = (e) => { ui.error = String(e?.message ?? e); };
/** Before the open short goes (another short, New Short, Open Project, a script that opens another short): closing.js. */
const guard = () => guardShort(cr, { ask, onError });
/** Before the window closes or the app quits (the Mac shell asks, shell 0.9.0, AB-T-0593): closing.js. */
const closing = async (reason) => { const go = await creatorClosing(cr, { ask, asking: () => sheet.asking, reason, onError }); if (cr?.session) refresh(); return go; };
/** A file the project already holds by that name, with different bytes. */
const onClash = (ref) => ask('A different file has this name', `The project already has ${ref}, and it isn't the same file.`, [{ id: 'rename', label: 'Keep Both' }, { id: 'replace', label: 'Replace' }, { id: 'cancel', label: 'Cancel' }]);

// ---------------------------------------------------------------- commands
const openProject = () => act(async () => { const p = await openProjectFolder(); if (await guard()) await cr.openProject(p); });
const openShort = (id) => act(async () => { if (id !== cr.short?.id && await guard()) await cr.openShort(id); });
const newShort = () => act(async () => { if (!(await guard())) return; cr.nextSet = ui.newSet || null; await cr.newShort(ui.newTitle.trim() || 'Untitled'); });
const save = () => act(() => cr.saveShort());
const saveAs = () => act(() => cr.saveShort(ui.saveAsTitle.trim() || `${cr.short?.title ?? 'Short'} copy`));
const undo = () => act(() => cr.undo());
const redo = () => act(() => cr.redo());
/** An opened file: a script that opens another short asks about unsaved work first. */
async function openPicked(f) {
  if (kindOf(f.name) === 'script' && cr.scriptOpensOtherShort(f.name) && !(await guard())) return;
  await cr.openFile(f, { role: ui.role || null, onClash });
}
const setCoverage = (m) => act(() => cr.setCoverage(m));
/** File › Open (any kind) or one kind: the shell's panel (binary open), or the page's file picker in a browser. */
let pickKind = 'any';
const openFile = (kind = 'any') => {
  if (!inShell) { pickKind = kind; picker.value.click(); return; }
  return act(async () => openPicked(await pickFile(kind)));
};
const onPicked = (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) act(async () => openPicked(await readPicked(f))); };
const accept = () => ({ any: '.fountain,.vrmxa,.vrmxs,.glb', script: '.fountain', character: '.vrmxa', set: '.vrmxs,.glb' }[pickKind]);
// the script pane
const editScript = (t) => { cr.editScript(t); refresh('script'); };
const applyScript = () => act(() => cr.applyScript());
const goToLine = (n) => pane.value?.goToLine(n);
// the storyboard and the timeline
const pickShot = (id, frame) => { cr.pickShot(id, frame); timeline.value?.select({ row: 'shots', kind: 'shot', id }); refresh('timeline'); };
const tlSelect = (s) => { cr.selectedShot = s?.kind === 'shot' ? s.id : null; ui.selectedShot = cr.selectedShot; };
const tlCmd = (name, ...args) => act(() => cr.session.seq[name](...args));
// a frame field's drag (M5 W4): its live moves folded into one undo step on release
const tlGesture = (kind) => act(() => { const s = cr.session; if (kind === 'begin') s.beginGesture(); else if (kind === 'end') s.endGesture(); else s.cancelGesture(); });
const tlScrub = (f) => { cr.scrubTo(f); refresh('timeline'); };
const tlTransport = (what, v) => act(() => {
  if (what === 'play') cr.playPreview();
  else if (what === 'in' || what === 'out' || what === 'clear') cr.setRange(what);
  else if (what === 'loop') { cr.loopRange = v; }
  else if (what === 'camera') cr.setPreviewCamera(v);
  else if (what === 'regenerate') return cr.regenerateLine(v.row, v.index, v.text);
  else if (what === 'angles') cr.setAngles(v);
  else if (what === 'edit') cr.editView();
  else if (what === 'cameraFromView') cr.cameraFromView();
});
// the render queue
const queueAdd = (o) => act(() => cr.queueShort(o));
const queueRun = () => act(() => cr.queue.run());
const queueDo = (what, id, d) => act(() => cr.queue[what](id, d));
const exportShort = () => act(() => cr.exportShort()); // renders the job it adds, not the rest of the queue
// performance takes (M4 W9)
const takeSet = (key, v) => { cr.takeDeck[key] = v; refresh('take'); };
const takeChannel = (c, on) => { cr.takeDeck.channels = on ? [...new Set([...cr.takeDeck.channels, c])] : cr.takeDeck.channels.filter((x) => x !== c); refresh('take'); };
const takeStart = () => act(() => cr.takeDeck.start());
const takeStop = () => act(() => cr.takeDeck.stop());
const takeKeep = () => act(() => cr.takeDeck.keep());
const takeDiscard = () => act(() => cr.takeDeck.discard());
const takeRemove = (id) => act(() => cr.takeDeck.remove(id));
const takeSay = (text) => act(() => cr.takeDeck.say(text));

// keys: ⌘Z / ⇧⌘Z, ⌘S, ⌘O in a browser (in the Mac shell they come from the menus)
const typing = () => /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '');
/** Undo goes to a text field the person is typing in; otherwise (the script pane with nothing unapplied, anywhere else) to the short. */
const fieldUndo = () => typing() && (document.activeElement?.id !== 'script' || ui.script.pending);
addEventListener('keydown', (e) => {
  const cmd = e.metaKey || e.ctrlKey;
  if (!cmd || inShell || !cr?.session) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !fieldUndo()) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (k === 's') { e.preventDefault(); e.shiftKey ? saveAs() : save(); }
  else if (k === 'o') { e.preventDefault(); openFile(); }
});
if (inShell) {
  call('shell.info').then((i) => { ui.shell = `${i.app} · shell ${i.shell} · ${i.origin}`; });
  on('menu.openProject', openProject); on('menu.save', save); on('menu.saveAs', saveAs);
  on('menu.open', () => openFile('any'));
  on('menu.openScript', () => openFile('script')); on('menu.openCharacter', () => openFile('character')); on('menu.openSet', () => openFile('set'));
  on('menu.newShort', newShort); on('menu.applyScript', applyScript); on('menu.export', exportShort);
  on('menu.renderQueue', queueRun);
  // Open Documents (Finder, `open`, AppProbe's open step): the shell serves the file and says so
  on('file.opened', (f) => act(async () => { await ready; await openPicked(await fetchOpened(f)); }));
  on('menu.undo', () => (fieldUndo() ? document.execCommand('undo') : undo()));
  on('menu.redo', () => (fieldUndo() ? document.execCommand('redo') : redo()));
  onClosing(closing); // File › Close Window, the close button, Quit
}
</script>

<template>
  <div class="app">
    <header class="bar" role="toolbar" aria-label="Creator controls">
      <strong class="title">VRMXG Creator</strong>
      <button v-if="ui.shell" id="open-project" type="button" aria-label="Open project" @click="openProject">Open Project…</button>
      <span id="project-name" class="muted project" :aria-label="`Project ${ui.project}`" :title="ui.project">{{ ui.project }}</span>
      <button id="open-file" type="button" aria-label="Open a script, character or set" :disabled="ui.loading" @click="openFile('any')">Open…</button>
      <input ref="picker" type="file" hidden :accept="accept()" @change="onPicked">
      <span class="sep" />
      <input id="new-short-title" v-model="ui.newTitle" class="title-field" aria-label="New short title" @focus="$event.target.select()">
      <span class="muted">in</span>
      <div class="seg" role="radiogroup" aria-label="Set for a new short">
        <button v-for="s in ui.sets" :id="`set-${s.replace(/[^A-Za-z0-9]+/g, '-')}`" :key="s" type="button" role="radio" :aria-checked="ui.newSet === s" :aria-label="`Set ${s}`" :class="{ on: ui.newSet === s }" @click="ui.newSet = s; ui.newSetPicked = true">{{ s.replace(/\.vrmxs$/, '') }}</button>
      </div>
      <button id="new-short" type="button" aria-label="New short" :disabled="ui.loading || !ui.newSet" @click="newShort">New Short</button>
      <span class="sep" />
      <button id="save" type="button" :aria-label="ui.writable ? 'Save' : 'Save (in memory: open a project folder to save to disk)'" :disabled="ui.loading || !ui.short" @click="save">Save</button>
      <input id="save-as-title" v-model="ui.saveAsTitle" class="title-field" aria-label="Save as title" placeholder="Save as…" @focus="$event.target.select()">
      <button id="save-as" type="button" aria-label="Save as" :disabled="ui.loading || !ui.short" @click="saveAs">Save As</button>
      <span class="sep" />
      <button id="undo" type="button" :disabled="!ui.undo || ui.mode !== 'editing'" :aria-label="ui.undo ? `Undo ${ui.undo}` : 'Undo'" :title="ui.undo ?? ''" @click="undo">Undo</button>
      <button id="redo" type="button" :disabled="!ui.redo || ui.mode !== 'editing'" :aria-label="ui.redo ? `Redo ${ui.redo}` : 'Redo'" :title="ui.redo ?? ''" @click="redo">Redo</button>
      <span class="sep" />
      <span class="muted">Cameras</span>
      <div class="seg" role="radiogroup" aria-label="Cameras">
        <button id="coverage-rule" type="button" role="radio" :aria-checked="ui.coverage === 'rule'" aria-label="Cameras by rule" title="Coverage by rule (M4 W8): establishing, two-shots, close-ups and shot / reverse shot on the 180° line" :class="{ on: ui.coverage === 'rule' }" :disabled="!ui.short" @click="setCoverage('rule')">By rule</button>
        <button id="coverage-default" type="button" role="radio" :aria-checked="ui.coverage === 'default'" aria-label="Default cameras" title="The script's default: a wide and a close-up per speaker" :class="{ on: ui.coverage === 'default' }" :disabled="!ui.short" @click="setCoverage('default')">Default</button>
      </div>
    </header>

    <aside class="dock left" aria-label="Short">
      <div class="shorts" role="radiogroup" aria-label="Shorts">
        <h2>Shorts</h2>
        <button v-for="s in ui.shorts" :id="`short-${s.id}`" :key="s.id" type="button" role="radio" :aria-checked="ui.short?.id === s.id" :aria-label="`Short ${s.title} (${s.id})${s.saved ? '' : ', not saved'}`" :class="{ on: ui.short?.id === s.id, draft: !s.saved }" :disabled="ui.loading" @click="openShort(s.id)">{{ s.title }}{{ s.saved ? '' : ' •' }}</button>
      </div>
      <ScriptPane ref="pane" v-bind="ui.script" :disabled="ui.loading || ui.mode !== 'editing'" @edit="editScript" @apply="applyScript" />
    </aside>

    <main class="stage">
      <canvas ref="canvas" aria-label="Viewport" tabindex="0"></canvas>
      <p v-if="ui.loading" class="overlay">Loading…</p>
      <pre v-if="ui.error" id="error" class="overlay error" role="alert">{{ ui.error }}</pre>
    </main>

    <aside class="dock right" aria-label="Cast and render">
      <section class="cast" aria-label="Cast">
        <div class="dock-head"><h2>Cast</h2><button id="cast-open" type="button" aria-label="Cast a character into the selected role" :disabled="ui.loading || !ui.role" @click="openFile('character')">Cast…</button></div>
        <ul class="roles" role="radiogroup" aria-label="Roles">
          <li v-for="r in ui.roles" :key="r.id">
            <button :id="`role-${r.id}`" type="button" role="radio" :aria-checked="ui.role === r.id" :aria-label="`Role ${r.cue} (${r.id}), ${r.lines} lines, ${r.asset ? `cast ${r.asset}` : 'as in the set'}${r.voice ? `, voice ${r.voice}` : ''}`" :class="{ on: ui.role === r.id }" @click="ui.role = r.id">
              <strong>{{ r.cue }}</strong> <span class="muted">{{ r.lines }} lines</span><br><span class="small">{{ r.name ? `${r.name} · ${r.asset}` : 'as in the set' }}{{ r.voice ? ` · voice ${r.voice}` : '' }}</span>
            </button>
          </li>
        </ul>
        <output v-if="ui.cast" id="cast-result" class="muted small" :aria-label="`Cast ${ui.cast}`">{{ ui.cast }}</output>
      </section>
      <TakePanel v-if="ui.take" :st="ui.take" :line="ui.takeLine" :cameras="ui.cameras" :disabled="ui.loading || !ui.short || (ui.mode !== 'editing' && ui.mode !== 'take')" @kind="(k) => takeSet('kind', k)" @target="(t) => takeSet('target', t)" @channel="takeChannel" @device="(d) => takeSet('device', d)" @start="takeStart" @stop="takeStop" @keep="takeKeep" @discard="takeDiscard" @remove="takeRemove" @say="takeSay" />
      <RenderQueue :jobs="ui.jobs" :runner="ui.runner" :view-backend="ui.renderer === 'WebGL' ? 'webgl' : 'webgpu'" :can-add="!!ui.short" :disabled="ui.loading || ui.mode !== 'editing'" @add="queueAdd" @run="queueRun" @cancel="(id) => queueDo('cancel', id)" @remove="(id) => queueDo('remove', id)" @retry="(id) => queueDo('retry', id)" @move="(id, d) => queueDo('move', id, d)" />
    </aside>

    <StoryboardStrip class="board" :board="ui.board" :thumbs="ui.thumbs" :beats="ui.beats" :playhead="ui.tl?.playhead ?? -1" :selected="ui.selectedShot" :status="ui.thumbState" @pick="pickShot" @line="goToLine" />

    <Timeline v-if="ui.tl" ref="timeline" class="tl" :data="ui.tl" :disabled="ui.mode !== 'editing' || ui.loading" @cmd="tlCmd" @gesture="tlGesture" @scrub="tlScrub" @transport="tlTransport" @select="tlSelect" />
    <section v-else class="tl empty muted">No sequence: open a short.</section>

    <div v-if="ui.ask" class="ask-back">
      <section id="ask" class="ask" role="alertdialog" :aria-label="ui.ask.title" aria-modal="true">
        <h2>{{ ui.ask.title }}</h2>
        <p id="ask-text" :aria-label="ui.ask.text">{{ ui.ask.text }}</p>
        <div class="row"><button v-for="(o, i) in ui.ask.options" :id="`ask-${o.id}`" :key="o.id" type="button" :class="{ play: i === 0 }" :aria-label="o.label" @click="reply(o.id)">{{ o.label }}</button></div>
      </section>
    </div>

    <footer class="bar status">
      <output id="doc-state" :aria-label="`Short ${ui.short?.id ?? 'none'} ${ui.short?.sequence ?? ''} ${ui.nodes} nodes ${ui.dirty ? 'unsaved changes' : 'saved'} ${ui.valid ? 'valid' : 'invalid'} hash ${ui.hash}`">{{ ui.short?.sequence ?? '' }} · {{ ui.nodes }} nodes · {{ ui.dirty ? 'unsaved changes' : 'saved' }} · {{ ui.valid ? 'valid' : `invalid: ${ui.problems}` }} · {{ ui.hash }}</output>
      <output v-if="ui.saved" id="saved" :aria-label="`Saved ${ui.saved}`">Saved {{ ui.saved }}</output>
      <output v-if="ui.opened" id="open-result" :aria-label="`Opened ${ui.opened}`">Opened {{ ui.opened }}</output>
      <output v-if="ui.unsaved.length" id="memory-files" class="muted" :aria-label="`In memory: ${ui.unsaved.join(', ')}`">in memory: {{ ui.unsaved.join(', ') }}</output>
      <output id="build-time" :aria-label="`Build ${ui.build}`">build {{ ui.build }}</output>
      <output id="renderer" :aria-label="`Renderer ${ui.renderer}`">{{ ui.renderer }}</output>
      <output v-if="ui.mcp" id="mcp-state" :aria-label="ui.mcp">{{ ui.mcp }}</output>
      <span v-if="ui.shell" class="muted" :aria-label="`Shell ${ui.shell}`">{{ ui.shell }}</span>
    </footer>
  </div>
</template>

<style>
:root { color-scheme: light dark; --bg: #f4f5f7; --panel: #ffffff; --ink: #1d2128; --muted: #5f6672; --line: #d9dde3; --accent: #2f6fde; --sel: #dbe7fd; }
@media (prefers-color-scheme: dark) { :root { --bg: #15171b; --panel: #1e2127; --ink: #e8eaee; --muted: #9aa1ad; --line: #30353d; --accent: #5b8ff0; --sel: #24365a; } }
html, body, #app { margin: 0; height: 100%; background: var(--bg); color: var(--ink); font: 13px/1.4 -apple-system, system-ui, sans-serif; }
.app { display: grid; height: 100%; grid-template: "bar bar bar" auto "left stage right" 1fr "left board right" auto "tl tl tl" 260px "status status status" auto / 360px 1fr 300px; }
.bar { grid-area: bar; display: flex; align-items: center; gap: 6px 8px; padding: 6px 10px; background: var(--panel); border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.bar button { white-space: nowrap; }
.status { grid-area: status; border-top: 1px solid var(--line); border-bottom: 0; font-size: 12px; gap: 14px; flex-wrap: wrap; }
.title { margin-right: 4px; white-space: nowrap; }
.title-field { width: 110px; }
.project { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sep { width: 1px; height: 20px; background: var(--line); flex: none; }
button, select, input { font: inherit; color: var(--ink); background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 3px 8px; }
button:disabled { opacity: 0.45; }
button.play { background: var(--accent); color: #fff; border-color: var(--accent); }
.seg { display: inline-flex; flex: none; } .seg button { border-radius: 0; margin-left: -1px; white-space: nowrap; } .seg button:first-child { border-radius: 6px 0 0 6px; } .seg button:last-child { border-radius: 0 6px 6px 0; }
.seg button.on { background: var(--accent); color: #fff; border-color: var(--accent); }
h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); margin: 0; }
.muted { color: var(--muted); } .small { font-size: 12px; }
.dock { background: var(--panel); min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.left { grid-area: left; border-right: 1px solid var(--line); }
.right { grid-area: right; border-left: 1px solid var(--line); }
.dock-head { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-bottom: 1px solid var(--line); }
.dock-head h2 { flex: 1; }
.shorts { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 6px 10px; border-bottom: 1px solid var(--line); }
.shorts h2 { margin-right: 4px; } .shorts button { font-size: 12px; } .shorts button.on { background: var(--accent); color: #fff; border-color: var(--accent); }
.cast { border-bottom: 1px solid var(--line); max-height: 30%; overflow: auto; flex: none; }
.roles { list-style: none; margin: 0; padding: 4px 6px; }
.roles button { width: 100%; text-align: left; margin: 2px 0; } .roles button.on { border-color: var(--accent); box-shadow: inset 3px 0 var(--accent); }
.cast output { display: block; padding: 4px 10px 6px; word-break: break-word; }
.right .queue { flex: 1; }
.stage { grid-area: stage; position: relative; min-height: 0; background: #0e1014; }
canvas { display: block; width: 100%; height: 100%; outline: none; }
.overlay { position: absolute; left: 12px; top: 8px; margin: 0; padding: 6px 10px; background: color-mix(in srgb, var(--panel) 88%, transparent); border-radius: 6px; }
.error { color: #c0392b; white-space: pre-wrap; max-width: 80%; max-height: 60%; overflow: auto; top: 44px; }
.board { grid-area: board; border-left: 0; }
.tl { grid-area: tl; }
.tl.empty { display: flex; align-items: center; justify-content: center; background: var(--panel); border-top: 1px solid var(--line); }
output { font-variant-numeric: tabular-nums; }
.shorts button.draft { font-style: italic; }
.ask-back { position: fixed; inset: 0; z-index: 20; display: flex; align-items: flex-start; justify-content: center; padding-top: 12vh; background: rgba(0, 0, 0, 0.3); }
.ask { width: 380px; padding: 14px 16px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35); }
.ask h2 { margin-bottom: 8px; color: var(--ink); text-transform: none; letter-spacing: 0; font-size: 14px; }
.ask p { margin: 0 0 12px; } .ask .row { display: flex; justify-content: flex-end; gap: 8px; }
</style>
