<script setup>
// The editor's window: toolbar, scene tree, viewport, inspector, asset list, status. Engine objects stay in the
// EditorHost (never reactive); this keeps plain copies of what the panels show, refreshed when the host says so.
import { computed, onMounted, reactive, ref } from 'vue';
import { EditorHost, ADDABLE, SIZES, RATES, CODECS } from './host.js';
import { bundledProject, openProjectFolder } from './project.js';
import { McpLink } from './mcp.js';
import { inShell, call, on, onClosing, setEdited } from '../../shell/js/shell.js';
import { questions, filterTree, foldTree, readLayout, writeLayout, resize as resizePanel, toggle as togglePanel, splitterKey, shownSize, EDITOR_PANELS, dropVerdict, dropEffectFor, draggedKind, ASSET_MIME, fileKind, copyField, copyTransform, copyPart } from '@vrmxg/editor-ui';
import { isClip } from '@vrmxg/editor-core';
import { editorClosing } from './closing.js';
import { exportClosing } from './export-game.js';
import TreeItem from './TreeItem.vue';
import Inspector from './Inspector.vue';
import Timeline from '@vrmxg/editor-ui/Timeline.vue'; // shared with the creator (M4 W5)
import AssetsPanel from '@vrmxg/editor-ui/AssetsPanel.vue'; // M5 W6: thumbnails, filters, search, folders, typed drags
import { shortcutFor, shortcutGroups } from './shortcuts.js';
// M6 W3 (AB-T-0646): New Project from a template, Open Recent and the project settings
import NewProject from './NewProject.vue';
import ProjectSettings from './ProjectSettings.vue';
import { ProjectSettings as Settings, projectLayerUses } from './project-settings.js';
import { loadTemplates, newProjectFrom, recentProjects, reopenProject, entryScene } from './projects.js';

const canvas = ref(null);
const ui = reactive({
  shell: '', project: '', writable: false, scenes: [], scene: '', loading: true, error: '', mode: 'editing',
  tree: [], selected: [], inspector: null, assets: [], undo: null, redo: null, dirty: false, valid: true, problems: '',
  nodes: 0, hash: '', saved: '', verify: '', stopped: '', gizmo: 'translate', snap: true, camera: 'orbit', addType: 'Node3D',
  debug: { colliders: false, sensors: false, capsules: false, rays: false }, aids: { outline: true, handles: true, preview: true }, boxSelect: false, clip: 0, previewing: '', frame: '—', build: '—', renderer: '—', holds: '', step: 0, prompt: null, fileName: 'built-cafe.vrmxs', captions: [],
  mcp: '', tl: null, gameSlot: 'slot-1', gameNote: '', paused: false, seqSet: 'cafe.vrmxs', seqName: 'sequences/untitled.vrmxs',
  ask: null, // { title, text, options: [{ id, label }] }: the window's question before it closes (M5 W8)
  // M6 W3: the New Project sheet, the recent projects, the project settings panel (its view; null while closed)
  newProject: { open: false, templates: [], busy: false, error: '' }, recent: [], settings: null, settingsBusy: false, layerProblem: '',
  // M5 W6: the tree's search and folds, the assets panel's thumbnails and picked file, the panels' sizes, the field
  // clipboard, the shortcuts sheet
  docSel: 0, treeQuery: '', treeOpen: [], treeClosed: [], thumbs: {}, thumbStatus: '', picked: '', panels: readLayout(null), fieldClip: null, shortcuts: false, note: '',
  ex: { open: false, takes: [], take: '', seconds: 10, size: '1080p', fps: '30', codec: 'h264', audio: true, name: '', running: false, n: 0, frames: 0, phase: '', result: '', still: '', check: '', canCheck: false, scene: '', checkRows: '', gameName: '', game: '', gameRunning: false, gameN: 0, gameTotal: 0 },
});
/** @type {EditorHost} */ let ed = null; // never reactive
/** @type {Settings | null} */ let settings = null; // the open project's settings while the panel is open (never reactive)
/** @type {{ project: any, settings: Settings } | null} */ let kept = null; // the project's settings and their undo history, kept while it is open

const label = (n) => n.name ? `${n.name} (${n.id})` : n.id;
const plainTree = (items) => items.map(({ node, children, inner, overridden }) => ({ id: node.id, type: node.type, label: label(node), children: plainTree(children), ...(inner ? { inner: true } : {}), ...(overridden ? { overridden: true } : {}) }));
// the tree as drawn (M5 W6, AB-T-0607): a search's matches and their ancestors, rows folded (instances start folded)
const shownTree = computed(() => {
  const f = filterTree(ui.tree, ui.treeQuery);
  return { items: foldTree(f.items, { open: new Set(ui.treeOpen), closed: new Set(ui.treeClosed), searching: f.matches !== null }), matches: f.matches };
});
function fold(id) {
  const it = findItem(shownTree.value.items, id); // the row as foldTree drew it: its own word on whether it's an instance
  const list = it?.instance ? 'treeOpen' : 'treeClosed';
  ui[list] = ui[list].includes(id) ? ui[list].filter((x) => x !== id) : [...ui[list], id];
}
const findItem = (items, id) => { for (const it of items) { if (it.id === id) return it; const f = findItem(it.children, id); if (f) return f; } return null; };
const tiles = computed(() => ui.assets.map((a) => ({ ...a, thumb: ui.thumbs[a.ref] ?? null })));

