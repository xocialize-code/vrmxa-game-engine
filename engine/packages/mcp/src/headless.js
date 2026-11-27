// The headless target (Node): one scene of a project open in an editing session (@vrmxg/editor-core's EditorSession,
// the editor's own: the same commands and checks), and a headless engine. server.js <root> <scene> serves it on stdio.
//
// M6 W8: the target can move. `game op=open` opens another scene of the project (or a new one), and `game op=new` makes
// a project from a template in the folder the person named with --projects and opens it on its entry scene, its own
// behaviours declared in place of the last project's. Project settings are the editor's ProjectSettings over the folder.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, serialize, changedLines } from '@vrmxg/scene';
import { EditorSession } from '@vrmxg/editor-core';
import { declareProjectBehaviours } from '@vrmxg/registry';
import { exportBuild, defaultGame, GAME_FILE } from '@vrmxg/bundle';
import { exportToFolder, folderReader, checkFolder, behavioursImporter } from '@vrmxg/bundle/node';
// the editor's own: Project Settings (M6 W3) and New Project's templates (content/templates), read one way everywhere
import { ProjectSettings, projectLayerUses } from '../../../../apps/editor/src/project-settings.js';
import { listTemplates, makeProject } from '../../../../content/templates/tools/new-project.mjs';
import { gameIdFrom } from '../../../../content/templates/templates.js';
import { Project } from './project.js';
import { EngineSession } from './engine.js';
import { toolList, createHandlers, caller } from './tools.js';

/** The runtime a build is made with when none is named: @vrmxg/bundle's own (`npm run build:runtime -w @vrmxg/bundle`), as vrmxg-export's default is. */
export const defaultRuntime = () => path.resolve(path.dirname(fileURLToPath(import.meta.resolve('@vrmxg/bundle'))), '../runtime/dist');

const walk = (root, dir = root, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(root, f, out); else out.push(path.relative(root, f).split(path.sep).join('/'));
  }
  return out;
};

/**
 * @param {{ registry: any, project: import('./project.js').Project, scene: string, builds?: string | null, runtime?: string | null, projects?: string | null, behaviourProblems?: string[] }} opts
 *   scene: path under the project; builds: the folder `game op=export` writes builds into, each in a folder of its own
 *   (without it an export is checked and hashed, and nothing is written: where builds go is the person's to say, when
 *   they start the server); runtime: the runtime folder a build is made with; projects: the folder `game op=new` makes
 *   projects in (without it, none is made: the same reason); behaviourProblems: why the project's behaviours weren't
 *   declared (server.js declares them before the tools are listed)
 */
/**
 * The prefabs a session reads, loaded from the project when first asked for (a prefab an edit has just placed, or one
 * nested in it), as the target before M6 W8 read them afresh on every call.
 * @param {import('./project.js').Project} project @param {any} doc
 */
function projectPrefabs(project, doc) {
  class OnDemand extends Map {
    get(ref) {
      if (!super.has(ref) && typeof ref === 'string' && ref.endsWith('.vrmxs')) {
        try { if (project.exists(ref)) super.set(ref, parse(fs.readFileSync(project.file(ref), 'utf8'))); } catch { /* not a file of the project, or not a scene: the scene's own check names it */ }
      }
      return super.get(ref);
    }
    has(ref) { return this.get(ref) !== undefined; }
  }
  return project.prefabs(doc, new OnDemand());
}

