// "After Hours" (M6 W10, AB-T-0651): the build plan (after-hours-plan.mjs) applied to the editor's own EditorSession,
// headless: the ops the inspector's panels call, in the order a person makes them. tools/make-after-hours.mjs saves what
// it makes as the committed scenes; acceptance/m6/after-hours-scenario.mjs runs it with hooks that write, beside each op,
// the AppProbe steps that make it in the Mac editor (it reads the session as it goes: the ids the editor gives, the undo
// step each edit names).
import fs from 'node:fs';
import path from 'node:path';
import { Euler, Quaternion } from 'three';
import { m0Registry } from '@vrmxg/registry/m0';
import { declareProjectBehaviours } from '@vrmxg/registry';
import { EditorSession } from '@vrmxg/editor-core';
import { ProjectSettings } from '../../../apps/editor/src/project-settings.js';
import { personalGame } from '../../templates/templates.js';
import { DIR, SCENES, GAME } from './after-hours-plan.mjs';

const root = path.resolve(import.meta.dirname, '..');

/** The registry with the game's own behaviour declared (its static describe, M6 W0), as the editor has it. */
export async function afterHoursRegistry() {
  const reg = m0Registry();
  declareProjectBehaviours(reg, await import(path.join(root, DIR, 'behaviours.js')));
  return reg;
}

/** The inspector's rotation fields: Euler degrees (YXZ) to a quaternion (apps/editor/src/host.js quatFromDeg). */
export const quatFromDeg = (r) => new Quaternion().setFromEuler(new Euler((r[0] * Math.PI) / 180, (r[1] * Math.PI) / 180, (r[2] * Math.PI) / 180, 'YXZ')).toArray();
/** What the inspector shows of a node's transform (host.js transformOf). */
export function transformOf(n) {
  const t = n.transform ?? {};
  const e = new Euler().setFromQuaternion(new Quaternion().fromArray(t.q ?? [0, 0, 0, 1]), 'YXZ');
  const deg = (r) => Math.round((r * 180) / Math.PI * 1000) / 1000;
  return { p: t.p ?? [0, 0, 0], r: [deg(e.x), deg(e.y), deg(e.z)] };
}
/** One field of the position or rotation typed (host.js setAxisOn): the others kept as the inspector shows them. → whether it changed */
function setAxis(s, id, part, axis, value) {
  const v = [...transformOf(s.node(id))[part]];
  if (v[axis] === value) return false;
  v[axis] = value;
  s.setTransforms([{ id, t: part === 'r' ? { q: quatFromDeg(v) } : { p: v } }]);
  return true;
}

/**
 * The game document as File › Project Settings… leaves it (the editor's own ProjectSettings): New Project from "One
 * level" (the template's game.json, its id and title the sheet's), then the entry scene, the game's scenes in and the
 * template's out, and the behaviours module. → game.json's text
 */
export async function afterHoursGame() {
  const repo = path.resolve(root, '../..');
  const template = personalGame(fs.readFileSync(path.join(repo, 'content/templates/level/game.json'), 'utf8'), { id: GAME.id, title: GAME.title });
  const files = new Map([['game.json', template]]);
  const sceneFiles = ['level.vrmxs', 'ending.vrmxs', ...SCENES.map((x) => x.ref)].sort();
  const settings = new ProjectSettings({ game: JSON.parse(template), files: [...files.keys(), ...sceneFiles, GAME.behaviours].sort(), name: GAME.title, write: async (ref, t) => { files.set(ref, t); } });
  await settings.setEntry(GAME.entry);
  for (const ref of GAME.scenes) await settings.setScene(ref, true);
  for (const ref of GAME.drop) await settings.setScene(ref, false);
  await settings.setBehaviours(GAME.behaviours);
  return files.get('game.json');
}

const none = () => {};
/**
 * Build every scene of the plan. `ui` hooks (each optional) are called after the op they stand for, with the session:
 *   newScene(scene, s), copy(ids, prev), paste(roots, s), add(n, given, s), setId(given, want, s), name(id, name, s),
 *   parent(id, parent, s), position(id, p, s), rotate(id, axis, value, s), prop(id, key, value, s),
 *   behaviour(id, entry, s), connect(c, index, s), done(scene, s)
 * → [{ scene, session }]
 */
export function buildScenes(reg, ui = {}) {
  const on = new Proxy(ui, { get: (t, k) => t[k] ?? none });
  const out = [];
  let prev = null, clip = null;
  for (const scene of SCENES) {
    const s = EditorSession.empty(reg, scene.ref.replace(/\.vrmxs$/, '').replace(/[^A-Za-z0-9_-]/g, '-'));
    // the copy is made in the scene built before, then File › New
    for (const step of scene.steps) if (step.copy) { clip = prev.copy(step.copy); on.copy(step.copy, prev); }
    s.rename('root', scene.root);
    on.newScene(scene, s);
    for (const step of scene.steps) {
      if (step.copy) continue;
      if (step.paste) {
        const roots = s.paste(clip);
        on.paste(roots, s);
        for (const id of roots) { s.setNodeId(id, step.paste[id]); on.setId(id, step.paste[id], s); }
        continue;
      }
      if (step.connect) {
        const { args, ...c } = step.connect;
        const index = s.connect(c);
        for (const [k, v] of Object.entries(args ?? {})) s.setConnectionArg(index, k, v);
        on.connect(step.connect, index, s);
        continue;
      }
      const n = step.node;
      let id = n.from ? s.addFromAsset(n.from) : s.addNode(n.type);
      on.add(n, id, s);
      if (id !== n.id) { const given = id; id = s.setNodeId(id, n.id); on.setId(given, id, s); }
      if (n.name) { s.rename(id, n.name); on.name(id, n.name, s); }
      if (n.parent) { s.reparent(id, n.parent); on.parent(id, n.parent, s); }
      const p = n.p ?? [0, 0, 0];
      p.forEach((v, i) => setAxis(s, id, 'p', i, v));
      on.position(id, p, s);
      (n.r ?? [0, 0, 0]).forEach((v, i) => { if (setAxis(s, id, 'r', i, v)) on.rotate(id, i, v, s); });
      for (const [k, v] of Object.entries(n.props ?? {})) { s.setProp(id, k, v); on.prop(id, k, v, s); }
      for (const entry of n.behaviours ?? []) {
        const { use, ...params } = entry;
        s.addBehaviour(id, use);
        for (const [k, v] of Object.entries(params)) s.setBehaviourParam(id, use, k, v);
        on.behaviour(id, entry, s);
      }
    }
    on.done(scene, s);
    out.push({ scene, session: s });
    prev = s;
  }
  return out;
}