let assetsOf = null; // the file list the asset list was made from: rebuilt only when it changes
function refresh(kind = 'all') {
  ui.frame = ed.stats.frameMs ? `${ed.stats.frameMs.toFixed(1)} ms · ${ed.stats.fps.toFixed(0)} fps` : '—';
  ui.build = ed.stats.buildMs ? `${ed.stats.buildMs.toFixed(0)} ms` : '—';
  ui.renderer = ed.stats.backend === 'webgpu' ? 'WebGPU' : ed.stats.backend === 'webgl' ? 'WebGL' : '—'; // M4 W3: which backend draws
  ui.step = ed.stats.step;
  { const m = ed.memory(); ui.holds = `${m.worlds} worlds of ${m.built} built, ${m.geometries} geometries, ${m.textures} textures`; } // AB-T-0592: what is alive
  ui.captions = ed.captions();
  ui.prompt = ed.prompt();
  if (ed.exporting) Object.assign(ui.ex, { n: ed.exporting.n, frames: ed.exporting.frames, phase: ed.exporting.phase, running: true });
  ui.ex.gameRunning = !!ed.gameExporting; if (ed.gameExporting) { ui.ex.gameN = ed.gameExporting.n; ui.ex.gameTotal = ed.gameExporting.total; }
  if (kind === 'timeline' || kind === 'all') ui.tl = ed.timeline();
  if (kind === 'assetThumbs') { ui.thumbs = Object.fromEntries(ed.assetThumbs.urls); ui.thumbStatus = ed.assetThumbs.status(); } // only when one changes: 100 tiles' images aren't copied every refresh
  if (kind === 'stats' || kind === 'captions' || kind === 'export' || kind === 'timeline' || kind === 'assetThumbs') return;
  const s = ed.session;
  ui.loading = ed.busy > 0;
  if (ed.error) ui.error = ed.error;
  ui.project = ed.project?.name ?? ''; ui.writable = !!ed.project?.writable; ui.scenes = ed.project?.scenes() ?? []; ui.scene = ed.sceneRef ?? '';
  if (assetsOf !== ed.project?.files) { // the project's files changed (opened, or a save wrote one): the panel and its thumbnails follow
    assetsOf = ed.project?.files; ui.assets = ed.assets().map((a) => ({ ...a }));
    if (ui.picked && !ui.assets.some((a) => a.ref === ui.picked)) ui.picked = '';
    if (ed.project) ed.startAssetThumbs().catch((e) => console.warn('thumbnails', e));
  }
  ui.gizmo = ed.gizmoMode; ui.snap = ed.snap; ui.camera = ed.cameraMode;
  ui.layerProblem = ed.layerProblem ?? ''; // a node on a layer the game doesn't have (M6 W3)
  ui.aids = { ...ed.aids.show }; ui.boxSelect = ed.aids.boxSelect; ui.clip = ed.clipboard?.roots.length ?? 0; ui.previewing = ed.aids.previewing ?? ''; // M5 W5
  if (!s) return;
  ui.mode = s.mode; ui.paused = !!ed.paused;
  ui.tree = plainTree(s.tree({ inner: true }));
  ui.selected = [...s.selection];
  ui.docSel = s.selection.filter((id) => s.node(id)).length; // a prefab's inner nodes aren't deleted, duplicated or copied here (M5 W6)
  ui.inspector = ed.inspect();
  const h = s.history(); ui.undo = h.undo; ui.redo = h.redo;
  ui.dirty = s.dirty; ui.nodes = s.doc.nodes.length; ui.hash = s.hash();
  setEdited(ui.dirty); // the shell knows there is unsaved work even when the page can't answer it (the window's dot too)
  const v = s.validate(); ui.valid = v.ok; ui.problems = v.ok ? `${v.warnings.length} warnings` : v.errors.slice(0, 3).join('; ');
  ui.saved = ed.lastSave ? `${ed.lastSave.ref} · ${ed.lastSave.bytes} bytes · ${ed.lastSave.hash}` : '';
  ui.verify = ed.lastVerify ? `${ed.lastVerify.ref}: ${ed.lastVerify.same ? 'same bytes as saved' : 'DIFFERS from what was saved'}, ${ed.lastVerify.valid ? 'valid' : `invalid: ${ed.lastVerify.errors.join('; ')}`}` : '';
  ui.ex.takes = ed.takes();
  // a sequence just opened: export it by default (at its own rate); another scene: keep the take if it still exists
  const seqOpen = ui.ex.takes.some((t) => t.id === 'sequence'), scene = ed.sceneRef ?? '';
  if (seqOpen && ui.ex.scene !== scene) { ui.ex.take = 'sequence'; takeSeconds(); }
  ui.ex.scene = scene;
  if (!ui.ex.takes.some((t) => t.id === ui.ex.take)) {
    ui.ex.take = ui.ex.takes.find((t) => t.id === 'sequence')?.id ?? ui.ex.takes.find((t) => t.id === 'input/walk-in.json')?.id ?? ui.ex.takes[0]?.id ?? '';
    takeSeconds();
  }
  ui.ex.running = !!ed.exporting;
  const x = ed.lastExport;
  ui.ex.result = x ? `${x.name ?? x.began?.name ?? 'hashes only'}: ${x.frames} frames, ${x.seconds.toFixed(3)} s, ${CODECS[x.codec].label} ${x.size} ${x.fpsLabel} fps${x.audio ? ', with sound' : ''} · exported in ${(x.ms.total / 1000).toFixed(2)} s (${x.framesPerSecond} fps, ${x.transport || 'hash'}; per frame: render ${x.perFrameMs.render} ms, readback ${x.perFrameMs.readback}, waiting ${x.perFrameMs.wait}${x.encodeMsPerFrame !== undefined ? `, encode ${x.encodeMsPerFrame}, encoder wait ${x.waitMsPerFrame}` : ''}; sound ${x.ms.audio} ms${x.muxMs !== undefined ? `, mux ${x.muxMs} ms` : ''}) · frames ${x.hashesDigest ?? '—'}${x.subs ? ` · subtitles ${x.subs.error ? `not written (${x.subs.error})` : `${x.subs.path ? x.subs.path.split('/').pop() : '(text)'}, ${x.subs.lines} lines`}` : ''}` : '';
  const c = x?.scrubCheck;
  ui.ex.check = !c ? '' : c.same === c.frames ? `Scrub matches the export: all ${c.frames} frames (${c.rows.map((r) => r.frame).join(', ')})`
    : `Scrub differs from the export: ${c.frames - c.same} of ${c.frames} frames (${c.rows.filter((r) => !r.same).map((r) => `${r.frame}${r.worldSame === true ? ' same world' : r.worldSame === false ? ' other world' : ''}`).join(', ')})`;
  ui.ex.canCheck = x?.take === 'sequence' && !!x.frameHashes?.length;
  ui.ex.checkRows = c ? c.rows.map((r) => `${r.frame} ${r.scrub} ${r.exported}`).join('; ') : '';
  const g = ed.lastGameExport; // Export Game (M5 W0)
  ui.ex.game = g?.refused ? `Game export refused (${g.refused}): ${g.message}` : g ? `${g.written ? 'Exported' : 'Checked'} game ${g.id}: ${g.files} files, ${g.bytes} bytes, entry ${g.entry}, runtime ${g.runtime} · build ${g.digest.slice(0, 16)} · manifest ${g.manifest.slice(0, 16)}${g.byPattern ? ` · ${g.byPattern} files licensed by a pattern row` : ''}${g.unsaved ? ' · the open scene has unsaved changes, which are not in it' : ''}${g.written ? ` · ${g.path}` : ' · not written: a build folder needs the Mac app or vrmxg-export'}` : '';
  ui.ex.still = ed.lastStill ? `${ed.lastStill.thumbnail ? 'Thumbnail' : 'Still'} ${ed.lastStill.path ?? ed.lastStill.name} · ${ed.lastStill.bytes} bytes` : '';
  ui.stopped = ed.lastStop ? `scene ${ed.lastStop.restored && ed.lastStop.hash === ed.lastStop.before ? 'as before Play' : 'CHANGED'} (${ed.lastStop.hash}), view ${ed.lastStop.viewSame ? 'unchanged' : 'CHANGED'}` : '';
}

const act = async (fn) => { try { ui.error = ''; await fn(); } catch (e) { ui.error = String(e?.message ?? e); console.error(e); } refresh(); };

onMounted(async () => {
  ed = new EditorHost(canvas.value);
  ed.onChange = refresh; window.__editor = ed;
  // MCP: on in the Mac app, or with ?mcp (=port, or =off) in a browser; vrmxg-mcp --editor listens on 127.0.0.1:5183
  const q = new URLSearchParams(location.search).get('mcp');
  if ((inShell && q !== 'off') || (q && q !== 'off')) {
    const link = new McpLink(ed, { url: `http://127.0.0.1:${/^\d+$/.test(q ?? '') ? q : 5183}`, onChange: () => { ui.mcp = link.state === 'off' ? 'MCP: waiting for vrmxg-mcp --editor' : link.state === 'taken' ? 'MCP: another editor has the link' : `MCP ${link.state}${link.last ? ` · ${link.last}` : ''} · ${link.calls} calls`; } });
    window.__mcp = link; link.onChange(); link.start();
  }
  loadPanels(); // the panels' sizes as last left (M5 W6)
  await act(async () => ed.openProject(await bundledProject()));
  ui.loading = false;
  // a harness's check (M2 W12): export the film as frame hashes and check it against scrubbing
  if (new URLSearchParams(location.search).get('mode') === 'check-export') (await import('./checkmode.js')).checkModeMain(ed);
});

