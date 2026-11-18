<script setup>
// The editor's window: toolbar, scene tree, viewport, inspector, asset list, status. Engine objects stay in the
// EditorHost (never reactive); this keeps plain copies of what the panels show, refreshed when the host says so.
import { onMounted, reactive, ref } from 'vue';
import { EditorHost, ADDABLE, SIZES, RATES, CODECS } from './host.js';
import { bundledProject, openProjectFolder } from './project.js';
import { inShell, call, on } from '../../shell/js/shell.js';
import TreeItem from './TreeItem.vue';
import Inspector from './Inspector.vue';

const canvas = ref(null);
const ui = reactive({
  shell: '', project: '', writable: false, scenes: [], scene: '', loading: true, error: '', mode: 'editing',
  tree: [], selected: [], inspector: null, assets: [], undo: null, redo: null, dirty: false, valid: true, problems: '',
  nodes: 0, hash: '', saved: '', verify: '', stopped: '', gizmo: 'translate', snap: true, camera: 'orbit', addType: 'Node3D',
  debug: { colliders: false, sensors: false, capsules: false, rays: false }, frame: '—', build: '—', step: 0, assetFilter: '', fileName: 'built-cafe.vrmxs', captions: [],
  ex: { open: false, takes: [], take: '', seconds: 10, size: '1080p', fps: '30', codec: 'h264', audio: true, name: '', running: false, n: 0, frames: 0, phase: '', result: '', still: '' },
});
/** @type {EditorHost} */ let ed = null; // never reactive

const label = (n) => n.name ? `${n.name} (${n.id})` : n.id;
const plainTree = (items) => items.map(({ node, children }) => ({ id: node.id, type: node.type, label: label(node), children: plainTree(children) }));

let assetsOf = null; // the file list the asset list was made from: rebuilt only when it changes
function refresh(kind = 'all') {
  ui.frame = ed.stats.frameMs ? `${ed.stats.frameMs.toFixed(1)} ms · ${ed.stats.fps.toFixed(0)} fps` : '—';
  ui.build = ed.stats.buildMs ? `${ed.stats.buildMs.toFixed(0)} ms` : '—';
  ui.step = ed.stats.step;
  ui.captions = ed.captions();
  if (ed.exporting) Object.assign(ui.ex, { n: ed.exporting.n, frames: ed.exporting.frames, phase: ed.exporting.phase, running: true });
  if (kind === 'stats' || kind === 'captions' || kind === 'export') return;
  const s = ed.session;
  ui.loading = ed.busy > 0;
  if (ed.error) ui.error = ed.error;
  ui.project = ed.project?.name ?? ''; ui.writable = !!ed.project?.writable; ui.scenes = ed.project?.scenes() ?? []; ui.scene = ed.sceneRef ?? '';
  if (assetsOf !== ed.project?.files) { assetsOf = ed.project?.files; ui.assets = ed.assets().map((a) => ({ ...a })); }
  ui.gizmo = ed.gizmoMode; ui.snap = ed.snap; ui.camera = ed.cameraMode;
  if (!s) return;
  ui.mode = s.mode;
  ui.tree = plainTree(s.tree());
  ui.selected = [...s.selection];
  ui.inspector = ed.inspect();
  const h = s.history(); ui.undo = h.undo; ui.redo = h.redo;
  ui.dirty = s.dirty; ui.nodes = s.doc.nodes.length; ui.hash = s.hash();
  const v = s.validate(); ui.valid = v.ok; ui.problems = v.ok ? `${v.warnings.length} warnings` : v.errors.slice(0, 3).join('; ');
  ui.saved = ed.lastSave ? `${ed.lastSave.ref} · ${ed.lastSave.bytes} bytes · ${ed.lastSave.hash}` : '';
  ui.verify = ed.lastVerify ? `${ed.lastVerify.ref}: ${ed.lastVerify.same ? 'same bytes as saved' : 'DIFFERS from what was saved'}, ${ed.lastVerify.valid ? 'valid' : `invalid: ${ed.lastVerify.errors.join('; ')}`}` : '';
  ui.ex.takes = ed.takes();
  if (!ui.ex.takes.some((t) => t.id === ui.ex.take)) ui.ex.take = ui.ex.takes.find((t) => t.id === 'input/walk-in.json')?.id ?? ui.ex.takes[0]?.id ?? '';
  ui.ex.running = !!ed.exporting;
  const x = ed.lastExport;
  ui.ex.result = x ? `${x.name ?? x.began?.name ?? 'hashes only'}: ${x.frames} frames, ${x.seconds.toFixed(3)} s, ${CODECS[x.codec].label} ${x.size} ${x.fpsLabel} fps${x.audio ? ', with sound' : ''} · exported in ${(x.ms.total / 1000).toFixed(2)} s (${x.framesPerSecond} fps, ${x.transport || 'hash'}; per frame: render ${x.perFrameMs.render} ms, readback ${x.perFrameMs.readback}, waiting ${x.perFrameMs.wait}${x.encodeMsPerFrame !== undefined ? `, encode ${x.encodeMsPerFrame}, encoder wait ${x.waitMsPerFrame}` : ''}; sound ${x.ms.audio} ms${x.muxMs !== undefined ? `, mux ${x.muxMs} ms` : ''}) · frames ${x.hashesDigest ?? '—'}` : '';
  ui.ex.still = ed.lastStill ? `${ed.lastStill.thumbnail ? 'Thumbnail' : 'Still'} ${ed.lastStill.path ?? ed.lastStill.name} · ${ed.lastStill.bytes} bytes` : '';
  ui.stopped = ed.lastStop ? `scene ${ed.lastStop.restored && ed.lastStop.hash === ed.lastStop.before ? 'as before Play' : 'CHANGED'} (${ed.lastStop.hash}), view ${ed.lastStop.viewSame ? 'unchanged' : 'CHANGED'}` : '';
}

