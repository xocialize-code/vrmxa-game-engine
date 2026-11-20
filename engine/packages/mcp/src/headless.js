// The headless target (Node): one scene file of a project, edited with undo (@vrmxg/scene's editor), and a headless
// engine. server.js <root> <scene> serves it on stdio.
import fs from 'node:fs';
import path from 'node:path';
import { parse, serialize, createEditor, changedLines } from '@vrmxg/scene';
import { EngineSession } from './engine.js';
import { toolList, createHandlers, caller } from './tools.js';

/**
 * @param {{ registry: any, project: import('./project.js').Project, scene: string }} opts scene: path under the project
 */
export function createTools({ registry: reg, project, scene }) {
  const scenePath = project.file(scene);
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
    load: () => engine.load(structuredClone(doc), prefabs()),
    recording: (ref) => project.json(ref),
    takes: () => (fs.existsSync(project.file('takes')) ? fs.readdirSync(project.file('takes')).filter((f) => f.endsWith('.json')).map((f) => `takes/${f}`) : []),
    personas: () => engine.tree?.services.get('persona') ?? null,
  };
  const tools = toolList(reg, 'headless');
  return { tools, call: caller(createHandlers(reg, target)), doc, editor, engine };
}