export function createTools({ registry: reg, project: first, scene, builds = null, runtime = null, projects = null, behaviourProblems = [] }) {
  const at = { project: first, scenePath: '', sceneRef: '', session: /** @type {any} */ (null), savedText: '', engine: /** @type {any} */ (null), settings: /** @type {any} */ (null), behaviourProblems };
  /** Open a scene of the current project: its file, or (`doc`) a document not yet saved as `ref` (`unsaved`: a copy is). */
  const openScene = (ref, doc = null, { unsaved = false } = {}) => {
    const scenePath = at.project.file(ref);
    const d = doc ?? parse(fs.readFileSync(scenePath, 'utf8'));
    const prefabs = projectPrefabs(at.project, d);
    at.session = new EditorSession({ registry: reg, doc: d, prefabs, path: ref });
    at.scenePath = scenePath;
    at.sceneRef = path.relative(at.project.root, scenePath).split(path.sep).join('/'); // as game.json and changeScene name it
    at.savedText = unsaved ? '' : serialize(at.session.doc); // after the session (it adds empty assets and connections lists); a copy is unsaved, an empty new scene isn't (as the editor's New Scene)
    at.session.savedText = at.savedText;
  };
  openScene(scene);
  /** Work in the project at `root` (new, or read again): its behaviours module (game.json's) declared in place of the last one's. */
  const adopt = async (root) => {
    at.project = new Project(root, { vrmxaCore: at.project.vrmxaCorePath ?? undefined, seed: at.project.seed });
    at.behaviourProblems = [];
    try { declareProjectBehaviours(reg, await at.project.behaviours()); } catch (e) { reg.project(new Map()); at.behaviourProblems = [String(e?.message ?? e)]; }
    at.engine = new EngineSession(at.project, { director: process.env.VRMXG_DIRECTOR ?? null });
  };
  at.engine = new EngineSession(at.project, { director: process.env.VRMXG_DIRECTOR ?? null });
  const doc = () => at.session.doc;
  const prefabs = () => at.session.prefabs;
  /** The project as Project Settings reads it: its files now, and writes into the folder. */
  const asSettingsProject = (p) => ({
    get files() { return walk(p.root).sort(); },
    has: (ref) => p.exists(ref), text: async (ref) => fs.readFileSync(p.file(ref), 'utf8'), name: path.basename(p.root),
    scenes: () => walk(p.root).filter((f) => f.endsWith('.vrmxs')),
    write: async (ref, text) => { fs.mkdirSync(path.dirname(p.file(ref)), { recursive: true }); fs.writeFileSync(p.file(ref), text); },
  });
  const target = {
    session: () => at.session,
    doc, prefabs,
    apply: (op, label) => at.session.run(label ?? op.op, [op]),
    undo: () => at.session.undo(), redo: () => at.session.redo(),
    save(r) {
      const text = serialize(doc());
      const n = changedLines(at.savedText, text);
      fs.mkdirSync(path.dirname(at.scenePath), { recursive: true });
      fs.writeFileSync(at.scenePath, text); at.savedText = text; at.session.markSaved?.(text);
      return { saved: at.sceneRef, changedLines: n, warnings: r.warnings };
    },
    live: () => at.engine,
    load: () => at.engine.load(structuredClone(doc()), prefabs(), { scene: at.sceneRef }),
    // the game as a whole (M5 W9): the project's files as the exporter reads them, and an export into the builds folder
    project: () => folderReader(at.project.root),
    sceneRef: () => at.sceneRef,
    unsaved: () => serialize(doc()) !== at.savedText,
    async exportGame({ name }) {
      const rt = runtime ? path.resolve(runtime) : defaultRuntime();
      const about = (r) => ({ id: r.manifest.game.id, title: r.manifest.game.title, entry: r.manifest.game.entry, runtime: `${r.manifest.runtime.name} ${r.manifest.runtime.version}`, files: r.files, bytes: r.bytes, digest: r.manifest.digest, manifest: r.sha256, licensedByPattern: r.byPattern });
      const root = at.project.root, src = folderReader(root), files = src.files;
      // a project with no game.json is the open scene alone, as the editor's Export Game and `game op=rules` take it
      const game = files.includes(GAME_FILE) ? null : defaultGame({ files, entry: at.sceneRef });
      // every check and every hash, nothing written: also how the build's name (the game's id) is known before a folder is
      const checked = await exportBuild({ project: { files, read: src.read }, runtime: folderReader(rt), game, write: null, importModule: behavioursImporter(root) });
      if (!builds) return { ...about(checked), written: false, note: 'checked and hashed, nothing written: this server was started without --builds <folder>, which says where builds go. Ask the person to add it.' };
      const out = path.join(path.resolve(builds), name ?? checked.manifest.game.id);
      const r = await exportToFolder({ project: root, runtime: rt, out, game });
      return { ...about(r), written: true, path: r.out, state: checkFolder(r.out).state };
    },
    recording: (ref) => at.project.json(ref),
    takes: () => (fs.existsSync(at.project.file('takes')) ? fs.readdirSync(at.project.file('takes')).filter((f) => f.endsWith('.json')).map((f) => `takes/${f}`) : []),
    personas: () => at.engine.tree?.services.get('persona') ?? null,

    // ------------------------------------------------------------ M6 W8: building games
    /** The project's behaviours module: its exports (declared or not) and what was wrong with it, for game op=validate. */
    async behaviours() {
      let names = null;
      try { names = [...(await at.project.behaviours()).keys()]; } catch (e) { return { ref: at.project.behavioursRef, names: null, problems: [`${at.project.behavioursRef} didn't load: ${e?.message ?? e}`] }; }
      return { ref: at.project.behavioursRef, names, problems: at.behaviourProblems };
    },
    /** The project's settings: one ProjectSettings per project, so its undo history lasts as long as the project is open. */
    async settings() {
      if (at.settings?.root !== at.project.root) {
        const src = asSettingsProject(at.project);
        at.settings = { root: at.project.root, s: await ProjectSettings.load(src, { layerUses: () => projectLayerUses(src, { ref: at.sceneRef, doc: doc() }) }) };
      }
      return at.settings.s;
    },
    /** Open a scene of the project, or start a new one (empty, or a copy of `from`) that is saved as `scene`. */
    openScene({ scene: ref, from }) {
      const exists = at.project.exists(ref);
      if (from !== undefined && exists) throw new Error(`${ref} exists already: open it without from, or name a new scene`);
      if (from !== undefined && !at.project.exists(from)) throw new Error(`no scene ${from} to copy`);
      const id = ref.replace(/\.vrmxs$/, '').replace(/[^A-Za-z0-9_-]/g, '-'); // as the editor's New Scene names one ("rooms/new.vrmxs": rooms-new)
      if (exists) openScene(ref);
      else if (from !== undefined) openScene(ref, { ...parse(fs.readFileSync(at.project.file(from), 'utf8')), id }, { unsaved: true });
      else openScene(ref, EditorSession.empty(reg, id).doc);
      return { open: at.sceneRef, new: !exists, ...(from !== undefined ? { from } : {}), nodes: doc().nodes.length, ...(exists ? {} : { note: 'not saved yet: save writes it; name it in game op=settings scenes for a scene change to reach it' }) };
    },
    /** game.json's behaviours module changed (game op=settings): read the project again, its module declared afresh. */
    async behavioursChanged() {
      await adopt(at.project.root);
      const declared = [...reg.behaviours.values()].filter((b) => b.source === 'project').map((b) => b.name);
      return { module: at.project.behavioursRef, declared, ...(at.behaviourProblems.length ? { problems: at.behaviourProblems } : {}) };
    },
    templates: () => listTemplates(),
    /** A project from a template in the --projects folder, opened on its entry scene with its own behaviours. */
    async newProject({ template, title, id }) {
      if (!projects) throw new Error('this server was started without --projects <folder>, which says where new projects go: ask the person to add it');
      const root = path.join(path.resolve(projects), id ?? gameIdFrom(title));
      const r = makeProject(template.id, root, { title, ...(id ? { gameId: id } : {}) });
      await adopt(root);
      at.settings = null;
      const entry = JSON.parse(fs.readFileSync(at.project.file(GAME_FILE), 'utf8')).entry;
      openScene(entry);
      return { project: root, game: { id: r.id, title: r.title }, template: template.id, files: r.files.length, open: at.sceneRef, note: 'the server works in the new project now: its entry scene is open' };
    },
  };
  const tools = toolList(reg, 'headless');
  return { tools, call: caller(createHandlers(reg, target)), target, get doc() { return at.session.doc; }, get session() { return at.session; }, get engine() { return at.engine; }, get project() { return at.project; } };
}