const act = async (fn) => { try { ui.error = ''; await fn(); } catch (e) { ui.error = String(e?.message ?? e); console.error(e); } refresh(); };

onMounted(async () => {
  ed = new EditorHost(canvas.value);
  ed.onChange = refresh; window.__editor = ed;
  await act(async () => ed.openProject(await bundledProject()));
  ui.loading = false;
});

// ---------------------------------------------------------------- commands
const openProject = () => act(async () => ed.openProject(await openProjectFolder()));
const openScene = () => act(() => (ui.scenes.includes(ui.scene) ? ed.openScene(ui.scene) : null));
const fileName = () => { const n = ui.fileName.trim() || 'untitled.vrmxs'; return n.endsWith('.vrmxs') ? n : `${n}.vrmxs`; };
const newScene = () => act(() => ed.newScene(fileName()));
const save = () => act(() => ed.save());
const saveAs = () => act(() => ed.save(fileName()));
const verify = () => act(() => ed.verifySaved());
const undo = () => act(() => ed.session.undo());
const redo = () => act(() => ed.session.redo());
const play = () => act(() => (ed.session.mode === 'playing' ? ed.stop() : ed.play()));
const takeSeconds = () => { const t = ui.ex.takes.find((x) => x.id === ui.ex.take); if (t?.seconds) ui.ex.seconds = +t.seconds.toFixed(2); };
const exportVideo = () => act(() => ed.exportVideo({ take: ui.ex.take, seconds: +ui.ex.seconds, size: ui.ex.size, fps: ui.ex.fps, codec: ui.ex.codec, audio: ui.ex.audio, name: ui.ex.name.trim() }));
const saveStill = () => act(() => ed.saveStill(ui.ex.size));
const thumbnail = () => act(() => ed.makeThumbnail());
const select = (id, add) => act(() => ed.session.select([id], { add }));
const reparent = (id, parent) => act(() => ed.session.reparent(id, parent));
const remove = () => act(() => ed.session.remove());
const addNode = () => act(() => ed.session.addNode(ui.addType, { at: ed.lookPoint() }));
const addAsset = (ref) => act(() => ed.addAsset(ref));
const frame = () => ed.frameAll(ui.selected.length > 0);
const setGizmo = (m) => ed.setGizmoMode(m);
const setSnap = () => ed.setSnap(ui.snap);
const setCamera = () => ed.setCameraMode(ui.camera);
const setDebug = () => ed.setDebug({ ...ui.debug });
const onInspector = {
  rename: (v) => act(() => ed.session.rename(ui.inspector.id, v)),
  parent: (p) => act(() => ed.session.reparent(ui.inspector.id, p)),
  position: (p) => act(() => ed.session.setTransform(ui.inspector.id, { p })),
  rotation: (r) => act(() => ed.setRotationDeg(ui.inspector.id, r)),
  scale: (s) => act(() => ed.session.setTransform(ui.inspector.id, { s })),
  prop: (k, v) => act(() => ed.session.setProp(ui.inspector.id, k, v)),
};

