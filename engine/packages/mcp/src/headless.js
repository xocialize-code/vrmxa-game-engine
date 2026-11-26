// The headless target (Node): one scene file of a project, edited with undo (@vrmxg/scene's editor), and a headless
// engine. server.js <root> <scene> serves it on stdio.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, serialize, createEditor, changedLines } from '@vrmxg/scene';
import { exportBuild, defaultGame, GAME_FILE } from '@vrmxg/bundle';
import { exportToFolder, folderReader, checkFolder, behavioursImporter } from '@vrmxg/bundle/node';
import { EngineSession } from './engine.js';
import { toolList, createHandlers, caller } from './tools.js';

/** The runtime a build is made with when none is named: @vrmxg/bundle's own (`npm run build:runtime -w @vrmxg/bundle`), as vrmxg-export's default is. */
export const defaultRuntime = () => path.resolve(path.dirname(fileURLToPath(import.meta.resolve('@vrmxg/bundle'))), '../runtime/dist');

/**
 * @param {{ registry: any, project: import('./project.js').Project, scene: string, builds?: string | null, runtime?: string | null }} opts
 *   scene: path under the project; builds: the folder `game op=export` writes builds into, each in a folder of its own
 *   (without it an export is checked and hashed, and nothing is written: where builds go is the person's to say, when
 *   they start the server); runtime: the runtime folder a build is made with
 */
export function createTools({ registry: reg, project, scene, builds = null, runtime = null }) {
  const scenePath = project.file(scene);
  const sceneRef = path.relative(project.root, scenePath).split(path.sep).join('/'); // as game.json and changeScene name it
  const doc = parse(fs.readFileSync(scenePath, 'utf8'));
  let savedText = serialize(doc);
  const prefabs = () => project.prefabs(doc);
  const editor = createEditor(reg, doc, { prefabs });
  const engine = new EngineSession(project, { director: process.env.VRMXG_DIRECTOR ?? null });
  const target = {
    doc: () => doc, prefabs,
    apply: (op) => editor.apply(op),
    undo: () => editor.undo(), redo: () => editor.redo(),
    save(r) {
      const text = serialize(doc);
      const n = changedLines(savedText, text);
      fs.writeFileSync(scenePath, text); savedText = text;
      return { saved: path.relative(project.root, scenePath), changedLines: n, warnings: r.warnings };
    },
    live: () => engine,
    load: () => engine.load(structuredClone(doc), prefabs(), { scene: sceneRef }),
    // the game as a whole (M5 W9): the project's files as the exporter reads them, and an export into the builds folder
    project: () => folderReader(project.root),
    sceneRef: () => sceneRef,
    unsaved: () => serialize(doc) !== savedText,
    async exportGame({ name }) {
      const rt = runtime ? path.resolve(runtime) : defaultRuntime();
      const about = (r) => ({ id: r.manifest.game.id, title: r.manifest.game.title, entry: r.manifest.game.entry, runtime: `${r.manifest.runtime.name} ${r.manifest.runtime.version}`, files: r.files, bytes: r.bytes, digest: r.manifest.digest, manifest: r.sha256, licensedByPattern: r.byPattern });
      const src = folderReader(project.root), files = src.files;
      // a project with no game.json is the open scene alone, as the editor's Export Game and `game op=rules` take it
      const game = files.includes(GAME_FILE) ? null : defaultGame({ files, entry: sceneRef });
      // every check and every hash, nothing written: also how the build's name (the game's id) is known before a folder is
      const checked = await exportBuild({ project: { files, read: src.read }, runtime: folderReader(rt), game, write: null, importModule: behavioursImporter(project.root) });
      if (!builds) return { ...about(checked), written: false, note: 'checked and hashed, nothing written: this server was started without --builds <folder>, which says where builds go. Ask the person to add it.' };
      const out = path.join(path.resolve(builds), name ?? checked.manifest.game.id);
      const r = await exportToFolder({ project: project.root, runtime: rt, out, game });
      return { ...about(r), written: true, path: r.out, state: checkFolder(r.out).state };
    },
    recording: (ref) => project.json(ref),
    takes: () => (fs.existsSync(project.file('takes')) ? fs.readdirSync(project.file('takes')).filter((f) => f.endsWith('.json')).map((f) => `takes/${f}`) : []),
    personas: () => engine.tree?.services.get('persona') ?? null,
  };
  const tools = toolList(reg, 'headless');
  return { tools, call: caller(createHandlers(reg, target)), doc, editor, engine };
}