// ---------------------------------------------------------------- commands
const openProject = () => act(async () => { const p = await openProjectFolder(); await switchProject(p); });
/** Open another project: the last one's thumbnail draw ends first, its settings panel closes, the recent list follows. */
async function switchProject(p, scene = null) {
  closeSettings();
  kept = null; // another project: its own settings, and a history of its own
  await ed.releaseAssetThumbs();
  await ed.openProject(p, scene ?? undefined);
  refreshRecent();
}
const refreshRecent = async () => { ui.recent = await recentProjects(); };
// New Project (M6 W3): the sheet lists the templates the editor ships; Create… asks the shell for the folder
const openNewProject = () => act(async () => {
  if (sheet.asking || ui.mode !== 'editing') return;
  closeSettings();
  Object.assign(ui.newProject, { open: true, error: '', busy: false });
  if (!ui.newProject.templates.length) ui.newProject.templates = await loadTemplates();
});
async function createProject({ template, title, id }) {
  ui.newProject.busy = true; ui.newProject.error = '';
  try {
    const p = await newProjectFrom(template, { title, id });
    ui.newProject.open = false;
    await act(async () => switchProject(p, await entryScene(p)));
  } catch (e) {
    if (e?.code !== 'cancelled') ui.newProject.error = String(e?.message ?? e); // Cancel in the folder panel: back to the sheet
  } finally { ui.newProject.busy = false; }
}
// Open Recent (M6 W3): File › Open Recent in the Mac app, and the toolbar's list; the shell's one list of projects
const openRecent = (path) => act(async () => {
  if (!path || sheet.asking || ui.mode !== 'editing') return;
  ui.newProject.open = false;
  try { const p = await reopenProject(path); await switchProject(p, await entryScene(p)); } finally { refreshRecent(); }
});
// Project settings (M6 W3): the game's title, id, scenes, controls and physics layers; each change one undo step of
// its own, written to game.json at once. While the panel is open, Undo and Redo (the menu, ⌘Z) are the panel's.
const openSettings = () => act(async () => {
  if (sheet.asking || ui.mode !== 'editing' || !ed.project) return;
  if (!ed.project.writable) throw new Error(`${ed.project.name} is read-only here: open a project folder to change its settings`);
  ui.newProject.open = false;
  // the same project's settings again keep their undo history (closing the panel doesn't lose it; another project does)
  if (kept?.project !== ed.project) {
    kept = { project: ed.project, settings: await Settings.load(ed.project, {
      onChange: () => { if (settings) ui.settings = settings.view(); },
      layerUses: () => projectLayerUses(ed.project, ed.session ? { ref: ed.sceneRef, doc: ed.session.doc } : null), // a layer in use isn't renamed or removed
    }) };
  }
  settings = kept.settings;
  ui.settings = settings.view();
});
function closeSettings() { settings = null; ui.settings = null; }
const settingsPlan = (row, slot, binding) => settings.planRebind(row, slot, binding);
async function settingsDo(fn) {
  if (!settings) return;
  ui.settingsBusy = true;
  try { await fn(settings); } catch { /* the panel shows settings.error */ } finally {
    ui.settingsBusy = false;
    if (settings) ui.settings = settings.view();
    refresh(); // a new game.json, or a scene's file list
  }
}
const settingsOp = (name, ...args) => settingsDo((s) => s[name](...args));
const openScene = () => act(() => (ui.scenes.includes(ui.scene) ? ed.openScene(ui.scene) : null));
const fileName = () => { const n = ui.fileName.trim() || 'untitled.vrmxs'; return n.endsWith('.vrmxs') ? n : `${n}.vrmxs`; };
const newScene = () => act(() => ed.newScene(fileName()));
const openFile = () => act(() => { const f = fileName(); if (!ui.scenes.includes(f)) throw new Error(`${f} isn't in the project`); return ed.openScene(f); });
const save = () => act(() => ed.save());
const saveAs = () => act(() => ed.save(fileName()));
const verify = () => act(() => ed.verifySaved());
// the settings' own history while its panel is open; nothing while the New Project sheet is up (the scene is behind it)
const undo = () => (ui.newProject.open ? null : settings ? settingsDo((s) => s.undo()) : act(() => ed.session.undo()));
const redo = () => (ui.newProject.open ? null : settings ? settingsDo((s) => s.redo()) : act(() => ed.session.redo()));
const play = () => act(() => (ed.session.mode === 'playing' ? ed.stop() : ed.play()));
// save games while playing (M2 W9)
const saveGame = () => act(async () => { const r = await ed.saveGame(ui.gameSlot); ui.gameNote = `saved ${r.slot} at step ${r.step} (${(r.bytes / 1024).toFixed(0)} KB) · ${r.hash}`; });
const loadGame = () => act(async () => {
  const saved = ed.lastGameSave, r = await ed.loadGame(ui.gameSlot);
  const same = saved?.slot === r.slot ? (saved.step === r.step && saved.hash === r.hash ? ' · the world as saved' : ` · not the world saved (${saved.hash} at step ${saved.step})`) : '';
  ui.gameNote = `loaded ${r.slot} at step ${r.step} (paused) · ${r.hash}${same}`;
});
const resume = () => act(() => { ed.paused = !ed.paused; });
function takeSeconds() {
  const t = ui.ex.takes.find((x) => x.id === ui.ex.take);
  if (t?.seconds) ui.ex.seconds = +t.seconds.toFixed(2);
  if (t?.fps && RATES[String(t.fps)]) ui.ex.fps = String(t.fps); // a sequence exports at its own rate by default
}
const checkScrub = () => act(() => ed.checkExportAgainstScrub());
const bakeTake = () => act(async () => { const ref = await ed.bakeTake(ui.ex.take, ui.ex.name.trim() || null); ui.ex.open = false; await ed.openScene(ref); });
const exportVideo = () => act(() => ed.exportVideo({ take: ui.ex.take, seconds: +ui.ex.seconds, size: ui.ex.size, fps: ui.ex.fps, codec: ui.ex.codec, audio: ui.ex.audio, name: ui.ex.name.trim() }));
// not while the window is asking something (the close sheet, M5 W8): that question first, as the menu can't know of it
const exportGame = () => (sheet.asking ? null : act(() => ed.exportGame({ name: ui.ex.gameName.trim() })));
const saveStill = () => act(() => ed.saveStill(ui.ex.size));
const thumbnail = () => act(() => ed.makeThumbnail());
const select = (id, add) => act(() => ed.session.select([id], { add }));
// the timeline (M2 W5): sequence commands are one undo step each; scrubs and transport are view state
const newSequence = () => act(() => ed.newSequence(ui.seqName.endsWith('.vrmxs') ? ui.seqName : `${ui.seqName}.vrmxs`, ui.seqSet));
const tlCmd = (name, ...args) => act(() => ed.session.seq[name](...args));
const tlScrub = (f) => { ed.scrubTo(f); refresh('timeline'); };
const tlTransport = (what, v) => act(() => {
  if (what === 'play') ed.playPreview();
  else if (what === 'in' || what === 'out' || what === 'clear') ed.setRange(what);
  else if (what === 'loop') { ed.loopRange = v; }
  else if (what === 'camera') ed.setPreviewCamera(v);
  else if (what === 'regenerate') return ed.regenerateLine(v.row, v.index, v.text); // M3 W4: one undo step
  else if (what === 'angles') ed.setAngles(v);
  else if (what === 'edit') ed.editView();
  else if (what === 'cameraFromView') ed.cameraFromView();
});
const setScenes = () => ui.scenes.filter((x) => !x.startsWith('prefabs/') && !x.startsWith('sequences/'));
const reparent = (id, parent) => act(() => ed.session.reparent(id, parent));
const innerOnly = () => ui.selected.length > 0 && !ui.docSel;
const INNER_WHY = 'a prefab\'s node is edited through its instance\'s overrides: revert or apply them, or change the prefab';
const remove = () => (innerOnly() ? (ui.note = `Not deleted: ${INNER_WHY}`) : act(() => ed.session.remove()));
// Duplicate, Copy and Paste (M5 W5): commands on the session, one undo step each; a copy is also put on the system clipboard
// (as text) by the page's copy event, so it pastes into another editor window
const duplicate = () => (innerOnly() ? (ui.note = `Not duplicated: ${INNER_WHY}`) : act(() => ed.duplicate()));
const copyNodes = () => (innerOnly() ? (ui.note = `Not copied: ${INNER_WHY}`) : act(() => { if (!ed.copy()) throw new Error('select nodes to copy'); }));
const pasteNodes = (clip) => act(() => ed.paste(clip));
const setAid = (kind) => ed.setAid(kind, ui.aids[kind]);
const setBoxSelect = () => ed.setBoxSelect(ui.boxSelect);
const addNode = () => act(() => ed.session.addNode(ui.addType, { at: ed.lookPoint() }));
const addAsset = (ref) => act(() => ed.addAsset(ref));
const frame = () => ed.frameAll(ui.selected.length > 0);
const setGizmo = (m) => ed.setGizmoMode(m);
const setSnap = () => ed.setSnap(ui.snap);
const setCamera = () => ed.setCameraMode(ui.camera);
const setDebug = () => ed.setDebug({ ...ui.debug });
// The inspector edits the whole selection (M5 W4, AB-T-0601): a prop or a transform axis set on every selected node is
// one undo step; a number field's drag is a gesture, its live edits folded into one step on release (AB-T-0600).
const live = (fn) => act(() => ed.session.withGesture(fn)); // during a drag, the edit belongs to it (an MCP edit meanwhile doesn't)
const onInspector = {
  rename: (v) => act(() => ed.renameNode(ui.inspector.id, v)), // an inner node's name is its instance's override (M5 W6)
  parent: (p) => act(() => ed.session.reparent(ui.inspector.id, p)),
  axis: (part, i, v) => live(() => ed.setAxisOn(ui.inspector.ids, part, i, v)),
  prop: (k, v) => live(() => ed.setPropOn(ui.inspector.ids, k, v)),
  propAxis: (k, i, v) => live(() => ed.setPropAxisOn(ui.inspector.ids, k, i, v)), // one axis of a vector prop on a selection
  select: (ids, add = true) => act(() => ed.session.select(ids, { add })), // the inspector's Also select and Select every <type>: multi-select without a modifier key
  gesture: (kind) => act(() => { if (kind === 'begin') ed.session.beginGesture(); else if (kind === 'end') ed.session.endGesture(); else ed.session.cancelGesture(); }),
  // prefab overrides (M5 W6, AB-T-0603): the dot reverts a field of the inner node shown; the Overrides list reverts and
  // applies by field or all at once; each one undo step
  revert: (field) => act(() => { const i = ui.inspector.inner; ed.session.revertOverride(i.instance, i.target, field); }),
  ovRevert: (target, field) => act(() => ed.session.revertOverride(ui.inspector.overrides.id, target, field)),
  ovRevertAll: () => act(() => ed.session.revertOverride(ui.inspector.overrides.id)),
  ovApply: (target, field, what) => applyOverrides(target, field, `${target} ${what}`),
  ovApplyAll: () => applyOverrides(undefined, undefined, 'every override'),
  ovCopy: (text) => act(async () => { await copyText(text); ui.note = 'Overrides copied as text'; }),
  // a file into the node's asset slot (AB-T-0606): dropped, or the picked one by Use; one undo step
  slotAsset: (ref) => act(() => ed.setNodeAsset(ui.inspector.id, ref)),
  // per-field copy and paste (AB-T-0607): a paste is one undo step, on the whole selection
  fieldCopy: (p) => { ui.fieldClip = copyField(p); ui.note = `Copied ${p.key}`; },
  fieldPaste: (p, value) => act(() => ed.setPropOn(ui.inspector.ids, p.key, value)),
  xformCopy: (part) => { const d = ui.inspector; if ((part === 'all' ? ['p', 'r', 's'] : [part]).some((k) => d[k].includes(null))) return; ui.fieldClip = part === 'all' ? copyTransform(d) : copyPart(part, d[part]); ui.note = part === 'all' ? 'Copied the transform' : `Copied ${{ p: 'position', r: 'rotation', s: 'scale' }[part]}`; },
  xformPaste: (part) => act(() => { const c = ui.fieldClip; ed.pasteTransform(ui.inspector.ids, part === 'all' ? { p: c.p, r: c.r, s: c.s } : { [part]: c.value }); }),
};