// drag an asset from the list onto the viewport
const dragAsset = (e, ref) => { e.dataTransfer.setData('text/x-vrmxg-asset', ref); e.dataTransfer.effectAllowed = 'copy'; };
const dropOnViewport = (e) => { const ref = e.dataTransfer.getData('text/x-vrmxg-asset'); if (ref) act(() => ed.addAsset(ref, e.clientX, e.clientY)); };
const dropOnScene = (e) => { const id = e.dataTransfer.getData('text/x-vrmxg-node'); if (id) reparent(id, null); };

// keys: W E R gizmo, F frame, Delete, ⌘Z / ⇧⌘Z, ⌘S (in the Mac shell, Undo / Redo / Save come from the menus)
const typing = () => /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '');
addEventListener('keydown', (e) => {
  if (!ed?.session || typing()) return;
  const cmd = e.metaKey || e.ctrlKey;
  if (cmd && e.key.toLowerCase() === 'z' && !inShell) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (cmd && e.key.toLowerCase() === 's' && !inShell) { e.preventDefault(); save(); return; }
  if (ed.session.mode !== 'editing' || cmd) return;
  if (ed.cameraMode === 'fly' && !(e.key === 'Delete' || e.key === 'Backspace')) return; // WASD / R / F / Q / E fly the view
  if (e.key === 'w') setGizmo('translate'); else if (e.key === 'e') setGizmo('rotate'); else if (e.key === 'r') setGizmo('scale');
  else if (e.key === 'f') frame(); else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); }
});
if (inShell) {
  call('shell.info').then((i) => { ui.shell = `${i.app} · shell ${i.shell} · ${i.origin}`; });
  on('menu.openProject', openProject); on('menu.save', save); on('menu.saveAs', saveAs);
  on('menu.undo', () => (typing() ? document.execCommand('undo') : undo()));
  on('menu.redo', () => (typing() ? document.execCommand('redo') : redo()));
}
const shown = () => ui.assets.filter((a) => !ui.assetFilter || a.ref.toLowerCase().includes(ui.assetFilter.toLowerCase()));
</script>

