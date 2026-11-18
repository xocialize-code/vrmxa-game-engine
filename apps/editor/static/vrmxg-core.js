// A project's own modules (behaviours.js) import '@vrmxg/core' by name. The editor's import map points that name here,
// and this hands them the editor's own copy (set on globalThis before a project module loads), so a project behaviour
// extends the very Behaviour class the engine runs.
const core = globalThis.VRMXG_CORE;
if (!core) throw new Error('@vrmxg/core: the editor has not published its engine yet');
export const { Behaviour, Node, SceneTree } = core;
export default core;