/**
 * Apply to the prefab (M5 W6): it writes the prefab's own file, so every scene with an instance of it changes. The sheet
 * says which file, how many instances in this scene and which other scenes use it, before anything happens.
 */
async function applyOverrides(target, field, what) {
  const o = ui.inspector?.overrides;
  if (!o || sheet.asking) return;
  ui.error = '';
  let others = [];
  try { others = await ed.prefabScenes(o.ref); } catch { others = []; }
  const elsewhere = others.length ? ` ${others.length} other scene${others.length === 1 ? '' : 's'} of the project use${others.length === 1 ? 's' : ''} it too (${others.slice(0, 4).join(', ')}${others.length > 4 ? ', …' : ''}).` : ' No other scene of the project uses it.';
  const text = `${what} of ${o.id} goes into ${o.ref}, and the override${field ? '' : 's'} go${field ? 'es' : ''}. Every instance of the prefab follows: ${o.users} in this scene.${elsewhere} This scene's other instances that set the same value lose that override and follow the prefab again. The prefab's file is written when you save; Undo puts it all back.`;
  const c = await sheet.ask(`Apply to ${o.ref}?`, text, [{ id: 'apply', label: 'Apply to Prefab' }, { id: 'cancel', label: 'Cancel' }]);
  if (c === 'apply') act(() => ed.session.applyOverride(o.id, target, field));
}

/** Put text on the system clipboard (a press is the gesture WebKit wants); a selected textarea's copy where the API isn't there. */
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return; } catch { /* fall back */ }
  const t = document.createElement('textarea');
  t.value = text; document.body.append(t); t.select(); document.execCommand('copy'); t.remove();
}

// ---------------------------------------------------------------- panels (M5 W6, AB-T-0607 item 2)
// Scene, Inspector, Assets and Timeline resize from their inner edge (drag it, or focus it and use the arrow keys) and
// fold to a rail; their sizes are kept in the app's settings (the Mac shell's settings.json, localStorage in a browser).
const PANELS_KEY = 'vrmxg-editor-panels';
let panelTimer = null;
async function loadPanels() {
  try {
    if (inShell) { const r = await call('settings.read'); const doc = r?.text ? JSON.parse(r.text) : {}; ui.panels = readLayout(doc.panels ?? null); }
    else ui.panels = readLayout(localStorage.getItem(PANELS_KEY));
  } catch { ui.panels = readLayout(null); }
}
function savePanels() {
  clearTimeout(panelTimer);
  panelTimer = setTimeout(async () => {
    const text = writeLayout(ui.panels);
    try {
      if (inShell) { // the settings document is the app's: keep what else is in it
        const r = await call('settings.read'); let doc = {};
        try { doc = r?.text ? JSON.parse(r.text) : {}; } catch { doc = {}; }
        if (!doc || typeof doc !== 'object' || Array.isArray(doc)) doc = {};
        doc.panels = JSON.parse(text);
        await call('settings.write', { text: JSON.stringify(doc) });
      } else localStorage.setItem(PANELS_KEY, text);
    } catch (e) { console.warn('panel sizes not kept', e); }
  }, 250);
}
const setPanels = (layout) => { if (layout) { ui.panels = layout; savePanels(); } };
const bottomPanel = () => (ui.tl ? 'timeline' : 'assets');
const gridStyle = computed(() => ({ '--left': `${shownSize(ui.panels, 'scene')}px`, '--right': `${shownSize(ui.panels, 'inspector')}px`, '--bottom': `${shownSize(ui.panels, bottomPanel())}px` }));
// which way a pointer move grows each panel: the Scene's edge is on its right, the Inspector's on its left, the bottom's on top
const GROWS = { scene: 1, inspector: -1, assets: -1, timeline: -1 };
function dragSplit(e, name) {
  if (e.button !== 0) return;
  e.preventDefault();
  const el = e.currentTarget, axis = EDITOR_PANELS[name].axis, start = axis === 'x' ? e.clientX : e.clientY, size = ui.panels[name].collapsed ? EDITOR_PANELS[name].min : ui.panels[name].size;
  el.setPointerCapture?.(e.pointerId);
  const move = (m) => { ui.panels = resizePanel(ui.panels, name, size + ((axis === 'x' ? m.clientX : m.clientY) - start) * GROWS[name]); };
  const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); savePanels(); };
  el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}
// the edge's own keys stop here: the timeline and the window's shortcuts listen on the window for arrows too
function keySplit(e, name) { const next = splitterKey(ui.panels, name, e, GROWS[name]); if (next) { e.preventDefault(); e.stopPropagation(); setPanels(next); } }
const foldPanel = (name) => setPanels(togglePanel(ui.panels, name));

// ---------------------------------------------------------------- drops on the viewport and node slots (M5 W6)
const placeable = (kind) => ui.assets.some((a) => a.kind === kind && a.nodeType);

// an asset from the panel onto the viewport: placed where it lands, if a node type places it (a clip or a wearable isn't)
const overViewport = (e) => { const v = dropVerdict(draggedKind(e.dataTransfer?.types), { slot: 'viewport', placeable }); if (v.ok) { e.preventDefault(); e.dataTransfer.dropEffect = dropEffectFor({ slot: 'viewport' }); } };
const dropOnViewport = (e) => { const ref = e.dataTransfer.getData(ASSET_MIME); if (ref && dropVerdict(fileKind(ref), { slot: 'viewport', placeable }).ok) act(() => ed.addAsset(ref, e.clientX, e.clientY)); };
const dropOnScene = (e) => { const id = e.dataTransfer.getData('text/x-vrmxg-node'); if (id) reparent(id, null); };