<template>
  <div class="app">
    <header class="bar" role="toolbar" aria-label="Editor controls">
      <strong class="title">VRMXG Editor</strong>
      <button v-if="ui.shell" id="open-project" type="button" aria-label="Open project" @click="openProject">Open Project…</button>
      <span class="muted project" id="project-name" :aria-label="`Project ${ui.project}`" :title="ui.project">{{ ui.project }}</span>
      <select id="scene" v-model="ui.scene" aria-label="Scene" title="Open a scene of the project" :disabled="ui.mode !== 'editing'" @change="openScene"><option v-if="!ui.scenes.includes(ui.scene)" :value="ui.scene">{{ ui.scene }} (new)</option><option v-for="s in ui.scenes" :key="s" :value="s">{{ s }}</option></select>
      <input id="file-name" v-model="ui.fileName" class="file-name" aria-label="Scene file name" title="The file New and Save As use, in the project" :disabled="ui.mode !== 'editing'">
      <button id="new-scene" type="button" aria-label="New scene" :disabled="ui.mode !== 'editing'" @click="newScene">New</button>
      <button id="save" type="button" :disabled="!ui.writable || ui.mode !== 'editing'" :aria-label="ui.writable ? 'Save' : 'Save (open a project folder to save)'" @click="save">Save</button>
      <button id="save-as" type="button" :disabled="!ui.writable || ui.mode !== 'editing'" aria-label="Save as" @click="saveAs">Save As…</button>
      <span class="sep" />
      <button id="undo" type="button" :disabled="!ui.undo || ui.mode !== 'editing'" :aria-label="ui.undo ? `Undo ${ui.undo}` : 'Undo'" :title="ui.undo ?? ''" @click="undo">Undo</button>
      <button id="redo" type="button" :disabled="!ui.redo || ui.mode !== 'editing'" :aria-label="ui.redo ? `Redo ${ui.redo}` : 'Redo'" :title="ui.redo ?? ''" @click="redo">Redo</button>
      <span class="sep" />
      <div class="seg" role="radiogroup" aria-label="Gizmo">
        <button v-for="[m, t] in [['translate', 'Move'], ['rotate', 'Rotate'], ['scale', 'Scale']]" :key="m" type="button" role="radio" :aria-checked="ui.gizmo === m" :aria-label="t" :class="{ on: ui.gizmo === m }" @click="setGizmo(m)">{{ t }}</button>
      </div>
      <label class="field"><input id="snap" v-model="ui.snap" type="checkbox" aria-label="Snap" @change="setSnap"> Snap</label>
      <select id="camera-mode" v-model="ui.camera" aria-label="View camera" title="Viewport camera" @change="setCamera"><option value="orbit">Orbit</option><option value="fly">Fly</option></select>
      <button id="frame" type="button" aria-label="Frame selection" @click="frame">Frame</button>
      <span class="sep" />
      <button id="export-open" type="button" :aria-pressed="ui.ex.open" aria-label="Export" :disabled="ui.mode !== 'editing'" @click="ui.ex.open = !ui.ex.open">Export</button>
      <button id="play" type="button" class="play" :disabled="ui.loading && ui.mode === 'editing'" :aria-label="ui.mode === 'playing' ? 'Stop' : 'Play'" @click="play">{{ ui.mode === 'playing' ? '■ Stop' : '▶ Play' }}</button>
    </header>

    <aside class="dock left" aria-label="Scene">
      <div class="dock-head"><h2>Scene</h2>
        <select v-model="ui.addType" aria-label="Node type to add" :disabled="ui.mode !== 'editing'"><option v-for="t in ADDABLE" :key="t" :value="t">{{ t }}</option></select>
        <button id="add-node" type="button" aria-label="Add node" :disabled="ui.mode !== 'editing'" @click="addNode">Add</button>
        <button id="delete" type="button" aria-label="Delete selection" :disabled="!ui.selected.length || ui.mode !== 'editing'" @click="remove">Delete</button>
      </div>
      <ul class="tree" role="tree" aria-label="Scene tree" @dragover.prevent @drop.prevent="dropOnScene">
        <TreeItem v-for="item in ui.tree" :key="item.id" :item="item" :selected="ui.selected" @select="select" @reparent="reparent" />
      </ul>
    </aside>

    <main class="stage" @dragover.prevent @drop.prevent="dropOnViewport">
      <canvas ref="canvas" aria-label="Viewport" tabindex="0"></canvas>
      <p v-if="ui.loading" class="overlay">Loading…</p>
      <p v-if="ui.mode === 'playing'" class="overlay playing" role="status">Playing · step {{ ui.step }} · WASD move, E interact</p>
      <pre v-if="ui.error" class="overlay error" role="alert">{{ ui.error }}</pre>
      <section v-if="ui.ex.open" id="export-panel" class="export" role="dialog" aria-label="Export">
        <h2>Export</h2>
        <label class="field">Take <select id="export-take" v-model="ui.ex.take" aria-label="Take" :disabled="ui.ex.running" @change="takeSeconds"><option v-for="t in ui.ex.takes" :key="t.id" :value="t.id">{{ t.label }}</option></select></label>
        <label class="field">Seconds <input id="export-seconds" v-model="ui.ex.seconds" type="number" min="0.1" step="0.1" aria-label="Seconds" :disabled="ui.ex.running"></label>
        <div class="field"><span>Size</span><div class="seg" role="radiogroup" aria-label="Size">
          <button v-for="(wh, k) in SIZES" :id="`size-${k}`" :key="k" type="button" role="radio" :aria-checked="ui.ex.size === k" :aria-label="`${k} ${wh[0]}×${wh[1]}`" :title="`${wh[0]}×${wh[1]}`" :class="{ on: ui.ex.size === k }" :disabled="ui.ex.running" @click="ui.ex.size = k">{{ k }}</button>
        </div></div>
        <div class="field"><span>Frame rate</span><div class="seg" role="radiogroup" aria-label="Frame rate">
          <button v-for="(r, k) in RATES" :id="`fps-${k.replace('.', '')}`" :key="k" type="button" role="radio" :aria-checked="ui.ex.fps === k" :aria-label="`${k} fps`" :class="{ on: ui.ex.fps === k }" :disabled="ui.ex.running" @click="ui.ex.fps = k">{{ k }}</button>
        </div></div>
        <div class="field"><span>Codec</span><div class="seg" role="radiogroup" aria-label="Codec">
          <button v-for="(c, k) in CODECS" :id="`codec-${k}`" :key="k" type="button" role="radio" :aria-checked="ui.ex.codec === k" :aria-label="`${c.label} .${c.ext}`" :title="`${c.label} (.${c.ext})${c.alpha ? ', keeps transparency' : ''}`" :class="{ on: ui.ex.codec === k }" :disabled="ui.ex.running" @click="ui.ex.codec = k">{{ c.short }}</button>
        </div></div>
        <label class="field"><span>Sound</span><input id="export-audio" v-model="ui.ex.audio" type="checkbox" aria-label="Sound" :disabled="ui.ex.running"></label>
        <label class="field">File name <input id="export-name" v-model="ui.ex.name" aria-label="Export file name" placeholder="automatic" :disabled="ui.ex.running"></label>
        <div class="row">
          <button id="export-run" type="button" class="play" :disabled="ui.ex.running || !ui.ex.take" :aria-label="ui.shell ? 'Export video' : 'Export (frame hashes only: video needs the Mac app)'" @click="exportVideo">{{ ui.shell ? 'Export Video…' : 'Export (hashes)' }}</button>
          <progress v-if="ui.ex.running" id="export-progress" :max="ui.ex.frames || 1" :value="ui.ex.n" :aria-label="`Exporting ${ui.ex.phase} ${ui.ex.n} of ${ui.ex.frames}`" />
        </div>
        <output v-if="ui.ex.result" id="export-result" :aria-label="`Exported ${ui.ex.result}`">{{ ui.ex.result }}</output>
        <h3>Stills</h3>
        <div class="row">
          <button id="save-still" type="button" aria-label="Save still" :disabled="ui.ex.running" @click="saveStill">Save Still…</button>
          <button id="thumbnail" type="button" aria-label="Make thumbnail" :disabled="ui.ex.running" @click="thumbnail">Thumbnail</button>
        </div>
        <output v-if="ui.ex.still" id="still-result" :aria-label="ui.ex.still">{{ ui.ex.still }}</output>
      </section>
      <div v-if="ui.captions.length" id="captions" class="captions" role="status" aria-live="polite">
        <p v-for="c in ui.captions" :key="c.actor" :aria-label="`${c.name}: ${c.text}`"><strong>{{ c.name }}</strong> <span v-for="(w, i) in c.words" :key="i" :class="{ said: i < c.spoken, now: i === c.word }">{{ `${w} ` }}</span></p>
      </div>
    </main>

    <aside class="dock right"><Inspector :data="ui.inspector" v-on="onInspector" /></aside>

    <section class="assets" aria-label="Assets">
      <div class="dock-head"><h2>Assets</h2><input v-model="ui.assetFilter" type="search" placeholder="Filter" aria-label="Filter assets"></div>
      <ul class="asset-list">
        <li v-for="a in shown()" :key="a.ref" draggable="true" :title="a.ref" @dragstart="dragAsset($event, a.ref)">
          <span class="kind">{{ a.kind }}</span><span class="aname">{{ a.ref }}</span>
          <button :id="`add-${a.ref.replace(/[^A-Za-z0-9]+/g, '-')}`" type="button" :disabled="!a.nodeType || ui.mode !== 'editing'" :aria-label="`Add ${a.ref}`" :title="a.nodeType ? `Add as ${a.nodeType}` : 'Put on through a character\'s closet'" @click="addAsset(a.ref)">Add</button>
        </li>
      </ul>
    </section>

    <footer class="bar status">
      <fieldset class="toggles"><legend>Debug</legend>
        <label v-for="k in ['colliders', 'sensors', 'capsules', 'rays']" :key="k"><input v-model="ui.debug[k]" type="checkbox" :aria-label="k" @change="setDebug"> {{ k }}</label>
      </fieldset>
      <output id="doc-state" :aria-label="`Scene ${ui.scene} ${ui.nodes} nodes ${ui.dirty ? 'unsaved changes' : 'saved'} ${ui.valid ? 'valid' : 'invalid'} hash ${ui.hash}`">{{ ui.nodes }} nodes · {{ ui.dirty ? 'unsaved changes' : 'saved' }} · {{ ui.valid ? 'valid' : `invalid: ${ui.problems}` }} · {{ ui.hash }}</output>
      <output v-if="ui.saved" id="saved" :aria-label="`Saved ${ui.saved}`">Saved {{ ui.saved }}</output>
      <button v-if="ui.saved" id="verify" type="button" aria-label="Reopen and compare" @click="verify">Reopen &amp; compare</button>
      <output v-if="ui.verify" id="verify-result" :aria-label="`Reopened ${ui.verify}`">{{ ui.verify }}</output>
      <output v-if="ui.stopped" id="stop-result" :aria-label="`Stopped: ${ui.stopped}`">Stopped: {{ ui.stopped }}</output>
      <output id="frame-time" :aria-label="`Frame time ${ui.frame}`">{{ ui.frame }}</output>
      <output id="build-time" :aria-label="`Build ${ui.build}`">build {{ ui.build }}</output>
      <span v-if="ui.shell" class="muted" :aria-label="`Shell ${ui.shell}`">{{ ui.shell }}</span>
    </footer>
  </div>
