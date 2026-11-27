// The editor host's project behaviours (M6 W0, W2, W9) as plain functions over the host's fields, so a Node test runs
// the code the host runs (host.js can't be imported in Node: it draws). The host keeps `project`, `behaviourProblems`,
// `behaviourError`, `behaviourSources` and `_bareFor`, and its methods of the same names delegate here.
import { declareProjectBehaviours } from '@vrmxg/registry';

/**
 * Declare a project's behaviours module into the editor's registry, keeping what went wrong as a problem (openProject).
 * A module that won't load or declarations the registry refuses don't keep the project closed: the registry's project
 * behaviours are cleared and the problem is shown.
 * @param {any} host @param {any} registry @param {any} project
 */
export async function declareBehaviours(host, registry, project) {
  host.behaviourProblems = []; host.behaviourError = '';
  try { declareProjectBehaviours(registry, await project.behaviours()); } catch (err) {
    registry.project(new Map());
    host.behaviourProblems = [String(err?.message ?? err)];
    host.behaviourError = `The project's behaviours: ${host.behaviourProblems[0]}`;
  }
  host.behaviourSources = project.behavioursModule?.sources ?? null; // the text those classes came from (M6 W2: what hot reload compares with)
}

/**
 * game.json's behaviours module changed (Project Settings › Behaviours, MCP's game op=settings; M6 W9): forget the
 * module read when the project opened and read the one game.json names now, so the inspector, Play and Export Game
 * all use the module the build will. A module added to the folder since the project opened isn't in its file list
 * until the project is opened again (AB-T-0670). → { module, declared, problems? }, or null with no project open
 * @param {any} host @param {any} registry
 */
export async function reloadBehaviours(host, registry) {
  const p = host.project;
  if (!p) return null;
  p.forgetBehaviours();
  await declareBehaviours(host, registry, p);
  host.changed?.();
  const declared = [...registry.behaviours.values()].filter((b) => b.source === 'project').map((b) => b.name);
  return { module: p.behavioursModule?.ref ?? null, declared, ...(host.behaviourProblems.length ? { problems: [...host.behaviourProblems] } : {}) };
}

/**
 * The project's behaviours as a world is built with them (Play, takes, exports). When their declarations were refused
 * (declareBehaviours), each class is handed over as a bare subclass, which has no describe of its own: the world
 * declares none of them, as the editor's registry doesn't, and runs them as code only instead of refusing to build. A
 * module that wouldn't load gives none.
 * @param {any} host @param {any} project
 */
export async function worldBehaviours(host, project) {
  if (!host.behaviourProblems.length) return project.behaviours();
  let map;
  try { map = await project.behaviours(); } catch { return new Map(); }
  if (host._bareFor?.map !== map) host._bareFor = { map, bare: new Map([...map].map(([n, C]) => [n, class extends C {}])) };
  return host._bareFor.bare;
}