// keys: the window's own come from shortcuts.js (M5 W6), the table the shortcuts sheet is drawn from; in the Mac shell,
// Undo / Redo / Save / Duplicate come from the menus. The fly camera keeps its letters while it flies.
const typing = () => /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '');
// where Edit › Undo and Redo go to the web view's own text undo: a field that edits text. A focused check box, radio,
// slider or button isn't one (M6 W3: Undo after ticking one of the settings' boxes is the settings' undo); the keys
// above still treat every form control as typing, so Delete in a check box never deletes the selected nodes
const editingText = () => { const el = /** @type {any} */ (document.activeElement); return /^(SELECT|TEXTAREA)$/.test(el?.tagName ?? '') || (el?.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|reset|range|color)$/.test(el.type)); };
const KEY_ACTIONS = {
  undo: () => undo(), redo: () => redo(), save: () => save(), duplicate: () => duplicate(), remove: () => remove(),
  gizmoMove: () => setGizmo('translate'), gizmoRotate: () => setGizmo('rotate'), gizmoScale: () => setGizmo('scale'), frame: () => frame(),
  shortcuts: () => { ui.shortcuts = !ui.shortcuts; }, closeSheet: () => { ui.shortcuts = false; },
};
/** While the New Project sheet or the settings panel is up, the window's keys are its Undo and Redo only (the settings'). */
const SHEET_KEYS = new Set(['undo', 'redo']);
addEventListener('keydown', (e) => {
  if (!ed?.session) return;
  const s = shortcutFor(e, { inShell, flying: ed.cameraMode === 'fly', editing: ed.session.mode === 'editing', sheet: ui.shortcuts });
  if (!s) return;
  if (typing() && !(SHEET_KEYS.has(s.action) && !editingText())) return; // a form control has the keys; Undo and Redo only leave a text field's to it
  if (s.action === 'remove' && !ui.selected.length) return; // nothing of the scene's selected: a timeline item's Delete
  if ((ui.settings || ui.newProject.open) && !SHEET_KEYS.has(s.action)) return;
  e.preventDefault();
  KEY_ACTIONS[s.action]?.();
});
// Copy and Paste of nodes through the page's clipboard events: ⌘C / ⌘V in a browser, Edit › Copy / Paste in the Mac shell.
// A text field keeps its own copy and paste. A paste of text that isn't a clip falls back to the editor's own clipboard.
const nodeEdit = () => ed?.session?.mode === 'editing' && !typing() && !sheet.asking && !ui.settings && !ui.newProject.open;
addEventListener('copy', (e) => {
  if (!nodeEdit() || !ui.docSel || document.getSelection()?.toString()) return;
  const clip = ed.copy();
  if (!clip) return;
  e.preventDefault();
  e.clipboardData?.setData('text/plain', JSON.stringify(clip));
  refresh();
});
addEventListener('paste', (e) => {
  if (!nodeEdit()) return;
  let clip = null;
  const text = e.clipboardData?.getData('text/plain') ?? '';
  // the clipboard is data: at most 8 MB is read, and only a clip that checks out whole is pasted
  if (text.length <= 8e6) try { const v = JSON.parse(text); if (isClip(v)) clip = v; } catch { /* not a clip */ }
  // other text copied since (from another app): not ours to paste nodes over; an empty clipboard falls back to the editor's
  if (!clip && (text.trim() || !ed.clipboard)) return;
  e.preventDefault();
  pasteNodes(clip ?? ed.clipboard);
});
// WebKit enables Edit › Copy and Paste only when the page says it will handle them (its beforecopy / beforepaste events)
addEventListener('beforecopy', (e) => { if (nodeEdit() && ui.docSel && !document.getSelection()?.toString()) e.preventDefault(); });
addEventListener('beforepaste', (e) => { if (nodeEdit()) e.preventDefault(); });
if (inShell) {
  call('shell.info').then((i) => { ui.shell = `${i.app} · shell ${i.shell} · ${i.origin}`; });
  on('menu.openProject', openProject); on('menu.save', save); on('menu.saveAs', saveAs);
  on('menu.newProject', openNewProject); // File › New Project… (M6 W3)
  on('menu.openRecent', ({ path }) => openRecent(path)); // File › Open Recent › a project (shell 0.14.0)
  on('menu.projectSettings', openSettings); // File › Project Settings… (M6 W3)
  refreshRecent();
  on('menu.exportGame', exportGame); // File › Export Game… (M5 W0)
  on('menu.duplicate', () => (typing() ? null : duplicate())); // Edit › Duplicate (M5 W5)
  on('menu.shortcuts', () => { ui.shortcuts = true; }); // Help › Keyboard Shortcuts (M5 W6, shell 0.13.0)
  on('menu.undo', () => (editingText() ? document.execCommand('undo') : undo()));
  on('menu.redo', () => (editingText() ? document.execCommand('redo') : redo()));
}

// Before the window closes or the app quits (the Mac shell asks, shell 0.9.0, AB-T-0593): a scene with unsaved changes
// gets a sheet in the window (closing.js: Save, Don't Save or Cancel in a project folder; Cancel or Close Anyway in the
// read-only sample). One question at a time, every one answered (@vrmxg/editor-ui questions).
const sheet = questions((q) => { ui.ask = q; });
const reply = (id) => sheet.reply(id);
const closing = async (reason) => {
  ui.error = '';
  // a game export being written (M5 W0): the person is told it stops, and it stops cleanly, before the question about
  // unsaved changes
  if (!(await exportClosing(ed, { ask: sheet.ask, asking: () => sheet.asking }))) return false;
  const go = await editorClosing(ed, { ask: sheet.ask, asking: () => sheet.asking, reason, onError: (e) => { ui.error = String(e?.message ?? e); } });
  if (ed?.session) refresh();
  return go;
};
if (inShell) onClosing(closing);
const sheetGroups = shortcutGroups();
</script>