</template>

<style>
:root { color-scheme: light dark; --bg: #f4f5f7; --panel: #ffffff; --ink: #1d2128; --muted: #5f6672; --line: #d9dde3; --accent: #2f6fde; --sel: #dbe7fd; }
@media (prefers-color-scheme: dark) { :root { --bg: #15171b; --panel: #1e2127; --ink: #e8eaee; --muted: #9aa1ad; --line: #30353d; --accent: #5b8ff0; --sel: #24365a; } }
html, body, #app { margin: 0; height: 100%; background: var(--bg); color: var(--ink); font: 13px/1.4 -apple-system, system-ui, sans-serif; }
.app { display: grid; height: 100%; grid-template: "bar bar bar" auto "left stage right" 1fr "left assets right" 200px "status status status" auto / 280px 1fr 300px; }
.bar { grid-area: bar; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 6px 10px; background: var(--panel); border-bottom: 1px solid var(--line); }
.status { grid-area: status; border-top: 1px solid var(--line); border-bottom: 0; font-size: 12px; gap: 14px; }
.title { margin-right: 4px; }
.file-name { width: 120px; }
.project { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar:not(.status) { flex-wrap: nowrap; overflow-x: auto; }
.dock-head select { width: 110px; min-width: 0; }
.sep { width: 1px; height: 20px; background: var(--line); }
.field { display: flex; align-items: center; gap: 6px; color: var(--muted); }
button, select, input { font: inherit; color: var(--ink); background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 3px 8px; }
button:disabled { opacity: 0.45; }
button.play { background: var(--accent); color: #fff; border-color: var(--accent); min-width: 78px; }
.seg { display: inline-flex; } .seg button { border-radius: 0; margin-left: -1px; } .seg button:first-child { border-radius: 6px 0 0 6px; } .seg button:last-child { border-radius: 0 6px 6px 0; }
.seg button.on { background: var(--accent); color: #fff; border-color: var(--accent); }
.dock { background: var(--panel); overflow: auto; min-height: 0; }
.left { grid-area: left; border-right: 1px solid var(--line); }
.right { grid-area: right; border-left: 1px solid var(--line); }
.dock-head { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 1; background: var(--panel); }
.dock-head h2 { flex: 1; }
h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); margin: 0; }
h3 { font-size: 12px; color: var(--muted); margin: 14px 0 6px; }
.tree, .tree ul { list-style: none; margin: 0; padding: 0; }
.tree .row { display: flex; justify-content: space-between; gap: 8px; padding: 3px 8px; cursor: default; white-space: nowrap; }
.tree .row:hover { background: color-mix(in srgb, var(--sel) 50%, transparent); }
.tree .row.sel { background: var(--sel); } .tree .row.primary { box-shadow: inset 2px 0 var(--accent); }
.tree .type { color: var(--muted); font-size: 11px; }
.stage { grid-area: stage; position: relative; min-height: 0; background: #0e1014; }
canvas { display: block; width: 100%; height: 100%; outline: none; }
.overlay { position: absolute; left: 12px; top: 8px; margin: 0; padding: 6px 10px; background: color-mix(in srgb, var(--panel) 88%, transparent); border-radius: 6px; }
.overlay.playing { left: auto; right: 12px; }
.captions { position: absolute; left: 50%; bottom: 6%; transform: translateX(-50%); max-width: 70%; text-align: center; pointer-events: none; }
.captions p { margin: 4px 0; padding: 6px 12px; border-radius: 8px; background: rgba(10, 12, 16, 0.72); color: #f2f2f2; font-size: 16px; }
.captions span { opacity: 0.55; } .captions span.said, .captions span.now { opacity: 1; } .captions span.now { color: #ffd76a; }
.error { color: #c0392b; white-space: pre-wrap; max-width: 80%; max-height: 60%; overflow: auto; top: 44px; }
.inspector { padding: 0 12px 12px; } .inspector h2 { padding: 8px 0; }
.inspector .field { justify-content: space-between; margin: 6px 0; } .inspector .field input:not([type=checkbox]), .inspector .field select { width: 150px; max-width: 60%; box-sizing: border-box; }
.inspector .vec { display: flex; gap: 4px; border: 0; padding: 0; margin: 8px 0; flex-wrap: wrap; min-width: 0; } .inspector .vec legend { color: var(--muted); padding: 0; margin-bottom: 4px; width: 100%; }
.inspector .vec input { width: calc((100% - 8px) / 3); box-sizing: border-box; }
.prop { display: flex; align-items: center; gap: 4px; } .prop .field { flex: 1; } .prop.set .field { color: var(--ink); }
.reset { padding: 1px 6px; }
.mono { font-family: ui-monospace, monospace; font-size: 11px; }
.kind { margin: 6px 0 2px; } .small { font-size: 12px; } .muted { color: var(--muted); }
.assets { grid-area: assets; background: var(--panel); border-top: 1px solid var(--line); overflow: auto; min-height: 0; }
.asset-list { list-style: none; margin: 0; padding: 4px 0; columns: 2; column-gap: 0; }
.asset-list li { display: flex; align-items: center; gap: 8px; padding: 3px 10px; break-inside: avoid; cursor: grab; }
.asset-list .kind { width: 64px; color: var(--muted); font-size: 11px; } .asset-list .aname { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.toggles { display: flex; gap: 8px; border: 0; margin: 0; padding: 0; } .toggles legend { float: left; margin-right: 4px; color: var(--muted); }
output { font-variant-numeric: tabular-nums; }
.export { position: absolute; right: 12px; top: 8px; width: 320px; max-height: calc(100% - 24px); overflow: auto; padding: 10px 12px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25); box-sizing: border-box; }
.export .field { justify-content: space-between; margin: 6px 0; gap: 8px; } .export .seg button { padding: 3px 6px; font-size: 12px; } .export .field select, .export .field input:not([type=checkbox]) { width: 180px; box-sizing: border-box; }
.export .row { display: flex; align-items: center; gap: 8px; margin: 8px 0; } .export progress { flex: 1; }
.export output { display: block; font-size: 12px; color: var(--muted); word-break: break-word; }
</style>