<template>
  <div class="app" :class="{ 'with-timeline': !!ui.tl }" :style="gridStyle">
    <header class="bar" role="toolbar" aria-label="Editor controls">
      <strong class="title">VRMXG Editor</strong>
      <button id="new-project-open" type="button" aria-label="New project" title="New Project… (⇧⌘N): a game from a template" :disabled="ui.mode !== 'editing'" @click="openNewProject">New Project…</button>
      <button v-if="ui.shell" id="open-project" type="button" aria-label="Open project" @click="openProject">Open Project…</button>
      <select v-if="ui.shell" id="open-recent" value="" aria-label="Open recent project" title="Open Recent" :disabled="ui.mode !== 'editing' || !ui.recent.length" @change="openRecent($event.target.value); $event.target.value = ''"><option value="">Recent…</option><option v-for="r in ui.recent" :key="r.path" :value="r.path" :disabled="!r.exists" :title="r.path">{{ r.name }}{{ r.exists ? '' : ' (gone)' }}</option></select>
      <span class="muted project" id="project-name" :aria-label="`Project ${ui.project}`" :title="ui.project">{{ ui.project }}</span>
      <button id="project-settings-open" type="button" aria-label="Project settings" title="Project Settings… (⇧⌘P): the game's title, scenes, controls and physics layers" :disabled="!ui.writable || ui.mode !== 'editing'" @click="openSettings">Settings…</button>
      <select id="scene" v-model="ui.scene" aria-label="Scene" title="Open a scene of the project" :disabled="ui.mode !== 'editing'" @change="openScene"><option v-if="!ui.scenes.includes(ui.scene)" :value="ui.scene">{{ ui.scene }} (new)</option><option v-for="s in ui.scenes" :key="s" :value="s">{{ s }}</option></select>
      <input id="file-name" @focus="$event.target.select()" v-model="ui.fileName" class="file-name" aria-label="Scene file name" title="The file New and Save As use, in the project" :disabled="ui.mode !== 'editing'">
      <button id="open-file" type="button" aria-label="Open file" title="Open the scene or sequence named in the file field" :disabled="ui.mode !== 'editing'" @click="openFile">Open</button>
      <button id="new-scene" type="button" aria-label="New scene" :disabled="ui.mode !== 'editing'" @click="newScene">New</button>
      <span class="sep" />
      <select id="seq-set" v-model="ui.seqSet" aria-label="Set to film" title="The scene a new sequence films" :disabled="ui.mode !== 'editing'"><option v-for="x in setScenes()" :key="x" :value="x">{{ x }}</option></select>
      <input id="seq-name" @focus="$event.target.select()" v-model="ui.seqName" class="file-name" aria-label="Sequence file name" title="The new sequence's file" :disabled="ui.mode !== 'editing'">
      <button id="new-sequence" type="button" aria-label="New sequence" :disabled="ui.mode !== 'editing'" @click="newSequence">New Sequence</button>
      <span class="sep" />
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
      <label class="field" title="An outline round the selection"><input id="aid-outline" v-model="ui.aids.outline" type="checkbox" aria-label="Selection outline" @change="setAid('outline')"> Outline</label>
      <label class="field" title="Handles to size the selected collider, sensor or light by dragging (⌥ grows both sides)"><input id="aid-handles" v-model="ui.aids.handles" type="checkbox" aria-label="Shape handles" @change="setAid('handles')"> Handles</label>
      <label class="field" title="What the selected camera sees, picture in picture"><input id="aid-preview" v-model="ui.aids.preview" type="checkbox" aria-label="Camera preview" @change="setAid('preview')"> Preview</label>
      <label class="field" title="Drag on the viewport to select what lies inside a rectangle (⌘-drag does it any time)"><input id="box-select" v-model="ui.boxSelect" type="checkbox" aria-label="Box select" @change="setBoxSelect"> Box</label>
      <span class="sep" />
      <button id="export-open" type="button" :aria-pressed="ui.ex.open" aria-label="Export" :disabled="ui.mode !== 'editing'" @click="ui.ex.open = !ui.ex.open">Export</button>
      <template v-if="ui.mode === 'playing'">
        <div class="seg" role="radiogroup" aria-label="Save slot">
          <button v-for="g in ['slot-1', 'slot-2', 'slot-3']" :id="`game-${g}`" :key="g" type="button" role="radio" :aria-checked="ui.gameSlot === g" :aria-label="`Save slot ${g.slice(-1)}`" :class="{ on: ui.gameSlot === g }" @click="ui.gameSlot = g">{{ g.slice(-1) }}</button>
        </div>
        <button id="save-game" type="button" aria-label="Save game" @click="saveGame">Save Game</button>
        <button id="pause-game" type="button" :aria-label="ui.paused ? 'Resume' : 'Pause'" @click="resume">{{ ui.paused ? 'Resume' : 'Pause' }}</button>
      </template>
      <button id="load-game" type="button" :disabled="ui.loading" aria-label="Load game" title="Load the slot's save into a fresh play of this scene" @click="loadGame">Load Game</button>
      <button id="shortcuts-open" type="button" aria-label="Keyboard shortcuts" title="Keyboard Shortcuts (⌘/)" @click="ui.shortcuts = true">?</button>
      <button id="play" type="button" class="play" :disabled="ui.loading && ui.mode === 'editing'" :aria-label="ui.mode === 'playing' ? 'Stop' : 'Play'" @click="play">{{ ui.mode === 'playing' ? '■ Stop' : '▶ Play' }}</button>
    </header>

    <aside class="dock left" :class="{ folded: ui.panels.scene.collapsed }" aria-label="Scene">
      <button v-if="ui.panels.scene.collapsed" id="panel-scene-expand" type="button" class="rail" aria-label="Expand the Scene panel" @click="foldPanel('scene')">Scene</button>
      <template v-else>
      <div class="dock-head"><button id="panel-scene-fold" type="button" class="fold" aria-label="Fold the Scene panel" title="Fold" @click="foldPanel('scene')">‹</button><h2>Scene</h2>
        <select v-model="ui.addType" aria-label="Node type to add" :disabled="ui.mode !== 'editing'"><option v-for="t in ADDABLE" :key="t" :value="t">{{ t }}</option></select>
        <button id="add-node" type="button" aria-label="Add node" :disabled="ui.mode !== 'editing'" @click="addNode">Add</button>
        <button id="delete" type="button" :aria-label="innerOnly() ? 'Delete selection (a prefab node: edit it through its instance)' : 'Delete selection'" :title="innerOnly() ? INNER_WHY : ''" :disabled="!ui.docSel || ui.mode !== 'editing'" @click="remove">Delete</button>
        <button id="duplicate" type="button" :aria-label="innerOnly() ? 'Duplicate selection (a prefab node: edit it through its instance)' : 'Duplicate selection'" :title="innerOnly() ? INNER_WHY : 'Duplicate (⌘D)'" :disabled="!ui.docSel || ui.mode !== 'editing'" @click="duplicate">Duplicate</button>
        <button id="copy" type="button" :aria-label="innerOnly() ? 'Copy selection (a prefab node: edit it through its instance)' : 'Copy selection'" :title="innerOnly() ? INNER_WHY : 'Copy (⌘C)'" :disabled="!ui.docSel || ui.mode !== 'editing'" @click="copyNodes">Copy</button>
        <button id="paste" type="button" :aria-label="ui.clip ? `Paste ${ui.clip} node${ui.clip > 1 ? 's' : ''}` : 'Paste'" title="Paste (⌘V)" :disabled="!ui.clip || ui.mode !== 'editing'" @click="pasteNodes()">Paste</button>
      </div>
      <div class="tree-search">
        <input id="tree-search" v-model="ui.treeQuery" type="search" placeholder="Search: name, id, type:Light, is:overridden" aria-label="Search the scene tree">
        <output v-if="shownTree.matches !== null" id="tree-matches" :aria-label="`${shownTree.matches} matching nodes`">{{ shownTree.matches }}</output>
      </div>
      <ul class="tree" role="tree" aria-label="Scene tree" @dragover.prevent @drop.prevent="dropOnScene">
        <TreeItem v-for="item in shownTree.items" :key="item.id" :item="item" :selected="ui.selected" @select="select" @reparent="reparent" @fold="fold" />
      </ul>
      </template>
    </aside>

    <main class="stage" @dragenter="overViewport" @dragover="overViewport" @drop.prevent="dropOnViewport">
      <canvas ref="canvas" aria-label="Viewport" tabindex="0"></canvas>
      <p v-if="ui.loading" class="overlay">Loading…</p>
      <p v-if="ui.mode === 'playing'" class="overlay playing" role="status">Playing · step {{ ui.step }} · WASD move, E interact</p>
      <pre v-if="ui.error" class="overlay error" role="alert">{{ ui.error }}</pre>
      <section v-if="ui.ex.open" id="export-panel" class="export" role="dialog" aria-label="Export">
        <h2>Export</h2>
        <label class="field">Take <select id="export-take" v-model="ui.ex.take" aria-label="Take" :disabled="ui.ex.running" @change="takeSeconds"><option v-for="t in ui.ex.takes" :key="t.id" :value="t.id">{{ t.label }}</option></select></label>
        <label class="field">Seconds <input id="export-seconds" v-model="ui.ex.seconds" type="number" min="0.1" step="0.1" aria-label="Seconds" :disabled="ui.ex.running" @focus="$event.target.select()"></label>
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
        <label class="field">File name <input id="export-name" v-model="ui.ex.name" aria-label="Export file name" placeholder="automatic" :disabled="ui.ex.running" @focus="$event.target.select()"></label>
        <div class="row">
          <button id="export-run" type="button" class="play" :disabled="ui.ex.running || !ui.ex.take" :aria-label="ui.shell ? 'Export video' : 'Export (frame hashes only: video needs the Mac app)'" @click="exportVideo">{{ ui.shell ? 'Export Video…' : 'Export (hashes)' }}</button>
          <progress v-if="ui.ex.running" id="export-progress" :max="ui.ex.frames || 1" :value="ui.ex.n" :aria-label="`Exporting ${ui.ex.phase} ${ui.ex.n} of ${ui.ex.frames}`" />
        </div>
        <output v-if="ui.ex.result" id="export-result" :aria-label="`Exported ${ui.ex.result}`">{{ ui.ex.result }}</output>
        <div v-if="ui.ex.take && ui.ex.take !== 'sequence'" class="row">
          <button id="export-bake" type="button" aria-label="Bake the take into a sequence" title="A sequence of this take: the lines as dialogue clips, the decisions and the input as tracks" :disabled="ui.ex.running" @click="bakeTake">Bake into Sequence</button>
        </div>
        <div v-if="ui.ex.canCheck" class="row">
          <button id="export-check" type="button" aria-label="Check the export against scrubbing" title="Jump to frames of each shot from snapshots and compare them with the exported frames" :disabled="ui.ex.running" @click="checkScrub">Check Against Scrub</button>
          <output v-if="ui.ex.check" id="export-check-result" :aria-label="ui.ex.check" :title="`frame, scrub, export: ${ui.ex.checkRows}`">{{ ui.ex.check }}</output>
        </div>
        <h3>Stills</h3>
        <div class="row">
          <button id="save-still" type="button" aria-label="Save still" :disabled="ui.ex.running" @click="saveStill">Save Still…</button>
          <button id="thumbnail" type="button" aria-label="Make thumbnail" :disabled="ui.ex.running" @click="thumbnail">Thumbnail</button>
        </div>
        <output v-if="ui.ex.still" id="still-result" :aria-label="ui.ex.still">{{ ui.ex.still }}</output>
        <h3>Game</h3>
        <label class="field">Build name <input id="game-name" v-model="ui.ex.gameName" aria-label="Game build name" placeholder="the game's id" :disabled="ui.ex.gameRunning" @focus="$event.target.select()"></label>
        <div class="row">
          <button id="export-game" type="button" class="play" :disabled="ui.ex.running || ui.ex.gameRunning" :aria-label="ui.shell ? 'Export game' : 'Export game (checked only: a build folder needs the Mac app)'" title="The project as a playable build: the runtime, the game's files and a manifest of every file's hash and licence" @click="exportGame">{{ ui.shell ? 'Export Game…' : 'Export Game (check)' }}</button>
          <progress v-if="ui.ex.gameRunning" id="export-game-progress" :max="ui.ex.gameTotal || 1" :value="ui.ex.gameN" :aria-label="`Exporting the game: file ${ui.ex.gameN} of ${ui.ex.gameTotal}`" />
        </div>
        <output v-if="ui.ex.game" id="export-game-result" :aria-label="ui.ex.game">{{ ui.ex.game }}</output>
      </section>
      <p v-if="ui.prompt" id="prompt" class="prompt" role="status" :aria-label="`Press ${ui.prompt.key} to ${ui.prompt.text}`"><kbd>{{ ui.prompt.key }}</kbd> {{ ui.prompt.text }}</p>
      <div v-if="ui.captions.length" id="captions" class="captions" role="status" aria-live="polite">
        <p v-for="c in ui.captions" :key="c.actor" :aria-label="`${c.name}: ${c.text}`"><strong>{{ c.name }}</strong> <span v-for="(w, i) in c.words" :key="i" :class="{ said: i < c.spoken, now: i === c.word }">{{ `${w} ` }}</span></p>
      </div>
    </main>

    <aside class="dock right" :class="{ folded: ui.panels.inspector.collapsed }">
      <button v-if="ui.panels.inspector.collapsed" id="panel-inspector-expand" type="button" class="rail" aria-label="Expand the Inspector panel" @click="foldPanel('inspector')">Inspector</button>
      <template v-else>
        <button id="panel-inspector-fold" type="button" class="fold fold-corner" aria-label="Fold the Inspector panel" title="Fold" @click="foldPanel('inspector')">›</button>
        <Inspector :data="ui.inspector" :clip="ui.fieldClip" :picked="ui.picked" v-on="onInspector" />
      </template>
    </aside>

    <section class="bottom" :class="{ folded: ui.panels[bottomPanel()].collapsed }" :aria-label="ui.tl ? 'Timeline panel' : 'Assets panel'">
      <button v-if="ui.panels[bottomPanel()].collapsed" :id="`panel-${bottomPanel()}-expand`" type="button" class="rail rail-h" :aria-label="`Expand the ${ui.tl ? 'Timeline' : 'Assets'} panel`" @click="foldPanel(bottomPanel())">{{ ui.tl ? 'Timeline' : 'Assets' }} ▴</button>
      <template v-else>
        <button :id="`panel-${bottomPanel()}-fold`" type="button" class="fold fold-corner" :aria-label="`Fold the ${ui.tl ? 'Timeline' : 'Assets'} panel`" title="Fold" @click="foldPanel(bottomPanel())">▾</button>
        <Timeline v-if="ui.tl" :data="ui.tl" :disabled="ui.mode !== 'editing' || ui.loading" @cmd="tlCmd" @scrub="tlScrub" @transport="tlTransport" />
        <AssetsPanel v-else class="assets" :entries="tiles" :picked="ui.picked" :disabled="ui.mode !== 'editing'" :status="ui.thumbStatus" @add="addAsset" @pick="(r) => { ui.picked = ui.picked === r ? '' : r; }" />
      </template>
    </section>

    <!-- the panels' edges (M5 W6): drag one, or focus it and use the arrow keys (Home / End, Return folds) -->
    <div id="split-scene" class="split split-x edge-right" role="separator" aria-orientation="vertical" tabindex="0" :aria-label="`Scene panel width${ui.panels.scene.collapsed ? ', folded' : ''}`" :aria-valuenow="ui.panels.scene.size" :aria-valuemin="EDITOR_PANELS.scene.min" :aria-valuemax="EDITOR_PANELS.scene.max" @pointerdown="dragSplit($event, 'scene')" @keydown="keySplit($event, 'scene')" />
    <div id="split-inspector" class="split split-x edge-left" role="separator" aria-orientation="vertical" tabindex="0" :aria-label="`Inspector panel width${ui.panels.inspector.collapsed ? ', folded' : ''}`" :aria-valuenow="ui.panels.inspector.size" :aria-valuemin="EDITOR_PANELS.inspector.min" :aria-valuemax="EDITOR_PANELS.inspector.max" @pointerdown="dragSplit($event, 'inspector')" @keydown="keySplit($event, 'inspector')" />
    <div :id="`split-${bottomPanel()}`" class="split split-y edge-top" role="separator" aria-orientation="horizontal" tabindex="0" :aria-label="`${ui.tl ? 'Timeline' : 'Assets'} panel height${ui.panels[bottomPanel()].collapsed ? ', folded' : ''}`" :aria-valuenow="ui.panels[bottomPanel()].size" :aria-valuemin="EDITOR_PANELS[bottomPanel()].min" :aria-valuemax="EDITOR_PANELS[bottomPanel()].max" @pointerdown="dragSplit($event, bottomPanel())" @keydown="keySplit($event, bottomPanel())" />

    <NewProject v-if="ui.newProject.open" :templates="ui.newProject.templates" :can-create="!!ui.shell" :busy="ui.newProject.busy" :error="ui.newProject.error" @create="createProject" @cancel="ui.newProject.open = false" />
    <ProjectSettings v-if="ui.settings" :view="ui.settings" :disabled="ui.settingsBusy" :plan="settingsPlan" @op="settingsOp" @undo="undo" @redo="redo" @close="closeSettings" />

    <div v-if="ui.shortcuts" class="ask-back" @click.self="ui.shortcuts = false">
      <section id="shortcuts" class="sheet" role="dialog" aria-label="Keyboard shortcuts" aria-modal="true">
        <div class="row"><h2>Keyboard Shortcuts</h2><button id="shortcuts-close" type="button" aria-label="Close the shortcuts" @click="ui.shortcuts = false">Done</button></div>
        <div class="sheet-cols">
          <section v-for="g in sheetGroups" :key="g.group" :aria-label="g.group">
            <h3>{{ g.group }}</h3>
            <dl><template v-for="it in g.items" :key="it.label"><dt :aria-label="`${it.label}: ${it.keys}`">{{ it.label }}<span v-if="it.note" class="muted small"> ({{ it.note }})</span></dt><dd><kbd>{{ it.keys }}</kbd></dd></template></dl>
          </section>
        </div>
      </section>
    </div>

    <div v-if="ui.ask" class="ask-back">
      <section id="ask" class="ask" role="alertdialog" :aria-label="ui.ask.title" aria-modal="true">
        <h2>{{ ui.ask.title }}</h2>
        <p id="ask-text" :aria-label="ui.ask.text">{{ ui.ask.text }}</p>
        <div class="row"><button v-for="(o, i) in ui.ask.options" :id="`ask-${o.id}`" :key="o.id" type="button" :class="{ play: i === 0 }" :aria-label="o.label" @click="reply(o.id)">{{ o.label }}</button></div>
      </section>
    </div>

    <footer class="bar status">
      <fieldset class="toggles"><legend>Debug</legend>
        <label v-for="k in ['colliders', 'sensors', 'capsules', 'rays']" :key="k"><input v-model="ui.debug[k]" type="checkbox" :aria-label="k" @change="setDebug"> {{ k }}</label>
      </fieldset>
      <output id="doc-state" :aria-label="`Scene ${ui.scene} ${ui.nodes} nodes ${ui.dirty ? 'unsaved changes' : 'saved'} ${ui.valid ? 'valid' : 'invalid'} hash ${ui.hash}`">{{ ui.nodes }} nodes · {{ ui.dirty ? 'unsaved changes' : 'saved' }} · {{ ui.valid ? 'valid' : `invalid: ${ui.problems}` }} · {{ ui.hash }}</output>
      <output v-if="ui.saved" id="saved" :aria-label="`Saved ${ui.saved}`">Saved {{ ui.saved }}</output>
      <button v-if="ui.saved" id="verify" type="button" aria-label="Reopen and compare" @click="verify">Reopen &amp; compare</button>
      <output v-if="ui.verify" id="verify-result" :aria-label="`Reopened ${ui.verify}`">{{ ui.verify }}</output>
      <output v-if="ui.stopped" id="stop-result" :aria-label="`Stopped: ${ui.stopped}`">Stopped: {{ ui.stopped }}</output>
      <output v-if="ui.gameNote" id="game-note" :aria-label="ui.gameNote">{{ ui.gameNote }}</output>
      <output v-if="ui.mcp" id="mcp-state" :aria-label="ui.mcp">{{ ui.mcp }}</output>
      <output v-if="ui.note" id="note" :aria-label="ui.note">{{ ui.note }}</output>
      <output v-if="ui.layerProblem" id="layer-problem" class="warn" :aria-label="`Layers: ${ui.layerProblem}`">Layers: {{ ui.layerProblem }}</output>
      <output id="frame-time" :aria-label="`Frame time ${ui.frame}`">{{ ui.frame }}</output>
      <output id="build-time" :aria-label="`Build ${ui.build}`">build {{ ui.build }}</output>
      <output id="renderer" :aria-label="`Renderer ${ui.renderer}`">{{ ui.renderer }}</output>
      <output id="holds" class="muted" :aria-label="`Holds ${ui.holds}`" title="Worlds alive (the edit view, the preview, Play), and the view's GPU objects: a count that keeps climbing is a leak">{{ ui.holds }}</output>
      <span v-if="ui.shell" class="muted" :aria-label="`Shell ${ui.shell}`">{{ ui.shell }}</span>
    </footer>
  </div>
</template>

<style>
:root { color-scheme: light dark; --bg: #f4f5f7; --panel: #ffffff; --ink: #1d2128; --muted: #5f6672; --line: #d9dde3; --accent: #2f6fde; --sel: #dbe7fd; }
@media (prefers-color-scheme: dark) { :root { --bg: #15171b; --panel: #1e2127; --ink: #e8eaee; --muted: #9aa1ad; --line: #30353d; --accent: #5b8ff0; --sel: #24365a; } }
html, body, #app { margin: 0; height: 100%; background: var(--bg); color: var(--ink); font: 13px/1.4 -apple-system, system-ui, sans-serif; }
.app { display: grid; height: 100%; grid-template: "bar bar bar" auto "left stage right" 1fr "left assets right" var(--bottom, 200px) "status status status" auto / var(--left, 280px) 1fr var(--right, 300px); }
.bottom { grid-area: assets; position: relative; min-height: 0; display: flex; flex-direction: column; background: var(--panel); border-top: 1px solid var(--line); }
.bottom > .timeline, .bottom > .assets-panel { flex: 1; min-height: 0; }
.bar { grid-area: bar; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 6px 10px; background: var(--panel); border-bottom: 1px solid var(--line); }
.status { grid-area: status; border-top: 1px solid var(--line); border-bottom: 0; font-size: 12px; gap: 14px; }
.title { margin-right: 4px; }
.file-name { width: 120px; }
.project { flex: none; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar:not(.status) { flex-wrap: nowrap; overflow-x: auto; }
.dock-head select { width: 110px; min-width: 0; }
.sep { width: 1px; height: 20px; background: var(--line); }
.field { display: flex; align-items: center; gap: 6px; color: var(--muted); }
button, select, input { font: inherit; color: var(--ink); background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 3px 8px; }
button:disabled { opacity: 0.45; }
button.play { background: var(--accent); color: #fff; border-color: var(--accent); min-width: 78px; }
.seg { display: inline-flex; } .seg button { border-radius: 0; margin-left: -1px; } .seg button:first-child { border-radius: 6px 0 0 6px; } .seg button:last-child { border-radius: 0 6px 6px 0; }
.seg button.on { background: var(--accent); color: #fff; border-color: var(--accent); }
.dock { background: var(--panel); overflow: auto; min-height: 0; position: relative; }
.split { z-index: 5; background: transparent; outline: none; position: relative; }
.split:hover, .split:focus-visible { background: color-mix(in srgb, var(--accent) 45%, transparent); }
.split-x { width: 6px; cursor: col-resize; align-self: stretch; } .edge-right { grid-area: left; justify-self: end; margin-right: -3px; } .edge-left { grid-area: right; justify-self: start; margin-left: -3px; }
.split-y { height: 6px; cursor: row-resize; justify-self: stretch; } .edge-top { grid-area: assets; align-self: start; margin-top: -3px; }
.rail { width: 100%; height: 100%; border: 0; border-radius: 0; writing-mode: vertical-rl; color: var(--muted); background: var(--panel); }
.rail-h { writing-mode: horizontal-tb; height: auto; flex: 1; text-align: left; padding: 4px 10px; }
.fold { padding: 0 6px; line-height: 1.4; }
.fold-corner { position: absolute; right: 6px; top: 6px; z-index: 3; }
.tree-search { display: flex; gap: 6px; align-items: center; padding: 6px 10px; border-bottom: 1px solid var(--line); }
.tree-search input { flex: 1; min-width: 0; }
.tree .row.inner .name { font-style: italic; color: var(--muted); } .tree .row.inner.sel .name { color: var(--ink); }
.tree .row.match .name { background: color-mix(in srgb, #ffd76a 45%, transparent); border-radius: 3px; }
.tree .disc { border: 0; background: none; padding: 0 2px; width: 14px; color: var(--muted); } .tree .disc-space { display: inline-block; width: 18px; }
.tree .ov-mark { color: var(--accent); font-size: 9px; } .tree .badge { font-size: 10px; color: var(--muted); border: 1px solid var(--line); border-radius: 8px; padding: 0 5px; }
.tree .row .name { flex: 1; overflow: hidden; text-overflow: ellipsis; }
.sheet { width: min(860px, 92vw); max-height: 76vh; overflow: auto; padding: 14px 16px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35); }
.sheet > .row { display: flex; justify-content: space-between; align-items: center; } .sheet h2 { color: var(--ink); font-size: 14px; text-transform: none; letter-spacing: 0; }
.sheet-cols { columns: 2 320px; column-gap: 24px; } .sheet-cols > section { break-inside: avoid; }
.sheet dl { display: grid; grid-template-columns: 1fr auto; gap: 3px 12px; margin: 0; } .sheet dt { margin: 0; } .sheet dd { margin: 0; text-align: right; }
.sheet kbd { font: 12px/1.4 -apple-system, system-ui, sans-serif; padding: 0 5px; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 4px; background: var(--bg); white-space: nowrap; }
.left { grid-area: left; border-right: 1px solid var(--line); }
.right { grid-area: right; border-left: 1px solid var(--line); }
.dock-head { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 1; background: var(--panel); }
.dock-head h2 { flex: 1; }
h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); margin: 0; }
h3 { font-size: 12px; color: var(--muted); margin: 14px 0 6px; }
.tree, .tree ul { list-style: none; margin: 0; padding: 0; }
.tree .row { display: flex; align-items: center; gap: 4px; padding: 3px 8px; cursor: default; white-space: nowrap; }
.tree .row:hover { background: color-mix(in srgb, var(--sel) 50%, transparent); }
.tree .row.sel { background: var(--sel); } .tree .row.primary { box-shadow: inset 2px 0 var(--accent); }
.tree .type { color: var(--muted); font-size: 11px; }
.stage { grid-area: stage; position: relative; min-height: 0; background: #0e1014; }
canvas { display: block; width: 100%; height: 100%; outline: none; }
.overlay { position: absolute; left: 12px; top: 8px; margin: 0; padding: 6px 10px; background: color-mix(in srgb, var(--panel) 88%, transparent); border-radius: 6px; }
.overlay.playing { left: auto; right: 12px; }
.prompt { position: absolute; left: 50%; bottom: 18%; transform: translateX(-50%); margin: 0; padding: 6px 12px; border-radius: 8px; background: color-mix(in srgb, var(--panel) 88%, transparent); font-size: 15px; pointer-events: none; }
.prompt kbd { display: inline-block; min-width: 1.4em; padding: 1px 6px; margin-right: 6px; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 5px; background: var(--bg); font: 600 13px/1.4 -apple-system, system-ui, sans-serif; text-align: center; }
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
.toggles { display: flex; gap: 8px; border: 0; margin: 0; padding: 0; } .toggles legend { float: left; margin-right: 4px; color: var(--muted); }
output { font-variant-numeric: tabular-nums; } .warn { color: #c77b00; }
.export { position: absolute; right: 12px; top: 8px; width: 320px; max-height: calc(100% - 24px); overflow: auto; padding: 10px 12px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25); box-sizing: border-box; }
.export .field { justify-content: space-between; margin: 6px 0; gap: 8px; } .export .seg button { padding: 3px 6px; font-size: 12px; } .export .field select, .export .field input:not([type=checkbox]) { width: 180px; box-sizing: border-box; }
.export .row { display: flex; align-items: center; gap: 8px; margin: 8px 0; } .export progress { flex: 1; }
.export output { display: block; font-size: 12px; color: var(--muted); word-break: break-word; }
.ask-back { position: fixed; inset: 0; z-index: 20; display: flex; align-items: flex-start; justify-content: center; padding-top: 12vh; background: rgba(0, 0, 0, 0.3); }
.ask { width: 380px; padding: 14px 16px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35); }
.ask h2 { margin-bottom: 8px; color: var(--ink); text-transform: none; letter-spacing: 0; font-size: 14px; }
.ask p { margin: 0 0 12px; } .ask .row { display: flex; justify-content: flex-end; gap: 8px; }
</style>
